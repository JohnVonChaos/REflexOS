import { describe, it, expect } from 'vitest';
import { contextService } from '../services/contextService';
import type { MemoryAtom } from '../types';

describe('ContextService.assignTier', () => {
  it('assigns hot for critical axiomId', () => {
    const item: MemoryAtom = { uuid: '1', timestamp: Date.now(), role: 'model', type: 'axiom', text: 'x', isInContext: false, isCollapsed: false, axiomId: 'identity.fixit.1' } as any;
    const tier = contextService.assignTier(item, 1000);
    expect(tier).toBe('hot');
  });

  it('assigns hot for high intrinsicValue', () => {
    const item: MemoryAtom = { uuid: '2', timestamp: Date.now(), role: 'model', type: 'steward_note', text: 'x', isInContext: false, isCollapsed: false, intrinsicValue: 0.9 } as any;
    const tier = contextService.assignTier(item, 1000);
    expect(tier).toBe('hot');
  });

  it('assigns warm for medium intrinsicValue', () => {
    const item: MemoryAtom = { uuid: '3', timestamp: Date.now(), role: 'model', type: 'steward_note', text: 'x', isInContext: false, isCollapsed: false, intrinsicValue: 0.5 } as any;
    const tier = contextService.assignTier(item, 1000);
    expect(tier).toBe('warm');
  });

  it('assigns cold by default', () => {
    const item: MemoryAtom = { uuid: '4', timestamp: Date.now(), role: 'model', type: 'steward_note', text: 'x', isInContext: false, isCollapsed: false } as any;
    const tier = contextService.assignTier(item, 1000);
    expect(tier).toBe('cold');
  });
});

describe('ContextService.computeRestorationPriority', () => {
  it('prioritizes intrinsicValue and recent activation', () => {
    const now = 1000;
    const item: MemoryAtom = { uuid: '5', timestamp: 800, role: 'model', type: 'steward_note', text: 'x', isInContext: false, isCollapsed: false, intrinsicValue: 0.8, lastActivatedTurn: 998 } as any;
    const p = contextService.computeRestorationPriority(item, now);
    expect(p).toBeGreaterThan(120); // 0.8*100 + 50
  });

  it('decays with age', () => {
    const now = 2000;
    const item: MemoryAtom = { uuid: '6', timestamp: 1000, role: 'model', type: 'steward_note', text: 'x', isInContext: false, isCollapsed: false, intrinsicValue: 0.5 } as any;
    const p = contextService.computeRestorationPriority(item, now);
    // baseline would be 50, but age > 100 should reduce it
    expect(p).toBeLessThan(50);
  });
});
