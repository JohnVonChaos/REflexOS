/**
 * Brave API Test Service
 * Allows on-demand testing of Brave API configuration
 */

export interface BraveTestResult {
  success: boolean;
  message: string;
  statusCode?: number;
  resultsCount?: number;
  error?: string;
}

/**
 * Test the Brave API configuration.
 * Routes through the local browserServer proxy (port 3005) so the browser
 * never touches api.search.brave.com directly (which is CORS-blocked).
 */
export async function testBraveAPI(
  apiKey: string,
  apiUrl: string,
  testQuery: string = 'test'
): Promise<BraveTestResult> {
  const trimmedKey = (apiKey || '').trim();
  const trimmedUrl = (apiUrl || '').trim();

  if (!trimmedKey) {
    return { success: false, message: 'Brave API key is not configured', error: 'NO_KEY' };
  }

  if (!trimmedUrl) {
    return { success: false, message: 'Brave API URL is not configured', error: 'NO_URL' };
  }

  const proxyUrl = 'http://localhost:3005/brave-search';

  try {
    console.log('[Brave Test] Calling proxy at:', proxyUrl, '| query:', testQuery);

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: trimmedKey, apiUrl: trimmedUrl, query: testQuery }),
      signal: AbortSignal.timeout(20000),
    });

    console.log('[Brave Test] Proxy response status:', response.status);

    const data = await response.json();

    if (!response.ok) {
      console.error('[Brave Test] Proxy error:', data);
      return {
        success: false,
        message: data?.message || `Proxy returned ${response.status}`,
        statusCode: response.status,
        error: data?.error || `HTTP_${response.status}`,
      };
    }

    console.log('[Brave Test] Success:', data.message);
    return {
      success: true,
      message: data.message || `Brave API OK — ${data.resultsCount ?? '?'} result(s)`,
      statusCode: 200,
      resultsCount: data.resultsCount,
    };
  } catch (error: any) {
    console.error('[Brave Test] Fetch error:', error);
    const isTimeout = error.name === 'AbortError' || error.name === 'TimeoutError';
    return {
      success: false,
      message: isTimeout
        ? 'Timed out waiting for proxy. Is the browser server running? (npm run server)'
        : `Could not reach proxy at ${proxyUrl}. Is the browser server running? (npm run server)\nDetail: ${error.message}`,
      error: isTimeout ? 'TIMEOUT' : 'NETWORK',
    };
  }
}

/**
 * Test LM Studio connectivity
 */
export async function testLMStudio(baseUrl: string): Promise<BraveTestResult> {
  if (!baseUrl) {
    return {
      success: false,
      message: 'LM Studio base URL is not configured',
      error: 'NO_URL',
    };
  }

  try {
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${cleanUrl}/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `LM Studio returned ${response.status}. Is it running?`,
        statusCode: response.status,
        error: `HTTP_${response.status}`,
      };
    }

    const data = await response.json();

    console.log('[LMStudio Test] Raw response:', data);

    let models: any[] = [];
    if (Array.isArray(data)) {
      models = data;
    } else if (Array.isArray(data?.models)) {
      models = data.models;
    } else if (Array.isArray(data?.data)) {
      models = data.data;
    }

    // Count loaded instances when available. If loaded_instances is missing, fallback to model list length.
    const loadedInstancesCount = models.reduce((sum: number, model: any) => {
      if (Array.isArray(model?.loaded_instances)) {
        return sum + model.loaded_instances.length;
      }
      return sum;
    }, 0);

    const modelCountGuess = models.length;
    const modelCount = loadedInstancesCount > 0 ? loadedInstancesCount : modelCountGuess;

    console.log('[LMStudio Test] Model list count:', modelCountGuess, 'Loaded instances count:', loadedInstancesCount);

    return {
      success: true,
      message: `LM Studio is running with ${modelCount} model(s) loaded (${modelCountGuess} available).`,
      statusCode: 200,
    };
  } catch (error: any) {
    let message = 'Could not connect to LM Studio';
    let errorType = 'CONNECTION_FAILED';

    console.error('[LMStudio Test] Error:', error);

    if (error.name === 'AbortError') {
      message = 'LM Studio connection timeout';
      errorType = 'TIMEOUT';
    } else if (error instanceof TypeError) {
      message = 'Network error. Check if LM Studio is running at the specified URL.';
      errorType = 'NETWORK';
    }

    return {
      success: false,
      message: message,
      error: errorType,
    };
  }
}
