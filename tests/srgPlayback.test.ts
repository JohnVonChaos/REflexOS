import { describe, it, expect } from 'vitest';
import { srgPlaybackService, DEFAULT_PLAYBACK_CONFIG } from '../src/services/srgPlayback';

describe('srgPlaybackService.getPlaybackWindow', () => {
  it('returns current coherent block only when threshold hit', () => {
    // Create a synthetic timeline with explicit similarity values so the test is deterministic
    (srgPlaybackService as any).timeline = [
      { turnId: 't1', slice: { nodeIds: [] }, similarityToPrev: 1 },
      { turnId: 't2', slice: { nodeIds: [] }, similarityToPrev: 0.9 },
      { turnId: 't3', slice: { nodeIds: [] }, similarityToPrev: 0.2 },
      { turnId: 't4', slice: { nodeIds: [] }, similarityToPrev: 0.9 },
    ];

    const timeline = srgPlaybackService.getTimeline();
    const tokens: Record<string, number> = { t1: 5, t2: 5, t3: 5, t4: 5 };
    const cfg = { ...DEFAULT_PLAYBACK_CONFIG, similarityThreshold: 0.3, backtrackThreshold: 0.6, maxBacktrackTurns: 2 };

    const sims = timeline.map(t => t.similarityToPrev ?? 0);
    expect(sims).toEqual([1, 0.9, 0.2, 0.9]);

    // For current turn t4, block should be t3..t4
    const w = srgPlaybackService.getPlaybackWindow(timeline, 't4', cfg, tokens);
    expect(w.includedTurnIds).toEqual(['t3','t4']);
  });

  it('backtracks into previous block when local continuity high', () => {
    // Build synthetic timeline: boundary at t3, but previous block has strong internal continuity so backtrack should include t2
    (srgPlaybackService as any).timeline = [
      { turnId: 't1', slice: { nodeIds: [] }, similarityToPrev: 1 },
      { turnId: 't2', slice: { nodeIds: [] }, similarityToPrev: 0.9 },
      { turnId: 't3', slice: { nodeIds: [] }, similarityToPrev: 0.2 },
    ];

    const timeline = srgPlaybackService.getTimeline();
    const tokens = { t1: 1000, t2: 1000, t3: 1000 };
    const cfg = { ...DEFAULT_PLAYBACK_CONFIG, similarityThreshold: 0.5, backtrackThreshold: 0.3, maxBacktrackTurns: 2, hardTokenLimit: 5000 } as any;

    // current t3 should backtrack into t2 because previous block (t1->t2) is coherent
    const w = srgPlaybackService.getPlaybackWindow(timeline, 't3', cfg, tokens);
    expect(w.includedTurnIds[0]).toBe('t2');
  });
});
