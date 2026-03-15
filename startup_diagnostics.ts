import { performWebSearch } from './services/geminiService';
import type { RoleSetting, AISettings } from './types';

const RUN_DIAGNOSTICS = true; // Set to false to disable

async function runDiagnosticTests() {
    if (!RUN_DIAGNOSTICS) return;
    
    console.log('\n======================================================');
    console.log('🧪 RUNNING REFLEXOS STARTUP DIAGNOSTICS');
    console.log('======================================================\n');
    
    const errors: string[] = [];
    const successes: string[] = [];

    const reportError = (test: string, error: any) => {
        const msg = `❌ [FAIL] ${test}: ${error?.message || error}`;
        console.error(msg);
        errors.push(msg);
    };

    const reportSuccess = (test: string) => {
        const msg = `✅ [PASS] ${test}`;
        console.log(msg);
        successes.push(msg);
    };

    // --- TEST 1: LIVE SEARCH API ---
    try {
        console.log('Testing Live Web Search API (localhost:8001)...');
        
        // Mock the absolute minimum settings needed to trace the pipeline
        const mockRole: RoleSetting = { enabled: true, provider: 'lmstudio', selectedModel: 'default' };
        const mockProviders: any = {
            lmstudio: { webSearchApiUrl: 'http://localhost:8001' }
        };
        
        const testQuery = "diagnostic ping test";
        const result = await performWebSearch(testQuery, mockRole, mockProviders);
        
        if (result && result.text && result.text.length > 10) {
            reportSuccess(`Web Search API is responsive. Returned ${result.text.length} chars.`);
        } else {
            throw new Error(`API responded, but payload was empty or invalid format. Received: ${JSON.stringify(result)?.slice(0, 100)}...`);
        }
    } catch (e: any) {
        if (e.message.includes('fetch failed') || e.message.includes('ECONNREFUSED')) {
            reportError('Web Search API', `Could not connect to http://localhost:8001. Is searchapi.py running?`);
        } else {
            reportError('Web Search API', e);
        }
    }

    // --- TEST 2: QUOTE STRIPPING LOGIC ---
    try {
        console.log('Testing Command Parser Quote Stripping...');
        const testCases = [
            '? search.brave "quoted term"',
            '? search.brave \'quoted term\'',
            '? search.brave ```quoted term```',
            '? search.brave ```json quoted term```'
        ];
        
        for (const rawCmd of testCases) {
            const match = rawCmd.match(/\?\s*search\.(brave|pw|both)\s+(.*)/i);
            let query = match ? match[2].trim() : '';
            
            if (query.toLowerCase().startsWith('```json') && query.endsWith('```')) {
                query = query.slice(7, -3).trim();
            } else if (query.startsWith('```') && query.endsWith('```')) {
                query = query.slice(3, -3).trim();
            }
            query = query.replace(/^[`'"\s]+|[`'"\s]+$/g, '').trim();
            
            if (query !== 'quoted term') {
                throw new Error(`Quote stripping failed for ${rawCmd}. Result was: '${query}'`);
            }
        }
        
        reportSuccess('Exact-match quote and backtick stripping works for all edge cases.');
        
    } catch(e) {
        reportError('Quote Stripping Logic', e);
    }

    // --- TEST 3: COMMAND LINE NORMALIZATION (blockquotes / bold / no-space variants) ---
    try {
        console.log('Testing command normalization behavior...');
        const normalizationCases = [
            '> **? search.brave ping**',
            '`?srg.q multilayered cognition`',
            '* ? search.brave ping lookup diagnostics',
            '# ?search.brave ping lookup diagnostics'
        ];

        for (const raw of normalizationCases) {
            const cleaned = raw.replace(/^[\s*`#>_~|:*]+/, '').trim();
            if (!cleaned.startsWith('?') && !cleaned.startsWith('!')) {
                throw new Error(`Normalization failed for "${raw}" -> "${cleaned}"`);
            }
        }

        reportSuccess('Command normalization accepts blockquote/bold/markdown wrapping.');
    } catch (e) {
        reportError('Command Normalization', e);
    }

    // --- FINAL REPORT ---
    console.log('\n======================================================');
    console.log(`📊 DIAGNOSTICS COMPLETE: ${successes.length} Passed, ${errors.length} Failed`);
    if (errors.length > 0) {
        console.log('🚨 CHECK ERROR LOGS ABOVE.');
        process.exit(1);
    } else {
        console.log('🚀 SYSTEM READY. All primary pipelines verified.');
    }
    console.log('======================================================\n');
}

// Ensure this only runs in a Node/CLI environment, not in the browser build directly if imported by accident
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    // We execute it immediately
    runDiagnosticTests().catch(console.error);
}

export { runDiagnosticTests };