/**
 * SRG VIEWPORT CULLING
 * ====================
 * Utilities for viewport-based rendering optimization
 * 
 * Features:
 * - Viewport bounding box calculation
 * - Spatial culling for nodes outside view
 * - Buffer zone for smooth scrolling
 * - Zoom-based node count limits
 */

import type { ActivatedNode, BoundingBox, ViewportState, LODConfig } from '../types/graph';

// ============================================================================
// VIEWPORT UTILITIES
// ============================================================================

export class ViewportCulling {
  /**
   * Get nodes within viewport bounds (with buffer)
   */
  static getNodesInViewport(
    nodes: ActivatedNode[],
    viewport: ViewportState,
    maxNodes: number,
    buffer: number = 200
  ): ActivatedNode[] {
    const expanded: BoundingBox = {
      x1: viewport.boundingBox.x1 - buffer,
      y1: viewport.boundingBox.y1 - buffer,
      x2: viewport.boundingBox.x2 + buffer,
      y2: viewport.boundingBox.y2 + buffer
    };

    return nodes
      .filter(n => 
        n.x >= expanded.x1 && n.x <= expanded.x2 &&
        n.y >= expanded.y1 && n.y <= expanded.y2
      )
      .sort((a, b) => b.activation - a.activation)
      .slice(0, maxNodes);
  }

  /**
   * Calculate viewport bounding box from zoom and pan
   */
  static calculateViewportBounds(
    canvasWidth: number,
    canvasHeight: number,
    zoom: number,
    pan: { x: number; y: number }
  ): BoundingBox {
    // Transform viewport corners to world coordinates
    const halfWidth = (canvasWidth / 2) / zoom;
    const halfHeight = (canvasHeight / 2) / zoom;

    return {
      x1: -pan.x - halfWidth,
      y1: -pan.y - halfHeight,
      x2: -pan.x + halfWidth,
      y2: -pan.y + halfHeight
    };
  }

  /**
   * Determine LOD level based on zoom
   */
  static getLODLevel(zoom: number, config: LODConfig): 'far' | 'mid' | 'close' {
    if (zoom > config.farZoomThreshold) {
      return 'far';
    } else if (zoom > config.midZoomThreshold) {
      return 'mid';
    } else {
      return 'close';
    }
  }

  /**
   * Get maximum node count for current LOD level
   */
  static getMaxNodesForLOD(zoom: number, config: LODConfig): number {
    const level = this.getLODLevel(zoom, config);
    return config.maxNodesPerLevel[level];
  }

  /**
   * Check if point is in viewport
   */
  static isPointInViewport(
    x: number,
    y: number,
    viewport: BoundingBox,
    buffer: number = 0
  ): boolean {
    return (
      x >= viewport.x1 - buffer &&
      x <= viewport.x2 + buffer &&
      y >= viewport.y1 - buffer &&
      y <= viewport.y2 + buffer
    );
  }

  /**
   * Calculate viewport center in world coordinates
   */
  static getViewportCenter(viewport: BoundingBox): { x: number; y: number } {
    return {
      x: (viewport.x1 + viewport.x2) / 2,
      y: (viewport.y1 + viewport.y2) / 2
    };
  }

  /**
   * Calculate distance from point to viewport center
   */
  static distanceFromViewportCenter(
    x: number,
    y: number,
    viewport: BoundingBox
  ): number {
    const center = this.getViewportCenter(viewport);
    const dx = x - center.x;
    const dy = y - center.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Sort nodes by distance from viewport center
   * (Useful for progressive loading)
   */
  static sortByDistanceFromCenter(
    nodes: ActivatedNode[],
    viewport: BoundingBox
  ): ActivatedNode[] {
    const center = this.getViewportCenter(viewport);
    
    return [...nodes].sort((a, b) => {
      const distA = Math.sqrt((a.x - center.x) ** 2 + (a.y - center.y) ** 2);
      const distB = Math.sqrt((b.x - center.x) ** 2 + (b.y - center.y) ** 2);
      return distA - distB;
    });
  }

  /**
   * Get default LOD config
   */
  static getDefaultLODConfig(): LODConfig {
    return {
      farZoomThreshold: 1000,
      midZoomThreshold: 500,
      closeZoomThreshold: 200,
      maxNodesPerLevel: {
        far: 50,
        mid: 200,
        close: 500
      },
      enabled: true
    };
  }
}
