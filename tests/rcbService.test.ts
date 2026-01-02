import { describe, it, expect } from 'vitest';
import { rcbService } from '../src/services/rcbService';

describe('rcbService.updateRcb', () => {
  it('sets RCB timestamp to last turn timestamp when available', async () => {
    const now = Date.now();
    const userAtom: any = { uuid: 'u1', timestamp: now - 1000, role: 'user', type: 'user_message', text: 'hello' };
    const modelAtom: any = { uuid: 'm1', timestamp: now, role: 'model', type: 'model_response', text: 'ok' };

    const currentRcb: any = {
      id: 'rcb_0', timestamp: 0, lastUpdatedAt: 0, conscious_focal_points: [], current_mission_state: '', interaction_history_abstract: '', constraint_reminders: [], plan_of_action: [], size_current: 0, size_limit: 1000, warnings: []
    };

    const updated = await rcbService.updateRcb([userAtom, modelAtom], currentRcb, { enabled: true } as any, {} as any, {} as any);
    expect(updated.timestamp).toBe(modelAtom.timestamp);
    expect(updated.lastUpdatedAt).toBeGreaterThan(0);
  });
  it('adds time_divergence warning when timestamp diverges by >1 year', async () => {
    const now = Date.now();
    const old = now - (1000 * 60 * 60 * 24 * 400); // ~400 days ago
    const userAtom: any = { uuid: 'u2', timestamp: old, role: 'user', type: 'user_message', text: 'old' };
    const modelAtom: any = { uuid: 'm2', timestamp: old, role: 'model', type: 'model_response', text: 'ok' };

    const currentRcb: any = {
      id: 'rcb_1', timestamp: 0, lastUpdatedAt: 0, conscious_focal_points: [], current_mission_state: '', interaction_history_abstract: '', constraint_reminders: [], plan_of_action: [], size_current: 0, size_limit: 1000, warnings: []
    };

    const updated = await rcbService.updateRcb([userAtom, modelAtom], currentRcb, { enabled: true } as any, {} as any, {} as any);
    expect(updated.warnings.some((w: any) => w.type === 'time_divergence')).toBeTruthy();
  });
  it('sets lastTurnSystemTime when last turn is recent system time', async () => {
    const now = Date.now();
    const userAtom: any = { uuid: 'u3', timestamp: now - 2000, role: 'user', type: 'user_message', text: 'hi' };
    const modelAtom: any = { uuid: 'm3', timestamp: now - 1000, role: 'model', type: 'model_response', text: 'ok' };
    const currentRcb: any = { id: 'rcb_2', timestamp: 0, lastUpdatedAt: 0, conscious_focal_points: [], current_mission_state: '', interaction_history_abstract: '', constraint_reminders: [], plan_of_action: [], size_current: 0, size_limit: 1000, warnings: [] };
    const updated = await rcbService.updateRcb([userAtom, modelAtom], currentRcb, { enabled: true } as any, {} as any, {} as any);
    expect(updated.lastTurnSystemTime).toBe(modelAtom.timestamp);
    expect(updated.resonanceAnchor).toBeUndefined();
  });
});
