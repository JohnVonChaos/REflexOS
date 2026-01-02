import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import WorkspaceManager from '../src/services/workspaceManager';

describe('WorkspaceManager', () => {
  let w: WorkspaceManager;

  beforeEach(async () => {
    w = new WorkspaceManager();
  });

  it('saves and opens a file', async () => {
    const path = 'reflex://notes/test.md';
    const saved = await w.fsSave(path, 'hello world', { lastCursorLine: 3 });
    expect(saved.path).toBe(path);
    const { file } = await w.fsOpen(path);
    expect(file).not.toBeNull();
    expect(file!.content).toBe('hello world');
    expect(file!.workState?.lastCursorLine).toBe(3);
  });

  it('lists files by prefix and returns recents', async () => {
    await w.fsSave('reflex://notes/a.md', 'a');
    await w.fsSave('reflex://code/b.ts', 'b');
    const notes = await w.fsList('reflex://notes');
    expect(notes.some(n => n.path === 'reflex://notes/a.md')).toBeTruthy();
    const recents = await w.fsRecent(5);
    expect(recents.length).toBeGreaterThanOrEqual(2);
  });
});
