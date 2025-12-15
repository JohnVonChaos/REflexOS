import { describe, it, expect } from 'vitest';
import { PositionHash, Relations, SRGCore } from '../services/srgCore';

describe('PositionHash.interference', () => {
  it('finds co-occurrence positions for simple tokens', () => {
    const ph = new PositionHash();
    const text = 'the cat sat on the mat the dog sat on the mat';
    const tokens = text.toLowerCase().match(/\b[\w']+\b/g) || [];
    ph.addTokens(tokens, 0);

    const results = ph.interference(['cat', 'dog'], 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.score > 0)).toBe(true);
  });
});

describe('Relations.extractFromTokens', () => {
  it('extracts IS_A, WANT, HAS patterns', () => {
    const rel = new Relations();
    let count = 0;
    count += rel.extractFromTokens(('john is a doctor').match(/\b[\w']+\b/g) || [], 0);
    count += rel.extractFromTokens(('alice wants pizza').match(/\b[\w']+\b/g) || [], 1);
    count += rel.extractFromTokens(('bob has a car').match(/\b[\w']+\b/g) || [], 2);

    expect(count).toBeGreaterThanOrEqual(3);
    const isA = rel.getByRelation('IS_A');
    const want = rel.getByRelation('WANT');
    const has = rel.getByRelation('HAS');
    expect(isA.length).toBeGreaterThanOrEqual(1);
    expect(want.length).toBeGreaterThanOrEqual(1);
    expect(has.length).toBeGreaterThanOrEqual(1);
  });
});

describe('SRGCore.computeSimilarity', () => {
  it('returns 0 for unrelated texts and >0 for related texts using corpus', () => {
    const srg = new SRGCore();
    srg.addText('the cat sat on the mat');
    srg.addText('the dog sat on the mat');

    const unrelated = srg.computeSimilarity('apple orange', 'car train');
    expect(unrelated).toBe(0);

    const related = srg.computeSimilarity('cat', 'dog');
    expect(related).toBeGreaterThan(0);
  });
});
