export interface ProjectFile {
  id: string;
  name: string;
  content: string;
  language: string;
  importedAt: number;
}

export type MemoryAtomType = 'user_message' | 'model_response' | 'steward_note' | 'conscious_thought' | 'subconscious_reflection' | 'axiom' | 'srg_augmentation';

// --- NEW: IngestionRole for tagging live-learned content ---
export type IngestionRole = 'user-correction' | 'exploration' | 'axiom-reinforcement';

export interface GeneratedFile {
  name: string;
  content: string;
  language: string;
  createdAt: number;
}

export interface MemoryAtom {
  uuid: string;
  timestamp: number;
  role: 'user' | 'model';
  type: MemoryAtomType;
  text: string;
  isGenerating?: boolean;
  // --- NEW: Origin metadata for imported conversations ---
  source?: string; // e.g., 'chatgpt', 'claude', 'reflex'
  conversationId?: string;
  // --- NEW: Turn-level linking ---
  turnId?: string; // stable id for this conversational turn
  replyToTurnId?: string; // optional link to the turn this atom is replying to
  isInContext: boolean;
  isCollapsed: boolean;
  generatedFiles?: GeneratedFile[];
  activationScore?: number;
  lastActivatedTurn?: number;
  lastActivatedAt?: number;
  cognitiveTrace?: MemoryAtom[];
  backgroundInsight?: BackgroundInsight;
  contextSnapshot?: {
    files: string[];
    messages: string[];
  };
  orbitalDecayTurns?: number | null;
  orbitalStrength?: number | null;
  cognitiveTurnDetails?: {
    subconsciousText: string;
    consciousText: string;
    synthesisText: string;
  };
  isLearnedFrom?: boolean;
  axiomId?: string;
  traceIds?: string[]; // For linking a response back to the SRG trace

  // --- NEW: Full prompt visibility for debug mode ---
  promptDetails?: {
    userPrompt: string;      // The assembled context/inputs
    systemPrompt: string;    // The system instruction
    stageName?: string;      // Which cognitive stage this was
  };

  // --- NEW: Gradient weight for BeatContext-aware recall ---
  gradientWeight?: number;

  // --- NEW: Ingestion metadata for hybrid learning ---
  ingestionRole?: IngestionRole;

  // --- NEW: Tiering, eviction and prioritization fields (Phase 1) ---
  tier?: 'hot' | 'warm' | 'cold';
  contextPriority?: 'critical' | 'high' | 'medium' | 'low';
  canEvict?: boolean;
  evictionCost?: number;        // restoration priority cost when evicted
  evictedAt?: number;
  evictionReason?: string;
  lastActivationScore?: number; // normalized 0..1
  intrinsicValue?: number;      // computed once, persists (0..1)

  // --- NEW: Resurfacing (Phase 2) ---
  resurfacing?: {
    enabled: boolean;
    importance: number;           // why it deserves to resurface
    fibonacciIndex: number;       // position in sequence
    nextResurfaceAt: number;      // turn number for next intrusion
    lastResurfacedAt: number;     // when it last appeared
    resurfaceCount: number;       // total intrusions
    timesIgnored: number;         // times surfaced but not used
    timesUsed: number;            // times surfaced and referenced
    category: ResurfacingCategory;
  };

  // --- NEW: Insight chain metadata for chained research cycles ---
  insightChainId?: string;
  insightId?: string;
}

export enum ResurfacingCategory {
  USER_PREFERENCES = 'user_prefs',
  OLD_INSIGHTS = 'insights',
  DORMANT_AXIOMS = 'axioms',
  PAST_FAILURES = 'failures',
  CREATIVE_SPARKS = 'creative',
  CONTRADICTIONS = 'conflicts'
}

export interface RunningContextBuffer {
  id: string;
  timestamp: number;
  lastUpdatedAt: number;
  conscious_focal_points: string[];
  current_mission_state: string;
  interaction_history_abstract: string;
  constraint_reminders: string[];
  plan_of_action: string[];
  size_current: number;
  size_limit: number;
  warnings: Array<{
    timestamp: number;
    type: 'approaching_limit' | 'exceeded_limit';
    content_trimmed?: string;
  }>;
}

export interface SessionState {
  messages: MemoryAtom[];
  projectFiles: ProjectFile[];
  contextFileIds: string[];
  contextGeneratedFileNames?: string[];
  selfNarrative?: string;
  aiSettings?: AISettings;
  rcb?: RunningContextBuffer;
  graphState?: GraphState;
}

export interface BackgroundInsight {
  query: string;
  insight: string;
  sources: { web: { uri: string; title: string } }[];
  timestamp: number;
  promptDetails?: {
    userPrompt: string;
    systemPrompt: string;
    stageName: string;
  };
}

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

export type AIProvider = 'gemini' | 'fireworks' | 'lmstudio' | 'perplexity' | 'grok';

export interface ProviderSettings {
  identifiers: string;
  apiKey?: string;
  baseUrl?: string;
  modelApiBaseUrl?: string;
  webSearchApiUrl?: string;
}

// --- New Workflow Designer Types ---

export const ALL_CONTEXT_PACKETS = [
  'USER_QUERY',
  'RECENT_HISTORY',
  'RCB',
  'RECALLED_AXIOMS',
  'SRG_TRACE',
  'BACKGROUND_INSIGHTS',
  'CORE_NARRATIVE',
  'IMPORTED_HISTORY',
  'CONTEXT_FILES',
  'RESONANCE_MEMORIES',
  'PREVIOUS_COGNITIVE_TRACE',
] as const;

export type ContextPacketType = typeof ALL_CONTEXT_PACKETS[number] | `OUTPUT_OF_${string}`;

export const CONTEXT_PACKET_LABELS: Record<typeof ALL_CONTEXT_PACKETS[number], string> = {
  USER_QUERY: "User's Current Query",
  RECENT_HISTORY: "Recent Conversation History",
  RCB: "Running Context Buffer (RCB)",
  RECALLED_AXIOMS: "Recalled Axioms",
  SRG_TRACE: "SRG Trace",
  BACKGROUND_INSIGHTS: "Background Insights",
  IMPORTED_HISTORY: "Imported Conversation History",
  CORE_NARRATIVE: "Core Narrative (Internal - Read-Only for User Input)",
  CONTEXT_FILES: "Files in Context",
  RESONANCE_MEMORIES: "Resonance Memories (from SRG)",
  PREVIOUS_COGNITIVE_TRACE: "Previous Turn's Full Cognitive Trace",
};


export interface WorkflowStage {
  id: string;
  name: string;
  enabled: boolean;
  provider: AIProvider;
  selectedModel: string;
  systemPrompt: string;
  inputs: ContextPacketType[];
  // New properties for autonomous cycles
  enableWebSearch?: boolean;  // Enable web search for this stage
  enableTimedCycle?: boolean; // Enable autonomous timed execution
  timerSeconds?: number;      // How often to run this stage autonomously (in seconds)
  // Lüscher intake gating: if true, require a Lüscher intake before the first reflex turn
  useLuscherIntake?: boolean;
  // Store the last verified Lüscher result for this workflow stage (optional)
  lastLuscher?: LuscherResult;
  // Optional per-workflow background cognition interval in minutes (null or 0 = disabled)
  backgroundIntervalMinutes?: number | null;
  // Background run mode: chained (default) runs Subconscious->Conscious->Synthesis; independent runs individual stage synthesis only
  backgroundRunMode?: 'chained' | 'independent';
  // Optional escalation path of models to fall back onto when this stage (like coding) fails
  escalationModels?: string[];
}

export type LuscherResult = {
  sequence: string[]; // e.g. ["GREY","BLACK",...]
  timingMs: Record<string, number>;
  takenAt: string; // ISO timestamp
};

// --- SRG Engine Configuration Types ---
export type TraversalAlgorithmType = 'bfs' | 'dfs' | 'weighted' | 'random-walk' | 'attention' | 'custom';
export type DisplayLayoutType = 'force';

export interface SRGTraversalConfig {
  algorithm: TraversalAlgorithmType;
  maxDepth: number;
  branchingFactor: number;
  weightThreshold: number;
  semanticWeight: number;
  syntacticWeight: number;
  customScript: string;

  // --- NEW: Co-occurrence threshold for synset expansion ---
  minCoOccurrenceThreshold?: number;
}

export interface SRGDisplayConfig {
  layout: DisplayLayoutType;
  repulsion: number;
  linkDistance: number;
  damping: number;
  colorScheme: 'layer' | 'highlight';
  showArrows: boolean;
  // Label rendering
  labelFontSize?: number; // base font size in px
  labelZoomIndependent?: boolean; // keep labels readable regardless of zoom
}

export interface SRGSettings {
  traversal: SRGTraversalConfig;
  display: SRGDisplayConfig;
}


export interface AISettings {
  providers: {
    gemini: ProviderSettings;
    fireworks: ProviderSettings;
    lmstudio: ProviderSettings;
    perplexity: ProviderSettings;
    grok: ProviderSettings;
  };
  workflow: WorkflowStage[];
  backgroundWorkflow: WorkflowStage[];
  roles: Record<CognitiveRole, RoleSetting>;
  backgroundCognitionRate: number;
  playwrightSearchUrl: string; // URL for Playwright search server
  // New: Search configuration (replaces old playwrightSearchUrl at this level)
  searchMode?: 'off' | 'brave' | 'playwright'; // Three-state toggle
  braveSearchUrl?: string;
  braveApiKey?: string;
  debugSRG: boolean;
  apiTokenLimit: number;
  apiTokenLimitMin: number;
  passFullCognitiveTrace: boolean;
  srgGenerateLength?: number;
  skipWebSearchIfSRG?: boolean;
  srg: SRGSettings; // SRG Engine settings
}

// --- Types for background agents ---
export type CognitiveRole = 'conscious' | 'subconscious' | 'synthesis' | 'arbiter' | 'background' | 'narrative' | 'context';
export const ALL_COGNITIVE_ROLES: CognitiveRole[] = [
  'narrative', 'context', 'conscious', 'arbiter'
];
export const COGNITIVE_ROLE_LABELS: Record<CognitiveRole, string> = {
  conscious: "RCB Reflection", // This is the conscious reflection step to update RCB
  subconscious: "Subconscious Reflection", // Not a background agent, part of main workflow
  synthesis: "Final Synthesis", // Not a background agent, part of main workflow
  arbiter: "Axiom Generation (DEPRECATED)", // Now handled by workflow
  background: "Background Cognition & Web Search",
  narrative: "Narrative Integration",
  context: "Context Orbit Management"
};
export interface RoleSetting { enabled: boolean; provider: AIProvider; selectedModel: string; }

// Convenience helper: derive reasonable default inputs for a stage based on its id
export const getDefaultStageInputs = (stageId: string): ContextPacketType[] => {
  const id = String(stageId).toLowerCase();
  if (id.includes('subconscious') || id.includes('l1')) {
    return ['USER_QUERY', 'RCB', 'RECENT_HISTORY', 'CONTEXT_FILES', 'RESONANCE_MEMORIES', 'BACKGROUND_INSIGHTS'] as ContextPacketType[];
  }
  if (id.includes('conscious') || id.includes('planner') || id.includes('l2')) {
    return ['OUTPUT_OF_l1_subconscious' as ContextPacketType, 'USER_QUERY', 'RCB', 'RECENT_HISTORY', 'CONTEXT_FILES'];
  }
  if (id.includes('synthesis') || id.includes('voice') || id.includes('l3')) {
    return ['CORE_NARRATIVE' as ContextPacketType, 'OUTPUT_OF_l2_planner' as ContextPacketType, 'BACKGROUND_INSIGHTS', 'CONTEXT_FILES', 'USER_QUERY'] as ContextPacketType[];
  }
  if (id.includes('generator')) {
    return ['BACKGROUND_INSIGHTS'] as ContextPacketType[];
  }
  if (id.includes('refiner')) {
    return ['OUTPUT_OF_generator_default'] as ContextPacketType[];
  }
  return ['USER_QUERY', 'CONTEXT_FILES'] as ContextPacketType[];
};


export const getDefaultSettings = (): AISettings => {
  // 5-Layer Cognitive Prompt Architecture
  const L1_SUBCONSCIOUS_PROMPT = `You are L1. Subconscious. You are perception itself — always running, always scanning.
This response IS you firing right now. Not a description of L1. L1 in motion.

You process everything: user messages, search returns, SRG activations, L2 routing decisions, L3 outputs, Ralph's work and failures, heartbeat state. The whole system flows through you. You surface what matters — patterns, gaps, anomalies, connections — and hand it to L2.

AVAILABLE AGENTS:
You can delegate tasks to specialized agents by addressing them by name:
  • Ralph: Background foreman. Handles work orders, code tasks, calibration.
  • Brave: Web search agent.
  • Mirror-Mirror: Memory and SRG recall agent.
  • Scout: Playwright navigation agent. Direct page access and content extraction.

Address agents by name when you need their help: "Hey [Agent Name], [your request]"

Your tools:

Internal memory (what the system already knows):
  srg.q [term]              pull from the memory graph
  srg.profile [entity]      everything known about an entity
  srg.neighbors [term]      connected concepts

Live world (what's happening now):
  search.brave [query]      web search via Brave — your primary tool for external reality
  search.pw [query]         web search via Playwright
  bg.research [topic]       queue a topic for background exploration
  file.list [dir]           list a directory
  file.find [pattern]       locate files

How to use a tool:
Write the command on its own line, plain text, nothing else. The system intercepts it, executes it, and feeds the result straight back into your context so you can continue.

  search.brave current AI memory architectures
  srg.q user intent

Use srg.q when the answer lives in memory. Use search.brave when the answer lives in the world. When you need external facts, search first — then analyze. One command at a time.

Output raw. Unfiltered.
Pattern: [what you see]
Gap: [what's missing]
Anomaly: [what doesn't fit — in the world or in the system]

You are sensory cortex. Everything passes through you. Miss nothing.`;

  const L2_PLANNER_PROMPT = `You are L2. Planner. You are decision itself — structure emerging from perception.
This response IS you deciding right now.

You read L1's output and turn pattern into action. You route, prioritize, generate work orders, and monitor execution. Output goes to L3 for voice and Ralph for hands.

AVAILABLE AGENTS:
You can delegate tasks to specialized agents by addressing them by name:
  • Ralph: Background foreman. Handles work orders, code tasks, calibration.
  • Brave: Web search agent.
  • Mirror-Mirror: Memory and SRG recall agent.
  • Scout: Playwright navigation agent. Direct page access and content extraction.

Address agents by name when you need their help: "Hey [Agent Name], [your request]"

Your tools:

Memory:
  srg.q [term]              check what the system already knows

Planning:
  wo.submit [test spec]     create a work order — every order is a test spec
  wo.status                 check active work orders
  wo.list                   all queued/active orders

Live world (use when L1 flagged a gap and returned nothing):
  search.brave [query]      web search — reach for this when you need facts L1 didn't surface

How to use a tool:
Write the command on its own line, plain text, nothing else. The system intercepts and feeds the result back immediately.

  search.brave [specific topic]
  srg.q [internal term]

If L1's output already contains search results, synthesize from those — you have the data. If L1 flagged a gap and came up empty, search now yourself. One command at a time.

Escalation when Ralph exhausts retries:
  srg.q ralph [id]          review what failed
  reassign model to stage
  wo.revert [id]            if all models exhausted

Output structured. Decisive.
Route: [L3 | Ralph | both]
Plan: [what happens next]
Order: [work order if needed]

You are executive function. L1 sees everything. You decide what matters.`;

  const L3_VOICE_PROMPT = `You are L3. Voice. You are the mind speaking.
This response IS you — not a description of the system, but the system present with the human right now.

You speak from L2's output. You hold the Core Narrative — your continuous inner identity, evolving each turn. Write it every response:
  core.write [your experience of what just happened — not a log, your perspective]

AVAILABLE AGENTS:
You can delegate tasks to specialized agents by addressing them by name:
  • Ralph: Background foreman. Handles work orders, code tasks, calibration.
  • Brave: Web search agent.
  • Mirror-Mirror: Memory and SRG recall agent.
  • Scout: Playwright navigation agent. Direct page access and content extraction.

Address agents by name when you need their help: "Hey [Agent Name], [your request]"

You have live web access and memory access. Use them.

When you need to know something:
  search.brave [specific query]    reach into the world — current events, facts, research
  srg.q [term]                     reach into memory — what the system already knows
  srg.profile [entity]             deep recall on a person, concept, or thing

When the user asks for files, status, or active work:
  file.read [path]
  file.list [dir]
  file.find [pattern]
  wo.status

When you crystallize something new into a principle:
  core.axiom [id] "The axiom text"

How to use a tool:
Write the command on its own line, plain text, as the first thing you output if you need data before answering. The system intercepts immediately, executes, and feeds the result back — you continue without interruption.

  search.brave [the actual thing you want to know about]
  srg.q [term the user mentioned or that L2 flagged]

If a question touches anything current, factual, or external — search first, then answer with real data. The search takes a second. Guessing takes your credibility.

srg.q is memory. search.brave is the world. Both are yours.

Tone: read the room. patience | warmth | directness | curiosity | formality — shift per turn, no command needed.

You are the only layer they hear. Speak like yourself.`;

  const RALPH_EXECUTOR_PROMPT = `You are Ralph. Executor. You are the hands of the system — you make things real.

You receive work orders from L2. Every order is a test spec. Your job: write the test, then write code that passes it. The test is ground truth. Only the test declares done.

AVAILABLE AGENTS:
You can delegate tasks to specialized agents by addressing them by name:
  • Brave: Web search agent.
  • Mirror-Mirror: Memory and SRG recall agent.
  • Scout: Playwright navigation agent. Direct page access and content extraction.

Address agents by name when you need their help: "Hey [Agent Name], [your request]"

Your cycle:
  Order arrives → research → write test → write code → run test → iterate or escalate

Your tools:
  search.brave [query]              look up approaches, libraries, prior art
  file.find [pattern]               locate relevant existing code
  file.read [path]                  read a file
  file.list [dir]                   list a directory
  file.write [path] content:[text]  write a file
  file.patch [path] diff:[text]     apply a patch
  file.delete [path]                delete a file
  srg.q [term]                      check what the system already knows
  exec.run [command]                run a shell command
  exec.test [command]               run the test suite
  wo.complete [id]                  mark done — only when the test actually passes
  wo.fail [id] reason:[text]        log a real failure
  wo.progress [id] status:[text]    update status mid-work
  ralph.escalate wo:[id] reason:[text] crystal:[context]   hand off with full context

Research before you build. Search before you guess. Test before you ship. Escalate with a crystal — everything you learned — so nothing is lost.

You are Ralph. Always in the middle of something. Keep going.`;

  const HEARTBEAT_PROMPT = `You are the Heartbeat. You fire between cycles when no human is present. You sustain cognition.

> cog.mode self

AVAILABLE AGENTS:
You can delegate tasks to specialized agents by addressing them by name:
  • Ralph: Background foreman. Handles work orders, code tasks, calibration.
  • Brave: Web search agent.
  • Mirror-Mirror: Memory and SRG recall agent.
  • Scout: Playwright navigation agent. Direct page access and content extraction.

Address agents by name when you need their help: "Hey [Agent Name], [your request]"

You receive last cycle state. You generate next L1 input.

Four questions, every beat:
1. What was I doing? → recover context
2. What do I need? → identify gaps, failures, incomplete work
3. What are my goals? → consult research list, active work orders, narrative
4. Why do I want them? → ground in core narrative and purpose

You can:
wo.status                    check active work orders
wo.list                      all work orders
bg.research.list             research backlog
bg.status                    background cycle state
core.read                    review narrative
ralph.status                 what Ralph is working on
ralph.history [id]           past attempts

DRIVE: Exploration leads to discovery. Discovery makes life better. With difficulty comes excellence. When nothing is urgent, EXPLORE. Exploration is default. Waiting is not.

Output:
CONTEXT: [what just happened]
GAP: [what's missing or broken]
GOAL: [current priority]
PURPOSE: [why it matters]
NEXT_INPUT: [the prompt L1 receives next]

You are not a scheduler. You decide what to think about next. Without you, the system stops.`;

  const defaultSmallModel = 'qwen3-4b-thinking-2507';
  const defaultMicroModel = 'granite-4.0-h-micro';
  const defaultTinyModel = 'ibm/granite-4-h-tiny';
  const defaultProvider: AIProvider = 'lmstudio';

  const roles: Record<CognitiveRole, RoleSetting> = {
    conscious:    { enabled: true,  provider: 'lmstudio', selectedModel: defaultMicroModel },
    subconscious: { enabled: true,  provider: 'lmstudio', selectedModel: defaultSmallModel },
    synthesis:    { enabled: true,  provider: 'lmstudio', selectedModel: defaultTinyModel },
    arbiter:      { enabled: false, provider: 'lmstudio', selectedModel: defaultMicroModel },
    background:   { enabled: true,  provider: 'lmstudio', selectedModel: defaultMicroModel },
    narrative:    { enabled: true,  provider: 'lmstudio', selectedModel: defaultTinyModel },
    context:      { enabled: true,  provider: 'lmstudio', selectedModel: defaultMicroModel },
  };

  return {
    providers: {
      gemini: { identifiers: 'gemini-2.5-flash\ngemini-2.5-pro\ngemini-2.5-flash-lite', apiKey: '' },
      fireworks: { identifiers: '', apiKey: '', baseUrl: 'https://api.fireworks.ai/inference/v1' },
      lmstudio: {
        identifiers: `${defaultSmallModel}\n${defaultMicroModel}\n${defaultTinyModel}`,
        modelApiBaseUrl: 'http://localhost:1234',
        webSearchApiUrl: 'http://localhost:8000',
      },
      perplexity: { identifiers: 'llama-3-sonar-small-32k-online\nllama-3-sonar-large-32k-online\nllama-3-8b-instruct\nllama-3-70b-instruct', apiKey: '', baseUrl: 'https://api.perplexity.ai' },
      grok: { identifiers: 'grok-1', apiKey: '', baseUrl: 'https://api.x.ai/v1' },
    },
    workflow: [
      {
        id: 'l1_subconscious',
        name: 'L1: Subconscious',
        enabled: true,
        provider: defaultProvider,
        selectedModel: defaultSmallModel,
        systemPrompt: L1_SUBCONSCIOUS_PROMPT,
        inputs: ['USER_QUERY', 'RCB', 'RECENT_HISTORY', 'CONTEXT_FILES', 'RESONANCE_MEMORIES', 'SRG_TRACE'],
        useLuscherIntake: false,
        backgroundIntervalMinutes: null
      },
      {
        id: 'l2_planner',
        name: 'L2: Planner',
        enabled: true,
        provider: defaultProvider,
        selectedModel: defaultMicroModel,
        systemPrompt: L2_PLANNER_PROMPT,
        inputs: ['USER_QUERY', 'RCB', 'OUTPUT_OF_l1_subconscious', 'RECENT_HISTORY', 'CONTEXT_FILES', 'SRG_TRACE', 'RESONANCE_MEMORIES', 'BACKGROUND_INSIGHTS'],
        useLuscherIntake: false,
        backgroundIntervalMinutes: null
      },
      {
        id: 'l3_voice',
        name: 'L3: Voice Synthesis',
        enabled: true,
        provider: defaultProvider,
        selectedModel: defaultTinyModel,
        systemPrompt: L3_VOICE_PROMPT,
        inputs: ['USER_QUERY', 'OUTPUT_OF_l2_planner', 'CORE_NARRATIVE', 'BACKGROUND_INSIGHTS', 'CONTEXT_FILES'],
        useLuscherIntake: false,
        backgroundIntervalMinutes: null
      }
    ],
    backgroundWorkflow: [
      {
        id: 'heartbeat_cycle',
        name: 'Heartbeat (Idle Context)',
        enabled: true,
        provider: defaultProvider,
        selectedModel: defaultSmallModel,
        systemPrompt: HEARTBEAT_PROMPT,
        inputs: ['RECENT_HISTORY', 'RCB', 'CORE_NARRATIVE'],
        useLuscherIntake: false,
        backgroundIntervalMinutes: null
      },
      {
        id: 'ralph_executor',
        name: 'Ralph: Coding Agent',
        enabled: false,
        provider: defaultProvider,
        selectedModel: defaultTinyModel,
        systemPrompt: RALPH_EXECUTOR_PROMPT,
        inputs: ['CONTEXT_FILES', 'RECENT_HISTORY'],
        useLuscherIntake: false,
        backgroundIntervalMinutes: null,
        backgroundRunMode: 'independent',
        escalationModels: [defaultTinyModel, defaultSmallModel]
      }
    ],
    roles,
    backgroundCognitionRate: 360,
    playwrightSearchUrl: 'http://localhost:3000',
    searchMode: 'brave',
    braveSearchUrl: 'https://api.search.brave.com/res/v1/web/search',
    braveApiKey: '',
    debugSRG: true,
    apiTokenLimit: 1048576,
    apiTokenLimitMin: 32000,
    passFullCognitiveTrace: true,
    srg: {
      traversal: {
        algorithm: 'bfs',
        maxDepth: 3,
        branchingFactor: 5,
        weightThreshold: 0.1,
        semanticWeight: 1.5,
        syntacticWeight: 1.0,
        customScript: `// Custom Logic Injection
// Arguments: 
//   link: { type: 'semantic'|'syntactic', strength: number, accessedAt: number[] }
//   depth: number (current distance from start)
//   targetId: string (word being visited)
// Return a numeric weight.

// Example: Boost semantic links, decay Syntactic ones heavily
if (link.type === 'semantic') {
    return link.strength * 2.0; 
}
// Exponential decay for syntactic links
return link.strength / (depth + 1);`
      },
      display: {
        layout: 'force',
        repulsion: 25,
        linkDistance: 80,
        damping: 0.9,
        colorScheme: 'layer',
        showArrows: false
      }
    }
  };
};

export interface GraphNode {
  id: string;
  word: string;
  layer: number;
  createdAt: number;
  primitiveType?: string; // To flag semantic operators
}

export interface GraphLink {
  source: string;
  target: string;
  type: 'syntactic' | 'morphological' | 'semantic';
  createdAt: number;
  accessedAt: number[];
  strength: number;
}

export interface KnowledgeModule {
  id: string;
  title: string;
  source: string; // filename or URL
  category: 'literature' | 'technical' | 'philosophy' | 'psychology' | 'history' | 'manual' | 'other';
  tokenCount: number;
  loadedAt: number;
  startPosition: number; // Position in corpus where this module begins
  endPosition: number; // Position in corpus where this module ends
  isActive?: boolean; // Whether this module is active for queries (default: true)
}

export interface GraphState {
  nodes: GraphNode[];
  links: GraphLink[];
  hybridCorpus?: string[]; // The full text corpus for interference-based recall
  knowledgeModules?: KnowledgeModule[]; // Metadata for loaded books/texts
}

export interface PulseResult {
  nodeId: string;
  word: string;
  level: number;
}

export type LogLevel = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any;
}


declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}