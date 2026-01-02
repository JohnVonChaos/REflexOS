import { describe, it, expect } from 'vitest';
import { ReflexScheduler } from '../src/services/reflexScheduler';

describe('ReflexScheduler', () => {
  it('runs scheduled tasks on tick', async () => {
    const s = new ReflexScheduler();
    let ran = false;
    s.register({ id: 't1', intervalMs: 1, lastRun: 0, run: async () => { ran = true; } });
    s.tick();
    // tick is synchronous for registered tasks; the run may be async but in our test run() completes quickly
    expect(ran).toBe(true);
  });
});
