import { describe, it, expect } from 'vitest';
import { backgroundCognitionService } from '../services/backgroundCognitionService';

describe('BackgroundCognitionService.runSynthesisCycle', () => {
  it('finds simple connections between old and recent memories', async () => {
    const now = 1000;
    const items: any[] = [
      { uuid: 'o1', timestamp: now - 200, role: 'model', type: 'steward_note', text: 'I love gardening and soil composition', isInContext: false, isCollapsed: false, intrinsicValue: 0.6 },
      { uuid: 'r1', timestamp: now - 2, role: 'user', type: 'user_message', text: 'I have questions about soil for my garden', isInContext: false, isCollapsed: false, intrinsicValue: 0.5 }
    ];

    const { srgStorage } = await import('../services/srgStorage');
    await srgStorage.initialize();
    await srgStorage.addText(items[0].text);
    await srgStorage.addText(items[1].text);

    const connections = await backgroundCognitionService.runSynthesisCycle(items, now);
    expect(connections.length).toBeGreaterThan(0);

    // Ensure they were persisted
    const { memoryService } = await import('../services/memoryService');
    const all = await memoryService.getAll();
    expect(all.some(a => a.type === 'steward_note')).toBe(true);
  });
});
