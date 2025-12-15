

import { useState, useEffect, useRef, useCallback } from 'react';
import type { MemoryAtom } from '../types';

// Augment MemoryAtom with position and velocity for simulation
// FIX: Renamed `Node` to `GraphNode` to avoid collision with the global DOM `Node` type.
export interface GraphNode extends MemoryAtom {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Link {
    source: string; // uuid of source node
    target: string; // uuid of target node
    strength: number; 
}

// Export constants for use in visualization component
export const MIN_RADIUS = 8;
export const MAX_RADIUS = 30;

// New simulation config for semantic clustering and perpetual motion
const SIMULATION_CONFIG = {
  repulsion: 3500,          // Force pushing all nodes apart.
  typeRepulsionMultiplier: 1.5, // Extra push between different types of nodes.
  damping: 0.9,             // Friction.
  ambientJiggle: 0,         // Constant force to keep it alive.
  boundaryForce: 0.1,       // Strength of the 'soft wall' at the edges.
  boundaryPadding: 50,      // Distance from edge where boundary force starts.
};


export const useForceLayout = (atoms: MemoryAtom[], width: number, height: number, isActive: boolean) => {
  const nodesRef = useRef<GraphNode[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize nodes
  useEffect(() => {
    const existingNodesMap = new Map<string, GraphNode>(nodesRef.current.map(n => [n.uuid, n]));
    const newNodes = atoms.map((atom): GraphNode => {
      const existing = existingNodesMap.get(atom.uuid);
      if (existing) {
        return { ...existing, ...atom };
      }
      return {
        ...atom,
        x: width / 2 + (Math.random() - 0.5) * 50,
        y: height / 2 + (Math.random() - 0.5) * 50,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
      };
    });
    
    const atomUuids = new Set(atoms.map(a => a.uuid));
    const filteredNodes = newNodes.filter(n => atomUuids.has(n.uuid));
    
    nodesRef.current = filteredNodes;
    setNodes(filteredNodes);

  }, [atoms, width, height]);

  const simulationTick = useCallback(() => {
    if (!width || !height || nodesRef.current.length === 0) {
        return;
    };
    
    const { repulsion, typeRepulsionMultiplier, damping, ambientJiggle, boundaryForce, boundaryPadding } = SIMULATION_CONFIG;
    
    const currentNodes = nodesRef.current;

    // Apply repulsion and update positions
    for (let i = 0; i < currentNodes.length; i++) {
        const node = currentNodes[i];
        
        for (let j = i + 1; j < currentNodes.length; j++) {
            const other = currentNodes[j];
            const dx = node.x - other.x;
            const dy = node.y - other.y;
            let distanceSq = dx * dx + dy * dy;
            if (distanceSq < 100) distanceSq = 100;

            let typeMultiplier = 1.0;
            if (node.type !== other.type) {
                typeMultiplier = typeRepulsionMultiplier;
            }
            
            const force = (repulsion / distanceSq) * typeMultiplier;
            const fx = (dx / Math.sqrt(distanceSq)) * force;
            const fy = (dy / Math.sqrt(distanceSq)) * force;

            node.vx += fx;
            node.vy += fy;
            other.vx -= fx;
            other.vy -= fy;
        }

        // Soft boundary forces
        if (node.x < boundaryPadding) node.vx += (boundaryPadding - node.x) * boundaryForce;
        if (node.x > width - boundaryPadding) node.vx -= (node.x - (width - boundaryPadding)) * boundaryForce;
        if (node.y < boundaryPadding) node.vy += (boundaryPadding - node.y) * boundaryForce;
        if (node.y > height - boundaryPadding) node.vy -= (node.y - (height - boundaryPadding)) * boundaryForce;
    }

    // Mutate node positions based on velocity, preventing new object creation.
    for (const node of currentNodes) {
        node.vx = node.vx * damping + (Math.random() - 0.5) * ambientJiggle;
        node.vy = node.vy * damping + (Math.random() - 0.5) * ambientJiggle;
        node.x += node.vx;
        node.y += node.vy;
    }

    // Trigger re-render with a new array reference, but using the same, mutated node objects.
    setNodes([...currentNodes]);
    
  }, [width, height]);

  useEffect(() => {
    const loop = () => {
      simulationTick();
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    if (isActive && width > 0 && height > 0) {
        animationFrameRef.current = requestAnimationFrame(loop);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isActive, simulationTick, width, height]);

  // Return empty arrays for links and zones as they are no longer generated
  return { nodes, links: [], semanticZones: [] };
};
