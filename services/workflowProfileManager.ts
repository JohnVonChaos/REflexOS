import { WorkflowStage, AISettings, AIProvider } from '../types';
import { loggingService } from './loggingService';

export interface WorkflowProfile {
  id: string;
  name: string;
  description?: string;
  workflow: WorkflowStage[];
  providers: Record<AIProvider, any>; // Provider settings
  createdAt: number;
  updatedAt: number;
  tags?: string[];
}

const PROFILES_STORE = 'workflowProfiles';
const DB_NAME = 'reflex-workflow-db';
const DB_VERSION = 1;

export class WorkflowProfileManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initDB();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        loggingService.log('INFO', 'WorkflowProfileManager DB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(PROFILES_STORE)) {
          const store = db.createObjectStore(PROFILES_STORE, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          loggingService.log('INFO', 'Created workflowProfiles object store');
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    await this.initPromise;
    if (!this.db) throw new Error('Database not initialized');
    return this.db;
  }

  /**
   * Save a workflow configuration as a profile
   */
  async saveProfile(
    name: string,
    workflow: WorkflowStage[],
    providers: Record<AIProvider, any>,
    description?: string,
    tags?: string[]
  ): Promise<WorkflowProfile> {
    const db = await this.ensureDB();
    const id = `profile_${Date.now()}`;
    const now = Date.now();

    const profile: WorkflowProfile = {
      id,
      name,
      description,
      workflow: JSON.parse(JSON.stringify(workflow)), // Deep copy
      providers: JSON.parse(JSON.stringify(providers)), // Deep copy
      createdAt: now,
      updatedAt: now,
      tags,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction([PROFILES_STORE], 'readwrite');
      const store = tx.objectStore(PROFILES_STORE);
      const request = store.add(profile);

      request.onsuccess = () => {
        loggingService.log('INFO', 'Saved workflow profile', { id, name });
        resolve(profile);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update an existing profile
   */
  async updateProfile(
    id: string,
    name?: string,
    workflow?: WorkflowStage[],
    providers?: Record<AIProvider, any>,
    description?: string,
    tags?: string[]
  ): Promise<WorkflowProfile> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([PROFILES_STORE], 'readonly');
      const store = tx.objectStore(PROFILES_STORE);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const profile: WorkflowProfile = getRequest.result;
        if (!profile) {
          reject(new Error(`Profile not found: ${id}`));
          return;
        }

        const updated: WorkflowProfile = {
          ...profile,
          name: name ?? profile.name,
          workflow: workflow ? JSON.parse(JSON.stringify(workflow)) : profile.workflow,
          providers: providers ? JSON.parse(JSON.stringify(providers)) : profile.providers,
          description: description ?? profile.description,
          tags: tags ?? profile.tags,
          updatedAt: Date.now(),
        };

        const writeTx = db.transaction([PROFILES_STORE], 'readwrite');
        const writeStore = writeTx.objectStore(PROFILES_STORE);
        const putRequest = writeStore.put(updated);

        putRequest.onsuccess = () => {
          loggingService.log('INFO', 'Updated workflow profile', { id, name });
          resolve(updated);
        };

        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Load a profile by ID
   */
  async getProfile(id: string): Promise<WorkflowProfile | null> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([PROFILES_STORE], 'readonly');
      const store = tx.objectStore(PROFILES_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * List all profiles, optionally filtered by tags
   */
  async listProfiles(tags?: string[]): Promise<WorkflowProfile[]> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([PROFILES_STORE], 'readonly');
      const store = tx.objectStore(PROFILES_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        let profiles: WorkflowProfile[] = request.result || [];

        if (tags && tags.length > 0) {
          profiles = profiles.filter(p =>
            tags.every(tag => p.tags?.includes(tag))
          );
        }

        profiles.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(profiles);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a profile
   */
  async deleteProfile(id: string): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([PROFILES_STORE], 'readwrite');
      const store = tx.objectStore(PROFILES_STORE);
      const request = store.delete(id);

      request.onsuccess = () => {
        loggingService.log('INFO', 'Deleted workflow profile', { id });
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Export profile as JSON (for backup/sharing)
   */
  async exportProfile(id: string): Promise<string> {
    const profile = await this.getProfile(id);
    if (!profile) throw new Error(`Profile not found: ${id}`);

    return JSON.stringify(profile, null, 2);
  }

  /**
   * Import profile from JSON
   */
  async importProfile(json: string): Promise<WorkflowProfile> {
    try {
      const profile = JSON.parse(json);
      
      // Validate required fields
      if (!profile.name || !profile.workflow || !profile.providers) {
        throw new Error('Invalid profile format: missing required fields');
      }

      // Generate new ID to avoid conflicts
      const newProfile: WorkflowProfile = {
        ...profile,
        id: `profile_${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const db = await this.ensureDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([PROFILES_STORE], 'readwrite');
        const store = tx.objectStore(PROFILES_STORE);
        const request = store.add(newProfile);

        request.onsuccess = () => {
          loggingService.log('INFO', 'Imported workflow profile', { id: newProfile.id, name: newProfile.name });
          resolve(newProfile);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      loggingService.log('ERROR', 'Failed to import profile', { error: e });
      throw e;
    }
  }
}

export const workflowProfileManager = new WorkflowProfileManager();
