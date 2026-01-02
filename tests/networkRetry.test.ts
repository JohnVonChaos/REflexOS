import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '../src/services/networkRetry';

function makeResponse(status: number, body = '', headers: Record<string,string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: {
      get: (k: string) => headers[k] ?? null
    },
    text: async () => body
  } as any;
}

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('retries on 500 and eventually succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(500, 'err'))
      .mockResolvedValueOnce(makeResponse(500, 'err'))
      .mockResolvedValueOnce(makeResponse(200, 'ok'));

    (globalThis as any).fetch = fetchMock;

    const p = fetchWithRetry('http://test', { method: 'POST' }, { maxRetries: 3, baseDelayMs: 10 });

    // advance timers to allow backoff sleeps to proceed
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20);
    const resp = await p;
    expect(resp.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('respects Retry-After header', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(429, 'rate', { 'Retry-After': '1' }))
      .mockResolvedValueOnce(makeResponse(200, 'ok'));

    (globalThis as any).fetch = fetchMock;

    const p = fetchWithRetry('http://test', { method: 'POST' }, { maxRetries: 2, baseDelayMs: 10 });
    // Retry-After = 1 second -> 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    const resp = await p;
    expect(resp.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
