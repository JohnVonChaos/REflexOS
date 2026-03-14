/**
 * USE NODE LIMITING HOOK
 * =======================
 * Hook for activation-based node limiting in SRG Explorer
 * 
 * Features:
 * - Activation ranking (0-1 score based on query relevance)
 * - Progressive disclosure (start with top N, expand on demand)
 * - Path importance calculation
 * - Statistics tracking
 */

import { useMemo, useState, useCallback } from 'react';
import type { GraphNode } from '../types';
import type { TraversalPath } from '../services/srg-word-hybrid';
import type { ActivatedNode, NodeRenderConfig } from '../types/graph';

interface UseNodeLimitingOptions {
  maxInitialNodes?: number;
  expansionStep?: number;
  minActivation?: number;
}

interface UseNodeLimitingResult {
  limitedNodes: ActivatedNode[];
  config: NodeRenderConfig;
  expandVisible: () => void;
  reduceVisible: () => void;
  resetVisible: () => void;
  setMinActivation: (threshold: number) => void;
}

/**
 * Hook for limiting visible nodes based on activation scores
 */
export function useNodeLimiting(
  allNodes: GraphNode[],
  queryWords: string[],
  topPaths: TraversalPath[] = [],
  options: UseNodeLimitingOptions = {}
): UseNodeLimitingResult {
  const {
    maxInitialNodes = 200,
    expansionStep = 100,
    minActivation = 0.0
  } = options;

  const [maxVisibleNodes, setMaxVisibleNodes] = useState(maxInitialNodes);
  const [activationThreshold, setActivationThreshold] = useState(minActivation);

  // Calculate activation scores for all nodes
  const activatedNodes = useMemo(() => {
    return calculateActivations(allNodes, queryWords, topPaths);
  }, [allNodes, queryWords, topPaths]);

  // Filter and limit nodes based on config
  const limitedNodes = useMemo(() => {
    return limitNodesByActivation(
      activatedNodes,
      maxVisibleNodes,
      activationThreshold
    );
  }, [activatedNodes, maxVisibleNodes, activationThreshold]);

  // Build config object for UI
  const config: NodeRenderConfig = useMemo(() => ({
    maxVisibleNodes,
    showingCount: limitedNodes.length,
    totalCount: activatedNodes.length,
    expansionStep,
    minActivation: activationThreshold
  }), [maxVisibleNodes, limitedNodes.length, activatedNodes.length, expansionStep, activationThreshold]);

  // Expand visible node count
  const expandVisible = useCallback(() => {
    setMaxVisibleNodes(prev => Math.min(prev + expansionStep, activatedNodes.length));
  }, [expansionStep, activatedNodes.length]);

  // Reduce visible node count (remove lowest-activated visible nodes)
  const reduceVisible = useCallback(() => {
    setMaxVisibleNodes(prev => Math.max(Math.max(expansionStep, maxInitialNodes), prev - expansionStep));
  }, [expansionStep, maxInitialNodes]);

  // Reset to initial count
  const resetVisible = useCallback(() => {
    setMaxVisibleNodes(maxInitialNodes);
  }, [maxInitialNodes]);

  // Update activation threshold
  const setMinActivation = useCallback((threshold: number) => {
    setActivationThreshold(Math.max(0, Math.min(1, threshold)));
  }, []);

  return {
    limitedNodes,
    config,
    expandVisible,
    reduceVisible,
    resetVisible,
    setMinActivation
  };
}

// ============================================================================
// ACTIVATION CALCULATION
// ============================================================================

/**
 * Calculate activation scores for nodes based on query relevance
 */
function calculateActivations(
  nodes: GraphNode[],
  queryWords: string[],
  topPaths: TraversalPath[]
): ActivatedNode[] {
  const querySet = new Set(queryWords.map(w => w.toLowerCase()));
  
  // Build set of nodes in top paths with importance scores
  const pathNodes = new Map<string, number>();
  for (let i = 0; i < topPaths.length; i++) {
    const path = topPaths[i];
    const pathWeight = 1.0 / (i + 1); // First path = 1.0, second = 0.5, third = 0.33...
    
    for (const nodeId of path.nodes) {
      const current = pathNodes.get(nodeId) || 0;
      pathNodes.set(nodeId, current + pathWeight * path.totalInterference);
    }
  }

  // Calculate activation for each node
  const activated: ActivatedNode[] = nodes.map((node, index) => {
    let activation = 0.0;
    
    // Direct query match = highest activation
    if (querySet.has(node.word.toLowerCase())) {
      activation = 1.0;
    }
    // In top paths = medium-high activation
    else if (pathNodes.has(node.id)) {
      activation = 0.5 + (pathNodes.get(node.id)! * 0.4); // 0.5 to 0.9
    }
    // Semantic primitive = baseline activation
    else if (node.primitiveType) {
      activation = 0.3;
    }
    // Otherwise, use layer-based scoring (longer words = slightly higher)
    else {
      activation = Math.min(node.layer / 30, 0.2); // 0.0 to 0.2
    }

    // Boost recently created nodes slightly
    if (node.createdAt) {
      const ageMs = Date.now() - node.createdAt;
      const recencyBoost = Math.exp(-ageMs / (30 * 24 * 60 * 60 * 1000)); // 30-day decay
      activation += recencyBoost * 0.1;
    }

    // Clamp to [0, 1]
    activation = Math.max(0, Math.min(1, activation));

    return {
      ...node,
      activation,
      activationRank: 0, // Will be set after sorting
      inTopPaths: pathNodes.has(node.id),
      pathImportance: pathNodes.get(node.id) || 0,
      x: 0, // Will be set by force layout
      y: 0,
      vx: 0,
      vy: 0
    };
  });

  // Sort by activation and assign ranks
  activated.sort((a, b) => b.activation - a.activation);
  activated.forEach((node, index) => {
    node.activationRank = index + 1;
  });

  return activated;
}

// ============================================================================
// NODE LIMITING
// ============================================================================

/**
 * Limit nodes by activation score
 */
function limitNodesByActivation(
  nodes: ActivatedNode[],
  maxNodes: number,
  minActivation: number
): ActivatedNode[] {
  return nodes
    .filter(n => n.activation >= minActivation)
    .slice(0, maxNodes);
}
