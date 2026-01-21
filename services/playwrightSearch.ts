import { chromium, Browser, Page } from 'playwright';
import { loggingService } from './loggingService';

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
    if (!browser) {
        browser = await chromium.launch({ headless: true });
    }
    return browser;
}

export async function searchWeb(query: string, maxResults: number = 5): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    let page: Page | null = null;

    try {
        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();

        // Use DuckDuckGo (no rate limiting, no captchas)
        const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Extract search results
        const resultElements = await page.$$('.result');

        for (let i = 0; i < Math.min(resultElements.length, maxResults); i++) {
            const element = resultElements[i];

            try {
                const titleElement = await element.$('.result__a');
                const snippetElement = await element.$('.result__snippet');

                const title = titleElement ? await titleElement.textContent() : '';
                const url = titleElement ? await titleElement.getAttribute('href') : '';
                const snippet = snippetElement ? await snippetElement.textContent() : '';

                if (title && url) {
                    results.push({
                        title: title.trim(),
                        url: url.trim(),
                        snippet: snippet?.trim() || ''
                    });
                }
            } catch (e) {
                loggingService.log('WARN', 'Failed to extract search result', { error: e });
            }
        }

        loggingService.log('INFO', `Web search completed: ${results.length} results for "${query}"`);

    } catch (error: any) {
        loggingService.log('ERROR', 'Web search failed', { query, error: error.message });
    } finally {
        if (page) {
            await page.close();
        }
    }

    return results;
}

export async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
    }
}

// Format results for background cognition
export function formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
        return 'No search results found.';
    }

    return results.map((result, idx) => {
        return `[${idx + 1}] ${result.title}\n${result.url}\n${result.snippet}\n`;
    }).join('\n');
}
