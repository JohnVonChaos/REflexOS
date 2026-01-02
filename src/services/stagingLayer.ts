import { StagingLayer, StagingChange, StagingCommit } from '../types';

// Minimal in-memory StagingLayer implementation for prototyping and tests.
export class InMemoryStagingLayer implements StagingLayer {
  private base: Map<string, string> = new Map();
  private overlay: Map<string, string | null> = new Map(); // null => deleted
  private commits: StagingCommit[] = [];

  constructor(initialFiles?: Record<string, string>) {
    if (initialFiles) {
      Object.entries(initialFiles).forEach(([p, c]) => this.base.set(p, c));
    }
  }

  listFiles(): string[] {
    const keys = new Set<string>();
    this.base.forEach((_, k) => keys.add(k));
    this.overlay.forEach((v, k) => {
      if (v === null) keys.delete(k);
      else keys.add(k);
    });
    return Array.from(keys).sort();
  }

  readFile(path: string): string | null {
    if (this.overlay.has(path)) {
      const v = this.overlay.get(path);
      return v === null ? null : v;
    }
    return this.base.get(path) ?? null;
  }

  writeFile(path: string, content: string): void {
    this.overlay.set(path, content);
  }

  deleteFile(path: string): void {
    if (this.overlay.has(path)) this.overlay.set(path, null);
    else if (this.base.has(path)) this.overlay.set(path, null);
    else this.overlay.set(path, null); // mark as deleted regardless
  }

  diff(): StagingChange[] {
    const changes: StagingChange[] = [];
    const paths = new Set<string>();
    this.base.forEach((_, k) => paths.add(k));
    this.overlay.forEach((_, k) => paths.add(k));

    paths.forEach((p) => {
      const baseVal = this.base.get(p) ?? null;
      const overlayHas = this.overlay.has(p);
      const overlayVal = overlayHas ? this.overlay.get(p) ?? null : undefined;

      if (overlayHas) {
        if (overlayVal === null) {
          // deleted
          changes.push({ path: p, type: 'deleted', before: baseVal, after: null });
        } else if (baseVal === null) {
          changes.push({ path: p, type: 'added', before: null, after: overlayVal });
        } else if (baseVal !== overlayVal) {
          changes.push({ path: p, type: 'modified', before: baseVal, after: overlayVal });
        }
      }
    });

    return changes;
  }

  commit(message?: string, author?: string): StagingCommit {
    const changes = this.diff();
    const commit: StagingCommit = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,
      timestamp: Date.now(),
      author,
      message,
      changes
    };

    // apply overlay
    this.overlay.forEach((v, k) => {
      if (v === null) this.base.delete(k);
      else this.base.set(k, v);
    });

    // clear overlay
    this.overlay.clear();
    this.commits.push(commit);
    return commit;
  }

  discard(): void {
    this.overlay.clear();
  }

  getCommits(): StagingCommit[] {
    return [...this.commits];
  }
}

export default InMemoryStagingLayer;
