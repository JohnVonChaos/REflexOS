import { srgService } from './srgService';

export interface ISrgAdapter {
  getCentrality(nodeId: string): Promise<number>;
  getRecencyWeight(nodeId: string): Promise<number>;
  getNeighborhoodStats(nodeIds: string[]): Promise<{ avgCentrality: number; maxCentrality: number }>;
}

export class SrgIntegrationAdapter implements ISrgAdapter {
  async getCentrality(nodeId: string) {
    try {
      // Map to a 0-1 score
      const node = await srgService.getNode(nodeId);
      if (!node) return 0.0;
      const centrality = (node.importance || 0) / 100; // heuristic
      return Math.max(0, Math.min(1, centrality));
    } catch (e) {
      return 0;
    }
  }

  async getRecencyWeight(nodeId: string) {
    try {
      const node = await srgService.getNode(nodeId);
      if (!node || !node.lastActivatedAt) return 0;
      const ageMs = Date.now() - node.lastActivatedAt;
      const weight = Math.exp(-ageMs / (1000 * 60 * 60 * 24 * 7)); // 1 week half-life
      return Math.max(0, Math.min(1, weight));
    } catch (e) {
      return 0;
    }
  }

  async getNeighborhoodStats(nodeIds: string[]) {
    const centralities = await Promise.all(nodeIds.map(id => this.getCentrality(id)));
    const avgCentrality = centralities.reduce((a, b) => a + b, 0) / (centralities.length || 1);
    const maxCentrality = Math.max(...centralities, 0);
    return { avgCentrality, maxCentrality };
  }
}

export const srgIntegrationAdapter = new SrgIntegrationAdapter();
