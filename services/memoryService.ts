import type { MemoryAtom } from '../types';
import { loggingService } from './loggingService';
import { resurfacingService } from './resurfacingService';
import { srgStorage } from './srgStorage';

type AtomCreatedHandler = (atom: MemoryAtom) => void;

class MemoryService {
  private store: MemoryAtom[] = [];
  private handlers: AtomCreatedHandler[] = [];

  /** Persist a MemoryAtom and notify subscribers. */
  async createAtom(atom: Partial<MemoryAtom>): Promise<MemoryAtom> {
    const now = Date.now();
    const complete: MemoryAtom = {
      uuid: atom.uuid || `atom-${now}-${Math.floor(Math.random()*10000)}`,
      timestamp: atom.timestamp || now,
      role: atom.role || 'model',
      type: atom.type || 'steward_note',
      text: atom.text || '',
      isInContext: !!atom.isInContext,
      isCollapsed: !!atom.isCollapsed,
      ...atom
    } as MemoryAtom;

    // Ensure every conversational turn has a stable turnId for user/model messages
    if ((complete.type === 'user_message' || complete.type === 'model_response') && !complete.turnId) {
      complete.turnId = `turn-${now}-${Math.floor(Math.random() * 1e6)}`;
    }

    // Basic defaults
    if (typeof complete.intrinsicValue !== 'number') complete.intrinsicValue = 0.5;
    if (typeof complete.canEvict !== 'boolean') complete.canEvict = true;

    this.store.push(complete);

    try {
      // Schedule for resurfacing immediately
      resurfacingService.scheduleResurfacing(complete, this.currentTurn());
    } catch (e) {
      loggingService.log('WARN', 'Failed to schedule resurfacing for new atom.', { error: e });
    }

    // Add to SRG corpus (ensure storage initialized)
    try {
      if ((srgStorage as any).db === null) {
        await srgStorage.initialize();
      }
      if (complete.text && complete.text.trim().length > 0) {
        // Only add to the user or model SRG depending on the atom role/type
        const role = (complete.type === 'user_message') ? 'user' : (complete.type === 'model_response') ? 'model' : 'both';
        const nodeIds = await srgStorage.addText(complete.text, role as any);
        complete.traceIds = Array.from(new Set([...(complete.traceIds || []), ...nodeIds]));
      }
    } catch (e) {
      loggingService.log('WARN', 'Failed to add atom text to SRG storage.', { error: e });
    }

    // Notify handlers asynchronously
    for (const h of this.handlers) {
      try { h(complete); } catch (e) { loggingService.log('ERROR', 'Atom handler error', { error: e }); }
    }

    // If this atom is a reply to another turn, wire turn-level trace links
    try {
      if (complete.replyToTurnId) {
        const other = this.store.find(a => a.turnId === complete.replyToTurnId);
        if (other) {
          // cross-link turn ids in traceIds
          other.traceIds = Array.from(new Set([...(other.traceIds || []), complete.turnId || '']));
          complete.traceIds = Array.from(new Set([...(complete.traceIds || []), other.turnId || '']));
          // persist update to the other atom in store
          const idx = this.store.findIndex(a => a.uuid === other.uuid);
          if (idx !== -1) this.store[idx] = other;
        }
      }
    } catch (e) {
      loggingService.log('WARN', 'Failed to link turns', { error: e });
    }

    loggingService.log('INFO', 'Memory atom created', { uuid: complete.uuid, type: complete.type });
    return complete;
  }

  /**
   * Bulk ingest atoms and optionally trigger Lüscher refresh if ingestion is heavy
   */
  async ingestBulk(atoms: Partial<MemoryAtom>[]): Promise<MemoryAtom[]> {
    const created: MemoryAtom[] = [];
    for (const a of atoms) {
      const c = await this.createAtom(a);
      created.push(c);
    }

    // If heavy ingestion, check Lüscher profile freshness and emit event
    const ingestedCount = atoms.length;
    if (ingestedCount > 20) {
      try {
        const { getLatestLuescherProfile, shouldRefreshProfile } = await import('./luescherService');
        const profile = await getLatestLuescherProfile();
        if (shouldRefreshProfile(profile)) {
          const detail = { trigger: 'heavy-ingestion', ingestedCount };
          const evt = (typeof (globalThis as any).CustomEvent === 'function') ? new (globalThis as any).CustomEvent('luscher:refresh-needed', { detail }) : { type: 'luscher:refresh-needed', detail };
          if (typeof (globalThis as any).dispatchEvent === 'function') {
            (globalThis as any).dispatchEvent(evt);
          } else {
            loggingService.log('INFO', 'Lüscher refresh needed (heavy ingestion) - no global dispatch available', detail);
          }
        }
      } catch (e) {
        loggingService.log('WARN', 'Failed to perform Lüscher refresh check after bulk ingestion', { error: e });
      }
    }

    return created;
  }

  async updateAtom(uuid: string, patch: Partial<MemoryAtom>): Promise<MemoryAtom | null> {
    const idx = this.store.findIndex(a => a.uuid === uuid);
    if (idx === -1) return null;
    const updated = { ...this.store[idx], ...patch } as MemoryAtom;
    this.store[idx] = updated;

    try {
      // Re-schedule resurfacing if applicable
      resurfacingService.scheduleResurfacing(updated, this.currentTurn());
    } catch (e) {
      loggingService.log('WARN', 'Failed to re-schedule resurfacing on update.', { error: e });
    }

    return updated;
  }

  async getByUuid(uuid: string): Promise<MemoryAtom | undefined> {
    return this.store.find(a => a.uuid === uuid);
  }

  async getByTurnId(turnId: string): Promise<MemoryAtom | undefined> {
    return this.store.find(a => a.turnId === turnId);
  }

  async getAll(): Promise<MemoryAtom[]> { return [...this.store]; }

  onAtomCreated(handler: AtomCreatedHandler) {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter(h => h !== handler); };
  }

  // Simple turn counter for scheduling; replace with central turn service as available
  private _turn = 1;
  currentTurn() { return this._turn; }
  advanceTurn() { this._turn++; }
}

export const memoryService = new MemoryService();
