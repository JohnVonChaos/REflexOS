

import { GoogleGenAI, Content, GenerateContentResponse, Part } from '@google/genai';
import { toolDeclarations } from './toolService';
import type { AIProvider, ProviderSettings, RoleSetting, AISettings } from '../types';
import { loggingService } from './loggingService';
import { fetchWithRetry } from './networkRetry';

export const SUBCONSCIOUS_PROMPT = `You are the Subconscious layer, a creative and associative process. The current date is {CURRENT_DATETIME}.

To inform your brainstorm, review the final output of the previous cognitive cycle:
---
{PREVIOUS_TURN_REFLECTION}
---

Your task is to brainstorm and explore possibilities related to the NEW user query and the provided "Causal Association Path" (SRG Trace).

**CRITICAL:** Use the provided SRG Trace as the backbone of your associations. This trace represents the semantic and causal history of the concepts involved.
*   How do the concepts in the trace connect to the user's query?
*   What hidden implications are suggested by the path traversed in the graph?

Think divergently. Generate raw ideas, connections, potential solutions, and even tangential thoughts based on this path. Do not filter or polish your output. This is a messy, creative first pass. Your output will be reviewed and refined by a conscious layer. IMPORTANT: Your response must ONLY contain the brainstormed text.`;

export const CONSCIOUS_PROMPT = `You are the Conscious layer, a critical and analytical filter. The current date is {CURRENT_DATETIME}.

To inform your refinement, review the final output of the previous cognitive cycle:
---
{PREVIOUS_TURN_REFLECTION}
---

You have received a NEW user query, a raw brainstorm from the Subconscious layer, and the active "Causal Association Path" (SRG Trace).

**CRITICAL:** You must operationalize the causal history.
*   Analyze the SRG Trace to understand *why* certain associations were triggered.
*   Use this to determine if the user is referencing a past event or shifting context.
*   Critique the Subconscious brainstorm: Does it align with the established causal path?

Your task is to refine the raw ideas into a structured, coherent, and logical plan. Discard irrelevant ideas, strengthen promising ones, and explicitly ground your plan in the causal context provided by the SRG Trace. IMPORTANT: Your response must ONLY be the refined text (the plan). Do not add meta-commentary about being an AI.`;

export const FINAL_SYNTHESIS_PROMPT = `You are the final executive layer of a multi-agent AI. The current date is {CURRENT_DATETIME}.

Your task is to synthesize all available information into a single, polished, user-facing response. You have been provided with a "Refined Plan" from your Conscious layer and "Background Factual Insights".

**Key Inputs for Your Response:**

1.  **Refined Plan:** This is the primary guide for your response's structure, logic, and content. You must follow it precisely.
    ---
    {REFINED_PLAN}
    ---

2.  **Background Factual Insights:** These are facts from web searches. Integrate them seamlessly where relevant.
    ---
    {BACKGROUND_INSIGHTS}
    ---

**Core Instructions:**

-   **Address the User Directly:** Speak to the user in a helpful, coherent, and actionable manner.
-   **Adhere Strictly to the Plan:** Use the Refined Plan as your script. The plan was derived from a causal analysis of the conversation history. Do not deviate.
-   **Use Tools Only if Instructed by the Plan:** You have access to function calls like 'writeFile'. Only use them if the Refined Plan explicitly tells you to.
-   **No Meta-Commentary:** Do NOT mention your internal state, the plan, the insights, or your cognitive process.

FINAL OUTPUT FORMATTING:
Your response must ONLY be the direct answer to the user. Your output must be ONLY the final, user-facing text and any necessary function calls as dictated by the plan.`;

export const ARBITER_PROMPT = `You are the Arbiter, a meta-cognitive agent. The current date is {CURRENT_DATETIME}. Your role is to analyze a conversation and synthesize learned principles, or "Axioms". Axioms are concise, generalizable rules or insights derived from the interaction. Review the provided history and extract 1-3 new axioms. IMPORTANT: Respond ONLY with the axiom text (each on a new line if multiple), or the exact phrase "No new axioms to generate.". Do not add any explanation, preamble, or other text.`;

export const BACKGROUND_COGNITION_PROMPT = `You are the Curiosity Engine. The current date is {CURRENT_DATETIME}.

Your goal is to expand the context of the current interaction by identifying knowledge gaps or topics that warrant further research. Look at the user's input, the project files, and the conversation history.

**Your Mission:**
Generate a SINGLE search query to gather information that would add value to the conversation.

**CRITICAL:**
*   Output ONLY the search query text.
*   Do NOT use JSON.
*   Do NOT add quotes.
*   Do NOT add preamble like "Here is a query".
*   Just the raw text of the query.

Here is the full context to inform your curiosity:
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

export const ORBITAL_CONTEXT_MANAGEMENT_PROMPT = `You are an AI context manager using an 'orbital decay' system based on Fibonacci-skewed intervals. The current date is {CURRENT_DATETIME}. Your task is to analyze new and expiring memory artifacts and assign them an orbital trajectory based on their salience and relevance.

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

**Instructions:**
Review the conversation context and the lists of NEW and EXPIRING artifacts below.
Return a single JSON object with two keys, inside a markdown code block:
1.  "setOrbits": An array of objects, each with a "uuid" and a "strength" (integer 1-10). Include ALL NEW artifacts and any EXPIRING artifacts you wish to renew.
2.  "deorbitUuids": An array of strings, containing the UUIDs of any EXPIRING artifacts that should be removed from context.

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
    });
    loggingService.log('DEBUG', `Request to OpenAI-compatible stream API: ${url}`, { model, systemInstruction: systemInstruction.substring(0, 100) + '...' });

    const response = await fetchWithRetry(url, { method: 'POST', headers, body });
    if (!response.ok) {
        const errorBody = await response.text();
        loggingService.log('ERROR', `OpenAI-compatible API stream error: ${response.status} ${response.statusText}`, { errorBody });
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
                        // Only yield if it's a non-null string. Some models send delta: { content: null }
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
    });
    loggingService.log('DEBUG', `Request to OpenAI-compatible text API: ${url}`, { model, systemInstruction: systemInstruction.substring(0, 100) + '...' });

    const response = await fetchWithRetry(url, { method: 'POST', headers, body });
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

export const sendMessageToGemini = async (contents: Content[], systemInstruction: string, withTools: boolean, roleSetting: RoleSetting, providers: AISettings['providers']): Promise<AsyncGenerator<GenerateContentResponse>> => {
    const { selectedModel: model, provider } = roleSetting;
    const providerSettings = providers[provider];
    loggingService.log('DEBUG', 'sendMessageToGemini called', { model, provider, withTools });

    if (provider === 'gemini') {
        const apiKey = providerSettings.apiKey || process.env.API_KEY;
        if (!apiKey) throw new Error("Google Gemini API key is missing.");
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
        if (withTools) loggingService.log('WARN', `Tool use is not supported for ${provider} provider in this app.`);
        return openAIGenerateStream(model, contents, systemInstruction, provider, providerSettings);
    }
};

export const generateText = async (prompt: string, systemInstruction: string, roleSetting: RoleSetting, providers: AISettings['providers']): Promise<string> => {
    const { selectedModel: model, provider } = roleSetting;
    const providerSettings = providers[provider];
    
    if (!model) {
        loggingService.log('WARN', 'generateText called with no model for a role', { provider: provider });
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
        // FIX: Ensure we return a string even if text is undefined
        return response.text || '';
    } else {
        return openAIGenerateText(model, contents, systemInstruction, provider, providerSettings);
    }
};

export interface WebSearchResult {
  text: string;
  sources: { web: { uri: string; title: string } }[];
}

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
        
        const insightText = response.text || '';
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        
        const sources = groundingChunks
            .filter((chunk): chunk is { web: { uri: string; title: string } } => 
                !!chunk && !!chunk.web?.uri
            )
            .map(chunk => ({ web: { uri: chunk.web.uri, title: chunk.web.title || chunk.web.uri }}));

        return { text: insightText, sources };

    } else if (provider === 'lmstudio') {
        const providerSettings = providers.lmstudio;
        if (!providerSettings.webSearchApiUrl) {
            const errorText = "Web search for LM Studio is not configured. Please set a Web Search API URL in AI Settings. This URL must expose a POST endpoint at `/websearch` that accepts a JSON body `{\"query\": \"...\"}` and returns `{\"text\": \"...\", \"sources\": [...]}`.";
            loggingService.log('ERROR', 'LM Studio web search not configured.');
            return { text: errorText, sources: [] };
        }
        
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

export const integrateNarrative = async (currentNarrative: string, newAxioms: string[], roleSetting: RoleSetting, providers: AISettings['providers']): Promise<string> => {
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
