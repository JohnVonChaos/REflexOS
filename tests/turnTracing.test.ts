import { describe, it, expect } from 'vitest';
import { memoryService } from '../services/memoryService';
import { recallWeaverService } from '../src/services/recallWeaverService';
import { srgStorage } from '../services/srgStorage';

describe('Turn-level SRG traces', () => {
  it('creates turnIds and cross-links user<->model traceIds, and recallChains finds pairs', async () => {
    await srgStorage.initialize();

    const user = await memoryService.createAtom({ role: 'user', type: 'user_message', text: 'How do I bake sourdough bread?' });
    expect(user.turnId).toBeDefined();

    const model = await memoryService.createAtom({ role: 'model', type: 'model_response', text: 'Mix flour, water, and salt. Let it ferment', replyToTurnId: user.turnId });
    expect(model.turnId).toBeDefined();

    // Fetch fresh copies
    const updatedUser = await memoryService.getByUuid(user.uuid);
    const updatedModel = await memoryService.getByUuid(model.uuid);

    expect(updatedUser).toBeDefined();
    expect(updatedModel).toBeDefined();

    expect(updatedUser!.traceIds).toContain(updatedModel!.turnId);
    expect(updatedModel!.traceIds).toContain(updatedUser!.turnId);

    const chains = await recallWeaverService.recallChains('baking sourdough', 3);
    expect(chains.length).toBeGreaterThanOrEqual(1);
    const found = chains.find(c => c.user.turnId === user.turnId);
    expect(found).toBeTruthy();
    expect(found!.model).toBeDefined();
    expect(found!.model!.turnId).toBe(model.turnId);
  });
});
