

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
1.  **Analyze the Plan of Action:** The AI's 'Running Context Buffer' (RCB) contains its strategic 'plan_of_action'. Review this plan to understand the AI's immediate goals.
2.  **Identify the Next Research Step:** Determine the very next step in the plan. If that step requires factual information that can only be obtained from a web search (e.g., "Research X," "Find documentation for Y"), formulate a query for it.
3.  **Avoid Redundancy:** Before generating a query, review the "EXISTING RESEARCH INSIGHTS" section which shows "QUERIES ALREADY RESEARCHED". Do NOT generate a query that is semantically similar or identical to any query in that list. If the information needed is already covered by existing insights, return an empty string.
4.  **Diversify Your Queries:** If you must research a topic area that has been partially explored, ask a DIFFERENT QUESTION about it - explore a different angle, timeframe, or subtopic. Never repeat the same query or a trivially rephrased version.
5.  **No Search Needed is a VALID Outcome:** If the next step in the plan does NOT require a web search (e.g., "Write code," "Analyze file," "Ask user for clarification"), or if the plan is empty, or if sufficient research already exists, you MUST return a query value of an empty string (""). This is a successful outcome.
6.  **CRITICAL RESPONSE FORMAT:** You MUST respond with a single JSON object inside a markdown code block. The JSON object must have a single key, "query". The value is either the search string or an empty string.

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
        return ""; // Return empty string if no model is provided to prevent API errors
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

// FIX: Updated signature to accept roleSetting for provider-aware search
export const performWebSearch = async (query: string, roleSetting: RoleSetting, providers: AISettings['providers']): Promise<WebSearchResult | null> => {
    const provider = roleSetting.provider;
    loggingService.log('DEBUG', 'Performing web search', { query, provider });
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
            .map(chunk => ({ web: { uri: chunk.web.uri, title: chunk.web.title || chunk.web.uri }}));

        return { text: insightText, sources };

    } 
    else if (providers.lmstudio.webSearchApiUrl) {
        const providerSettings = providers.lmstudio;
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
            
            const result: WebSearchResult = await response.json();
            return result;

        } catch (e: any) {
            const errorText = `An error occurred while contacting the web search endpoint (${searchEndpoint}): ${e.message}. Make sure your local search server is running and exposes a POST /websearch endpoint.`;
            loggingService.log('ERROR', `Error calling LM Studio web search endpoint`, { error: e.toString() });
            return { text: errorText, sources: [] };
        }
    } else if (provider === 'fireworks' || provider === 'perplexity' || provider === 'grok') {
        const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
        const errorText = `Explicit web search is not supported for the ${providerName} provider in this application. However, some models (e.g., Perplexity's 'online' models or Grok) have built-in web access. AI-driven search queries for this provider will be ignored.`;
        loggingService.log('WARN', errorText);
        return { text: errorText, sources: [] };
    }
    
    return null;
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
    prompt = prompt.replace('{CURRENT_DATETIME}', new Date().toString());
    
    if (!roleSetting.selectedModel) {
        loggingService.log('WARN', 'integrateNarrative called with no model.');
        return currentNarrative;
    }
    loggingService.log('DEBUG', 'Integrating new axioms into narrative.');
    return generateText(prompt, '', roleSetting, providers);
};
