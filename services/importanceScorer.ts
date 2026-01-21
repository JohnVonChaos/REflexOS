import type { ContextItem, ImportanceScorerConfig } from '../types/contextTiers';
import { srgIntegrationAdapter } from './srgIntegrationAdapter';

export async function scoreContextItem(item: ContextItem, config: ImportanceScorerConfig): Promise<number> {
  const recency = item.lastAccessedTurn ? Math.exp(-(Date.now() - item.timestamp) / (1000 * 60 * 60 * 24)) : 0.5;
  const srgNodes = item.srgNodeIds || [];
  const srgStats = srgNodes.length ? await srgIntegrationAdapter.getNeighborhoodStats(srgNodes) : { avgCentrality: 0, maxCentrality: 0 };
  const usage = Math.log(1 + (item.usageCount || 0));

  const rawScore = (recency * config.recencyWeight)
    + (srgStats.avgCentrality * config.srgCentralityWeight)
    + (usage * config.usageCountWeight)
    + ((item.pinned ? 1 : 0) * config.pinnedBoost);

  // normalize to 0-100
  const normalized = Math.max(0, Math.min(100, Math.round(rawScore * 100)));
  return normalized;
}

export async function rankContextItems(items: ContextItem[], config: ImportanceScorerConfig) {
  const scored = await Promise.all(items.map(async (it) => ({ it, score: await scoreContextItem(it, config) })));
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.it);
}
