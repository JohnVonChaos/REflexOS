import { describe, it, expect } from 'vitest';
import { srgService } from '../src/services/srgService';

describe('srgService.getSrgView', () => {
  it('returns a valid SrgView for simple text', async () => {
    // Initialize small graph
    await srgService.reinforceLinksFromText('hello world this is a test');
    const view = await srgService.getSrgView({ stageId: 'test', taskType: 'test', textContext: 'hello test', activeModules: [] });
    expect(view).toHaveProperty('id');
    expect(view.payload).toContain('hello');
  });
});
