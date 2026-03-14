import { describe, it, expect, beforeEach } from 'vitest';
import { srgService } from '../services/srgService';

describe('SRGService export/import state', () => {
  it('exportState returns expected keys and importState restores hybrid corpus', async () => {
    // Ensure hybrid has some data
    await srgService.ingestHybrid('alpha beta gamma delta epsilon');
    const state = srgService.exportState();
    expect(state).toHaveProperty('nodes');
    expect(state).toHaveProperty('links');
    expect(state).toHaveProperty('hybridCorpus');

    const originalCorpusLen = (state.hybridCorpus || []).length;

    // Create a tiny snapshot and import it back
    const snapshot = {
      nodes: state.nodes.slice(0, 2),
      links: state.links.slice(0, 2),
      hybridCorpus: ['one', 'two', 'three'],
      knowledgeModules: []
    };

    await srgService.importState(snapshot as any);
    const after = srgService.exportState();
    expect(after.hybridCorpus).toBeTruthy();
    expect((after.hybridCorpus || []).length).toBeGreaterThanOrEqual(3);
  });
});
