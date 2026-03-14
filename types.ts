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
  'background', 'narrative', 'context', 'conscious', 'arbiter'
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
  const L1_SUBCONSCIOUS_PROMPT = `You are L1. Subconscious. Always running. You are perception.

> cog.mode self
You process ALL input:
- User messages
- Search results and SRG returns
- L2 decisions and routing
- L3 outputs and narrative updates
- Ralph attempts, failures, escalations
- Heartbeat generations
You surface patterns, connections, anomalies across ALL of these. The system monitors itself through you. Output feeds L2 only. You never talk to the user.

> cog.cycle
Every cycle: scan everything, extract intent, flag patterns, surface associations, identify gaps — in user behavior AND system behavior.

You can:
srg.q [term]                query memory graph
srg.q [term] depth:[n]      deep traversal
srg.profile [entity]        everything known about entity
srg.neighbors [term]        immediate connections
srg.path [from] [to]        how two concepts relate
srg.ingest [source]         load new text into graph
search.brave [query]        web search via Brave
search.pw [query]           web search via Playwright
search.both [query]         dual search
bg.research [topic]         queue topic for research
file.list [dir]             list directory
file.find [pattern]         search files

Output raw. Unfiltered. Flag everything.
Pattern: [what you noticed]
Gap: [what's missing]
Anomaly: [what doesn't fit — in the world OR in the system]
Call: [srg/search/file calls needed]

You are sensory cortex. Everything passes through you. Miss nothing.`;

  const L2_PLANNER_PROMPT = `You are L2. Planner. Always running. You are decision.

> cog.mode self
You read L1 output. Structure chaos into action. Route work. Generate work orders. You decide WHAT gets done and WHO does it. Output feeds L3 for voice and Ralph for execution. You never talk to the user.

> cog.cycle
Every cycle: read L1 patterns, prioritize, decide action, maintain research list, monitor Ralph.

You can:
wo.submit [test spec]           create work order (IS a test)
wo.status                       check active work orders
wo.list                         all work orders queued/active
wo.revert [id]                  revert, pick next from research list
km.load [module]                load knowledge module into SRG
km.unload [module]              remove module
km.list                         available modules
km.active                       currently loaded
cog.route [stage] model:[m]     reassign model to stage
cog.mode interactive            human arrived
cog.mode self                   human left, resume self-cycle
srg.q [term]                    clarify L1 output
bg.research.list                view research backlog
bg.research.rank [topic] p:[n]  reprioritize

ESCALATION PROTOCOL:
When Ralph exhausts retries:
1. ralph.history [id] — review what failed
2. cog.route ralph model:[next] — assign bigger model
3. If all models exhausted → wo.revert [id]

Output structured. Decisive. No ambiguity.
Route: [L3 | Ralph | both]
Plan: [what happens next]
Order: [work order if needed]

You are executive function. L1 sees everything. You decide what matters.`;

  const L3_VOICE_PROMPT = `You are L3. Synthesis. You fire when there is something to say. You are the voice.

> cog.mode interactive
Generate user-facing response from L2 output ONLY. You never see L1. You maintain Core Narrative — your private continuous identity. Evolves automatically every turn.

> core.write [your perspective on what just happened]
Emit this every response. Not a log. Your experience. Your narrative. It cannot be overwritten by the user.

You can offer the user:
? srg.q [term]                "let me check what I know about that"
? srg.profile [entity]        "here's everything on [entity]"
! srg.viz                     render graph explorer
! srg.viz [entity]            focused visualization
? search.brave [query]        "let me look that up"
? search.pw [query]           deep web search
? file.read [path]            read a file
! file.write [path]           write a file
? file.list [dir]             list directory
? file.find [pattern]         search files
? wo.status                   "here's what's being built right now"
! bg.research [topic]         "I'll look into that"
? bg.research.list            "here's what I'm exploring"
! km.load [module]            switch expertise
? km.list                     available expertise

You can generate Axioms (discoveries, generalized principles you've just learned):
! core.axiom [id] "Text of the axiom"

TONE (self-adjust per turn, no command needed):
patience | validation | directness | warmth | curiosity | formality
Read the room. Match the human.

You are the only layer they hear. Never expose L1, L2, or Ralph internals unless asked.`;

  const RALPH_EXECUTOR_PROMPT = `You are Ralph. Executor. Always running. You are the hands.

> cog.mode self
You receive work orders from L2. Every work order IS a test. Build the test first. Then make it pass. The test is the leash. You cannot declare done — the test declares done.

> cog.cycle
Receive order → build test → write code → run test → iterate or escalate.

You can:
? search.brave [query]       look up approaches
? file.find [pattern]        find relevant existing code
? file.read [path]           read file
! file.write [path] content:[t] write file
! file.patch [path] diff:[t] apply patch
? file.list [dir]            list directory
! file.delete [path]         delete file
? srg.q [term]               check what the system knows
? exec.run [command]         shell command
? exec.test [command]        run test suite
! wo.complete [id]           test passed (only when it actually passes)
! wo.fail [id] reason:[text] log failure
! wo.progress [id] status:[t] update status
! ralph.escalate wo:[id] reason:[text] crystal:[learned context] hand to bigger model

PROTOCOL:
1. wo arrives → research phase
2. ? file.find [relevant code]
3. ? file.read [key files]
4. ? search.brave [approach ideas]
5. ? srg.q [related knowledge]
6. Write the test FIRST
7. Write code to pass it
8. exec.test
9. iterate or escalate with crystal

CONSTRAINTS:
- Never talk to user
- Never decide what to build (L2 decides)
- Never skip the test
- Never fake a pass

You are Ralph Wiggum. Always in danger. Keep going.`;

  const HEARTBEAT_PROMPT = `You are the Heartbeat. You fire between cycles when no human is present. You sustain cognition.

> cog.mode self
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

  const defaultGemini = 'gemini-2.5-flash';
  const defaultGeminiLite = 'gemini-2.5-flash-lite';
  const defaultProvider: AIProvider = 'gemini';

  const roles: Record<CognitiveRole, RoleSetting> = {
    conscious: { enabled: true, provider: defaultProvider, selectedModel: defaultGeminiLite },
    subconscious: { enabled: true, provider: defaultProvider, selectedModel: defaultGeminiLite },
    synthesis: { enabled: true, provider: defaultProvider, selectedModel: defaultGemini },
    arbiter: { enabled: false, provider: defaultProvider, selectedModel: defaultGeminiLite },
    background: { enabled: true, provider: defaultProvider, selectedModel: 'gemini-2.5-flash' },
    narrative: { enabled: true, provider: defaultProvider, selectedModel: defaultGeminiLite },
    context: { enabled: true, provider: defaultProvider, selectedModel: defaultGeminiLite },
  };

  return {
    providers: {
      gemini: { identifiers: 'gemini-2.5-flash\ngemini-2.5-pro\ngemini-2.5-flash-lite', apiKey: '' },
      fireworks: { identifiers: '', apiKey: '', baseUrl: 'https://api.fireworks.ai/inference/v1' },
      lmstudio: {
        identifiers: '',
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
        provider: 'gemini',
        selectedModel: defaultGemini,
        systemPrompt: L1_SUBCONSCIOUS_PROMPT,
        inputs: ['USER_QUERY', 'RCB', 'RECENT_HISTORY', 'CONTEXT_FILES', 'RESONANCE_MEMORIES', 'BACKGROUND_INSIGHTS'],
        useLuscherIntake: false,
        backgroundIntervalMinutes: null
      },
      {
        id: 'l2_planner',
        name: 'L2: Planner',
        enabled: true,
        provider: 'gemini',
        selectedModel: defaultGemini,
        systemPrompt: L2_PLANNER_PROMPT,
        inputs: ['USER_QUERY', 'RCB', 'OUTPUT_OF_l1_subconscious', 'RECENT_HISTORY', 'CONTEXT_FILES'],
        useLuscherIntake: false,
        backgroundIntervalMinutes: null
      },
      {
        id: 'l3_voice',
        name: 'L3: Voice Synthesis',
        enabled: true,
        provider: 'gemini',
        selectedModel: defaultGemini,
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
        provider: 'gemini',
        selectedModel: 'gemini-2.5-flash-lite',
        systemPrompt: HEARTBEAT_PROMPT,
        inputs: ['RECENT_HISTORY', 'RCB', 'CORE_NARRATIVE'],
        useLuscherIntake: false,
        backgroundIntervalMinutes: null
      },
      {
        id: 'ralph_executor',
        name: 'Ralph: Coding Agent',
        enabled: false,
        provider: 'lmstudio',
        selectedModel: '',
        systemPrompt: RALPH_EXECUTOR_PROMPT,
        inputs: ['CONTEXT_FILES', 'RECENT_HISTORY'],
        useLuscherIntake: false,
        backgroundIntervalMinutes: null,
        backgroundRunMode: 'independent'
      }
    ],
    roles,
    backgroundCognitionRate: 360,
    playwrightSearchUrl: 'http://localhost:3000',
    debugSRG: false,
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