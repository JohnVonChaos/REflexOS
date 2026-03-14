/**
 * SRG EDGE FILTERING SERVICE
 * ===========================
 * Intelligent edge filtering with visual hierarchy for SRG Explorer
 * 
 * Features:
 * - Priority-based filtering (HIGH > MEDIUM > LOW)
 * - Interference amplitude thresholds
 * - Path-based highlighting
 * - Color-coded relation types
 * - Recency-based saturation
 * - Animated edges for causation
 */

import type { GraphLink } from '../types';
import type { RelationalEdge, TraversalPath } from './srg-word-hybrid';
import type {
  EdgeRenderConfig,
  StyledEdge,
} from '../types/graph';
import { RELATION_PRIORITY, RELATION_COLORS } from '../types/graph';

// ============================================================================
// EDGE FILTERING & STYLING
// ============================================================================

export class EdgeFilteringService {
  /**
   * Filter and style edges based on config and top paths
   */
  static filterAndStyleEdges(
    edges: GraphLink[],
    topPaths: TraversalPath[],
    config: EdgeRenderConfig,
    hybridEdges?: Map<string, RelationalEdge>
  ): StyledEdge[] {
    // Build set of edges in top paths for highlighting
    const topPathEdgeKeys = new Set<string>();
    for (const path of topPaths.slice(0, 3)) {  // Top 3 paths
      for (let i = 0; i < path.nodes.length - 1; i++) {
        const source = path.nodes[i];
        const target = path.nodes[i + 1];
        const edge = path.edges[i];
        if (edge) {
          topPathEdgeKeys.add(`${source}-${target}-${edge.type}`);
          topPathEdgeKeys.add(`${target}-${source}-${edge.type}`); // Bidirectional
        }
      }
    }

    const styled: StyledEdge[] = [];
    const now = Date.now();

    for (const edge of edges) {
      // Get additional metadata from hybrid engine if available
      const hybridKey = `${edge.source}-${edge.target}`;
      const hybridEdge = hybridEdges?.get(hybridKey);

      // Skip if below interference threshold (if hybrid data available)
      if (hybridEdge && hybridEdge.interferenceAmplitude < config.minInterference) {
        continue;
      }

      // Skip if below strength threshold
      const strength = hybridEdge?.strength || edge.accessedAt?.length || 1;
      if (strength < config.minStrength) {
        continue;
      }

      // Skip syntactic if disabled
      if (!config.showSyntactic && edge.type === 'syntactic') {
        continue;
      }

      // Check if in top paths
      const edgeKey = `${edge.source}-${edge.target}-${edge.type}`;
      const reverseKey = `${edge.target}-${edge.source}-${edge.type}`;
      const inTopPaths = topPathEdgeKeys.has(edgeKey) || topPathEdgeKeys.has(reverseKey);

      // Skip if not in top paths (when that filter is enabled)
      if (config.showOnlyTopPaths && !inTopPaths) {
        continue;
      }

      // Calculate recency (0 to 1, decay over 7 days)
      const lastAccess = edge.accessedAt?.[edge.accessedAt.length - 1] || 
                        hybridEdge?.accessedAt?.[hybridEdge.accessedAt.length - 1] || 
                        now;
      const ageMs = now - lastAccess;
      const recency = Math.exp(-ageMs / (7 * 24 * 60 * 60 * 1000)); // 7-day half-life

      // Get interference amplitude (default to 0.5 if not available)
      const interferenceAmplitude = hybridEdge?.interferenceAmplitude ?? 0.5;

      // Determine base color and style properties
      const isTop = inTopPaths;
      let color = RELATION_COLORS[edge.type] || '#9CA3AF';
      // Background edges should be thin; top/causal paths should be thick and prominent
      let width = isTop ? Math.max(Math.log(strength + 1) * 1.5, 3.5) : Math.max(0.6, Math.log(strength + 1) * 0.45);
      // Make background opacity very subtle by default (but allow config to change)
      let opacity: number;
      if (isTop) {
        opacity = 0.95;
      } else {
        if (config.dimBackgroundEdges) {
          opacity = Math.max(0.04, interferenceAmplitude * 0.18);
        } else {
          // If user disables dimming, keep a more visible background
          opacity = Math.max(0.15, interferenceAmplitude * 0.35);
        }
      }
      let zIndex = isTop ? 1000 : this.getPriority(edge.type);

      // Force high-visibility style for Top/Causal Paths
      if (isTop) {
        color = '#FFA500'; // Orange (matches "Causal Path" / Active Trace)
      }

      // Build styled edge
      const styledEdge: StyledEdge = {
        ...edge,
        color,
        opacity,
        width,
        saturation: recency,
        zIndex,
        dashArray: this.getDashArray(edge.type),
        animated: this.isAnimated(edge.type),
        interferenceAmplitude,
        strength,
        // expose helpful flag for rendering logic
        inTopPaths: isTop
      } as StyledEdge;

      styled.push(styledEdge);
    }

    // Ensure top-path edges are always included and drawn last (so they render on top)
    const topEdges = styled.filter(e => e.zIndex >= 1000);
    const backgroundEdges = styled.filter(e => e.zIndex < 1000)
                                .sort((a, b) => a.zIndex - b.zIndex); // low → high

    const allowedBackground = backgroundEdges.slice(0, Math.max(0, config.maxEdgesVisible - topEdges.length));

    return allowedBackground.concat(topEdges);
  }

  /**
   * Get priority level for a relation type
   */
  private static getPriority(relationType: string): number {
    if (RELATION_PRIORITY.HIGH.includes(relationType as any)) return 10;
    if (RELATION_PRIORITY.MEDIUM.includes(relationType as any)) return 5;
    return 1;
  }

  /**
   * Get dash array for specific relation types
   */
  private static getDashArray(relationType: string): string | undefined {
    // Dashed lines for possibility/capability
    if (relationType.includes('CAN') || 
        relationType.includes('MIGHT') || 
        relationType.includes('MAY') ||
        relationType.includes('COULD')) {
      return '5,5';
    }
    return undefined;
  }

  /**
   * Check if edge should be animated
   */
  private static isAnimated(relationType: string): boolean {
    // Animate causation and creation edges
    return relationType === 'CREATES' || 
           relationType === 'CAUSES' || 
           relationType === 'MAKES' ||
           relationType === 'MAKE';
  }

  /**
   * Get default edge render config
   */
  static getDefaultConfig(): EdgeRenderConfig {
    return {
      minInterference: 0.1,  // Much lower default to show more connections
      minStrength: 1,        // Show even single-occurrence links
      showSyntactic: true,   // Show sequence links by default
      showOnlyTopPaths: false, // Show ALL edges by default, not just top paths
      dimBackgroundEdges: true,
      maxEdgesVisible: 2000  // Much higher cap
    };
  }
}
