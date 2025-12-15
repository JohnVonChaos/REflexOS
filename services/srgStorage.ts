import { openDB, IDBPDatabase } from 'idb';
import { SRGCore } from './srgCore';

interface TokenEntry { position: number; token: string }
interface WordPositionEntry { word: string; positions: number[] }
interface RelationTripleEntry { id: string; subject: string; relationType: string; object: string | null; position: number; modifiers: string[] }
interface MetadataEntry { key: string; value: any }

export class SRGStorage {
  private userCore: SRGCore;
  private modelCore: SRGCore;
  private db: IDBPDatabase | null = null;

  constructor(userCore?: SRGCore, modelCore?: SRGCore) {
    this.userCore = userCore || new SRGCore();
    this.modelCore = modelCore || new SRGCore();
  }

  async initialize(): Promise<void> {
    this.db = await openDB('reflexengine_srg', 1, {
      upgrade(db) {
        // Separate stores for user/model corpora
        if (!db.objectStoreNames.contains('tokens_user')) {
          db.createObjectStore('tokens_user', { keyPath: 'position' });
        }
        if (!db.objectStoreNames.contains('tokens_model')) {
          db.createObjectStore('tokens_model', { keyPath: 'position' });
        }
        if (!db.objectStoreNames.contains('word_positions_user')) {
          db.createObjectStore('word_positions_user', { keyPath: 'word' });
        }
        if (!db.objectStoreNames.contains('word_positions_model')) {
          db.createObjectStore('word_positions_model', { keyPath: 'word' });
        }
        if (!db.objectStoreNames.contains('relation_triples_user')) {
          db.createObjectStore('relation_triples_user', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('relation_triples_model')) {
          db.createObjectStore('relation_triples_model', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('turn_relations')) {
          db.createObjectStore('turn_relations', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('luscher_profiles')) {
          db.createObjectStore('luscher_profiles', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      }
    });
  }

  async putLuescherProfile(profile: any): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    const entry = { id: `luscher_${Date.now()}`, timestamp: Date.now(), profile };
    await this.db.put('luscher_profiles', entry);
  }

  async getLatestLuescherProfile(): Promise<any | null> {
    if (!this.db) throw new Error('DB not initialized');
    const all = await this.db.getAll('luscher_profiles');
    if (!all || all.length === 0) return null;
    all.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
    return all[0].profile || null;
  }

  private async getMetadata(key: string): Promise<any> {
    if (!this.db) throw new Error('DB not initialized');
    const e = await this.db.get('metadata', key);
    return e?.value;
  }

  private async setMetadata(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    await this.db.put('metadata', { key, value });
  }

  /**
   * Add text to the SRG corpus. Role may be 'user', 'model' or 'both'.
   * Returns an array of node IDs added (prefixed with role and position).
   */
  async addText(text: string, role: 'user' | 'model' | 'both' = 'both'): Promise<string[]> {
    if (!this.db) throw new Error('DB not initialized');
    const addedNodeIds: string[] = [];

    const addFor = async (whichCore: SRGCore, tokenStore: string, wpStore: string, relStore: string, metaKey: string, rlabel: string) => {
      const startPos = (await this.getMetadata(metaKey)) || 0;
      whichCore.addText(text, startPos);
      const tokens = whichCore.getTokens();
      for (let pos = startPos; pos < tokens.length; pos++) {
        const token = tokens[pos];
        await this.db!.put(tokenStore, { position: pos, token } as TokenEntry);
        addedNodeIds.push(`${rlabel}:pos:${pos}`);
      }
      const wp = whichCore.getWordPositions();
      for (const [word, positions] of wp.entries()) {
        await this.db!.put(wpStore, { word, positions } as WordPositionEntry);
      }
      const triples = whichCore.getAllRelations();
      const tx = this.db!.transaction(relStore, 'readwrite');
      await tx.objectStore(relStore).clear();
      for (const t of triples) {
        const id = t.id || `${relStore}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
        const entry: RelationTripleEntry = { id, subject: t.subject, relationType: t.relationType, object: t.object || null, position: t.position || 0, modifiers: t.modifiers || [] };
        await tx.objectStore(relStore).put(entry);
      }
      await tx.done;
      await this.setMetadata(metaKey, tokens.length);
    };

    if (role === 'user' || role === 'both') {
      await addFor(this.userCore, 'tokens_user', 'word_positions_user', 'relation_triples_user', 'totalTokens_user', 'user');
    }
    if (role === 'model' || role === 'both') {
      await addFor(this.modelCore, 'tokens_model', 'word_positions_model', 'relation_triples_model', 'totalTokens_model', 'model');
    }

    await this.setMetadata('lastUpdated', Date.now());
    return addedNodeIds;
  }

  /**
   * Compute similarity using a role-specific core. Defaults to 'user' core.
   */
  async computeSimilarity(textA: string, textB: string, role: 'user' | 'model' | 'both' = 'user'): Promise<number> {
    if (role === 'model') return this.modelCore.computeSimilarity(textA, textB);
    return this.userCore.computeSimilarity(textA, textB);
  }

  async loadFromDB(): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    // Load user core
    const tokensUser: string[] = [];
    const allTokensUser = await this.db.getAll('tokens_user');
    allTokensUser.sort((a: any, b: any) => a.position - b.position);
    for (const t of allTokensUser) tokensUser[t.position] = t.token;
    const wpUserEntries = await this.db.getAll('word_positions_user');
    const wpUser: [string, number[]][] = wpUserEntries.map((e: any) => [e.word, e.positions]);
    const triplesUser = await this.db.getAll('relation_triples_user');
    this.userCore.loadFromDump(tokensUser, wpUser, triplesUser);

    // Load model core
    const tokensModel: string[] = [];
    const allTokensModel = await this.db.getAll('tokens_model');
    allTokensModel.sort((a: any, b: any) => a.position - b.position);
    for (const t of allTokensModel) tokensModel[t.position] = t.token;
    const wpModelEntries = await this.db.getAll('word_positions_model');
    const wpModel: [string, number[]][] = wpModelEntries.map((e: any) => [e.word, e.positions]);
    const triplesModel = await this.db.getAll('relation_triples_model');
    this.modelCore.loadFromDump(tokensModel, wpModel, triplesModel);
  }

  // Close DB handle (useful for tests)
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default SRGStorage;

// Singleton instance for app-wide use
export const srgStorage = new SRGStorage();
