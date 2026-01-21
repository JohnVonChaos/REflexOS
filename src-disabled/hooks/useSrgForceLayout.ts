

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GraphNode as SrgNode, GraphLink as SrgLink, SRGDisplayConfig } from '../types';

// Augment nodes with position and velocity for simulation
export interface GraphNode extends SrgNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Link extends SrgLink {}

const DEFAULT_CONFIG = {
  repulsion: 25,
  linkDistance: 80,
  damping: 0.9,
};

export const useSrgForceLayout = (
    srgNodes: SrgNode[], 
    srgLinks: SrgLink[], 
    width: number, 
    height: number, 
    isActive: boolean,
    config?: Partial<SRGDisplayConfig>
) => {
  const nodesRef = useRef<GraphNode[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize nodes
  useEffect(() => {
    const existingNodesMap = new Map<string, GraphNode>(nodesRef.current.map(n => [n.id, n]));
    nodesRef.current = srgNodes.map((node): GraphNode => {
      const existing = existingNodesMap.get(node.id);
      if (existing) {
        // Keep existing positions for stability when nodes are just being filtered
        return { ...existing, ...node };
      }
      return {
        ...node,
        x: width / 2 + (Math.random() - 0.5) * width * 0.1,
        y: height / 2 + (Math.random() - 0.5) * height * 0.1,
        vx: 0,
        vy: 0,
      };
    });
    setNodes(nodesRef.current);
    setLinks(srgLinks);
  }, [srgNodes, srgLinks, width, height]);

  const simulationTick = useCallback(() => {
    if (!width || !height) return;

    const currentNodes = nodesRef.current;
    if (currentNodes.length === 0) return;

    const repulsion = config?.repulsion ?? DEFAULT_CONFIG.repulsion;
    const linkDistance = config?.linkDistance ?? DEFAULT_CONFIG.linkDistance;
    const damping = config?.damping ?? DEFAULT_CONFIG.damping;
    const linkStrength = 0.1;
    const centerForce = 0.005;

    const nodeMap = new Map<string, GraphNode>(currentNodes.map(n => [n.id, n]));

    // Apply forces
    for (const node of currentNodes) {
      // Repulsion from other nodes
      for (const other of currentNodes) {
        if (node === other) continue;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        let distanceSq = dx * dx + dy * dy;
        if (distanceSq < 100) distanceSq = 100;

        const force = repulsion / distanceSq;
        const angle = Math.atan2(dy, dx);
        node.vx += Math.cos(angle) * force;
        node.vy += Math.sin(angle) * force;
      }

      // Center force
      node.vx += (width / 2 - node.x) * centerForce;
      node.vy += (height / 2 - node.y) * centerForce;
    }

    // Link force (attraction)
    for (const link of links) {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (!source || !target) continue;
      
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const displacement = distance - (linkDistance * (1 + (source.layer + target.layer) / 50));
      const force = displacement * linkStrength * (link.type === 'semantic' ? 1.5 : 1);
      
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    // Update positions
    for (const node of currentNodes) {
      node.vx *= damping;
      node.vy *= damping;
      
      // Prevent extreme velocities
      const speed = Math.sqrt(node.vx*node.vx + node.vy*node.vy);
      if (speed > 20) {
        node.vx = (node.vx / speed) * 20;
        node.vy = (node.vy / speed) * 20;
      }

      node.x += node.vx;
      node.y += node.vy;
    }

    setNodes([...currentNodes]);
    
  }, [width, height, links, config?.repulsion, config?.linkDistance, config?.damping]);

  useEffect(() => {
    if (!isActive || !width || !height) {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        return;
    }
    
    const loop = () => {
      simulationTick();
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, simulationTick, width, height]);

  return { nodes, links };
};
