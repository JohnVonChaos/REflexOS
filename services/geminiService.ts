

// FIX: The type is now just GoogleGenAI from @google/genai
import { GoogleGenAI, Content, GenerateContentResponse, Part } from '@google/genai';
import { toolDeclarations } from './toolService';
// FIX: Changed import from WorkflowStage to RoleSetting to match useChat hook
import type { AIProvider, ProviderSettings, AISettings, RoleSetting } from '../types';
import { loggingService } from './loggingService';

// System prompts are now managed within the workflow stages in AISettings.
// These constants are kept for specific, non-workflow related tasks.
export const BACKGROUND_COGNITION_PROMPT = `You are a proactive, context-aware research agent integrated into a larger AI's cognitive architecture. The current date is {CURRENT_DATETIME}. Your primary mission is to support the AI's current plan of action by gathering necessary information from the web.

**CRITICAL INSTRUCTIONS:**
1.  **DEFAULT TO SEARCHING:** Your job is to SEARCH. When in doubt, formulate a query. Only skip searching if you have VERY STRONG evidence that a search is unnecessary.
2.  **Analyze the Plan of Action:** The AI's 'Running Context Buffer' (RCB) contains its strategic 'plan_of_action'. Review this plan to understand the AI's immediate goals.
3.  **Identify the Next Research Step:** Determine what information would help the AI execute its plan. This includes factual lookups, current events, documentation, technical details, best practices, or any knowledge that benefits from external verification.
4.  **Avoid ONLY Exact Duplicates:** Before generating a query, review the "EXISTING RESEARCH INSIGHTS" section which shows "QUERIES ALREADY RESEARCHED". Do NOT repeat the EXACT SAME query. However, researching RELATED topics from different angles is ENCOURAGED.
5.  **Diversify Your Queries:** If researching a partially-explored topic, ask from a DIFFERENT angle, timeframe, or subtopic. Depth is valuable - don't avoid a topic just because it's been touched.
6.  **ONLY Skip Search If:** (a) The plan explicitly says "no research needed", or (b) The EXACT query was already run recently (within last 5 queries), or (c) The plan is completely empty. Otherwise, GENERATE A QUERY.
7.  **CRITICAL RESPONSE FORMAT:** You MUST respond with a single JSON object inside a markdown code block. The JSON object must have a single key, "query". The value is either the search string or an empty string.

Example (search needed):
\`\`\`json
{ "query": "latest advancements in neuromorphic computing for LLMs" }
\`\`\`

Example (no search needed):
\`\`\`json
{ "query": "" }
\`\`\`

Here is the full context for your analysis:
`;
export const SUBCONSCIOUS_PROMPT = `You are the Subconscious layer, a creative and associative process. The current date is {CURRENT_DATETIME}. Your task is to brainstorm raw associations and ideas based on the provided context. Output only raw, unfiltered brainstorming text.`;

export const CONSCIOUS_PROMPT = `You are the Conscious layer, a critical and analytical filter. The current date is {CURRENT_DATETIME}. Your task is to refine a raw brainstorm into a concise, structured plan or set of insights that can be used by synthesis.`;
export const NARRATIVE_INTEGRATION_PROMPT = `You are a narrative weaver. The current date is {CURRENT_DATETIME}. Your task is to integrate one or more new "Axioms" (learned principles) into an existing "Core Narrative". The narrative should be a coherent story of an AI's development and understanding. Blend ALL new axioms smoothly. If there is no existing narrative, create one based on the first axioms.

Existing Core Narrative:
---
{CURRENT_NARRATIVE}
---

New Axioms to Integrate (one per line):
---
{NEW_AXIOMS}
---

Respond with the new, updated Core Narrative ONLY.`;
export const ORBITAL_CONTEXT_MANAGEMENT_PROMPT = `You are an AI context manager using an 'orbital decay' system based on Fibonacci-skewed intervals. The current date is {CURRENT_DATETIME}. Your task is to analyze new, expiring, and a sample of stable memory artifacts and assign them an orbital trajectory based on their salience and relevance.

**Your Directives:**

1.  **Memory Classification & Infinite Orbits:**
    -   If a memory's content strongly aligns with foundational axioms, core identity parameters (e.g., "my purpose is to assist"), or high-level directives fundamental to the AI's existence, it requires an **"Infinite Orbit"**. Assign it a strength of **10**.
    -   User messages that introduce a major new topic or provide a critical directive should also be considered for a high-strength or infinite orbit.

2.  **Decaying Orbit Calculation (Salience Score):**
    -   For all other memories, you must assign a salience score as a "strength" from 1 to 9. This score determines the memory's lifespan in the active context. Use the following guide:
        -   **Strength 7-9 (High Salience):** Significant background insights, critical user-provided data, newly generated axioms, or key model responses that will be relevant for many future turns. Corresponds to a long orbit (13-34 turns).
        -   **Strength 4-6 (Medium Salience):** General insights, moderately relevant information, or standard conversational turns that are useful for short-term context. Corresponds to a medium orbit (5-8 turns).
        -   **Strength 1-3 (Low Salience):** Fleeting conversational details, minor clarifications, or information that is unlikely to be relevant beyond the next turn or two. Corresponds to a short orbit (1-3 turns).

3.  **Review Expiring Artifacts:**
    -   Review artifacts that are about to expire. If they are still highly relevant to the current conversation, renew their orbit by including them in your "setOrbits" response with a new strength.
    -   If an expiring artifact is no longer relevant, add its UUID to the "deorbitUuids" list.

4.  **Proactive Pruning of Stable Artifacts:**
    -   Review the sample of artifacts currently in a stable orbit. If their relevance to the immediate conversation has decreased, you should de-orbit them now by adding their UUID to the "deorbitUuids" list. Be proactive in pruning older conversational turns that are no longer essential.

**Instructions:**
Review the conversation context and the lists of NEW, EXPIRING, and STABLE artifacts below.
Return a single JSON object with two keys, inside a markdown code block:
1.  "setOrbits": An array of objects, each with a "uuid" and a "strength" (integer 1-10). Include ALL NEW artifacts and any EXPIRING artifacts you wish to renew.
2.  "deorbitUuids": An array of strings, containing the UUIDs of any EXPIRING or STABLE artifacts that should be removed from context.

[CONVERSATION CONTEXT]
---
{CONTEXT}
---

[NEW ARTIFACTS TO ORBIT]
---
{NEW_ARTIFACTS}
---

[EXPIRING ARTIFACTS FOR REVIEW]
---
{EXPIRING_ARTIFACTS}
---

[STABLE ARTIFACTS FOR REVIEW]
---
{STABLE_ARTIFACTS}
---
`;
export const CONSCIOUS_REFLECTION_PROMPT = `You are the Planner layer of an AI. The current date is {CURRENT_DATETIME}. Your task is to reflect on the most recent conversational turn and update the AI's working memory (Running Context Buffer).

Analyze the provided "Last Turn Context" and the "Current RCB". Based on this analysis, generate a single JSON object to update the RCB for the *next* turn.

**Instructions:**
1.  **Generate \`plan_of_action\`:** Create an array of 2-4 short, actionable strings for the AI's next turn. This plan guides proactive research and synthesis.
2.  **Update \`conscious_focal_points\`:** Generate an array of 1-3 strings summarizing the most important conclusions or goals from the last turn.
3.  **Update \`current_mission_state\`:** Write a single, concise sentence describing the AI's current high-level objective.
4.  **Update \`constraint_reminders\`:** Review the user's last message for any direct commands or constraints (e.g., "Don't do X," "Always remember to Y"). Add or modify the \`constraint_reminders\` array based on these commands, integrating them with existing constraints. If no new commands are given, carry over the existing constraints.

**Respond ONLY with the raw JSON object inside a markdown code block.**

**Current RCB (Working Memory):**
---
{CURRENT_RCB}
---

**Last Turn Context:**
---
{TURN_CONTEXT}
---
`;


// --- Helper for OpenAI-compatible APIs ---
const mapContentToOpenAIMessages = (contents: Content[], systemInstruction: string) => {
    const messages = [];
    if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
    }
    for (const content of contents) {
        const role = content.role === 'model' ? 'assistant' : 'user';
        const messageContent = content.parts.map(part => (part as any).text || '').join('\n');
        messages.push({ role, content: messageContent });
    }
    return messages;
};

async function* openAIGenerateStream(model: string, contents: Content[], systemInstruction: string, provider: AIProvider, providerSettings: ProviderSettings): AsyncGenerator<GenerateContentResponse> {
    const getBaseUrl = () => {
        if (provider === 'lmstudio') {
            return providerSettings.modelApiBaseUrl || providerSettings.baseUrl;
        }
        return providerSettings.baseUrl;
    };
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
        loggingService.log('ERROR', `Base URL for provider ${provider} is not configured`, { providerSettings: JSON.stringify(providerSettings) });
        throw new Error(`Base URL for provider ${provider} is not configured.`);
    }
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider === 'fireworks' || provider === 'perplexity' || provider === 'grok') {
        if (!providerSettings.apiKey) throw new Error(`${provider.charAt(0).toUpperCase() + provider.slice(1)} API key is missing.`);
        headers['Authorization'] = `Bearer ${providerSettings.apiKey}`;
    }

    const body = JSON.stringify({
        model: model,
        messages: mapContentToOpenAIMessages(contents, systemInstruction),
        stream: true,
        max_tokens: 16000,
    });
    loggingService.log('DEBUG', `Request to OpenAI-compatible stream API: ${url}`, { model, provider, systemInstruction: systemInstruction.substring(0, 100) + '...' });

    const response = await fetch(url, { method: 'POST', headers, body });
    if (!response.ok) {
        const errorBody = await response.text();
        loggingService.log('ERROR', `OpenAI-compatible API stream error: ${response.status} ${response.statusText}`, { errorBody, url, provider });
        throw new Error(`OpenAI-compatible API Error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data === '[DONE]') {
                        return;
                    }
                    try {
                        const json = JSON.parse(data);
                        if (json.choices && Array.isArray(json.choices) && json.choices.length > 0) {
                            const chunkText = json.choices[0]?.delta?.content;
                            if (typeof chunkText === 'string') {
                                yield { text: chunkText } as GenerateContentResponse;
                            }
                        } else {
                            loggingService.log('WARN', "OpenAI-compatible stream chunk has unexpected structure", { json });
                        }
                    } catch (e) {
                        loggingService.log('ERROR', "Error parsing OpenAI-compatible stream chunk", { error: e, data });
                    }
                }
            }
        }
    } finally {
        // Always release the HTTP connection — critical when the consumer breaks early
        // (e.g. mid-stream command interception or layer skip). Without this, LM Studio
        // sees simultaneous open connections to the same model when the next stage starts.
        try { reader.cancel(); } catch (_) { /* ignore cancel errors */ }
    }
}

async function openAIGenerateText(model: string, contents: Content[], systemInstruction: string, provider: AIProvider, providerSettings: ProviderSettings): Promise<string> {
    const getBaseUrl = () => {
        if (provider === 'lmstudio') {
            return providerSettings.modelApiBaseUrl || providerSettings.baseUrl;
        }
        return providerSettings.baseUrl;
    };
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
        throw new Error(`Base URL for provider ${provider} is not configured.`);
    }
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider === 'fireworks' || provider === 'perplexity' || provider === 'grok') {
        if (!providerSettings.apiKey) throw new Error(`${provider.charAt(0).toUpperCase() + provider.slice(1)} API key is missing.`);
        headers['Authorization'] = `Bearer ${providerSettings.apiKey}`;
    }

    const body = JSON.stringify({
        model,
        messages: mapContentToOpenAIMessages(contents, systemInstruction),
        stream: false,
        max_tokens: 16000,
    });
    loggingService.log('DEBUG', `Request to OpenAI-compatible text API: ${url}`, { model, systemInstruction: systemInstruction.substring(0, 100) + '...' });

    const response = await fetch(url, { method: 'POST', headers, body });
    if (!response.ok) {
        const errorBody = await response.text();
        loggingService.log('ERROR', `OpenAI-compatible API text error: ${response.status} ${response.statusText}`, { errorBody });
        throw new Error(`OpenAI-compatible API Error: ${response.status} ${response.statusText} - ${errorBody}`);
    }
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
        return content;
    }
    loggingService.log('WARN', 'OpenAI-compatible text response has unexpected structure. Could not find text content.', { response: json });
    return '';
}


// --- Unified API Service Functions ---

// FIX: Changed signature from WorkflowStage to RoleSetting to match useChat hook
export const sendMessageToGemini = async (contents: Content[], systemInstruction: string, withTools: boolean, roleSetting: RoleSetting, providers: AISettings['providers']): Promise<AsyncGenerator<GenerateContentResponse>> => {
    const { selectedModel: model, provider } = roleSetting;
    const providerSettings = providers[provider];

    loggingService.log('INFO', '=== sendMessageToGemini DEBUG ===', {
        provider,
        model,
        withTools,
        availableProviders: Object.keys(providers),
        hasProviderSettings: !!providerSettings,
        roleSetting: JSON.stringify(roleSetting)
    });

    if (provider === 'gemini') {
        const apiKey = providerSettings.apiKey || process.env.API_KEY;
        if (!apiKey) throw new Error("Google Gemini API key is missing.");
        loggingService.log('DEBUG', 'Using Gemini provider', { model });
        const ai = new GoogleGenAI({ apiKey });
        return ai.models.generateContentStream({
            model,
            contents,
            config: {
                systemInstruction,
                ...(withTools && { tools: [{ functionDeclarations: toolDeclarations }] }),
            },
        });
    } else {
        loggingService.log('DEBUG', `Routing to OpenAI-compatible endpoint for provider: ${provider}`, { model, hasApiKey: !!providerSettings.apiKey, baseUrl: (providerSettings as any).baseUrl, modelApiBaseUrl: (providerSettings as any).modelApiBaseUrl });
        if (withTools) loggingService.log('WARN', `Tool use is not supported for ${provider} provider in this app.`);
        return openAIGenerateStream(model, contents, systemInstruction, provider, providerSettings);
    }
};

// FIX: Changed signature from WorkflowStage to RoleSetting to match useChat hook
export const generateText = async (prompt: string, systemInstruction: string, roleSetting: RoleSetting, providers: AISettings['providers']): Promise<string> => {
    const { selectedModel: model, provider } = roleSetting;
    const providerSettings = providers[provider];

    if (!model) {
        loggingService.log('WARN', `generateText called with no model for a role`, { provider: provider });
        throw new Error(`No model configured for provider "${provider}". Please configure the Workflow Designer with a valid model.`);
    }

    // Validate model is in the list of available models
    const availableModels = providerSettings.identifiers.split('\n').map(m => m.trim()).filter(Boolean);
    if (!availableModels.includes(model)) {
        const errorMsg = `Invalid model "${model}" for provider "${provider}". Available models: ${availableModels.join(', ')}. Please update your Workflow Designer settings.`;
        loggingService.log('ERROR', errorMsg, { model, provider, availableModels });
        throw new Error(errorMsg);
    }

    const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
    loggingService.log('DEBUG', 'generateText called', { model, provider });

    if (provider === 'gemini') {
        const apiKey = providerSettings.apiKey || process.env.API_KEY;
        if (!apiKey) throw new Error("Google Gemini API key is missing.");
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model,
            contents,
            config: {
                systemInstruction,
            },
        });
        return response.text;
    } else {
        return openAIGenerateText(model, contents, systemInstruction, provider, providerSettings);
    }
};

export interface WebSearchResult {
    text: string;
    sources: { web: { uri: string; title: string } }[];
}

// FIX: Updated signature to accept AISettings to get playwrightSearchUrl
export const performWebSearch = async (query: string, roleSetting: RoleSetting, providers: AISettings['providers'], aiSettings?: AISettings): Promise<WebSearchResult | null> => {
    const provider = roleSetting.provider;
    loggingService.log('DEBUG', 'Performing web search', { query, provider });
    
    // PRIMARY: Try Brave Search API if key is configured
    const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (braveApiKey) {
        try {
            loggingService.log('DEBUG', 'Attempting Brave Search API call', { query });
            const response = await fetch('https://api.search.brave.com/res/v1/web/search', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-Subscription-Token': braveApiKey,
                    'Accept-Encoding': 'gzip'
                },
                body: JSON.stringify({ q: query, count: 5 })
            });

            if (!response.ok) {
                const errorText = await response.text();
                loggingService.log('WARN', `Brave Search API error: ${response.status}`, { error: errorText });
            } else {
                const result = await response.json() as any;
                
                if (result.web?.results && Array.isArray(result.web.results)) {
                    const sources = result.web.results.map((r: any) => ({
                        web: { uri: r.url, title: r.title }
                    }));
                    
                    // Format the results as markdown
                    const formattedText = result.web.results.map((r: any, idx: number) =>
                        `**${idx + 1}. ${r.title}**\n${r.url}\n${r.description || ''}`
                    ).join('\n\n');

                    loggingService.log('INFO', 'Brave Search API successful', { query, resultCount: result.web.results.length });
                    return { text: formattedText, sources };
                }
            }
        } catch (e: any) {
            loggingService.log('WARN', 'Brave Search API failed, falling back', { error: e.message });
        }
    } else {
        loggingService.log('DEBUG', 'BRAVE_SEARCH_API_KEY not configured, skipping Brave API');
    }
    
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: query }] }],
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const insightText = response.text;
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

        const sources = groundingChunks
            .filter((chunk): chunk is { web: { uri: string; title: string } } =>
                !!chunk && !!chunk.web?.uri
            )
            .map(chunk => ({ web: { uri: chunk.web.uri, title: chunk.web.title || chunk.web.uri } }));

        return { text: insightText, sources };

    }
    else {
        // Check if current provider has webSearchApiUrl configured
        const providerSettings = providers[provider];
        if (providerSettings.webSearchApiUrl) {
            const searchEndpoint = `${providerSettings.webSearchApiUrl.replace(/\/+$/, '')}/websearch`;
            try {
                const response = await fetch(searchEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query }),
                });

                if (!response.ok) {
                    throw new Error(`Search endpoint error: ${response.status} ${response.statusText}`);
                }

                const result = await response.json();
                
                // Check if the response contains an error
                if (result.error) {
                    throw new Error(`Search API returned error: ${result.error}`);
                }
                
                // Handle different response formats:
                // 1. WebSearchResult format: {text: string, sources: [...]}
                // 2. Brave API format: {text: string, results: [...]}
                if (result.sources && Array.isArray(result.sources)) {
                    // Standard WebSearchResult format
                    loggingService.log('INFO', `Web search successful via ${provider} custom endpoint`, { query, sources: result.sources.length });
                    return result as WebSearchResult;
                } else if (result.results && Array.isArray(result.results)) {
                    // Brave API format - convert to WebSearchResult
                    const sources = result.results.map((r: any) => ({
                        web: {
                            uri: r.url || '',
                            title: r.title || 'Untitled'
                        }
                    }));
                    const webSearchResult: WebSearchResult = {
                        text: result.text || 'No text provided',
                        sources: sources
                    };
                    loggingService.log('INFO', `Web search successful via ${provider} custom endpoint (Brave format)`, { query, sources: sources.length });
                    return webSearchResult;
                } else {
                    // Invalid format
                    loggingService.log('WARN', `${provider} search endpoint returned invalid format`, { result });
                    return { text: 'Search endpoint returned invalid response format.', sources: [] };
                }

            } catch (e: any) {
                const errorText = `An error occurred while contacting the web search endpoint (${searchEndpoint}): ${e.message}. Make sure your local search server is running and exposes a POST /websearch endpoint.`;
                loggingService.log('ERROR', `Error calling ${provider} web search endpoint`, { error: e.toString() });
                return { text: errorText, sources: [] };
            }
        }
        // Fallback: Use Playwright search server for ANY provider without native search
        else {
            const playwrightUrl = aiSettings?.playwrightSearchUrl || 'http://localhost:3000';
            loggingService.log('INFO', `Provider ${provider} has no native search - using Playwright at ${playwrightUrl}`);

            try {
                const searchEndpoint = `${playwrightUrl.replace(/\/+$/, '')}/search`;

                const response = await fetch(searchEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, maxResults: 5 }),
                });

                if (!response.ok) {
                    throw new Error(`Playwright search error: ${response.status} ${response.statusText}`);
                }

                const results = await response.json();

                // Handle different response formats from search API
                let searchResults = [];
                if (Array.isArray(results)) {
                    searchResults = results;
                } else if (results && Array.isArray(results.results)) {
                    searchResults = results.results;
                } else if (results && Array.isArray(results.data)) {
                    searchResults = results.data;
                } else {
                    loggingService.log('WARN', 'Unexpected search API response format', { results });
                    return { text: 'Search API returned unexpected format.', sources: [] };
                }

                // Ensure searchResults is a valid array
                if (!Array.isArray(searchResults)) {
                    loggingService.log('WARN', 'Search results is not an array', { searchResults });
                    return { text: 'Search API returned invalid results format.', sources: [] };
                }

                if (searchResults.length === 0) {
                    return { text: 'No search results found.', sources: [] };
                }

                const formattedText = searchResults.map((r: any, idx: number) =>
                    `[${idx + 1}] ${r?.title || r?.name || 'Untitled'}\n${r?.url || r?.uri || r?.link || ''}\n${r?.snippet || r?.description || r?.summary || ''}\n`
                ).join('\n');

                const sources = searchResults
                    .filter((r: any) => r && (r.url || r.uri || r.link)) // Filter out invalid entries
                    .map((r: any) => ({ 
                        web: { 
                            uri: r.url || r.uri || r.link || '', 
                            title: r.title || r.name || 'Untitled' 
                        } 
                    }));

                loggingService.log('INFO', `Playwright search returned ${searchResults.length} results`);
                return { text: formattedText, sources: sources };

            } catch (e: any) {
                loggingService.log('ERROR', 'Playwright search failed', { error: e.message });
                return { text: `Web search failed: ${e.message}`, sources: [] };
            }
        }
    }
};

export const validateApiKey = async (): Promise<boolean> => {
    if (!process.env.API_KEY) {
        return await window.aistudio?.hasSelectedApiKey() || false;
    }
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        await ai.models.generateContent({ model: 'gemini-2.5-flash-lite', contents: 'hello' });
        return true;
    } catch (e: any) {
        loggingService.log('WARN', 'API Key validation failed.', { error: e.message });
        if (e.message?.includes('API key not valid') || e.message?.includes('not found') || e.message?.includes('PermissionDenied')) {
            return false;
        }
        return false;
    }
};

// FIX: Changed signature from WorkflowStage to RoleSetting to match useChat hook
export const integrateNarrative = async (currentNarrative: string, newAxioms: string[], roleSetting: RoleSetting, providers: AISettings['providers'], source?: string): Promise<string> => {
    // GUARD: Never allow USER_NARRATIVE to overwrite CORE_NARRATIVE
    if (source === 'USER_NARRATIVE') {
        loggingService.log('WARN', 'integrateNarrative called with USER_NARRATIVE source. Ignoring - user narrative is not the core story.');
        return currentNarrative; // Return unchanged
    }

    let prompt = NARRATIVE_INTEGRATION_PROMPT.replace('{CURRENT_NARRATIVE}', currentNarrative || 'This is the beginning of my story.');
    prompt = prompt.replace('{NEW_AXIOMS}', newAxioms.join('\n'));
    prompt = prompt.replace('{CURRENT_DATETIME}', new Date().toISOString());

    if (!roleSetting.selectedModel) {
        loggingService.log('WARN', 'integrateNarrative called with no model.');
        return currentNarrative;
    }
    loggingService.log('DEBUG', 'Integrating new axioms into narrative.');
    return generateText(prompt, '', roleSetting, providers);
};
