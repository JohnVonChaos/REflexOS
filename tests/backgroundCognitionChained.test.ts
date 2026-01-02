import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { backgroundCognitionService } from '../services/backgroundCognitionService';
import * as gemini from '../services/geminiService';

describe('BackgroundCognitionService runChainedCycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('runs subconscious then conscious and passes result to synthesis', async () => {
    const genSpy = vi.spyOn(gemini, 'generateText')
      .mockImplementationOnce(async () => 'raw brainstorm text')
      .mockImplementationOnce(async () => 'refined conscious plan');

    const runSynSpy = vi.spyOn(backgroundCognitionService as any, 'runSynthesisCycle');

    const now = Math.floor(Date.now() / 1000);
    const messages = [{ role: 'user', type: 'user_message', text: 'hello world', timestamp: Date.now() } as any];

    const res = await (backgroundCognitionService as any).runChainedCycle(messages, now);

    expect(res.subconscious).toBe('raw brainstorm text');
    expect(res.conscious).toBe('refined conscious plan');
    expect(Array.isArray(res.synthesis)).toBe(true);
    expect(genSpy).toHaveBeenCalledTimes(2);
    // First system instruction should be subconscious prompt
    const firstSys = genSpy.mock.calls[0][1] as string;
    const secondSys = genSpy.mock.calls[1][1] as string;
    expect(firstSys).toContain('You are the Subconscious');
    expect(secondSys).toContain('You are the Conscious');

    expect(runSynSpy).toHaveBeenCalled();
    const lastCallArgs = runSynSpy.mock.calls[runSynSpy.mock.calls.length - 1];
    // Ensure third argument contains conscious output
    expect(lastCallArgs[2]).toBeDefined();
    expect(lastCallArgs[2].conscious).toBe('refined conscious plan');
  });
});
