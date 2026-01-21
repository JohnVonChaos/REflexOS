import PersistentStagingLayer from './persistentStagingLayer';
import { openDB } from 'idb';
import type { ReflexFile } from '../types';

const DB_NAME = 'reflex-workspace-v1';
const FILE_STORE = 'files'; // key: path, value: ReflexFile
const RECENT_STORE = 'recent'; // simple list for recents

export class WorkspaceManager {
  private dbPromise = openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE);
      if (!db.objectStoreNames.contains(RECENT_STORE)) db.createObjectStore(RECENT_STORE);
    }
  });

  // Staging layer used for edits
  staging = new PersistentStagingLayer('reflex-staging-v1');

  async fsList(pathPrefix = 'reflex://', opts: { limit?: number } = {}) {
    const db = await this.dbPromise;
    const files = await db.getAll(FILE_STORE) as ReflexFile[];
    const filtered = files.filter(f => f.path.startsWith(pathPrefix));
    const summaries = filtered.map(f => ({ path: f.path, title: f.title, kind: f.kind, lastModified: f.lastModified, tags: f.tags, workState: f.workState }));
    summaries.sort((a,b) => b.lastModified - a.lastModified);
    return summaries.slice(0, opts.limit ?? summaries.length);
  }

  async fsOpen(path: string): Promise<{ file: ReflexFile | null }> {
    const db = await this.dbPromise;
    const file = await db.get(FILE_STORE, path) as ReflexFile | undefined;
    if (file) {
      // update recents
      await db.put(RECENT_STORE, Date.now(), path);
      return { file };
    }
    return { file: null };
  }

  async fsSave(path: string, newContent: string, workStatePatch?: Partial<ReflexFile['workState']>) {
    const db = await this.dbPromise;
    const existing = await db.get(FILE_STORE, path) as ReflexFile | undefined;
    const now = Date.now();
    const file: ReflexFile = existing ? { ...existing, content: newContent, lastModified: now, workState: { ...(existing.workState || {}), ...(workStatePatch || {}), updatedAt: now } } : { id: `file-${now}-${Math.random().toString(36).slice(2,6)}`, path, title: path.split('/').pop() || path, kind: 'note', content: newContent, lastModified: now, tags: [], workState: { ...(workStatePatch || {}), updatedAt: now } };
    await db.put(FILE_STORE, file, path);
    await db.put(RECENT_STORE, now, path);
    return file;
  }

  async fsRecent(limit = 10) {
    const db = await this.dbPromise;
    const keys = await db.getAllKeys(RECENT_STORE) as string[];
    // map key->timestamp
    const items = [] as { path: string; at: number }[];
    for (const k of keys) {
      const at = await db.get(RECENT_STORE, k) as number | undefined;
      if (at) items.push({ path: k, at });
    }
    items.sort((a,b) => b.at - a.at);
    return items.slice(0, limit);
  }

  // Helper: import or seed files
  async seedFile(file: ReflexFile) {
    const db = await this.dbPromise;
    await db.put(FILE_STORE, file, file.path);
  }

  async getRecentActivity(limit = 10) {
    const db = await this.dbPromise;
    const keys = await db.getAllKeys(RECENT_STORE) as string[];
    const items: { action: string; path: string; timestamp: number }[] = [];
    for (const k of keys) {
      const at = await db.get(RECENT_STORE, k) as number | undefined;
      if (at) items.push({ action: 'edited', path: k, timestamp: at });
    }
    items.sort((a,b) => b.timestamp - a.timestamp);
    return items.slice(0, limit);
  }
}

export default WorkspaceManager;

// Singleton instance for app usage
export const workspace = new WorkspaceManager();
