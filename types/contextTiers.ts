// Types for Tiered Context Management (Phase 1)
export enum LayerId {
  SUBCONSCIOUS = 'SUBCONSCIOUS',
  CONSCIOUS = 'CONSCIOUS',
  SYNTHESIS = 'SYNTHESIS',
  ARBITER = 'ARBITER'
}

export enum ModelId {
  QWEN_3B = 'qwen2.5-3b-instruct',
  GEMMA_3N = 'google/gemma-3n-e4b',
  HERMES_3B = 'hermes-3-llama-3.2-3b'
}

export enum ContextTier {
  LIVE = 'LIVE',
  POSTIT = 'POSTIT',
  DEEP = 'DEEP'
}

export interface ContextItem {
  id: string; // uuid
  text: string;
  tokens: number;
  timestamp: number; // epoch ms
  layerOrigin: LayerId;
  srgNodeIds?: string[];
  pinned?: boolean;
  tier: ContextTier;
  usageCount: number;
  lastAccessedTurn?: number;
}

export interface ImportanceScorerConfig {
  recencyWeight: number;
  srgCentralityWeight: number;
  usageCountWeight: number;
  pinnedBoost: number;
}

export interface ContextProfile {
  layerId: LayerId;
  modelId: ModelId;
  softThresholdTokens: number;
  hardLimitTokens: number;
  maxTrapDoorDropTokens: number;
  importanceScorerConfig: ImportanceScorerConfig;
}

export interface TrapDoorState {
  basket: ContextItem[];
  layerId: LayerId;
  turnId: number;
  droppedAt: number;
}

export interface ContextSnapshot {
  turnId: number;
  layerId: LayerId;
  modelId: ModelId;
  items: ContextItem[];
  totalTokens: number;
  tierBreakdown: { live: number; postit: number; deep: number };
}

export interface ContextWorkspace {
  id: string;
  name: string;
  itemIds: string[]; // ids of ContextItem
  fileIds?: string[]; // project file ids to include
  createdAt: number;
  lastUsedAt?: number;
  description?: string;
}
