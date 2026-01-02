import { openDB, IDBPDatabase } from 'idb';
import type { StagingLayer, StagingChange, StagingCommit } from '../types';

const DB_NAME = 'reflex-staging-v1';
const OVERLAY_STORE = 'overlay'; // key: path, value: content|string|null (null => deleted)
const COMMITS_STORE = 'commits'; // key: commitId, value: StagingCommit

export class PersistentStagingLayer implements StagingLayer {
  private dbPromise: Promise<IDBPDatabase>;

  constructor(dbName = DB_NAME) {
    this.dbPromise = openDB(dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(OVERLAY_STORE)) db.createObjectStore(OVERLAY_STORE);
        if (!db.objectStoreNames.contains(COMMITS_STORE)) db.createObjectStore(COMMITS_STORE);
      }
    });
  }

  async listFiles(): Promise<string[]> {
    const db = await this.dbPromise;
    // overlay keys are paths; include only non-deleted entries and return unique set
    const keys = await db.getAllKeys(OVERLAY_STORE) as string[];
    const results = [] as string[];
    for (const k of keys) {
      const v = await db.get(OVERLAY_STORE, k);
      if (v !== null) results.push(k);
    }
    results.sort();
    return results;
  }

  async readFile(path: string): Promise<string | null> {
    const db = await this.dbPromise;
    const v = await db.get(OVERLAY_STORE, path);
    if (v !== undefined) return v === null ? null : v;
    // If not in overlay, no base persistence here — return null to indicate missing. Caller can wrap base.
    return null;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const db = await this.dbPromise;
    await db.put(OVERLAY_STORE, content, path);
  }

  async deleteFile(path: string): Promise<void> {
    const db = await this.dbPromise;
    await db.put(OVERLAY_STORE, null, path);
  }

  async diff(): Promise<StagingChange[]> {
    const db = await this.dbPromise;
    const keys = await db.getAllKeys(OVERLAY_STORE) as string[];
    // Since this persistent layer only stores overlay, the diff entries are relative to unknown base.
    // For the purposes of staging review we expose added/modified/deleted with before=null for added
    const changes: StagingChange[] = [];
    for (const k of keys) {
      const after = await db.get(OVERLAY_STORE, k);
      if (after === null) {
        changes.push({ path: k, type: 'deleted', before: null, after: null });
      } else {
        // Unknown whether this is added or modified without base; mark as modified for UI differentiation later
        changes.push({ path: k, type: 'modified', before: null, after });
      }
    }
    return changes;
  }

  async commit(message?: string, author?: string): Promise<StagingCommit> {
    const db = await this.dbPromise;
    const keys = await db.getAllKeys(OVERLAY_STORE) as string[];
    const changes: StagingChange[] = [];
    for (const k of keys) {
      const after = await db.get(OVERLAY_STORE, k);
      if (after === null) changes.push({ path: k, type: 'deleted', before: null, after: null });
      else changes.push({ path: k, type: 'modified', before: null, after });
    }

    const commit: StagingCommit = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,
      timestamp: Date.now(),
      author,
      message,
      changes
    };

    // persist commit
    await db.put(COMMITS_STORE, commit, commit.id);
    // clear overlay after commit
    const tx = db.transaction(OVERLAY_STORE, 'readwrite');
    await tx.store.clear();
    await tx.done;

    return commit;
  }

  async discard(): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(OVERLAY_STORE, 'readwrite');
    await tx.store.clear();
    await tx.done;
  }

  async getCommits(): Promise<StagingCommit[]> {
    const db = await this.dbPromise;
    const commits = await db.getAll(COMMITS_STORE) as StagingCommit[];
    commits.sort((a,b) => b.timestamp - a.timestamp);
    return commits;
  }
}

export default PersistentStagingLayer;
