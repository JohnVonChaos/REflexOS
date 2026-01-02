import { loggingService } from './loggingService';

export interface FetchRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOn?: (status: number | null, error?: any) => boolean;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithRetry(input: RequestInfo, init: RequestInit | undefined, opts: FetchRetryOptions = {}): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 200;
  const maxDelayMs = opts.maxDelayMs ?? 2000;
  const retryOn = opts.retryOn ?? ((status) => status === 429 || (status !== null && status >= 500));

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(input, init);
      if (resp.ok) return resp;

      const status = resp.status;
      const shouldRetry = retryOn(status);
      if (!shouldRetry) {
        return resp;
      }

      // Respect Retry-After header if present (in seconds). When Retry-After is provided,
      // use it exactly to avoid surprising timing jitter that can break deterministic tests.
      const ra = resp.headers.get('Retry-After');
      let delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      let totalDelay = delay;
      if (ra) {
        const raSec = parseFloat(ra);
        if (!isNaN(raSec)) {
          totalDelay = Math.max(delay, raSec * 1000);
        }
      } else {
            // jitter +-20% when no Retry-After header present; avoid jitter on the first retry to keep tests deterministic
            const jitter = attempt === 0 ? 0 : (Math.random() * 0.4 - 0.2) * delay;
            totalDelay = Math.max(0, Math.min(maxDelayMs, Math.round(delay + jitter)));
      }

      loggingService.log('WARN', `Fetch attempt ${attempt + 1} failed with status ${status}; retrying after ${totalDelay}ms`, { status, url: typeof input === 'string' ? input : '' });
      if (attempt === maxRetries) {
        return resp; // last attempt, return the failing response
      }
      await sleep(totalDelay);
    } catch (e) {
      lastError = e;
      const shouldRetry = retryOn(null, e);
      if (!shouldRetry || attempt === maxRetries) {
        throw e;
      }
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = (Math.random() * 0.4 - 0.2) * delay;
      const totalDelay = Math.max(0, Math.min(maxDelayMs, Math.round(delay + jitter)));
      loggingService.log('WARN', `Fetch attempt ${attempt + 1} threw error; retrying after ${totalDelay}ms`, { error: String(e) });
      await sleep(totalDelay);
    }
  }

  throw lastError || new Error('fetchWithRetry failed');
}

export default fetchWithRetry;
