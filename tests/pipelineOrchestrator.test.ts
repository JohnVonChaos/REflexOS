import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/geminiService', () => ({
  generateText: vi.fn(async (prompt: string) => {
    // Always append a judgment block
    return `Result content\n<SRG_JUDGMENT>{"stageId":"test","modelId":"mock","srgViewId":"view-1","coherence":0.9,"relevance":0.8,"confidence":0.85,"missingConcepts":[],"spuriousConcepts":[],"action":"ok"}</SRG_JUDGMENT>`;
  })
}));

import { runStage } from '../src/services/pipelineOrchestrator';
import { srgModuleService } from '../src/services/srgModuleService';
import { generateText } from '../src/services/geminiService';

describe('pipelineOrchestrator.runStage', () => {
  it('returns parsed content and judgement from model output', async () => {
    const res = await runStage('test', { userInput: 'hello', traceSoFar: '' }, []);
    expect(res.content).toContain('Result content');
    expect(res.judgment).toBeTruthy();
    expect(res.judgment.stageId).toBe('test');
  });

  it('uses stage-specific modules when provided', async () => {
    const spy = vi.spyOn(srgModuleService, 'getActiveModulesForStage').mockReturnValue([{ id: 'm1', weight: 0.5 }]);
    const res = await runStage('test', { userInput: 'hello', traceSoFar: '' }, [{ id: 'test', name: 't' } as any]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('injects stage-level Lüscher into prompt when present', async () => {
    // Reset mock history
    (generateText as any).mockClear();
    const lastLuscher = { sequence: ['GREY','BLACK'], timingMs: {}, takenAt: '2025-12-17T00:00:00Z' };
    const workflow = [{ id: 'test', name: 't', lastLuscher } as any];
    const res = await runStage('test', { userInput: 'hello', traceSoFar: '' }, workflow as any);
    // generateText should have been called and the prompt should include the LUSCHER_PROFILE block
    expect((generateText as any).mock.calls.length).toBeGreaterThan(0);
    const passedPrompt = (generateText as any).mock.calls[0][0] as string;
    expect(passedPrompt).toContain('LUSCHER_PROFILE');
    expect(passedPrompt).toContain('"GREY"');
  });
});
