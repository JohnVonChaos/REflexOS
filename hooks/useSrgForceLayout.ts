
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

const DEFAULT_CONFIG: SRGDisplayConfig = {
  layout: 'force',
  repulsion: 25,
  linkDistance: 80,
  damping: 0.9,
  colorScheme: 'layer',
  showArrows: false,
  labelFontSize: 14,
  labelZoomIndependent: true,
};

export const useSrgForceLayout = (
    srgNodes: SrgNode[], 
    srgLinks: SrgLink[], 
    width: number, 
    height: number, 
    isActive: boolean,
    config: SRGDisplayConfig
) => {
  const nodesRef = useRef<GraphNode[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  
  // Refs for stability to avoid simulation reconstruction
  const configRef = useRef(config);
  const linksRef = useRef(srgLinks);
  const alphaRef = useRef(0.3);
  const isDraggingRef = useRef(false);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { linksRef.current = srgLinks; }, [srgLinks]);

  // Initialize nodes
  useEffect(() => {
    // ⚠️ CRITICAL: Don't initialize if dimensions aren't ready
    if (!width || !height) {
      return;
    }

    const existingNodesMap = new Map<string, GraphNode>(nodesRef.current.map(n => [n.id, n]));
    
    // Only update nodesRef if srgNodes content changed significantly or first init
    const forcedReinit = nodesRef.current.length === 0;
    
    nodesRef.current = srgNodes.map((node): GraphNode => {
      const existing = existingNodesMap.get(node.id);
      
      // If node exists, preserve position and velocity
      if (existing) {
        return { ...existing, ...node };
      }
      
      // Initialize new node with proper random spread around center
      const angle = Math.random() * 2 * Math.PI;
      const minDim = Math.min(width, height);
      const radius = (minDim * 0.15) + Math.random() * (minDim * 0.1);

      return {
        ...node,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 2.0,
        vy: (Math.random() - 0.5) * 2.0,
      };
    });
    
    const prevCount = existingNodesMap.size;
    const newCount = nodesRef.current.length - prevCount;
    
    // Kick simulation if new nodes added
    if (newCount > 0) {
        alphaRef.current = Math.max(alphaRef.current, 0.8);
        try { window.dispatchEvent(new Event('srg:kick')); } catch (e) {}
    }

    setNodes([...nodesRef.current]);
    setLinks(srgLinks);
  }, [srgNodes, srgLinks, width, height]);


  const simulationTick = useCallback(() => {
    if (!width || !height) return;

    const currentNodes = nodesRef.current;
    if (currentNodes.length === 0 || alphaRef.current < 0.001) return;

    const { repulsion, linkDistance, damping } = { ...DEFAULT_CONFIG, ...configRef.current };
    
    const CHARGE_DISTANCE_MAX = 500;
    const linkStrength = 0.4;
    const centerForce = 0.05;
    const collisionRadius = 25;
    const collisionStrength = 0.8;
    const velocityDecay = 0.7; // damping
    const alphaDecay = 0.015;
    
    // alpha decay
    alphaRef.current *= (1 - alphaDecay);

    const nodeMap = new Map<string, GraphNode>(currentNodes.map(n => [n.id, n]));

    // Apply forces
    for (const node of currentNodes) {
      if ((node as any).fx != null) { // Fixed position (e.g. dragging)
          node.x = (node as any).fx;
          node.y = (node as any).fy;
          node.vx = 0;
          node.vy = 0;
          continue;
      }

      // Repulsion from other nodes (Many-Body Charge)
      for (const other of currentNodes) {
        if (node === other) continue;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        
        let distanceSq = dx * dx + dy * dy;
        
        // Jitter overlap to avoid stuck nodes
        if (distanceSq === 0) {
            distanceSq = 0.01;
        }

        const distance = Math.sqrt(distanceSq);
        
        if (distance < CHARGE_DISTANCE_MAX) {
          const capped = Math.max(distanceSq, 100); // 100 = 10^2
          // Increase repulsion floor
          const force = (repulsion * 80) / capped; 
          const angle = Math.atan2(dy, dx);
          
          if (!isNaN(angle)) {
              node.vx += Math.cos(angle) * force * alphaRef.current;
              node.vy += Math.sin(angle) * force * alphaRef.current;
          }
        }

        // Collision separation (Harder constraint)
        if (distance > 0 && distance < collisionRadius) {
          const overlap = (collisionRadius - distance) / distance;
          node.vx += dx * overlap * collisionStrength;
          node.vy += dy * overlap * collisionStrength;
        }
      }

      // Center force (Gentle gravity)
      node.vx += (width / 2 - node.x) * centerForce * alphaRef.current;
      node.vy += (height / 2 - node.y) * centerForce * alphaRef.current;
    }

    // Link force (Attraction/Spring)
    for (const link of linksRef.current) {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (!source || !target) continue;
      
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      
      // Jitter for exact overlap to prevent division by zero / infinite forces
      if (dx === 0 && dy === 0) {
          source.vx += (Math.random() - 0.5);
          source.vy += (Math.random() - 0.5);
          continue;
      }
      
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      
      // Use config linkDistance with layer spacing
      const targetDist = linkDistance * (1 + (source.layer + target.layer) / 100);
      const displacement = distance - targetDist;
      
      // Reduce force if displacement is huge (outlier clamp)
      const clampedDisplacement = Math.sign(displacement) * Math.min(Math.abs(displacement), 500); 
      
      const force = clampedDisplacement * linkStrength * (link.type === 'semantic' ? 1.2 : 1) * alphaRef.current;
      
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      // Safety check for NaN
      if (isNaN(fx) || isNaN(fy)) continue;

      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    // Update positions
    const BOUNDARY = 3000;
    const MAX_VELOCITY = 40; // Lower max velocity for stability

    for (const node of currentNodes) {
      if ((node as any).fx != null) continue;

      node.vx *= velocityDecay;
      node.vy *= velocityDecay;


      // Velocity clamping
      if (isNaN(node.vx) || isNaN(node.vy)) {
          node.vx = 0; 
          node.vy = 0;
      }
      const speedSq = node.vx*node.vx + node.vy*node.vy;
      if (speedSq > MAX_VELOCITY * MAX_VELOCITY) {
        const speed = Math.sqrt(speedSq);
        const dampen = MAX_VELOCITY / speed;
        node.vx *= dampen;
        node.vy *= dampen;
      }

      node.x += node.vx;
      node.y += node.vy;

      // Soft Boundary Constraint (Bounce instead of Teleport)
      // This prevents the "shrinking" effect where high propulsion caused nodes to 
      // fly off-screen and get reset to the center (making a dense clump).
      if (Math.abs(node.x - width/2) > BOUNDARY) {
          node.x = Math.sign(node.x - width/2) * BOUNDARY + width/2;
          node.vx *= -0.5; // Bounce with energy loss
      }
      if (Math.abs(node.y - height/2) > BOUNDARY) {
          node.y = Math.sign(node.y - height/2) * BOUNDARY + height/2;
          node.vy *= -0.5; // Bounce with energy loss
      }
      
      // NaN Check (Final Safety)
      if (isNaN(node.x)) node.x = width/2;
      if (isNaN(node.y)) node.y = height/2;
    }

    setNodes([...currentNodes]);
    
  }, [width, height]);

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

  // On viewport changes (zoom/pan/resize) - DON'T EXPLODE
  useEffect(() => {
    const onViewportChange = () => {
      // Just a tiny nudge to keep it alive if it was almost stopped, but don't reset to 1.0
      if (alphaRef.current < 0.1) {
          alphaRef.current = 0.15;
      }
    };

    window.addEventListener('srg:viewport-change', onViewportChange as EventListener);
    window.addEventListener('resize', onViewportChange as EventListener);
    return () => {
      window.removeEventListener('srg:viewport-change', onViewportChange as EventListener);
      window.removeEventListener('resize', onViewportChange as EventListener);
    };
  }, []);

  return { nodes, links };
};
