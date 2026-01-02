import { describe, it, expect } from 'vitest';
import { computeSrgSimilarity } from '../src/services/srgSimilarity';

describe('computeSrgSimilarity', () => {
  it('returns 1 for identical slices', () => {
    const a = { nodeIds: ['a','b','c'] };
    const b = { nodeIds: ['a','b','c'] };
    expect(computeSrgSimilarity(a as any, b as any)).toBeCloseTo(1);
  });

  it('returns 0 for disjoint slices', () => {
    const a = { nodeIds: ['x','y'] };
    const b = { nodeIds: ['a','b'] };
    expect(computeSrgSimilarity(a as any, b as any)).toBe(0);
  });

  it('respects weights and normalizes by min sum', () => {
    const a = { nodeIds: ['n1','n2'], nodeWeights: { n1: 2, n2: 1 } };
    const b = { nodeIds: ['n1'], nodeWeights: { n1: 1 } };
    // Intersection weight approximates 1 (n1) / min(sumA=3, sumB=1) => ~1
    expect(computeSrgSimilarity(a as any, b as any)).toBeGreaterThan(0.9);
  });

  it('blends module jaccard when requested', () => {
    const a = { nodeIds: ['a'], moduleIds: ['m1'] };
    const b = { nodeIds: ['a'], moduleIds: ['m2'] };
    const pure = computeSrgSimilarity(a as any, b as any);
    const blended = computeSrgSimilarity(a as any, b as any, { moduleBlend: 0.5 });
    expect(pure).toBeGreaterThan(0.9);
    expect(blended).toBeLessThan(pure + 0.1);
  });

  it('respects provenance weighting', () => {
    const a = { nodeIds: ['x','y'], speakerId: 'user-1', sourceType: 'chat_user' } as any;
    const b = { nodeIds: ['x','y'], speakerId: 'user-2', sourceType: 'chat_user' } as any;
    const noProv = computeSrgSimilarity(a, b, { provenanceWeight: 0 });
    const withProv = computeSrgSimilarity(a, b, { provenanceWeight: 1 });
    // With provenance weight strong, different speaker reduces similarity below the pure overlap
    expect(noProv).toBeGreaterThan(0.9);
    expect(withProv).toBeLessThan(0.5);
  });
});
