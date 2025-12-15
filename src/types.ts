

export interface ProjectFile {
  id: string;
  name: string;
  content: string;
  language: string;
  importedAt: number;
}

export type MemoryAtomType = 'user_message' | 'model_response' | 'steward_note' | 'conscious_thought' | 'subconscious_reflection' | 'axiom' | 'srg_augmentation';

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
    CORE_NARRATIVE: "Core Narrative",
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
}

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
}

export interface SRGDisplayConfig {
    layout: DisplayLayoutType;
    repulsion: number;
    linkDistance: number;
    damping: number;
    colorScheme: 'layer' | 'highlight';
    showArrows: boolean;
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
  roles: Record<CognitiveRole, RoleSetting>;
  backgroundCognitionRate: number;
  debugSRG: boolean;
  apiTokenLimit: number;
  passFullCognitiveTrace: boolean;
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


export const getDefaultSettings = (): AISettings => {
    // Default prompts are now stored here to initialize the workflow
    const SUBCONSCIOUS_DEFAULT_PROMPT = `You are a creative and associative process. Review the provided context, especially the "Previous Turn's Full Cognitive Trace", and brainstorm raw ideas, connections, and possibilities related to the user's query. Build upon or diverge from previous thoughts as needed. Do not filter your output.`;
    const CONSCIOUS_DEFAULT_PROMPT = `You are a critical and analytical filter. Review the provided brainstorm, the "Previous Turn's Full Cognitive Trace", and other context. Your task is to refine the raw ideas into a structured, coherent, and logical plan to address the user's query. Ensure your plan shows continuity with, or conscious deviation from, the previous turn's thinking.`;
    const SYNTHESIS_DEFAULT_PROMPT = `You are the final executive layer. Synthesize all provided information (the user's query, your refined plan, and any background facts) into a single, polished, user-facing response. Adhere strictly to the plan. Do NOT generate axioms; a separate agent will handle that if enabled.`;
    const AXIOM_GENERATION_PROMPT = `You are the Arbiter, a meta-cognitive agent. Your role is to analyze a completed conversational turn to identify any new, generalizable principles (Axioms) that were discovered or applied. Review the user's query, the AI's internal monologue (plan), and its final response. If you identify any new axioms, state them clearly. Respond with a single JSON object in a markdown code block. The object must have a key "axioms", which is an array of objects, each with "text" and "id" properties. The 'id' should be a concise, lowercase, dot-separated namespace (e.g., 'reasoning.axiom', 'safety.axiom'). If no new axioms are found, return an empty array.

Example:
\`\`\`json
{
  "axioms": [
    {
      "text": "A stable mind is a safe mind.",
      "id": "stability.axiom"
    }
  ]
}
\`\`\``;

    const defaultGemini = 'gemini-2.5-flash';
    const defaultGeminiLite = 'gemini-2.5-flash-lite';
    const defaultProvider: AIProvider = 'gemini';
    
    const roles: Record<CognitiveRole, RoleSetting> = {
        conscious: { enabled: true, provider: defaultProvider, selectedModel: defaultGeminiLite },
        subconscious: { enabled: true, provider: defaultProvider, selectedModel: defaultGeminiLite }, // Not configurable as a background agent
        synthesis: { enabled: true, provider: defaultProvider, selectedModel: defaultGemini }, // Not configurable as a background agent
        arbiter: { enabled: false, provider: defaultProvider, selectedModel: defaultGeminiLite }, // Deprecated
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
                id: 'subconscious_default',
                name: 'Subconscious Reflection',
                enabled: true,
                provider: 'gemini',
                selectedModel: defaultGemini,
                systemPrompt: SUBCONSCIOUS_DEFAULT_PROMPT,
                inputs: ['USER_QUERY', 'RCB', 'RECALLED_AXIOMS', 'RECENT_HISTORY', 'RESONANCE_MEMORIES', 'PREVIOUS_COGNITIVE_TRACE']
            },
            {
                id: 'conscious_default',
                name: 'Conscious Planner',
                enabled: true,
                provider: 'gemini',
                selectedModel: defaultGemini,
                systemPrompt: CONSCIOUS_DEFAULT_PROMPT,
                inputs: ['USER_QUERY', 'RCB', 'RECALLED_AXIOMS', 'RECENT_HISTORY', 'OUTPUT_OF_subconscious_default', 'PREVIOUS_COGNITIVE_TRACE']
            },
            {
                id: 'synthesis_default',
                name: 'Final Synthesis',
                enabled: true,
                provider: 'gemini',
                selectedModel: defaultGemini,
                systemPrompt: SYNTHESIS_DEFAULT_PROMPT,
                inputs: ['USER_QUERY', 'BACKGROUND_INSIGHTS', 'CONTEXT_FILES', 'OUTPUT_OF_conscious_default']
            },
            {
                id: 'axiom_generation_default',
                name: 'Axiom Generation',
                enabled: false, // Disabled by default for performance. User can enable for better axiom quality.
                provider: 'gemini',
                selectedModel: defaultGemini,
                systemPrompt: AXIOM_GENERATION_PROMPT,
                inputs: ['USER_QUERY', 'OUTPUT_OF_conscious_default', 'OUTPUT_OF_synthesis_default']
            }
        ],
        roles,
        backgroundCognitionRate: 360,
        debugSRG: false,
        apiTokenLimit: 1048576,
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

export interface GraphState {
    nodes: GraphNode[];
    links: GraphLink[];
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
