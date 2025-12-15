import { describe, it, expect } from 'vitest';
import { memoryService } from '../services/memoryService';

describe('memoryService.createAtom', () => {
  it('schedules resurfacing for eligible atoms', async () => {
    const atom = await memoryService.createAtom({ type: 'steward_note', role: 'model', text: 'test', intrinsicValue: 0.6 });
    expect(atom.resurfacing).toBeDefined();
  });

  it('adds atom text to SRG storage', async () => {
    const { srgStorage } = await import('../services/srgStorage');
    await srgStorage.initialize();
    await memoryService.createAtom({ type: 'steward_note', role: 'model', text: 'unique srg token xyz', intrinsicValue: 0.6 });
    // similarity with itself should be > 0
    const sim = await srgStorage.computeSimilarity('unique srg token xyz', 'unique srg token xyz');
    expect(sim).toBeGreaterThan(0);
  });
});
