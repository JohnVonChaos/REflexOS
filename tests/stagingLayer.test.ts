import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStagingLayer } from '../src/services/stagingLayer';

describe('InMemoryStagingLayer', () => {
  let s: InMemoryStagingLayer;

  beforeEach(() => {
    s = new InMemoryStagingLayer({ 'reflex://code/a.txt': 'initial', 'reflex://notes/n.md': 'hello' });
  });

  it('lists files (base + overlay)', () => {
    expect(s.listFiles()).toEqual(['reflex://code/a.txt', 'reflex://notes/n.md']);
    s.writeFile('reflex://code/b.txt', 'new');
    const list = s.listFiles();
    expect(list).toContain('reflex://code/b.txt');
  });

  it('reads overlay before base', () => {
    s.writeFile('reflex://code/a.txt', 'modified');
    expect(s.readFile('reflex://code/a.txt')).toBe('modified');
  });

  it('deletes file in overlay', () => {
    s.deleteFile('reflex://code/a.txt');
    expect(s.readFile('reflex://code/a.txt')).toBeNull();
    const diffs = s.diff();
    expect(diffs.some(d => d.path === 'reflex://code/a.txt' && d.type === 'deleted')).toBeTruthy();
  });

  it('commits changes and clears overlay', () => {
    s.writeFile('reflex://code/a.txt', 'modified');
    s.writeFile('reflex://code/b.txt', 'added');
    const diffs = s.diff();
    expect(diffs.length).toBeGreaterThanOrEqual(1);
    const c = s.commit('test commit', 'tester');
    expect(c.changes.length).toBeGreaterThanOrEqual(1);
    // overlay cleared
    expect(s.readFile('reflex://code/b.txt')).toBe('added');
    expect(s.diff().length).toBe(0);
  });

  it('discard clears overlay without changing base', () => {
    s.writeFile('reflex://code/a.txt', 'modified');
    s.discard();
    expect(s.readFile('reflex://code/a.txt')).toBe('initial');
  });
});
