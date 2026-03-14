/**
 * USE PHYSICS FREEZE HOOK
 * ========================
 * Hook for automatic physics stabilization and node freezing
 * 
 * Features:
 * - Velocity-based stabilization detection
 * - Timeout-based fallback freeze
 * - Manual freeze/unfreeze controls
 * - Physics state tracking
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ActivatedNode, StabilizationConfig, PhysicsState } from '../types/graph';

interface UsePhysicsFreezeOptions {
  autoFreezeEnabled?: boolean;
  stabilizationTimeout?: number;
  velocityThreshold?: number;
  checkInterval?: number;
}

interface UsePhysicsFreezeResult {
  physicsState: PhysicsState;
  freezeSimulation: () => void;
  unfreezeSimulation: () => void;
  unfreezeNode: (nodeId: string) => void;
  restartPhysics: () => void;
}

/**
 * Hook for managing physics simulation freeze state
 */
export function usePhysicsFreeze(
  nodes: ActivatedNode[],
  isActive: boolean,
  onNodesUpdate?: (nodes: ActivatedNode[]) => void,
  options: UsePhysicsFreezeOptions = {}
): UsePhysicsFreezeResult {
  const {
    autoFreezeEnabled = true,
    stabilizationTimeout = 3000,
    velocityThreshold = 0.1,
    checkInterval = 100
  } = options;

  const [physicsState, setPhysicsState] = useState<PhysicsState>({
    isRunning: false,
    isFrozen: false,
    averageVelocity: 0,
    frozenNodeCount: 0
  });

  const stabilizationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const velocityCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const nodesRef = useRef<ActivatedNode[]>(nodes);

  // Update nodes ref when nodes change
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Calculate average velocity
  const calculateAverageVelocity = useCallback((nodeList: ActivatedNode[]): number => {
    if (nodeList.length === 0) return 0;
    
    const totalVelocity = nodeList.reduce((sum, node) => {
      const vx = node.vx || 0;
      const vy = node.vy || 0;
      return sum + Math.sqrt(vx * vx + vy * vy);
    }, 0);
    
    return totalVelocity / nodeList.length;
  }, []);

  // Calculate maximum velocity among nodes
  const calculateMaxVelocity = useCallback((nodeList: ActivatedNode[]): number => {
    if (nodeList.length === 0) return 0;
    let maxV = 0;
    for (const node of nodeList) {
      const vx = node.vx || 0;
      const vy = node.vy || 0;
      const v = Math.sqrt(vx * vx + vy * vy);
      if (v > maxV) maxV = v;
    }
    return maxV;
  }, []);

  // Check if simulation is stabilized (avg AND max velocity)
  const isStabilized = useCallback((nodeList: ActivatedNode[], threshold = velocityThreshold): boolean => {
    const avgVelocity = calculateAverageVelocity(nodeList);
    const maxVelocity = calculateMaxVelocity(nodeList);
    // If max velocity is too high, we are not stable even if avg is low
    return avgVelocity < threshold && maxVelocity < threshold * 5;
  }, [calculateAverageVelocity, calculateMaxVelocity, velocityThreshold]);

  // Freeze all nodes
  const freezeSimulation = useCallback(() => {
    const frozenNodes = nodesRef.current.map(node => ({
      ...node,
      fx: node.x,
      fy: node.y,
      vx: 0,
      vy: 0
    }));

    nodesRef.current = frozenNodes;
    if (onNodesUpdate) {
      onNodesUpdate(frozenNodes);
    }

    setPhysicsState(prev => ({
      ...prev,
      isRunning: false,
      isFrozen: true,
      averageVelocity: 0,
      stabilizedAt: Date.now(),
      frozenNodeCount: frozenNodes.length
    }));

    // Clear any pending timers
    if (stabilizationTimerRef.current) {
      clearTimeout(stabilizationTimerRef.current);
      stabilizationTimerRef.current = null;
    }
    if (velocityCheckIntervalRef.current) {
      clearInterval(velocityCheckIntervalRef.current);
      velocityCheckIntervalRef.current = null;
    }

    console.log(`[SRG] Physics frozen - ${frozenNodes.length} nodes stabilized`);
  }, [onNodesUpdate]);

  // Unfreeze all nodes
  const unfreezeSimulation = useCallback(() => {
    const unfrozenNodes = nodesRef.current.map(node => ({
      ...node,
      fx: null,
      fy: null
    }));

    nodesRef.current = unfrozenNodes;
    if (onNodesUpdate) {
      onNodesUpdate(unfrozenNodes);
    }

    setPhysicsState(prev => ({
      ...prev,
      isRunning: true,
      isFrozen: false,
      frozenNodeCount: 0
    }));

    console.log('[SRG] Physics unfrozen - simulation restarted');
  }, [onNodesUpdate]);

  // Unfreeze a specific node (for dragging)
  const unfreezeNode = useCallback((nodeId: string) => {
    const updatedNodes = nodesRef.current.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          fx: null,
          fy: null
        };
      }
      return node;
    });

    nodesRef.current = updatedNodes;
    if (onNodesUpdate) {
      onNodesUpdate(updatedNodes);
    }

    setPhysicsState(prev => ({
      ...prev,
      frozenNodeCount: prev.frozenNodeCount - 1
    }));
  }, [onNodesUpdate]);

  // Restart physics with auto-freeze
  const restartPhysics = useCallback((simulation?: any) => {
    // Clear existing timers
    if (stabilizationTimerRef.current) {
      clearTimeout(stabilizationTimerRef.current);
    }
    if (velocityCheckIntervalRef.current) {
      clearInterval(velocityCheckIntervalRef.current);
    }

    // Unfreeze first
    unfreezeSimulation();

    // === ACTUAL FIX 1: Pre-constrain nodes to prevent flyaway ===
    try {
      const centerX = 0;
      const centerY = 0;
      const maxRadius = 500;
      const rounded = nodesRef.current.map(node => {
        const copy = { ...node } as any;
        if (!copy.x || !copy.y || isNaN(copy.x) || isNaN(copy.y)) {
          copy.x = centerX + (Math.random() - 0.5) * 200;
          copy.y = centerY + (Math.random() - 0.5) * 200;
        }
        const dx = copy.x - centerX;
        const dy = copy.y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxRadius) {
          copy.x = centerX + (dx / dist) * maxRadius;
          copy.y = centerY + (dy / dist) * maxRadius;
        }
        // Zero out velocities
        copy.vx = 0;
        copy.vy = 0;
        return copy as ActivatedNode;
      });
      nodesRef.current = rounded;
      if (onNodesUpdate) onNodesUpdate(rounded);
    } catch (e) {
      console.warn('[SRG] Failed to pre-constrain nodes', e);
    }

    // If a simulation object is passed in, nudge its alpha lower to prevent explosive forces
    if (simulation && typeof simulation.alpha === 'function') {
      try {
        simulation.alpha(0.3).restart();
      } catch (e) {
        // ignore
      }
    }

    // Method 1: Timeout-based freeze
    const startTime = performance.now();
    stabilizationTimerRef.current = setTimeout(() => {
      freezeSimulation();
      console.log(`[SRG] Force-froze after ${stabilizationTimeout}ms`);
    }, stabilizationTimeout);

    // Method 2: Velocity-based freeze (smarter)
    if (autoFreezeEnabled) {
      let checkCount = 0;
      velocityCheckIntervalRef.current = setInterval(() => {
        checkCount++;
        const currentNodes = nodesRef.current;
        const avgVelocity = calculateAverageVelocity(currentNodes);
        const maxVelocity = calculateMaxVelocity(currentNodes);

        setPhysicsState(prev => ({
          ...prev,
          averageVelocity: avgVelocity,
          maxVelocity
        }));

        if (isStabilized(currentNodes, velocityThreshold)) {
          freezeSimulation();
          if (velocityCheckIntervalRef.current) clearInterval(velocityCheckIntervalRef.current);
          if (stabilizationTimerRef.current) clearTimeout(stabilizationTimerRef.current);

          const duration = performance.now() - startTime;
          console.log(`[SRG] Velocity-stabilized after ${duration.toFixed(0)}ms (${checkCount} checks)`);
        }
      }, checkInterval);
    }
  }, [
    autoFreezeEnabled,
    stabilizationTimeout,
    checkInterval,
    freezeSimulation,
    unfreezeSimulation,
    calculateAverageVelocity,
    isStabilized,
    calculateMaxVelocity,
    velocityThreshold,
    physicsState.isFrozen
  ]);

  // Auto-restart when simulation becomes active
  useEffect(() => {
    if (isActive && !physicsState.isRunning && nodes.length > 0) {
      restartPhysics();
    }

    // Cleanup on unmount or when inactive
    return () => {
      if (stabilizationTimerRef.current) {
        clearTimeout(stabilizationTimerRef.current);
      }
      if (velocityCheckIntervalRef.current) {
        clearInterval(velocityCheckIntervalRef.current);
      }
    };
  }, [isActive, nodes.length, physicsState.isRunning, restartPhysics]);

  // Listen for viewport changes (resize/zoom/pan) and nudge physics to restart
  useEffect(() => {
    const onViewportChange = () => {
      // Restart physics so any clustered nodes can diffuse
      restartPhysics();
    };
    window.addEventListener('srg:viewport-change', onViewportChange);
    // Also listen for explicit kicks (node additions / bulk ops)
    const onKick = () => restartPhysics();
    window.addEventListener('srg:kick', onKick);
    return () => {
      window.removeEventListener('srg:viewport-change', onViewportChange);
      window.removeEventListener('srg:kick', onKick);
    };
  }, [restartPhysics]);

  return {
    physicsState,
    freezeSimulation,
    unfreezeSimulation,
    unfreezeNode,
    restartPhysics
  };
}
