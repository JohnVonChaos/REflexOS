import type { MemoryAtom } from '../types';
import { ResurfacingCategory } from '../types';
import { contextService } from './contextService';
import { srgStorage } from './srgStorage';

const FIBONACCI = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377];

const CONTEXT_BUDGETS = {
  active: {
    maxTokens: 8000,
    tiers: ['hot'] as const,
    reservedForResurfacing: 800,
  },
  idle: {
    maxTokens: 32000,
    tiers: ['hot', 'warm', 'cold'] as const,
    reservedForResurfacing: 4000,
  }
};

function countTokens(item: MemoryAtom) {
  if (!item || !item.text) return 1;
  return Math.max(1, Math.ceil(item.text.length / 4));
}

export class ResurfacingService {
  scheduleResurfacing(item: MemoryAtom, currentTurn: number) {
    if (typeof item.intrinsicValue !== 'number' || item.intrinsicValue < 0.3) return;

    item.resurfacing = {
      enabled: true,
      importance: item.intrinsicValue * (1 + (item.orbitalStrength || 0) / 10),
      fibonacciIndex: 0,
      nextResurfaceAt: currentTurn + FIBONACCI[0],
      lastResurfacedAt: currentTurn,
      resurfaceCount: 0,
      timesIgnored: 0,
      timesUsed: 0,
      category: this.categorizeItem(item)
    } as any;
  }

  advanceResurfacingSchedule(item: MemoryAtom, wasUsed: boolean, currentTurn: number) {
    if (!item.resurfacing) return;
    item.resurfacing.resurfaceCount++;

    if (wasUsed) {
      item.resurfacing.timesUsed++;
      item.resurfacing.timesIgnored = 0;
      item.resurfacing.fibonacciIndex = Math.min(item.resurfacing.fibonacciIndex + 1, FIBONACCI.length - 1);
    } else {
      item.resurfacing.timesIgnored++;
      if (item.resurfacing.timesIgnored > 3) {
        item.resurfacing.fibonacciIndex = Math.min(item.resurfacing.fibonacciIndex + 2, FIBONACCI.length - 1);
      }
    }

    const interval = FIBONACCI[item.resurfacing.fibonacciIndex];
    item.resurfacing.nextResurfaceAt = currentTurn + interval;
    item.resurfacing.lastResurfacedAt = currentTurn;
  }

  categorizeItem(item: MemoryAtom): ResurfacingCategory {
    // Very simple heuristic: map types to categories
    if (item.type === 'axiom') return ResurfacingCategory.DORMANT_AXIOMS;
    if (item.type === 'steward_note' || item.type === 'conscious_thought') return ResurfacingCategory.OLD_INSIGHTS;
    if (item.type === 'user_message') return ResurfacingCategory.USER_PREFERENCES;
    return ResurfacingCategory.CREATIVE_SPARKS;
  }

  async buildContextWithResurfacing(allItems: MemoryAtom[], currentTurn: number, turnType: 'active' | 'idle', currentContext: string = '') {
    const allocation = CONTEXT_BUDGETS[turnType];

    // 1. Build normal context
    const pool = allItems.filter(item => (allocation.tiers as readonly string[]).includes(contextService.assignTier(item, currentTurn)));

    // Compute async restoration priority using SRG similarity to current context (we'll use empty context by default)
    const computePriorities = async (items: MemoryAtom[], currentContext: string) => {
      const out: Array<{ item: MemoryAtom; priority: number }> = [];
      for (const it of items) {
        const p = await this.computeRestorationPriority(it, currentContext);
        out.push({ item: it, priority: p });
      }
      return out.sort((a, b) => b.priority - a.priority);
    };

    const normalContext: MemoryAtom[] = [];
    let tokensUsed = 0;
    const spaceAvailable = allocation.maxTokens - allocation.reservedForResurfacing;

    // Use provided currentContext to prioritize
    const prioritized = await computePriorities(pool, currentContext);
    for (const row of prioritized) {
      const item = row.item;
      const itemTokens = countTokens(item);
      if (tokensUsed + itemTokens <= spaceAvailable) {
        normalContext.push(item);
        tokensUsed += itemTokens;
      } else if (item.canEvict) {
        item.evictedAt = currentTurn;
        item.evictionReason = 'budget_exceeded';
      }
    }

    // 2. Find items due for resurfacing
    const dueForResurfacing = allItems
      .filter(i => i.resurfacing && i.resurfacing.enabled && i.resurfacing.nextResurfaceAt <= currentTurn && !normalContext.includes(i))
      .sort((a, b) => (b.resurfacing!.importance || 0) - (a.resurfacing!.importance || 0));

    const intrusiveMemories = this.buildBalancedIntrusiveSet(dueForResurfacing, allocation.reservedForResurfacing);

    return {
      normal: normalContext,
      intrusive: intrusiveMemories,
      total: [...normalContext, ...intrusiveMemories],
      allocation: {
        normal: tokensUsed,
        intrusive: intrusiveMemories.reduce((s, it) => s + countTokens(it), 0),
        total: allocation.maxTokens
      }
    };
  }

  /**
   * Schedule resurfacing for all eligible items
   */
  scheduleAll(allItems: MemoryAtom[], currentTurn: number) {
    for (const item of allItems) {
      this.scheduleResurfacing(item, currentTurn);
    }
  }

  buildBalancedIntrusiveSet(dueItems: MemoryAtom[], tokenBudget: number): MemoryAtom[] {
    const categories = Object.values(ResurfacingCategory);
    const intrusive: MemoryAtom[] = [];
    let tokensUsed = 0;

    for (const category of categories) {
      const categoryItem = dueItems.find(item => item.resurfacing!.category === category);
      if (categoryItem) {
        const tokens = countTokens(categoryItem);
        if (tokensUsed + tokens <= tokenBudget) {
          intrusive.push(categoryItem);
          tokensUsed += tokens;
        }
      }
    }

    const remaining = dueItems.filter(i => !intrusive.includes(i)).sort((a, b) => (b.resurfacing!.importance || 0) - (a.resurfacing!.importance || 0));

    for (const item of remaining) {
      const tokens = countTokens(item);
      if (tokensUsed + tokens <= tokenBudget) {
        intrusive.push(item);
        tokensUsed += tokens;
      } else {
        break;
      }
    }

    return intrusive;
  }

  /**
   * Compute restoration priority using SRG similarity between atom and current context.
   */
  async computeRestorationPriority(atom: MemoryAtom, currentContext: string): Promise<number> {
    // Tier weights
    const TIER_WEIGHTS: Record<string, number> = { hot: 3, warm: 1.5, cold: 1 };
    const tierWeight = TIER_WEIGHTS[atom.tier || 'cold'] || 1;

    // Compute similarity with SRG
    let similarityScore = 0;
    try {
      similarityScore = await srgStorage.computeSimilarity(atom.text || '', currentContext || '');
    } catch (e) {
      similarityScore = 0;
    }

    // Decay based on lastActivatedAt (recent activations boost priority)
    const computeDecayFactor = (lastActivatedAt?: number) => {
      if (!lastActivatedAt) return 1;
      const days = (Date.now() - lastActivatedAt) / (1000 * 60 * 60 * 24);
      return Math.max(0.1, Math.exp(-days / 30));
    };

    const decayFactor = computeDecayFactor(atom.lastActivatedAt);

    return similarityScore * tierWeight * decayFactor;
  }

  async evaluateIntrusiveMemoryUse(rcb: any, response: string, srgTrace: any, currentTurn: number) {
    for (const item of rcb.intrusive || []) {
      const wasReferenced = response.includes(item.uuid) || (typeof item.text === 'string' && response.includes(item.text.slice(0, 20))) || (srgTrace?.activatedItems?.includes(item.uuid));
      this.advanceResurfacingSchedule(item, !!wasReferenced, currentTurn);

      if (wasReferenced) {
        item.resurfacing!.importance *= 1.1;
      } else {
        item.resurfacing!.importance *= 0.95;
      }

      if (item.resurfacing!.importance < 0.1) {
        item.resurfacing!.enabled = false;
      }
    }
  }
}

export const resurfacingService = new ResurfacingService();
