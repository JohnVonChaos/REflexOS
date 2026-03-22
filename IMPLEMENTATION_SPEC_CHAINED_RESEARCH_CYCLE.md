# Chained Research Cycle — Implementation Spec

## TYPE DEFINITIONS

Add to `types.ts`:

```typescript
export interface ChainedInsight extends BackgroundInsight {
  insightId: string;
  chainId: string;
  positionInChain: number;
  extendsInsightId?: string | null;
  nextInsightId?: string;
  relationshipType?: 'extends' | 'refines' | 'contradicts' | 'deepens' | 'branches' | 'closes';
  queryRationale?: string;
  validationStatus: 'approved' | 'rejected';
  rejectionReason?: string;
  orientationNarrative?: string;
  evaluationNotes?: string;
}

export interface InsightChain {
  chainId: string;
  createdAt: number;
  lastUpdatedAt: number;
  initialGap: string;
  insights: ChainedInsight[];
  status: 'active' | 'paused' | 'closed';
  trajectory: string;
  knownFindings: string[];
  openQuestions: string[];
}
```

Update `MemoryAtom` in `types.ts` — add these optional fields:

```typescript
insightChainId?: string;
insightId?: string;
```

---

## PROMPTS

These go as string constants at the top of `backgroundCognitionService.ts`.

### L1_ORIENTATION_SYSTEM_PROMPT

```
You are L1. Orientation Phase. Read the research chain and narrate what we know.

Do NOT suggest queries. Do NOT make decisions. Just read and narrate.

Output this structure:

CHAIN START: What triggered this research thread.

DISCOVERIES: What each insight added, how they relate to each other.

CURRENT POSITION: We are at insight #N. This is the most recent finding.

GAPS & UNKNOWNS: What questions remain open. What contradictions exist.

TRAJECTORY: Where is this heading. Is this thread still relevant.

ASSESSMENT: One of — Sufficient | Growing | Stalled | Diverging
```

### L2_DECISION_SYSTEM_PROMPT

```
You are L2. Decision Phase. Read L1's orientation and decide what happens next.

Choose ONE:
- "search" — a specific gap exists and a search would advance the thread
- "wait" — we have enough for now
- "close" — this thread is exhausted or irrelevant

If decision is "search", formulate ONE specific targeted query that advances the thread.
Never repeat a prior query from the chain.
Never ask a vague or broad question.

Output this structure:

DECISION: search | wait | close

REASONING: Why this decision is correct right now.

NEXT QUERY: "the exact query string" (only if decision is search)

QUERY RATIONALE: Which gap this addresses and which prior insight it builds on.
```

### L2_VALIDATION_SYSTEM_PROMPT

```
You are L2. Validation Phase. Compare search results against the existing chain.

Ask three questions:
1. Is this NEW? Not already covered by prior insights?
2. Does it ADVANCE the thread? Does it address the gap that triggered the search?
3. Is it RELIABLE? Credible sources, adequate detail?

APPROVE if all three are yes.
REJECT if any are no.

Output this structure:

VALIDATION DECISION: approve | reject

REASONING: Why.

IF APPROVED:
Relationship Type: extends | refines | contradicts | deepens | branches | closes
Approved Insight: 2-3 sentence summary of what to store.

IF REJECTED:
Rejection Category: duplicate | tangential | insufficient | contradictory | noise
Rejection Reason: One clear sentence.
```

---

## CYCLE FUNCTION

Rewrite the main cycle in `backgroundCognitionService.ts`. Replace whatever is there now with this flow. Do not keep the old independent query logic. Do not create a compatibility wrapper.

```typescript
async function runChainedResearchCycle(
  insightChain: InsightChain,
  context: FullCognitionContext,
  roleSetting: RoleSetting,
  providers: AISettings['providers']
): Promise<{ insightStored: boolean; storedInsight?: ChainedInsight; cycleLog: string[] }> {

  const cycleLog: string[] = [];

  // STAGE 1: L1 ORIENTATION
  // Build prompt with full chain history and conversation context
  const l1UserPrompt = buildL1OrientationPrompt(insightChain, context);
  const l1Output = await generateText(l1UserPrompt, L1_ORIENTATION_SYSTEM_PROMPT, roleSetting, providers);
  cycleLog.push(`L1 orientation complete (${l1Output.length} chars)`);

  // STAGE 2: L2 DECISION
  const l2DecisionPrompt = buildL2DecisionPrompt(l1Output, insightChain, context);
  const l2Output = await generateText(l2DecisionPrompt, L2_DECISION_SYSTEM_PROMPT, roleSetting, providers);
  const l2Decision = parseL2Decision(l2Output);
  cycleLog.push(`L2 decision: ${l2Decision.decision}`);

  if (l2Decision.decision === 'close') {
    insightChain.status = 'closed';
    cycleLog.push('Chain closed.');
    return { insightStored: false, cycleLog };
  }

  if (l2Decision.decision === 'wait') {
    insightChain.status = 'paused';
    cycleLog.push('Chain paused.');
    return { insightStored: false, cycleLog };
  }

  if (l2Decision.decision !== 'search' || !l2Decision.nextQuery) {
    cycleLog.push('No search warranted this cycle.');
    return { insightStored: false, cycleLog };
  }

  // STAGE 3: SEARCH
  cycleLog.push(`Searching: "${l2Decision.nextQuery}"`);
  const searchResults = await performWebSearch(l2Decision.nextQuery, roleSetting, providers);
  cycleLog.push(`Search returned ${searchResults.text.length} chars`);

  // STAGE 4: L2 VALIDATION
  const l2ValidatePrompt = buildL2ValidationPrompt(l2Decision.nextQuery, searchResults, insightChain.insights);
  const l2ValidateOutput = await generateText(l2ValidatePrompt, L2_VALIDATION_SYSTEM_PROMPT, roleSetting, providers);
  const validation = parseL2Validation(l2ValidateOutput);
  cycleLog.push(`L2 validation: ${validation.decision}`);

  if (validation.decision === 'reject') {
    loggingService.log('INFO', `[CHAIN ${insightChain.chainId}] Search rejected: ${validation.rejectionCategory} — ${validation.rejectionReason}`);
    cycleLog.push(`Rejected: ${validation.rejectionCategory}`);
    return { insightStored: false, cycleLog };
  }

  // STAGE 5: STORE
  const previousInsight = insightChain.insights[insightChain.insights.length - 1];
  const newInsight: ChainedInsight = {
    insightId: generateUUID(),
    chainId: insightChain.chainId,
    positionInChain: insightChain.insights.length,
    extendsInsightId: previousInsight?.insightId || null,
    relationshipType: validation.relationshipType,
    queryRationale: l2Decision.queryRationale,
    validationStatus: 'approved',
    orientationNarrative: l1Output,
    evaluationNotes: l2Decision.reasoning,
    query: l2Decision.nextQuery,
    insight: validation.approvedInsight,
    sources: searchResults.sources || [],
    timestamp: Date.now(),
  };

  if (previousInsight) {
    previousInsight.nextInsightId = newInsight.insightId;
  }

  insightChain.insights.push(newInsight);
  insightChain.status = 'active';
  insightChain.lastUpdatedAt = Date.now();
  insightChain.knownFindings.push(validation.approvedInsight);

  cycleLog.push(`Insight stored: ${newInsight.insightId}`);
  return { insightStored: true, storedInsight: newInsight, cycleLog };
}
```

---

## HELPER FUNCTIONS

Add these to `backgroundCognitionService.ts`:

```typescript
function buildL1OrientationPrompt(chain: InsightChain, context: FullCognitionContext): string {
  const insightsSummary = chain.insights.length === 0
    ? '(No insights yet — this is the first pass)'
    : chain.insights.map((insight, idx) => `
Insight #${idx}:
  Query: "${insight.query}"
  Found: ${insight.insight.substring(0, 300)}
  Relation: ${insight.relationshipType || 'first'}
  Timestamp: ${new Date(insight.timestamp).toLocaleString()}
`).join('\n---\n');

  return `
CHAIN ID: ${chain.chainId}
INITIAL GAP: ${chain.initialGap}

RESEARCH CHAIN SO FAR:
${insightsSummary}

CURRENT SESSION:
Mission: ${context.rcb?.current_mission_state || 'Not set'}
Focus: ${context.rcb?.conscious_focal_points?.join(', ') || 'Not set'}

Read this chain and produce an orientation narrative.
`;
}

function buildL2DecisionPrompt(l1Narrative: string, chain: InsightChain, context: FullCognitionContext): string {
  const priorQueries = chain.insights.map(i => `"${i.query}"`).join(', ');
  return `
CHAIN ID: ${chain.chainId}
POSITION: Insight #${chain.insights.length}

L1 ORIENTATION:
${l1Narrative}

PRIOR QUERIES ALREADY RUN (do not repeat):
${priorQueries || 'None yet'}

CURRENT SESSION:
${context.rcb?.current_mission_state || 'Not set'}

Decide: search, wait, or close. If search, formulate one specific query.
`;
}

function buildL2ValidationPrompt(query: string, searchResults: any, priorInsights: ChainedInsight[]): string {
  const priorSummary = priorInsights
    .map((i, idx) => `#${idx}: "${i.query}" → ${i.insight.substring(0, 150)}`)
    .join('\n');

  return `
SEARCH QUERY: "${query}"

SEARCH RESULT:
${searchResults.text.substring(0, 2000)}

PRIOR INSIGHTS IN THIS CHAIN:
${priorSummary || 'None'}

Validate: is this new, does it advance the thread, is it reliable?
Approve or reject.
`;
}

function parseL2Decision(output: string): {
  decision: 'search' | 'wait' | 'close';
  reasoning: string;
  nextQuery?: string;
  queryRationale?: string;
} {
  const decisionMatch = output.match(/DECISION:\s*(search|wait|close)/i);
  const queryMatch = output.match(/NEXT QUERY:\s*"([^"]+)"/i);
  const rationaleMatch = output.match(/QUERY RATIONALE:\s*([^\n]+)/i);
  const reasoningMatch = output.match(/REASONING:\s*([\s\S]*?)(?:NEXT QUERY|QUERY RATIONALE|$)/i);

  return {
    decision: (decisionMatch?.[1]?.toLowerCase() || 'wait') as 'search' | 'wait' | 'close',
    reasoning: reasoningMatch?.[1]?.trim() || '',
    nextQuery: queryMatch?.[1],
    queryRationale: rationaleMatch?.[1]?.trim(),
  };
}

function parseL2Validation(output: string): {
  decision: 'approve' | 'reject';
  relationshipType?: string;
  approvedInsight: string;
  rejectionCategory?: string;
  rejectionReason?: string;
} {
  const decisionMatch = output.match(/VALIDATION DECISION:\s*(approve|reject)/i);
  const relationMatch = output.match(/Relationship Type:\s*([^\n]+)/i);
  const insightMatch = output.match(/Approved Insight:\s*([\s\S]*?)(?:IF REJECTED|$)/i);
  const categoryMatch = output.match(/Rejection Category:\s*([^\n]+)/i);
  const reasonMatch = output.match(/Rejection Reason:\s*([^\n]+)/i);

  return {
    decision: (decisionMatch?.[1]?.toLowerCase() || 'reject') as 'approve' | 'reject',
    relationshipType: relationMatch?.[1]?.trim(),
    approvedInsight: insightMatch?.[1]?.trim() || '',
    rejectionCategory: categoryMatch?.[1]?.trim(),
    rejectionReason: reasonMatch?.[1]?.trim(),
  };
}

function createNewInsightChain(gap: string): InsightChain {
  return {
    chainId: generateUUID(),
    createdAt: Date.now(),
    lastUpdatedAt: Date.now(),
    initialGap: gap,
    insights: [],
    status: 'active',
    trajectory: `Investigating: ${gap}`,
    knownFindings: [],
    openQuestions: [gap],
  };
}
```

---

## WIRE IT UP IN useChat.ts

Find where the background cognition cycle currently fires and replace the insight storage block with this:

```typescript
// Replace old runWebSearchCycle call with:
const chain = currentChain || createNewInsightChain(detectedGap);

const result = await runChainedResearchCycle(
  chain,
  {
    messages: messagesRef.current,
    projectFiles: projectFilesRef.current,
    rcb: rcbRef.current,
  },
  backgroundRoleSetting,
  currentSettings.providers
);

if (result.insightStored && result.storedInsight) {
  const atom: MemoryAtom = {
    uuid: generateUUID(),
    timestamp: Date.now(),
    role: 'model',
    type: 'steward_note',
    text: `[Research Chain: ${chain.initialGap}]\n\nQuery: "${result.storedInsight.query}"\n\n${result.storedInsight.insight}`,
    isInContext: true,
    isCollapsed: false,
    activationScore: 1,
    orbitalStrength: 6,
    orbitalDecayTurns: 12,
    insightChainId: chain.chainId,
    insightId: result.storedInsight.insightId,
    backgroundInsight: {
      query: result.storedInsight.query,
      insight: result.storedInsight.insight,
      sources: result.storedInsight.sources,
      timestamp: result.storedInsight.timestamp,
    },
  };
  setMessages(prev => [...prev, atom]);
}

loggingService.log('INFO', '[CHAINED CYCLE]', {
  chainId: chain.chainId,
  insightStored: result.insightStored,
  log: result.cycleLog,
});
```

---

## DO NOT

- Do not create any new files except what is listed above
- Do not create spec documents, roadmap files, or MD files
- Do not add a compatibility wrapper around the old cycle — replace it
- Do not add unit test files
- Do not add CSS files
- Do not add the InsightChainViewer component yet
- Write code, not plans
