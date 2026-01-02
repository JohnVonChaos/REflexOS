import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import PersistentStagingLayer from '../src/services/persistentStagingLayer';

describe('PersistentStagingLayer', () => {
  let p: PersistentStagingLayer;

  beforeEach(async () => {
    // use a fresh DB name each test to isolate
    p = new PersistentStagingLayer(`test-db-${Date.now()}-${Math.random().toString(36).slice(2,6)}`);
  });

  it('writes and reads files via overlay', async () => {
    await p.writeFile('reflex://notes/n1.md', 'hello');
    expect(await p.readFile('reflex://notes/n1.md')).toBe('hello');
  });

  it('lists files and respects deletions', async () => {
    await p.writeFile('reflex://a.txt', 'a');
    await p.writeFile('reflex://b.txt', 'b');
    expect((await p.listFiles()).length).toBeGreaterThanOrEqual(2);
    await p.deleteFile('reflex://b.txt');
    const files = await p.listFiles();
    expect(files).not.toContain('reflex://b.txt');
  });

  it('commits and stores commits history', async () => {
    await p.writeFile('reflex://c.txt', 'c');
    const before = await p.diff();
    expect(before.some(d => d.path === 'reflex://c.txt')).toBeTruthy();
    const commit = await p.commit('commit msg', 'tester');
    expect(commit.message).toBe('commit msg');
    const commits = await p.getCommits();
    expect(commits.length).toBeGreaterThanOrEqual(1);
    // overlay cleared
    expect((await p.listFiles())).not.toContain('reflex://c.txt');
  });

  it('discard clears overlay', async () => {
    await p.writeFile('reflex://d.txt', 'd');
    await p.discard();
    expect(await p.readFile('reflex://d.txt')).toBeNull();
  });

  it('persists overlay across instances', async () => {
    const dbName = `persist-test-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const a = new PersistentStagingLayer(dbName);
    await a.writeFile('reflex://persist/x.txt', 'x');
    // new instance pointing to same DB should see it
    const b = new PersistentStagingLayer(dbName);
    expect(await b.readFile('reflex://persist/x.txt')).toBe('x');
    await b.discard();
    const c = new PersistentStagingLayer(dbName);
    expect(await c.readFile('reflex://persist/x.txt')).toBeNull();
  });
});
