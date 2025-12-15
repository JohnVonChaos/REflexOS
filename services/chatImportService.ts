import type { MemoryAtom } from '../types';
import { memoryService } from './memoryService';

/**
 * A single imported chat line / turn.
 */
export interface ChatImportEntry {
  source: string; // e.g., 'chatgpt', 'claude'
  conversationId?: string;
  role: 'user' | 'assistant' | 'system' | 'model';
  timestamp?: number | string; // epoch ms or ISO string
  text: string;
  // raw payload (optional) for debugging / provenance
  raw?: any;
}

/**
 * Map an imported entry into a Partial<MemoryAtom> suitable for ingestion.
 */
export function mapEntryToAtom(e: ChatImportEntry): Partial<MemoryAtom> {
  const role = (e.role === 'user') ? 'user' : 'model';
  const type: MemoryAtom['type'] = (role === 'user') ? 'user_message' : 'model_response';
  let ts = Date.now();
  if (typeof e.timestamp === 'number') ts = e.timestamp;
  else if (typeof e.timestamp === 'string') {
    const p = Date.parse(e.timestamp);
    if (!Number.isNaN(p)) ts = p;
  }

  return {
    role,
    type,
    text: e.text,
    timestamp: ts,
    isInContext: false,
    isCollapsed: true,
    source: e.source,
    conversationId: e.conversationId,
  } as Partial<MemoryAtom>;
}

/**
 * Import an array of chat entries into memory and return created atoms.
 * This function calls memoryService.ingestBulk which will forward text to SRG storage
 * (so imported content becomes part of the SRG substrate automatically).
 */
export async function importEntries(entries: ChatImportEntry[]) {
  // Group by conversationId (falls back to 'default' if missing)
  const groups: Record<string, ChatImportEntry[]> = {};
  for (const e of entries) {
    const conv = e.conversationId || 'default';
    groups[conv] = groups[conv] || [];
    groups[conv].push(e);
  }

  const createdAtoms: MemoryAtom[] = [];

  // Process each conversation sequentially to allow reply linking
  for (const conv of Object.keys(groups)) {
    const list = groups[conv].slice().sort((a, b) => {
      const ta = typeof a.timestamp === 'number' ? a.timestamp : Date.parse(String(a.timestamp) || '0');
      const tb = typeof b.timestamp === 'number' ? b.timestamp : Date.parse(String(b.timestamp) || '0');
      return ta - tb;
    });

    // Keep track of most recent user turn in this convo to attach replies
    let lastUserTurnId: string | undefined;

    for (const e of list) {
      const partial = mapEntryToAtom(e);

      // If this appears to be a model reply and we have a lastUserTurnId, set replyToTurnId
      if ((e.role === 'assistant' || e.role === 'model') && lastUserTurnId) {
        (partial as any).replyToTurnId = lastUserTurnId;
      }

      const created = await memoryService.createAtom(partial as Partial<MemoryAtom>);
      createdAtoms.push(created);

      // Track user turns for pairing
      if (e.role === 'user') {
        lastUserTurnId = created.turnId;
      }
      // If the model turn was created and it is a model_response, we might want to
      // link it back to the user (this is done by memoryService when replyToTurnId is present)
    }
  }

  return createdAtoms;
}
