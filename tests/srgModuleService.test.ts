import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { srgModuleService } from '../src/services/srgModuleService';

describe('srgModuleService.getActiveModulesForStage', () => {
  beforeEach(async () => {
    // clear any existing modules by creating a fresh isolated instance isn't exposed; instead remove all exported modules
    const list = srgModuleService.listModules();
    for (const m of list) {
      try { await srgModuleService.deleteModule(m.id); } catch (e) { /* ignore */ }
    }
  });

  afterEach(async () => {
    const list = srgModuleService.listModules();
    for (const m of list) {
      try { await srgModuleService.deleteModule(m.id); } catch (e) { /* ignore */ }
    }
  });

  it('returns all installed modules when stage has no modules configured', async () => {
    const modA = await srgModuleService.importFromJSON(JSON.stringify({ name: 'A', description: 'a', graph: { nodes: {}, links: [], metadata: { totalNodes: 0, totalLinks: 0, averageDegree: 0 } }, weight: 1.0, isActive: true, metadata: { source: 'manual', version: '1.0', entryCount: 0, topics: [], expertise: 'x', createdAt: Date.now(), updatedAt: Date.now() } }));
    const modB = await srgModuleService.importFromJSON(JSON.stringify({ name: 'B', description: 'b', graph: { nodes: {}, links: [], metadata: { totalNodes: 0, totalLinks: 0, averageDegree: 0 } }, weight: 0.5, isActive: true, metadata: { source: 'manual', version: '1.0', entryCount: 0, topics: [], expertise: 'x', createdAt: Date.now(), updatedAt: Date.now() } }));

    const workflow = [{ id: 's1', name: 'stage1' }];
    const active = srgModuleService.getActiveModulesForStage(workflow as any, 's1');
    expect(active.find(a => a.id === modA.id)).toBeTruthy();
    expect(active.find(a => a.id === modB.id)).toBeTruthy();
    expect(active.every(a => a.weight === 1.0)).toBe(true);
  });

  it('respects per-stage enabled/weights', async () => {
    const modA = await srgModuleService.importFromJSON(JSON.stringify({ name: 'A', description: 'a', graph: { nodes: {}, links: [], metadata: { totalNodes: 0, totalLinks: 0, averageDegree: 0 } }, weight: 1.0, isActive: true, metadata: { source: 'manual', version: '1.0', entryCount: 0, topics: [], expertise: 'x', createdAt: Date.now(), updatedAt: Date.now() } }));
    const modB = await srgModuleService.importFromJSON(JSON.stringify({ name: 'B', description: 'b', graph: { nodes: {}, links: [], metadata: { totalNodes: 0, totalLinks: 0, averageDegree: 0 } }, weight: 0.5, isActive: true, metadata: { source: 'manual', version: '1.0', entryCount: 0, topics: [], expertise: 'x', createdAt: Date.now(), updatedAt: Date.now() } }));

    const workflow = [{ id: 's1', name: 'stage1', modules: [ { id: modA.id, enabled: true, weight: 0.9 }, { id: modB.id, enabled: false, weight: 0.2 } ] }];
    const active = srgModuleService.getActiveModulesForStage(workflow as any, 's1');
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(modA.id);
    expect(active[0].weight).toBe(0.9);
  });
});
