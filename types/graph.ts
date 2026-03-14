/**
 * SRG EXPLORER ENHANCEMENT TYPES
 * ================================
 * Type definitions for:
 * - Node limiting and activation ranking
 * - Auto-clustering for dense regions
 * - Intelligent edge filtering
 * - Zoom-based LOD (Level of Detail)
 * - Temporal playback system
 * - Physics stabilization
 */

import type { GraphNode as BaseGraphNode, GraphLink, RelationType } from '../types';
import type { RelationalEdge } from '../services/srg-word-hybrid';

// ============================================================================
// NODE LIMITING & ACTIVATION
// ============================================================================

export interface NodeRenderConfig {
  maxVisibleNodes: number;        // Default: 200
  showingCount: number;            // Currently visible
  totalCount: number;              // Total available
  expansionStep: number;           // Default: 100 (for "Show More")
  minActivation: number;           // Default: 0.0 (threshold)
}

export interface ActivatedNode extends BaseGraphNode {
  activation: number;              // 0.0 to 1.0 - how relevant/important
  activationRank: number;          // 1 to N - sorted by activation
  inTopPaths: boolean;             // Is this node in top query paths?
  pathImportance: number;          // Sum of path scores this node appears in
  x: number;                       // Position (from force layout)
  y: number;
  vx: number;                      // Velocity (from force layout)
  vy: number;
  fx?: number | null;              // Fixed position (when frozen)
  fy?: number | null;
}

// ============================================================================
// AUTO-CLUSTERING
// ============================================================================

export interface Cluster {
  id: string;
  type: 'cluster' | 'node';
  centroid: { x: number; y: number };
  nodes: ActivatedNode[];
  label: string;                   // e.g., "consciousness concepts (47)"
  dominantRelationType?: RelationType;
  averageActivation: number;
  boundingBox: { x1: number; y1: number; x2: number; y2: number };
  isExpanded?: boolean;            // Whether cluster is currently expanded
}

export interface ClusteringConfig {
  gridSize: number;                // Default: 100 - spatial grid cell size
  minClusterSize: number;          // Default: 10 - minimum nodes to form cluster
  maxClusterSize: number;          // Default: 100 - maximum nodes in one cluster
  enabled: boolean;                // Default: true
}

// ============================================================================
// ZOOM-BASED LOD (LEVEL OF DETAIL)
// ============================================================================

export interface LODConfig {
  farZoomThreshold: number;    // Default: 1000 - only major clusters
  midZoomThreshold: number;    // Default: 500 - top nodes + distant clusters
  closeZoomThreshold: number;  // Default: 200 - detailed view
  maxNodesPerLevel: {
    far: number;               // Default: 50
    mid: number;               // Default: 200
    close: number;             // Default: 500
  };
  enabled: boolean;            // Default: true
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ViewportState {
  zoom: number;
  pan: { x: number; y: number };
  boundingBox: BoundingBox;
}

// ============================================================================
// INTELLIGENT EDGE FILTERING
// ============================================================================

export interface EdgeRenderConfig {
  minInterference: number;         // Default: 0.5 - min interference amplitude
  minStrength: number;             // Default: 2 - min edge strength
  showSyntactic: boolean;          // Default: false - hide syntactic by default
  showOnlyTopPaths: boolean;       // Default: true - only edges in top paths
  dimBackgroundEdges?: boolean;    // Default: true - visually dim non-top edges
  maxEdgesVisible: number;         // Default: 500
}

export interface StyledEdge extends GraphLink {
  color: string;
  opacity: number;
  width: number;
  saturation: number;              // 0-1, based on recency
  zIndex: number;                  // Drawing order
  inTopPaths?: boolean;            // Helper flag for rendering
  dashArray?: string;              // For dashed lines (e.g., "5,5")
  animated?: boolean;              // Pulse/flow animation
  interferenceAmplitude?: number;
  strength?: number;
}

// Relation type priority tiers for edge filtering
export const RELATION_PRIORITY = {
  HIGH: ['IS', 'IS_A', 'CREATES', 'MAKES', 'CAUSES', 'WANTS', 'LOVES', 'NEEDS', 'CAN', 'ABLE_TO'] as RelationType[],
  MEDIUM: ['HAS', 'OWNS', 'WAS', 'WILL_BE', 'KNOWS', 'UNDERSTANDS'] as RelationType[],
  LOW: ['syntactic', 'WITH', 'AT', 'IN'] as RelationType[]
};

// Color scheme for relation types
export const RELATION_COLORS: Record<string, string> = {
  // Identity (bright blue)
  'IS': '#3B82F6', 'IS_A': '#60A5FA', 'IS_NOT': '#93C5FD',
  
  // Causation (orange)
  'CREATES': '#F97316', 'MAKES': '#FB923C', 'CAUSES': '#FDBA74', 'MAKE': '#F97316',
  
  // Desire (warm pink)
  'WANTS': '#EC4899', 'LOVES': '#F472B6', 'NEEDS': '#F9A8D4', 'LIKE': '#FBCFE8',
  'WANT': '#EC4899', 'LOVE': '#F472B6', 'NEED': '#F9A8D4',
  
  // Capability (cyan)
  'CAN': '#06B6D4', 'ABLE_TO': '#22D3EE', 'CAN_BE': '#67E8F9',
  
  // Possession (green)
  'HAS': '#10B981', 'HAS_A': '#34D399', 'OWNS': '#6EE7B7',
  
  // Temporal (gradient purple→blue)
  'WAS': '#8B5CF6', 'WILL_BE': '#3B82F6', 'USED_TO': '#A78BFA', 'WILL': '#3B82F6',
  
  // Knowledge (purple)
  'KNOWS': '#8B5CF6', 'UNDERSTANDS': '#A78BFA',
  
  // Obligation (red)
  'MUST': '#EF4444', 'SHOULD': '#F87171',
  
  // Actions (amber)
  'GIVE': '#F59E0B', 'TAKE': '#FBBF24', 'GET': '#FCD34D', 'FEEL': '#FDE68A',
  'THINK': '#A78BFA', 'SAY': '#C4B5FD', 'MEAN': '#DDD6FE',
  
  // Syntactic (dim gray)
  'syntactic': '#6B7280', 'semantic': '#9CA3AF'
};

// ============================================================================
// PHYSICS STABILIZATION
// ============================================================================

export interface StabilizationConfig {
  autoFreezeEnabled: boolean;      // Default: true
  stabilizationTimeout: number;    // Default: 3000ms - max time before freeze
  velocityThreshold: number;       // Default: 0.1 - avg velocity to consider stable
  checkInterval: number;           // Default: 100ms - how often to check velocity
}

export interface PhysicsState {
  isRunning: boolean;
  isFrozen: boolean;
  averageVelocity: number;
  stabilizedAt?: number;           // Timestamp when stabilized
  frozenNodeCount: number;
}

// ============================================================================
// TEMPORAL PLAYBACK SYSTEM
// ============================================================================

export interface TemporalSnapshot {
  timestamp: number;               // Unix timestamp or token position
  nodes: Set<string>;              // Node IDs present at this time
  edges: Map<string, RelationalEdge>; // Edge key -> edge state
  activations: Map<string, number>; // Node ID -> activation level
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;             // Current playback position
  startTime: number;               // Timeline start
  endTime: number;                 // Timeline end
  speed: number;                   // Playback speed multiplier (0.5x to 10x)
  mode: 'chronological' | 'activation' | 'path' | 'interference';
}

export interface TemporalConfig {
  enabled: boolean;                // Default: false (Phase 3 feature)
  snapshotInterval: number;        // How often to capture snapshots (in tokens)
  maxSnapshots: number;            // Max snapshots to store
}

// ============================================================================
// VISUAL SCHEME
// ============================================================================

export const VISUAL_SCHEME = {
  nodes: {
    default: '#64748B',           // Slate
    activated: '#3B82F6',         // Blue
    inPath: '#F59E0B',            // Amber
    cluster: '#8B5CF6',           // Purple
    primitive: '#10B981'          // Green for semantic primitives
  },
  edges: {
    identity: '#3B82F6',          // Blue family
    causation: '#F97316',         // Orange family
    desire: '#EC4899',            // Pink family
    capability: '#06B6D4',        // Cyan family
    possession: '#10B981',        // Green family
    temporal: '#8B5CF6',          // Purple family
    knowledge: '#8B5CF6',         // Purple
    syntactic: '#6B7280'          // Gray
  },
  highlights: {
    hover: '#FBBF24',             // Yellow
    selected: '#EF4444',          // Red
    path: '#10B981'               // Green
  }
};

// ============================================================================
// GRAPH STATISTICS
// ============================================================================

export interface GraphStats {
  totalNodes: number;
  visibleNodes: number;
  totalEdges: number;
  visibleEdges: number;
  clusterCount: number;
  averageActivation: number;
  physicsState: PhysicsState;
  viewportState: ViewportState;
  renderTime: number;              // Last render time in ms
  fps: number;                     // Current FPS
}

// ============================================================================
// COMBINED RENDER STATE
// ============================================================================

export interface GraphRenderState {
  nodes: ActivatedNode[];
  edges: StyledEdge[];
  clusters: Cluster[];
  stats: GraphStats;
  config: {
    nodeRender: NodeRenderConfig;
    edgeRender: EdgeRenderConfig;
    clustering: ClusteringConfig;
    lod: LODConfig;
    stabilization: StabilizationConfig;
    temporal: TemporalConfig;
  };
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type RenderMode = 'simple' | 'intermediate' | 'advanced';

export interface ProgressiveDisclosureState {
  currentMode: RenderMode;
  showRelationLabels: boolean;
  showInterferenceOverlay: boolean;
  showPositionCoordinates: boolean;
  showPathScoring: boolean;
  showTemporalDecay: boolean;
  showDebugInfo: boolean;
}
