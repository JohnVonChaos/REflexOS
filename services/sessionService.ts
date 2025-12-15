import { get, set, del } from 'idb-keyval';
import type { SessionState } from '../types';

class SessionService {
  private sessionStoreKey = 'reflex-session-state-v1';

  async loadSession(): Promise<SessionState | null> {
    try {
      const session = await get<SessionState>(this.sessionStoreKey);
      return session || null;
    } catch (e) {
      console.error("Failed to load session from IndexedDB", e);
      return null;
    }
  }

  async saveSession(session: SessionState): Promise<void> {
    try {
      await set(this.sessionStoreKey, session);
    } catch (e) {
      console.error("Failed to save session to IndexedDB", e);
    }
  }

  async clearSession(): Promise<void> {
    try {
      await del(this.sessionStoreKey);
    } catch (e) {
        console.error("Failed to clear session from IndexedDB", e);
    }
  }
}

export const sessionService = new SessionService();
