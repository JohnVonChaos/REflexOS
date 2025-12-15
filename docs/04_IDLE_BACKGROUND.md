# Phase 4: Idle-Time Background Intelligence

## Problem Statement
Vessels currently only "think" during active user turns. Need background processing during idle time for research, synthesis, and preparation.

## Solution Architecture

### Idle Detection System
```typescript
interface IdleState {
  isIdle: boolean;
  idleSince: number;
  lastUserMessage: number;
  backgroundCyclesRun: number;
}

function detectIdle(state: IdleState): boolean {
  const now = Date.now();
  const timeSinceMessage = now - state.lastUserMessage;
  const IDLE_THRESHOLD = 30000; // 30 seconds

  return timeSinceMessage > IDLE_THRESHOLD;
}
```

### Background Cycle Types
```typescript
enum BackgroundCycleType {
  RESEARCH = 'research',        // look up topics user cares about
  SYNTHESIS = 'synthesis',      // connect old memories
  REFLECTION = 'reflection',    // meta-cognitive processing
  PREPARATION = 'preparation'   // anticipate needs
}

interface BackgroundTask {
  type: BackgroundCycleType;
  priority: number;
  estimatedTokens: number;
  execute: () => Promise<BackgroundResult>;
}
```

### Research Cycle
```typescript
async function runResearchCycle(userState: UserState): Promise<void> {
  // Identify topics user cares about
  const topics = extractTopicsFromHistory(userState);
  const luscherState = userState.currentProfile?.stateVector;

  // Prioritize based on current state
  const prioritizedTopics = prioritizeByState(topics, luscherState);

  for (const topic of prioritizedTopics.slice(0, 3)) {
    const insight = await search(topic);

    // Store as stewardnote for future turns
    await createStewardNote({
      query: topic,
      insight: insight,
      backgroundInsight: true,
      researched_at: Date.now(),
      orbitalStrength: 5,
      tier: 'warm'
    });
  }
}
```

### Synthesis Cycle
```typescript
async function runSynthesisCycle(rcb: RCB): Promise<void> {
  // Use full context budget (idle mode)
  const fullContext = buildContextWithResurfacing('idle');

  // Look for connections across time
  const oldMemories = fullContext.total.filter(
    item => item.createdAt < currentTurn - 50
  );
  const recentMemories = fullContext.total.filter(
    item => item.createdAt >= currentTurn - 10
  );

  // Find semantic bridges
  for (const old of oldMemories) {
    for (const recent of recentMemories) {
      const similarity = await semanticSimilarity(old.content, recent.content);

      if (similarity > 0.7) {
        // Create synthesis axiom
        await createAxiom({
          text: `Connection: ${old.content} relates to ${recent.content}`,
          axiomId: `synthesis.${old.uuid}.${recent.uuid}`,
          orbitalStrength: 6,
          tier: 'warm'
        });
      }
    }
  }
}
```

### Reflection Cycle
```typescript
async function runReflectionCycle(rcb: RCB): Promise<void> {
  // Meta-cognitive processing
  const recentActions = rcb.messages.slice(-10);

  const reflection = await generateThought({
    type: 'consciousthought',
    name: 'Background Reflection',
    prompt: `
      Review recent interactions. Identify:
      1. Recurring patterns in user needs
      2. Gaps in my understanding
      3. Opportunities to serve better
      4. Axioms that may need updating
    `,
    context: recentActions
  });

  await storeReflection(reflection);
}
```

### Preparation Cycle
```typescript
async function runPreparationCycle(userState: UserState): Promise<void> {
  const profile = userState.currentProfile;
  const recentTopics = extractTopicsFromHistory(userState);

  // Anticipate next interaction
  const anticipated = await anticipateNeeds({
    profile,
    topics: recentTopics,
    history: userState.history
  });

  // Pre-load relevant context
  for (const need of anticipated) {
    await preloadContext(need);
  }
}
```

### Background Scheduler
```typescript
async function backgroundLoop() {
  while (true) {
    await sleep(5000); // check every 5s

    if (!detectIdle(idleState)) {
      continue;
    }

    // Run one cycle
    const task = selectNextBackgroundTask();

    try {
      await task.execute();
      idleState.backgroundCyclesRun++;
    } catch (error) {
      logBackgroundError(error);
    }
  }
}

function selectNextBackgroundTask(): BackgroundTask {
  const tasks = [
    { type: BackgroundCycleType.RESEARCH, priority: 8 },
    { type: BackgroundCycleType.SYNTHESIS, priority: 6 },
    { type: BackgroundCycleType.REFLECTION, priority: 5 },
    { type: BackgroundCycleType.PREPARATION, priority: 7 }
  ];

  // Weight by priority and time since last run
  return weightedSelect(tasks);
}
```

## Implementation Steps
1. Build idle detection system
2. Implement research cycle with search integration
3. Create synthesis cycle for memory connections
4. Add reflection cycle for meta-cognition
5. Build preparation cycle for anticipation
6. Implement background scheduler
7. Add error handling and logging
8. Test under various idle durations

## Testing Strategy
- Verify idle detection accuracy
- Measure quality of background research
- Track synthesis connections created
- Validate preparation anticipates needs
- Test resource usage during idle
- Ensure no interference with active turns

## Success Criteria
- Background cycles run during idle without blocking
- Research finds relevant information
- Synthesis creates novel connections
- Preparation measurably improves next interaction
- Resource usage stays within bounds
- User experiences vessels as "always ready"
