import { describe, it, expect } from 'vitest';
import { memoryService } from '../services/memoryService';
import { backgroundOrchestrator } from '../services/backgroundOrchestrator';

describe('BackgroundOrchestrator', () => {
  it('runs reflection cycle when idle', async () => {
    // Create an old user atom
    const now = Date.now();
    await memoryService.createAtom({ role: 'user', type: 'user_message', text: 'old message', timestamp: now - 60000 });

    // Force random outcome to reflection
    const origRandom = Math.random;
    (Math as any).random = () => 0.95;
    try {
      await (backgroundOrchestrator as any).cycle();
      const all = await memoryService.getAll();
      expect(all.some(a => a.type === 'conscious_thought')).toBe(true);
    } finally {
      (Math as any).random = origRandom;
    }
  });
});
