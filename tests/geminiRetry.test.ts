import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateText } from '../src/services/geminiService';

function makeJsonResponse(status: number, jsonBody: any, headers: Record<string,string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody)
  } as any;
}

describe('geminiService generateText retries', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('retries on 500 and returns text', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeJsonResponse(500, { error: 'fail' }))
      .mockResolvedValueOnce(makeJsonResponse(200, { choices: [{ message: { content: 'ok' } }] }));

    (globalThis as any).fetch = fetchMock;

    const roleSetting = { selectedModel: 'm', provider: 'openai' } as any;
    const providers = { openai: { baseUrl: 'http://fake' } } as any;

    const p = generateText('hi', '', roleSetting, providers);
    await vi.advanceTimersByTimeAsync(200);
    const text = await p;
    expect(text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
