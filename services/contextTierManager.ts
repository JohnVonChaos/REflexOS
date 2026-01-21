import { openDB, IDBPDatabase } from 'idb';
import type { ContextItem, ContextProfile, TrapDoorState, ContextSnapshot, LayerId } from '../types/contextTiers';

const DB_NAME = 'reflex-context-tiers-v1';
const DB_VERSION = 1;

interface DBSchema {
  contextItems: ContextItem;
  trapDoorStates: TrapDoorState;
  contextSnapshots: ContextSnapshot;
  contextProfiles: ContextProfile;
}

export class ContextTierManager {
  private dbPromise: Promise<IDBPDatabase>;
  private isInitialized = false;

  constructor() {
    this.dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('contextItems')) db.createObjectStore('contextItems', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('trapDoorStates')) db.createObjectStore('trapDoorStates', { keyPath: ['layerId', 'turnId'] });
        if (!db.objectStoreNames.contains('contextSnapshots')) db.createObjectStore('contextSnapshots', { keyPath: ['turnId', 'layerId'] });
        if (!db.objectStoreNames.contains('contextProfiles')) db.createObjectStore('contextProfiles', { keyPath: ['layerId', 'modelId'] });
        if (!db.objectStoreNames.contains('workspaces')) db.createObjectStore('workspaces', { keyPath: 'id' });
      }
    }).then(db => {
      console.log('[ContextTierManager] Database initialized successfully');
      this.isInitialized = true;
      return db;
    }).catch(err => {
      console.error('[ContextTierManager] Failed to initialize database:', err);
      throw err;
    });
  }

  async storeContextItem(item: ContextItem) {
    try {
      const db = await this.dbPromise;
      await db.put('contextItems', item);
      console.log('[ContextTierManager] Stored context item:', item.id);
    } catch (err) {
      console.error('[ContextTierManager] Failed to store context item:', err, item);
      throw err;
    }
  }

  async getContextItem(id: string) {
    const db = await this.dbPromise;
    return db.get('contextItems', id) as Promise<ContextItem | undefined>;
  }

  // New: delete a single context item
  async deleteContextItem(id: string) {
    const db = await this.dbPromise;
    await db.delete('contextItems', id);
  }

  // New: move an item to a different tier (non-destructive)
  async moveItemToTier(id: string, newTier: string) {
    const db = await this.dbPromise;
    const item = await db.get('contextItems', id) as ContextItem | undefined;
    if (!item) return;
    item.tier = newTier as any;
    await db.put('contextItems', item);
  }

  // New: get all context items (admin/debug)
  async getAllContextItems() {
    try {
      const db = await this.dbPromise;
      const items = await db.getAll('contextItems') as Promise<ContextItem[]>;
      console.log('[ContextTierManager] Retrieved all context items:', items.length);
      return items;
    } catch (err) {
      console.error('[ContextTierManager] Failed to retrieve context items:', err);
      throw err;
    }
  }

  // New: clear all context items (use with care)
  async clearAllContextItems() {
    const db = await this.dbPromise;
    const tx = db.transaction('contextItems', 'readwrite');
    await tx.store.clear();
    await tx.done;
  }

  async storeTrapDoorState(state: TrapDoorState) {
    const db = await this.dbPromise;
    await db.put('trapDoorStates', state);
  }

  async getTrapDoorState(layerId: LayerId, turnId: number) {
    const db = await this.dbPromise;
    return db.get('trapDoorStates', [layerId, turnId]) as Promise<TrapDoorState | undefined>;
  }

  async clearTrapDoorState(layerId: LayerId, turnId: number) {
    const db = await this.dbPromise;
    await db.delete('trapDoorStates', [layerId, turnId]);
  }

  // New: clear all trap door states
  async clearAllTrapDoorStates() {
    const db = await this.dbPromise;
    const tx = db.transaction('trapDoorStates', 'readwrite');
    await tx.store.clear();
    await tx.done;
  }

  // Workspaces API
  async createWorkspace(ws: { id: string; name: string; itemIds: string[]; fileIds?: string[]; description?: string }) {
    const db = await this.dbPromise;
    const w = { ...ws, createdAt: Date.now() } as any;
    await db.put('workspaces', w);
  }

  async getWorkspaces() {
    const db = await this.dbPromise;
    return db.getAll('workspaces') as Promise<any[]>;
  }

  async getWorkspace(id: string) {
    const db = await this.dbPromise;
    return db.get('workspaces', id) as Promise<any | undefined>;
  }

  async saveWorkspace(ws: any) {
    const db = await this.dbPromise;
    const updated = { ...ws, lastUsedAt: Date.now() };
    await db.put('workspaces', updated);
  }

  async deleteWorkspace(id: string) {
    const db = await this.dbPromise;
    await db.delete('workspaces', id);
  }

  // New: move all trap door basket items to DEEP (set-aside) and clear trap door states
  async deorbitAllTrapDoorStates() {
    const db = await this.dbPromise;
    const allStates = await db.getAll('trapDoorStates') as TrapDoorState[];
    for (const s of allStates) {
      for (const item of s.basket) {
        item.tier = 'DEEP' as any;
        await db.put('contextItems', item);
      }
      await db.delete('trapDoorStates', [s.layerId, s.turnId]);
    }
  }

  async storeSnapshot(snapshot: ContextSnapshot) {
    const db = await this.dbPromise;
    await db.put('contextSnapshots', snapshot);
  }

  async getSnapshot(turnId: number, layerId: LayerId) {
    const db = await this.dbPromise;
    return db.get('contextSnapshots', [turnId, layerId]) as Promise<ContextSnapshot | undefined>;
  }

  // New: clear all snapshots
  async clearAllSnapshots() {
    const db = await this.dbPromise;
    const tx = db.transaction('contextSnapshots', 'readwrite');
    await tx.store.clear();
    await tx.done;
  }

  async initializeProfiles(profiles: ContextProfile[]) {
    const db = await this.dbPromise;
    const tx = db.transaction('contextProfiles', 'readwrite');
    for (const p of profiles) {
      await tx.store.put(p);
    }
    await tx.done;
  }

  async getProfile(layerId: LayerId, modelId: string) {
    const db = await this.dbPromise;
    return db.get('contextProfiles', [layerId, modelId]) as Promise<ContextProfile | undefined>;
  }

  async updateProfile(profile: ContextProfile) {
    const db = await this.dbPromise;
    await db.put('contextProfiles', profile);
  }

  // New: wipe everything related to context tiers (items, trap door states, snapshots, profiles)
  async clearAllContexts() {
    const db = await this.dbPromise;
    // clear each store
    const tx = db.transaction(['contextItems', 'trapDoorStates', 'contextSnapshots', 'contextProfiles'], 'readwrite');
    // Instead of destructive clear, move all items to DEEP (set-aside) and remove trap door states
    const allItems = await tx.objectStore('contextItems').getAll();
    for (const it of allItems) {
      it.tier = 'DEEP';
      await tx.objectStore('contextItems').put(it);
    }
    await tx.objectStore('trapDoorStates').clear();
    await tx.objectStore('contextSnapshots').clear();
    // keep profiles intact
    await tx.done;
  }

  // TODO: more query helpers (by tier, by time ranges)
}

export const contextTierManager = new ContextTierManager();
