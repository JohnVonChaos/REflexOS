import { describe, it, expect } from 'vitest';
import { calculateHash } from '../src/services/interferenceAnalyzer';

describe('interferenceAnalyzer.calculateHash fallback', () => {
  it('falls back to Node crypto when Web Crypto subtle is unavailable', async () => {
    const savedCrypto = (globalThis as any).crypto;
    try {
      // Simulate environment where crypto exists but subtle is undefined
      try {
        (globalThis as any).crypto = {};
      } catch (e) {
        // Some runtimes expose a read-only crypto getter; in that case define property
        Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
      }

      const h = await calculateHash('test data');
      expect(typeof h).toBe('string');
      expect(h.length).toBeGreaterThan(0);
    } finally {
      // Restore original crypto safely
      try {
        (globalThis as any).crypto = savedCrypto;
      } catch (e) {
        try {
          Object.defineProperty(globalThis, 'crypto', { value: savedCrypto, configurable: true });
        } catch (_err) {
          // swallow: best-effort restore in constrained envs
        }
      }
    }
  });
});
