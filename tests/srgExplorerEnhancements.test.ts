/**
 * SRG EXPLORER ENHANCEMENT TEST
 * ==============================
 * Test suite for node limiting, edge filtering, and physics freeze
 */

import { describe, it, expect } from 'vitest';
import { EdgeFilteringService } from '../src/services/srgEdgeFiltering';
import { ViewportCulling } from '../src/services/srgViewportCulling';
import type { GraphLink } from '../types';
import type { ActivatedNode, ViewportState, LODConfig } from '../src/types/graph';

describe('SRG Explorer Enhancements', () => {
  describe('EdgeFilteringService', () => {
    it('should filter edges below minimum strength', () => {
      const edges: GraphLink[] = [
        { source: 'a', target: 'b', type: 'semantic', accessedAt: [Date.now()], strength: 1 },
        { source: 'b', target: 'c', type: 'semantic', accessedAt: [Date.now()], strength: 5 },
        { source: 'c', target: 'd', type: 'syntactic', accessedAt: [Date.now()], strength: 10 },
      ];

      const config = EdgeFilteringService.getDefaultConfig();
      config.minStrength = 3;

      const filtered = EdgeFilteringService.filterAndStyleEdges(edges, [], config);
      
      expect(filtered.length).toBe(2); // Only edges with strength >= 3
      expect(filtered.find(e => e.source === 'a')).toBeUndefined();
    });

    it('should hide syntactic edges when disabled', () => {
      const edges: GraphLink[] = [
        { source: 'a', target: 'b', type: 'semantic', accessedAt: [Date.now()], strength: 5 },
        { source: 'b', target: 'c', type: 'syntactic', accessedAt: [Date.now()], strength: 5 },
      ];

      const config = EdgeFilteringService.getDefaultConfig();
      config.showSyntactic = false;

      const filtered = EdgeFilteringService.filterAndStyleEdges(edges, [], config);
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].type).toBe('semantic');
    });

    it('should apply correct colors to relation types', () => {
      const edges: GraphLink[] = [
        { source: 'a', target: 'b', type: 'IS', accessedAt: [Date.now()], strength: 5 },
        { source: 'b', target: 'c', type: 'CREATES', accessedAt: [Date.now()], strength: 5 },
      ];

      const config = EdgeFilteringService.getDefaultConfig();
      config.showOnlyTopPaths = false;

      const styled = EdgeFilteringService.filterAndStyleEdges(edges, [], config);
      
      expect(styled[0].color).toBe('#3B82F6'); // IS = blue
      expect(styled[1].color).toBe('#F97316'); // CREATES = orange
    });

    it('should limit total visible edges', () => {
      const edges: GraphLink[] = Array.from({ length: 1000 }, (_, i) => ({
        source: `node${i}`,
        target: `node${i + 1}`,
        type: 'semantic' as const,
        accessedAt: [Date.now()],
        strength: 5
      }));

      const config = EdgeFilteringService.getDefaultConfig();
      config.maxEdgesVisible = 100;
      config.showOnlyTopPaths = false;

      const filtered = EdgeFilteringService.filterAndStyleEdges(edges, [], config);
      
      expect(filtered.length).toBeLessThanOrEqual(100);
    });
  });

  describe('ViewportCulling', () => {
    it('should calculate viewport bounds correctly', () => {
      const bounds = ViewportCulling.calculateViewportBounds(
        800, // canvas width
        600, // canvas height
        1.0, // zoom
        { x: 0, y: 0 } // pan
      );

      expect(bounds.x1).toBe(-400);
      expect(bounds.x2).toBe(400);
      expect(bounds.y1).toBe(-300);
      expect(bounds.y2).toBe(300);
    });

    it('should filter nodes outside viewport', () => {
      const nodes: ActivatedNode[] = [
        { id: '1', word: 'a', layer: 1, x: 0, y: 0, vx: 0, vy: 0, activation: 1, activationRank: 1, inTopPaths: true, pathImportance: 1, createdAt: Date.now() },
        { id: '2', word: 'b', layer: 1, x: 1000, y: 1000, vx: 0, vy: 0, activation: 0.5, activationRank: 2, inTopPaths: false, pathImportance: 0, createdAt: Date.now() },
        { id: '3', word: 'c', layer: 1, x: -1000, y: -1000, vx: 0, vy: 0, activation: 0.3, activationRank: 3, inTopPaths: false, pathImportance: 0, createdAt: Date.now() },
      ];

      const viewport: ViewportState = {
        zoom: 1.0,
        pan: { x: 0, y: 0 },
        boundingBox: { x1: -500, y1: -500, x2: 500, y2: 500 }
      };

      const visible = ViewportCulling.getNodesInViewport(nodes, viewport, 100, 0);
      
      expect(visible.length).toBe(1);
      expect(visible[0].id).toBe('1');
    });

    it('should determine LOD level based on zoom', () => {
      const config: LODConfig = ViewportCulling.getDefaultLODConfig();

      expect(ViewportCulling.getLODLevel(2000, config)).toBe('far');
      expect(ViewportCulling.getLODLevel(700, config)).toBe('mid');
      expect(ViewportCulling.getLODLevel(100, config)).toBe('close');
    });

    it('should include buffer zone for smooth scrolling', () => {
      const nodes: ActivatedNode[] = [
        { id: '1', word: 'a', layer: 1, x: 0, y: 0, vx: 0, vy: 0, activation: 1, activationRank: 1, inTopPaths: true, pathImportance: 1, createdAt: Date.now() },
        { id: '2', word: 'b', layer: 1, x: 550, y: 0, vx: 0, vy: 0, activation: 0.5, activationRank: 2, inTopPaths: false, pathImportance: 0, createdAt: Date.now() },
      ];

      const viewport: ViewportState = {
        zoom: 1.0,
        pan: { x: 0, y: 0 },
        boundingBox: { x1: -500, y1: -500, x2: 500, y2: 500 }
      };

      // Without buffer, node 2 is outside
      const withoutBuffer = ViewportCulling.getNodesInViewport(nodes, viewport, 100, 0);
      expect(withoutBuffer.length).toBe(1);

      // With buffer, node 2 is included
      const withBuffer = ViewportCulling.getNodesInViewport(nodes, viewport, 100, 200);
      expect(withBuffer.length).toBe(2);
    });
  });

  describe('Integration', () => {
    it('should handle large node sets efficiently', () => {
      const startTime = performance.now();
      
      const nodes: ActivatedNode[] = Array.from({ length: 5000 }, (_, i) => ({
        id: `node${i}`,
        word: `word${i}`,
        layer: i % 20,
        x: Math.random() * 2000 - 1000,
        y: Math.random() * 2000 - 1000,
        vx: 0,
        vy: 0,
        activation: Math.random(),
        activationRank: i,
        inTopPaths: i < 10,
        pathImportance: i < 10 ? 1 : 0,
        createdAt: Date.now()
      }));

      const viewport: ViewportState = {
        zoom: 1.0,
        pan: { x: 0, y: 0 },
        boundingBox: { x1: -400, y1: -300, x2: 400, y2: 300 }
      };

      const visible = ViewportCulling.getNodesInViewport(nodes, viewport, 500, 200);
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete in under 100ms
      expect(duration).toBeLessThan(100);
      expect(visible.length).toBeLessThanOrEqual(500);
    });
  });
});
