import type { SrgSlice } from './srgSimilarity';
import { computeSrgSimilarity } from './srgSimilarity';
import { get, set } from 'idb-keyval';

const DB_KEY = 'srg-playback-timeline-v1';

export interface SrgTimelineEntry {
  turnId: string; // uuid of message or segment id
  slice: SrgSlice;
  similarityToPrev?: number;
}

export interface PlaybackConfig {
  hardTokenLimit: number;
  similarityThreshold: number; // boundary
  backtrackThreshold: number; // stricter for backtrack
  maxBacktrackTurns: number;
}

export const DEFAULT_PLAYBACK_CONFIG: PlaybackConfig = {
  hardTokenLimit: 2000,
  similarityThreshold: 0.3,
  backtrackThreshold: 0.6,
  maxBacktrackTurns: 3,
};

class SrgPlaybackService {
  private timeline: SrgTimelineEntry[] = [];
  private saveTimeout: any = null;
  private provenanceWeight: number = 0.15; // default small provenance effect

  public appendEntry(turnId: string, slice: SrgSlice) {
    const prev = this.timeline.length > 0 ? this.timeline[this.timeline.length - 1] : null;
    const similarity = prev ? computeSrgSimilarity(prev.slice, slice, { provenanceWeight: this.provenanceWeight }) : 1;
    const entry: SrgTimelineEntry = { turnId, slice, similarityToPrev: similarity };
    this.timeline.push(entry);
    this.scheduleSave();
    return entry;
  }

  public getProvenanceWeight() { return this.provenanceWeight; }

  public async recomputeSimilarities(provenanceWeight?: number) {
    if (typeof provenanceWeight === 'number') this.provenanceWeight = provenanceWeight;
    for (let i = 0; i < this.timeline.length; i++) {
      if (i === 0) {
        this.timeline[i].similarityToPrev = 1;
      } else {
        this.timeline[i].similarityToPrev = computeSrgSimilarity(this.timeline[i - 1].slice, this.timeline[i].slice, { provenanceWeight: this.provenanceWeight });
      }
    }
    this.scheduleSave();
  }

  public getTimeline(): SrgTimelineEntry[] {
    return [...this.timeline];
  }

  public hasEntry(turnId: string) {
    return this.timeline.some(e => e.turnId === turnId);
  }

  public clear() { this.timeline = []; }

  private scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimelineImmediate();
      this.saveTimeout = null;
    }, 300);
  }

  private async saveTimelineImmediate() {
    try {
      await set(DB_KEY, this.timeline);
    } catch (e) {
      // fail silently; persistence is best-effort
      console.warn('Failed to save SRG playback timeline', e);
    }
  }

  public async init(): Promise<void> {
    try {
      const stored = await get<SrgTimelineEntry[]>(DB_KEY);
      if (stored && Array.isArray(stored)) {
        this.timeline = stored;
      }
    } catch (e) {
      console.warn('Failed to load SRG playback timeline', e);
    }
  }

  public async persistClear(): Promise<void> {
    this.clear();
    try {
      await set(DB_KEY, this.timeline);
    } catch (e) {
      console.warn('Failed to clear SRG playback timeline', e);
    }
  }

  /**
   * tokenLengthsByTurn: approximate token counts by turnId
   */
  public getPlaybackWindow(
    timeline: SrgTimelineEntry[],
    currentTurnId: string,
    config: PlaybackConfig,
    tokenLengthsByTurn: Record<string, number>
  ): { includedTurnIds: string[] } {
    const i = timeline.findIndex(t => t.turnId === currentTurnId);
    if (i === -1) {
      return { includedTurnIds: [] };
    }

    // Compute segment boundaries across the timeline: a new segment begins where similarityToPrev < threshold
    const segmentStarts: number[] = [0];
    for (let idx = 1; idx < timeline.length; idx++) {
      const sim = timeline[idx].similarityToPrev ?? 1;
      if (sim < config.similarityThreshold) segmentStarts.push(idx);
    }

    // Find the start of the segment that contains index i
    let blockStart = 0;
    for (let k = 0; k < segmentStarts.length; k++) {
      const s = segmentStarts[k];
      const next = k + 1 < segmentStarts.length ? segmentStarts[k + 1] : timeline.length;
      if (i >= s && i < next) {
        blockStart = s;
        break;
      }
    }

    // current coherent block: from blockStart..i
    let included: string[] = timeline.slice(blockStart, i + 1).map(t => t.turnId);

    // Backtrack into the immediate previous block conservatively: prefer only the most recent turn(s).
    // Only consider backtracking when the current turn's continuity is weak relative to the segment threshold.
    let tokens = included.reduce((s, id) => s + (tokenLengthsByTurn[id] || 0), 0);
    const currentSim = timeline[i].similarityToPrev ?? 1;
    if (currentSim < config.similarityThreshold && blockStart - 1 >= 0) {
      const j = blockStart - 1; // candidate is the last turn in the previous block
      const simToNext = timeline[j + 1].similarityToPrev ?? 0;
      const simToPrev = timeline[j].similarityToPrev ?? 0;
      if ((simToNext >= config.backtrackThreshold || simToPrev >= config.backtrackThreshold) && tokens + (tokenLengthsByTurn[timeline[j].turnId] || 0) <= config.hardTokenLimit) {
        included.unshift(timeline[j].turnId);
        tokens += tokenLengthsByTurn[timeline[j].turnId] || 0;
      }
    }

    // enforce hardTokenLimit; drop oldest until within limit
    while (included.length > 0 && included.reduce((s, id) => s + (tokenLengthsByTurn[id] || 0), 0) > config.hardTokenLimit) {
      included.shift();
    }

    return { includedTurnIds: included };
  }
}

export const srgPlaybackService = new SrgPlaybackService();

export default srgPlaybackService;
