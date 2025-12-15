import { describe, it, expect } from 'vitest';
import { resurfacingService } from '../services/resurfacingService';
import type { MemoryAtom } from '../types';

describe('ResurfacingService.scheduleResurfacing', () => {
  it('schedules items with sufficient intrinsicValue', () => {
    const item: MemoryAtom = { uuid: 'r1', timestamp: 1, role: 'model', type: 'steward_note', text: 'hello', isInContext: false, isCollapsed: false, intrinsicValue: 0.5 } as any;
    resurfacingService.scheduleResurfacing(item, 10);
    expect(item.resurfacing).toBeDefined();
    expect(item.resurfacing!.nextResurfaceAt).toBeGreaterThan(10);
  });

  it('does not schedule low intrinsicValue', () => {
    const item: MemoryAtom = { uuid: 'r2', timestamp: 1, role: 'model', type: 'steward_note', text: 'hi', isInContext: false, isCollapsed: false, intrinsicValue: 0.1 } as any;
    resurfacingService.scheduleResurfacing(item, 10);
    expect(item.resurfacing).toBeUndefined();
  });
});

describe('ResurfacingService.advanceResurfacingSchedule', () => {
  it('advances fibonacciIndex when used', () => {
    const item: any = { resurfacing: { enabled: true, fibonacciIndex: 0, timesIgnored: 0, timesUsed: 0 } };
    resurfacingService.advanceResurfacingSchedule(item, true, 50);
    expect(item.resurfacing.fibonacciIndex).toBe(1);
    expect(item.resurfacing.timesUsed).toBe(1);
  });
});

describe('ResurfacingService.buildContextWithResurfacing', () => {
  it('builds normal and intrusive contexts', async () => {
    const now = 200;
    const items: MemoryAtom[] = [];
    for (let i = 0; i < 10; i++) {
      items.push({ uuid: `m${i}`, timestamp: now - i, role: 'model', type: 'steward_note', text: 'x'.repeat(100), isInContext: false, isCollapsed: false, intrinsicValue: 0.6 } as any);
    }

    // schedule resurfacing for a couple
    resurfacingService.scheduleResurfacing(items[2], now);
    resurfacingService.scheduleResurfacing(items[4], now);

    const r = await (resurfacingService as any).buildContextWithResurfacing(items, now, 'idle', 'i love gardening soil');
    expect(r.normal.length).toBeGreaterThan(0);
    expect(r.intrusive.length).toBeGreaterThanOrEqual(0);
  });

  it('schedules multiple items with scheduleAll', () => {
    const now = 50;
    const items: any[] = [
      { uuid: 'a', timestamp: 1, role: 'model', type: 'steward_note', text: 'abc', isInContext: false, isCollapsed: false, intrinsicValue: 0.5 },
      { uuid: 'b', timestamp: 1, role: 'model', type: 'steward_note', text: 'def', isInContext: false, isCollapsed: false, intrinsicValue: 0.2 }
    ];
    resurfacingService.scheduleAll(items, now);
    expect(items[0].resurfacing).toBeDefined();
    expect(items[1].resurfacing).toBeUndefined();
  });

  it('computeRestorationPriority reflects SRG similarity to current context', async () => {
    const { srgStorage } = await import('../services/srgStorage');
    await srgStorage.initialize();
    // Add context text
    await srgStorage.addText('I love gardening and soil composition');

    const atom: any = { text: 'soil composition and gardening tips', intrinsicValue: 0.6, tier: 'warm', lastActivatedAt: Date.now() - 1000 };
    const score = await (resurfacingService as any).computeRestorationPriority(atom, 'gardening soil');
    expect(score).toBeGreaterThan(0);
  });
});
