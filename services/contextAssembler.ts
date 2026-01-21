import { contextTierManager } from './contextTierManager';
import { rankContextItems } from './importanceScorer';
import type { LayerId, ModelId, ContextSnapshot, ContextItem, ContextProfile, ContextTier } from '../types/contextTiers';

// Simple token estimator
function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function buildContext(request: { layerId: LayerId; modelId: ModelId; turnId: number }): Promise<ContextSnapshot> {
  const { layerId, modelId, turnId } = request;
  const profile = (await contextTierManager.getProfile(layerId, modelId)) as ContextProfile | undefined;
  if (!profile) throw new Error('Missing context profile for ' + layerId + '/' + modelId);

  // Candidate pool: pull recent LIVE and POSTIT items
  // NOTE: simpler queries for v1: get all items and filter in-memory
  // TODO: add DB-level queries for performance
  const allItems = [] as ContextItem[];
  // naive read: iterate all stored items (not ideal for prod)
  // For now, we assume other processes have written items to DB

  // Build initial payload: prefer LIVE, then POSTIT, then skip DEEP
  const liveItems = allItems.filter(i => i.tier === ContextTier.LIVE);
  const postitItems = allItems.filter(i => i.tier === ContextTier.POSTIT && (Date.now() - i.timestamp) < (1000 * 60 * 60 * 24 * 30)); // 30d filter

  let candidate = [...liveItems, ...postitItems];
  let totalTokens = candidate.reduce((s, it) => s + (it.tokens || estimateTokens(it.text)), 0);

  // Pre-soft-threshold compaction
  if (totalTokens > profile.softThresholdTokens) {
    const ranked = await rankContextItems(candidate, profile.importanceScorerConfig);
    // Move low scoring LIVE items to POSTIT until under soft threshold
    for (let i = ranked.length - 1; i >= 0 && totalTokens > profile.softThresholdTokens; i--) {
      const it = ranked[i];
      if (it.tier === ContextTier.LIVE && !it.pinned) {
        it.tier = ContextTier.POSTIT;
        await contextTierManager.storeContextItem(it);
        totalTokens -= it.tokens || estimateTokens(it.text);
      }
    }
    // recompute candidate set
    candidate = candidate.filter(it => it.tier !== ContextTier.DEEP);
  }

  // Trap door activation (hard limit protection)
  if (totalTokens > profile.hardLimitTokens) {
    const ranked = await rankContextItems(candidate, profile.importanceScorerConfig);
    const toDrop: ContextItem[] = [];
    let droppedTokens = 0;
    for (let i = ranked.length - 1; i >= 0 && droppedTokens < profile.maxTrapDoorDropTokens; i--) {
      const it = ranked[i];
      if (!it.pinned) {
        toDrop.push(it);
        droppedTokens += it.tokens || estimateTokens(it.text);
      }
    }
    // remove dropped items from candidate and store trap door state
    const turnBasket = toDrop.map(t => ({ ...t }));
    await contextTierManager.storeTrapDoorState({ basket: turnBasket, layerId, turnId, droppedAt: Date.now() });
    candidate = candidate.filter(c => !toDrop.find(t => t.id === c.id));
    totalTokens -= droppedTokens;
  }

  const snapshot: ContextSnapshot = {
    turnId,
    layerId,
    modelId,
    items: candidate,
    totalTokens,
    tierBreakdown: {
      live: candidate.filter(i => i.tier === ContextTier.LIVE).length,
      postit: candidate.filter(i => i.tier === ContextTier.POSTIT).length,
      deep: candidate.filter(i => i.tier === ContextTier.DEEP).length,
    }
  };

  await contextTierManager.storeSnapshot(snapshot);
  return snapshot;
}

export async function reconcileTrapDoor(layerId: LayerId, turnId: number, focusNodeIds: string[]) {
  const state = await contextTierManager.getTrapDoorState(layerId, turnId);
  if (!state) return;
  // For each item, check SRG overlap -- simple heuristic for v1
  for (const item of state.basket) {
    const overlap = (item.srgNodeIds || []).some(id => focusNodeIds.includes(id));
    if (overlap) {
      item.tier = ContextTier.POSTIT;
      await contextTierManager.storeContextItem(item);
    } else {
      item.tier = ContextTier.DEEP;
      await contextTierManager.storeContextItem(item);
    }
  }
  await contextTierManager.clearTrapDoorState(layerId, turnId);
}
