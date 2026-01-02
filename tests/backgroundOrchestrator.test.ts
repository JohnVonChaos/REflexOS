import { describe, it, expect } from 'vitest';
import { memoryService } from '../services/memoryService';
import { backgroundOrchestrator } from '../services/backgroundOrchestrator';
import { sessionService } from '../services/sessionService';
import { backgroundCognitionService } from '../services/backgroundCognitionService';
import { getDefaultSettings } from '../src/types';
import { vi } from 'vitest';

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

  it('runs chained cycle for scheduled workflow stages', async () => {
    const defaults = getDefaultSettings();
    // Mock session to provide a workflow stage with a very small interval
    vi.spyOn(sessionService, 'loadSession').mockResolvedValue({ aiSettings: { workflow: [{ id: 'test_stage', name: 'Test', backgroundIntervalMinutes: 0.0001, provider: 'gemini', selectedModel: 'gemini-2.5-flash', backgroundRunMode: 'chained' }], roles: defaults.roles, providers: defaults.providers } as any } as any);

    const runSpy = vi.spyOn(backgroundCognitionService as any, 'runChainedCycle').mockResolvedValue({ subconscious: '', conscious: '', synthesis: [] } as any);

    // Force the orchestrator to consider scheduled cycles immediately
    await (backgroundOrchestrator as any).cycle();

    expect(runSpy).toHaveBeenCalled();
  });

  it('runs independent synthesis when stage is set to independent mode', async () => {
    const defaults = getDefaultSettings();
    vi.spyOn(sessionService, 'loadSession').mockResolvedValue({ aiSettings: { workflow: [{ id: 'ind_stage', name: 'Ind', backgroundIntervalMinutes: 0.0001, provider: 'gemini', selectedModel: 'gemini-2.5-flash', backgroundRunMode: 'independent' }], roles: defaults.roles, providers: defaults.providers } as any } as any);

    const synSpy = vi.spyOn(backgroundCognitionService as any, 'runSynthesisCycle').mockResolvedValue([] as any);

    await (backgroundOrchestrator as any).cycle();

    expect(synSpy).toHaveBeenCalled();
  });
});
