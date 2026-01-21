// Turn-based context types for temporal awareness

export interface Turn {
    id: string;           // UUID
    role: 'user' | 'model' | 'system';
    content: string;
    timestamp: number;
    hash: string;         // SHA-256 of content
}

export interface TurnSequence {
    turns: Turn[];
    timestamp: number;
    hash: string;         // Hash of turn IDs in sequence
}

export type ContextDiffEvent =
    | { type: 'TURN_ADDED'; turn: Turn; position: number }
    | { type: 'TURN_REMOVED'; turnId: string; position: number }
    | { type: 'TURN_RESTORED'; turn: Turn; position: number; gapMs: number }
    | { type: 'SEQUENCE_REORDERED'; oldSequence: string[]; newSequence: string[] }
    | { type: 'CONTEXT_WIPE'; turnCount: number }
    | { type: 'CONTEXT_FIRST_SEEN'; turnCount: number };

export interface DualProcessConfig {
    maxIterations: number;
    ontologyThreshold: number;
    fairnessWindow: number;
    enableContextDiffer: boolean;
    scratchpadPersistence: 'indexeddb' | 'file';
    hudRefreshInterval: number;
}

export interface ScratchpadEntry {
    id: string;
    role: 'GENERATOR' | 'REFINER' | 'SYSTEM';
    content: string;
    timestamp: number;
    tension: 'HIGH' | 'LOW' | 'BALANCED';
    actionType: 'DISTILL' | 'COMPRESS' | 'NAVIGATE' | 'EDIT' | 'OBSERVE' | 'RESEARCH' | 'THOUGHT';
}

export interface DistilledInsight {
    query: string;
    distilledChunk: string; // ~500 chars max
    confidence: number; // 0-1
    sources: any[];
    originalLength: number;
    compressedLength: number;
    timestamp: number;
}
