import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { srgModuleService } from './srgModuleService';

describe('SRGModuleService', () => {
  beforeEach(async () => {
    await srgModuleService.init();
  });

  it('should import a module from chat entries', async () => {
    const entries = [ { source: 'test', role: 'user', text: 'Strategic thinking is important', timestamp: Date.now() } ];
    const module = await srgModuleService.importModule(entries, { name: 'Test Strategy Module', description: 'Test module for strategic reasoning' });
    expect(module.id).toBeDefined();
    expect(module.name).toBe('Test Strategy Module');
    expect(module.metadata.entryCount).toBe(1);
  });

  it('should list all modules', async () => {
    const modules = srgModuleService.listModules();
    expect(Array.isArray(modules)).toBe(true);
  });

  it('should toggle module active state', async () => {
    const entries = [ { source: 'test', role: 'user', text: 'test', timestamp: Date.now() } ];
    const module = await srgModuleService.importModule(entries, { name: 'Toggle Test', description: 'Test toggle' });
    expect(module.isActive).toBe(true);
    await srgModuleService.toggleModule(module.id);
    const updated = srgModuleService.getModule(module.id);
    expect(updated?.isActive).toBe(false);
  });

  it('should calculate interference between modules', async () => {
    const module1 = await srgModuleService.importModule([{ source: 'test', role: 'user', text: 'Be kind and empathetic', timestamp: Date.now() }], { name: 'Empathy', description: 'Empathy module' });
    const module2 = await srgModuleService.importModule([{ source: 'test', role: 'user', text: 'Follow the law strictly', timestamp: Date.now() }], { name: 'Law', description: 'Legal framework' });

    const result = await srgModuleService.queryWithInterference('How should I help someone?', { traversal: {} as any });

    expect(result.modules.length).toBeGreaterThanOrEqual(2);
    expect(result.pairwiseInterference.length).toBeGreaterThanOrEqual(1);
    expect(result.consensus).toBeDefined();
  });
});
