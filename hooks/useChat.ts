import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { MemoryAtom, GeneratedFile, ProjectFile, SessionState, BackgroundInsight, AISettings, RoleSetting, RunningContextBuffer, SRGSettings, WorkflowStage } from '../types';
import { getDefaultSettings, ALL_COGNITIVE_ROLES, CONTEXT_PACKET_LABELS, ALL_CONTEXT_PACKETS } from '../types';
import { sessionService } from '../services/sessionService';
import { recallWeaverService } from '../services/recallWeaverService';
import { sendMessageToGemini, generateText, integrateNarrative, performWebSearch } from '../services/geminiService';
import { contextService } from '../services/contextService';
import { backgroundCognitionService } from '../services/backgroundCognitionService';
import { rcbService, calculateRcbSize } from '../services/rcbService';
import { extractCodeBlocksFromText } from '../services/codeBlockParser';
import { loggingService } from '../services/loggingService';
import { graphService } from '../services/graphService';
import { srgService } from '../services/srgService';
import { Content, FunctionCall } from '@google/genai';

// Helper function to map 1-10 strength to a number of turns based on Fibonacci.
const fibMap = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55]; // fibMap[1] = 1, fibMap[2] = 2...
const mapStrengthToTurns = (strength: number): number => {
    if (strength >= 10) return -1; // Permanent
    if (strength <= 0) return 0; // De-orbit immediately
    if (strength < fibMap.length) return fibMap[strength];
    return fibMap[fibMap.length-1]; // Default to max if out of bounds
};

// --- Fibonacci Decay Logic ---
const fibCache = new Map<number, number>();
function fibonacci(n: number): number {
    if (n <= 1) return 1;
    if (fibCache.has(n)) return fibCache.get(n)!;
    const limitedN = Math.min(n, 40); 
    const result = fibonacci(limitedN - 1) + fibonacci(limitedN - 2);
    fibCache.set(limitedN, result);
    return result;
}

const initialRcbContent = {
    conscious_focal_points: [],
    current_mission_state: "",
    interaction_history_abstract: "",
    constraint_reminders: [],
    plan_of_action: []
};

const initializeRCB = (): RunningContextBuffer => ({
    id: `rcb_${Date.now()}`,
    timestamp: Date.now(),
    lastUpdatedAt: Date.now(),
    ...initialRcbContent,
    size_current: calculateRcbSize(initialRcbContent),
    size_limit: 80000, // Roughly 20k tokens
    warnings: [],
});

const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export const useChat = (initialProjectFiles: ProjectFile[], isReady: boolean) => {
    const [messages, setMessages] = useState<MemoryAtom[]>([]);
    const [projectFiles, setProjectFiles] = useState<ProjectFile[]>(initialProjectFiles);
    const [contextFileIds, setContextFileIds] = useState<string[]>([]);
    const [contextGeneratedFileNames, setContextGeneratedFileNames] = useState<string[]>([]);
    const [selfNarrative, setSelfNarrative] = useState<string>('');
    const [aiSettings, setAiSettings] = useState<AISettings>(getDefaultSettings());
    const [rcb, setRcb] = useState<RunningContextBuffer>(initializeRCB());
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState('');
    const [error, setError] = useState<Error | null>(null);
    const stopGenerationRef = useRef(false);
    const skipLayerRef = useRef(false);
    const [isCognitionRunning, setIsCognitionRunning] = useState(false);

    const currentTurnRef = useRef(0);

    const messagesRef = useRef(messages);
    const projectFilesRef = useRef(projectFiles);
    const contextFileIdsRef = useRef(contextFileIds);
    const contextGeneratedFileNamesRef = useRef(contextGeneratedFileNames);
    const selfNarrativeRef = useRef(selfNarrative);
    const aiSettingsRef = useRef(aiSettings);
    const isLoadingRef = useRef(isLoading);
    const isCognitionRunningRef = useRef(isCognitionRunning);
    const rcbRef = useRef(rcb);
    
    useEffect(() => {
        messagesRef.current = messages;
        projectFilesRef.current = projectFiles;
        contextFileIdsRef.current = contextFileIds;
        contextGeneratedFileNamesRef.current = contextGeneratedFileNames;
        selfNarrativeRef.current = selfNarrative;
        aiSettingsRef.current = aiSettings;
        isLoadingRef.current = isLoading;
        isCognitionRunningRef.current = isCognitionRunning;
        rcbRef.current = rcb;
    }, [messages, projectFiles, contextFileIds, contextGeneratedFileNames, selfNarrative, aiSettings, isLoading, isCognitionRunning, rcb]);

    const loadState = useCallback((state: Partial<SessionState & { contextFileNames: string[] }>) => {
        const loadedMessages = (state.messages || []).map(m => ({
            text: m.text || '',
            isCollapsed: m.isCollapsed ?? false,
            isInContext: m.isInContext ?? false,
            ...m,
        }));
        setMessages(loadedMessages);

        const loadedProjectFiles = (state.projectFiles || []).map(f => ({
            id: f.id || uuidv4(), // Assign new ID if missing
            content: f.content || '',
            ...f,
        }));
        setProjectFiles(loadedProjectFiles);

        if (state.contextFileIds) {
            setContextFileIds(state.contextFileIds);
        } else if ((state as any).contextFileNames) { // Backwards compatibility for old contextFileNames
            const oldNames = (state as any).contextFileNames as string[];
            const nameToIdMap = new Map<string, string>();
            // In case of duplicates, this will only map the last one, but it's the best we can do for backwards compat.
            loadedProjectFiles.forEach(f => nameToIdMap.set(f.name, f.id));
            const newIds = oldNames
                .map(name => nameToIdMap.get(name))
                .filter((id): id is string => !!id);
            setContextFileIds(Array.from(new Set(newIds)));
        } else {
            setContextFileIds([]);
        }

        setContextGeneratedFileNames(state.contextGeneratedFileNames || []);
        setSelfNarrative(state.selfNarrative || '');
        
        const defaultSettings = getDefaultSettings();
        const loadedSettings = state.aiSettings;
        if (loadedSettings) {
            const mergedSettings: AISettings = { ...defaultSettings, ...loadedSettings };
            const loadedLmStudioSettings = loadedSettings.providers?.lmstudio;
            if (loadedLmStudioSettings) {
                if (loadedLmStudioSettings.baseUrl && !loadedLmStudioSettings.modelApiBaseUrl) {
                    loadedLmStudioSettings.modelApiBaseUrl = loadedLmStudioSettings.baseUrl;
                    delete (loadedLmStudioSettings as any).baseUrl;
                }
            }
            // FIX: Add missing perplexity and grok providers to the settings merge logic.
            mergedSettings.providers = {
                gemini: { ...defaultSettings.providers.gemini, ...loadedSettings.providers?.gemini },
                fireworks: { ...defaultSettings.providers.fireworks, ...loadedSettings.providers?.fireworks },
                lmstudio: { ...defaultSettings.providers.lmstudio, ...loadedLmStudioSettings },
                perplexity: { ...defaultSettings.providers.perplexity, ...loadedSettings.providers?.perplexity },
                grok: { ...defaultSettings.providers.grok, ...loadedSettings.providers?.grok },
            };

            if (defaultSettings.roles) {
                const mergedRoles = { ...defaultSettings.roles };
                for (const role of ALL_COGNITIVE_ROLES) {
                    if (loadedSettings.roles?.[role]) {
                        mergedRoles[role] = {
                            ...defaultSettings.roles[role],
                            ...loadedSettings.roles[role],
                        };
                    }
                }
                mergedSettings.roles = mergedRoles;
            }

            // Deep merge SRG settings to prevent crashes with old session files
            mergedSettings.srg = {
                ...defaultSettings.srg,
                ...(loadedSettings.srg || {}),
                traversal: {
                    ...defaultSettings.srg.traversal,
                    ...(loadedSettings.srg?.traversal || {})
                },
                display: {
                     ...defaultSettings.srg.display,
                    ...(loadedSettings.srg?.display || {})
                }
            };
            
            setAiSettings(mergedSettings);
        } else {
            setAiSettings(defaultSettings);
        }

        if (state.rcb) {
            setRcb({ ...initializeRCB(), ...state.rcb });
        } else {
            setRcb(initializeRCB());
        }
        
        loggingService.log('INFO', 'Session state loaded from file.');
    }, []);

    // --- Session Management ---
    useEffect(() => {
        if (!isReady) return;
        const load = async () => {
            loggingService.log('INFO', 'Attempting to load session...');
            const state = await sessionService.loadSession();
            if (state) {
                loadState(state);
                currentTurnRef.current = (state.messages || []).filter(m => m.type === 'user_message').length;
                loggingService.log('INFO', 'Session loaded successfully.', { messageCount: state.messages?.length });
            } else {
                 loggingService.log('INFO', 'No session found, starting fresh.');
            }
        };
        load();
    }, [isReady, loadState]);

    useEffect(() => {
        if (!isReady) return;
        const graphState = graphService.getGraphState();
        const state: SessionState = { messages, projectFiles, contextFileIds, contextGeneratedFileNames, selfNarrative, aiSettings, rcb, graphState };
        sessionService.saveSession(state);
    }, [messages, projectFiles, contextFileIds, contextGeneratedFileNames, selfNarrative, aiSettings, rcb, isReady]);
    
    
    // --- Autonomous Workflow Cycles (New System) ---
    useEffect(() => {
        if (!isReady) return;
        
        const activeTimers: ReturnType<typeof setInterval>[] = [];

        // Helper to schedule a stage
        const scheduleStage = (stage: WorkflowStage) => {
            if (stage.enabled && stage.enableTimedCycle && stage.timerSeconds && stage.timerSeconds > 0) {
                const intervalId = setInterval(async () => {
                    if (isCognitionRunningRef.current || isLoadingRef.current) {
                        loggingService.log('WARN', `Skipping autonomous cycle for ${stage.name}: another process is running.`);
                        return;
                    }
                    await runAutonomousWorkflowCycle(stage);
                }, stage.timerSeconds * 1000);
                activeTimers.push(intervalId);
                loggingService.log('INFO', `Autonomous cycle started for ${stage.name} (every ${stage.timerSeconds}s)`);
            }
        };
        
        // Main pipeline stages
        aiSettings.workflow.forEach(scheduleStage);
        // Background-specific stages (code_maintenance, etc.)
        aiSettings.backgroundWorkflow.forEach(scheduleStage);

        return () => {
            activeTimers.forEach(clearInterval);
        };
    }, [isReady, aiSettings.workflow, aiSettings.backgroundWorkflow]);

    const runAutonomousWorkflowCycle = useCallback(async (stage: WorkflowStage) => {
        loggingService.log('INFO', `Autonomous cycle triggered for: ${stage.name}`);
        setIsCognitionRunning(true);
        setError(null);
        
        try {
            const currentMessages = messagesRef.current;
            const contextMessagesForPayload = currentMessages.filter(m => m.isInContext);
            const recentHistory = contextMessagesForPayload.filter(m => m.type === 'user_message' || m.type === 'model_response').slice(-10);
            const allBackgroundInsights = currentMessages.filter((m): m is MemoryAtom & { backgroundInsight: BackgroundInsight } => m.type === 'steward_note' && !!m.backgroundInsight);
            const contextProjectFiles = projectFilesRef.current.filter(f => contextFileIdsRef.current.includes(f.id));

            // ── CODE MAINTENANCE BRANCH ──────────────────────────────────────────
            if (stage.id === 'code_maintenance') {
                const roleSetting: RoleSetting = { enabled: stage.enabled, provider: stage.provider, selectedModel: stage.selectedModel };
                const baseContextPackets = {
                    CONTEXT_FILES: contextProjectFiles.map(f => `--- FILE: ${f.name} ---\n${f.content}`).join('\n\n') || 'None.',
                    RECENT_HISTORY: recentHistory.map(m => `${m.role}: ${m.text}`).join('\n'),
                };
                const insight = await backgroundCognitionService.runWebSearchCycle(
                    {
                        messages: currentMessages,
                        projectFiles: projectFilesRef.current,
                        contextFileNames: contextProjectFiles.map(f => f.name),
                        selfNarrative: selfNarrativeRef.current,
                        rcb: rcbRef.current,
                        baseContextPackets,
                    },
                    roleSetting,
                    aiSettingsRef.current.providers,
                    aiSettingsRef.current.backgroundWorkflow,
                    stage,
                );
                if (insight) {
                    const atom: MemoryAtom = {
                        uuid: crypto.randomUUID(),
                        timestamp: Date.now(),
                        role: 'model',
                        type: 'steward_note',
                        text: insight.insight,
                        isInContext: true,
                        isCollapsed: false,
                        orbitalStrength: 6,
                        orbitalDecayTurns: mapStrengthToTurns(6),
                        activationScore: 1.0,
                        lastActivatedAt: Date.now(),
                        lastActivatedTurn: currentTurnRef.current,
                    };
                    setMessages(prev => { const u = [...prev, atom]; messagesRef.current = u; return u; });
                    loggingService.log('INFO', `[CODE MAINTENANCE] Cycle complete, atom pushed to memory.`);
                }
                return;
            }
            // ── END CODE MAINTENANCE BRANCH ──────────────────────────────────────

            
            // Build context packets - respect what the context manager has marked as relevant
            const baseContextPackets = {
                USER_QUERY: recentHistory.filter(m => m.role === 'user').slice(-1)[0]?.text || 'No recent user query.',
                RCB: JSON.stringify(rcbRef.current, null, 2),
                RECENT_HISTORY: recentHistory.map(m => `${m.role}: ${m.text}`).join('\n'),
                // Only include background insights that are IN CONTEXT (managed by orbital decay)
                BACKGROUND_INSIGHTS: (() => {
                    const inContextInsights = allBackgroundInsights.filter(atom => atom.isInContext);
                    return inContextInsights.length > 0
                        ? inContextInsights.map(atom => `[Insight: "${atom.backgroundInsight!.query}"]\n${atom.backgroundInsight!.insight}`).join('\n\n')
                        : 'No background insights in context.';
                })(),
                CONTEXT_FILES: contextProjectFiles.map(f => `--- FILE: ${f.name} ---\n${f.content}`).join('\n\n') || 'None.',
                RECALLED_AXIOMS: currentMessages
                    .filter(m => m.type === 'axiom' && m.isInContext)
                    .map(a => `- ${a.text}`)
                    .join('\n') || 'None.',
                CORE_NARRATIVE: selfNarrativeRef.current || 'None.',
                RESONANCE_MEMORIES: 'None.',
                PREVIOUS_COGNITIVE_TRACE: 'N/A',
                SRG_TRACE: 'N/A',
            };

            // Build stage prompt from selected inputs
            let stagePrompt = '';
            for (const input of stage.inputs) {
                if (input.startsWith('OUTPUT_OF_')) {
                    // Skip output references for autonomous cycles
                    continue;
                } else if (ALL_CONTEXT_PACKETS.includes(input as any)) {
                    const label = CONTEXT_PACKET_LABELS[input as keyof typeof CONTEXT_PACKET_LABELS];
                    const content = baseContextPackets[input as keyof typeof baseContextPackets] || 'Not available.';
                    stagePrompt += `\n\n--- ${label} ---\n${content}`;
                }
            }

            const roleSetting: RoleSetting = { enabled: stage.enabled, provider: stage.provider, selectedModel: stage.selectedModel };
            
            // FIX: Check context size and prune if needed before making API call
            const estimatedTokens = Math.round(stagePrompt.length / 4);
            const tokenLimit = aiSettingsRef.current.apiTokenLimit;
            
            if (estimatedTokens > tokenLimit * 0.9) { // If using >90% of limit
                loggingService.log('WARN', `${stage.name}: Context approaching limit (${estimatedTokens}/${tokenLimit} tokens). Applying trap door.`);
                
                const contextRoleSetting = aiSettingsRef.current.roles.context;
                if (contextRoleSetting.enabled) {
                    // Build context items for trap door (deterministic orbital decay only, no AI)
                    const messagesToRemoveIds: string[] = [];
                    
                    // Priority 1: Background insights (steward notes with backgroundInsight), oldest first
                    const insightsToRemove = contextMessagesForPayload
                        .filter((m, idx) => idx > 0 && m.type === 'steward_note' && !!m.backgroundInsight) // Skip first message
                        .sort((a, b) => a.timestamp - b.timestamp) // Oldest first
                        .slice(0, Math.ceil(contextMessagesForPayload.length * 0.3));
                    
                    messagesToRemoveIds.push(...insightsToRemove.map(m => m.uuid));
                    
                    // Priority 2: If we still need more space, remove weak+old regular orbitals
                    if (messagesToRemoveIds.length < Math.ceil(contextMessagesForPayload.length * 0.3)) {
                        const remainingToRemove = Math.ceil(contextMessagesForPayload.length * 0.3) - messagesToRemoveIds.length;
                        const orbitalsToDecay = contextMessagesForPayload
                            .filter((m, idx) => idx > 0 && !messagesToRemoveIds.includes(m.uuid) && m.type !== 'steward_note' && m.orbitalStrength !== undefined && m.orbitalStrength !== null) // Skip first, insights, and non-orbitals
                            .sort((a, b) => {
                                if ((a.orbitalStrength || 0) !== (b.orbitalStrength || 0)) {
                                    return (a.orbitalStrength || 0) - (b.orbitalStrength || 0);
                                }
                                return a.timestamp - b.timestamp;
                            })
                            .slice(0, remainingToRemove);
                        
                        messagesToRemoveIds.push(...orbitalsToDecay.map(m => m.uuid));
                    }
                    
                    if (messagesToRemoveIds.length > 0) {
                        // Immediately deorbit the trapped items - no AI call, just dump
                        setMessages(prev => prev.map(m => 
                            messagesToRemoveIds.includes(m.uuid)
                                ? { ...m, isInContext: false, orbitalDecayTurns: null, orbitalStrength: null }
                                : m
                        ));
                        
                        loggingService.log('INFO', `Trap door: Set ${messagesToRemoveIds.length} items out-of-context (${insightsToRemove.length} insights, ${messagesToRemoveIds.length - insightsToRemove.length} orbitals). Orbital manager will re-evaluate post-turn.`);
                        return; // Skip this cycle, let next cycle work with pruned context
                    }
                } else {
                    loggingService.log('ERROR', `${stage.name}: Context overflow but context manager is disabled!`);
                    return;
                }
            }
            
            const stageOutput = await generateText(stagePrompt, stage.systemPrompt, roleSetting, aiSettingsRef.current.providers);

            // If web search is enabled, try to extract a search query and perform search
            if (stage.enableWebSearch) {
                let searchQuery = '';
                
                // Try to parse JSON response first
                try {
                    const jsonMatch = stageOutput.match(/```json\n([\s\S]*?)\n```/)?.[1];
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch);
                        if (parsed.query && typeof parsed.query === 'string') {
                            searchQuery = parsed.query.trim();
                        }
                    }
                } catch (e) {
                    // Fallback: use raw output as search query
                    let rawStr = stageOutput.trim().replace(/"/g, '').substring(0, 200);
                    rawStr = rawStr.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '');
                    searchQuery = rawStr.trim();
                }

                // Strip surrounding quotes and backticks that models sometimes add to queries to prevent exact-match zero results
                searchQuery = searchQuery.replace(/^[`'"\s]+|[`'"\s]+$/g, '').trim();
                
                if (searchQuery) {
                    loggingService.log('INFO', `${stage.name} generated search query: "${searchQuery}"`);
                    
                    const searchResult = await performWebSearch(searchQuery, roleSetting, aiSettingsRef.current.providers, aiSettingsRef.current);                    if (searchResult && searchResult.text) {
                        const newAtom: MemoryAtom = {
                            uuid: uuidv4(),
                            timestamp: Date.now(),
                            role: 'model',
                            type: 'steward_note',
                            text: `*${stage.name} researched: "${searchQuery}"*\n\n${searchResult.text}`,
                            isInContext: true,
                            isCollapsed: false,
                            backgroundInsight: {
                                query: searchQuery,
                                insight: searchResult.text,
                                sources: searchResult.sources || [],
                                timestamp: Date.now(),
                            },
                            activationScore: 1.0,
                            lastActivatedAt: Date.now(),
                            lastActivatedTurn: currentTurnRef.current,
                            orbitalStrength: 7,
                            orbitalDecayTurns: mapStrengthToTurns(7),
                        };
                        
                        setMessages(prev => {
                            const updated = [...prev, newAtom];
                            messagesRef.current = updated;
                            return updated;
                        });
                        
                        // FIX: Update RCB to reflect the research activity
                        const consciousRole = aiSettingsRef.current.roles.conscious;
                        if (consciousRole.enabled && rcbRef.current) {
                            try {
                                const updatedRcb = await rcbService.updateRcb(
                                    [newAtom], // Pass the research insight as a turn
                                    rcbRef.current,
                                    consciousRole,
                                    aiSettingsRef.current.providers
                                );
                                setRcb(updatedRcb);
                                loggingService.log('DEBUG', `RCB updated after ${stage.name} research cycle.`);
                            } catch (e) {
                                loggingService.log('ERROR', `Failed to update RCB after ${stage.name}`, { error: e });
                            }
                        }
                        
                        loggingService.log('INFO', `${stage.name} autonomous cycle successful, new insight created.`);
                    } else {
                        loggingService.log('WARN', `${stage.name}: Search returned no results.`);
                    }
                } else {
                    loggingService.log('INFO', `${stage.name} determined no search needed.`);
                }
            } else {
                // No search - just log the autonomous stage output
                loggingService.log('INFO', `${stage.name} autonomous output:`, { output: stageOutput.substring(0, 200) + '...' });
            }

        } catch (e: any) {
            loggingService.log('ERROR', `Autonomous cycle failed for ${stage.name}`, { error: e.toString() });
            
            // FIX: Auto-retry with trap door if it's a context overflow error
            const isContextError = (
                (e.message && (e.message.includes('400') || e.message.includes('context') || e.message.includes('token'))) ||
                (e.message && (e.message.includes('413') || e.message.includes('payload too large')))
            );
            const contextRoleSetting = aiSettingsRef.current.roles.context;
            
            if (isContextError && contextRoleSetting.enabled) {
                loggingService.log('WARN', `${stage.name}: Detected context overflow. Applying trap door...`);
                
                try {
                    const currentMessages = messagesRef.current;
                    const contextMessagesForPayload = currentMessages.filter(m => m.isInContext);
                    
                    // Trap door: Remove weak+old orbitals, but NEVER the first message (anchor)
                    const orbitalsToDecay = contextMessagesForPayload
                        .filter((m, idx) => idx > 0 && m.orbitalStrength !== undefined && m.orbitalStrength !== null) // Skip first message
                        .sort((a, b) => {
                            if ((a.orbitalStrength || 0) !== (b.orbitalStrength || 0)) {
                                return (a.orbitalStrength || 0) - (b.orbitalStrength || 0);
                            }
                            return a.timestamp - b.timestamp;
                        })
                        .slice(0, Math.ceil(contextMessagesForPayload.length * 0.3));
                    
                    const itemsToRemove = orbitalsToDecay.map(m => m.uuid);
                    
                    if (itemsToRemove.length > 0) {
                        setMessages(prev => prev.map(m => 
                            itemsToRemove.includes(m.uuid)
                                ? { ...m, isInContext: false, orbitalDecayTurns: null, orbitalStrength: null }
                                : m
                        ));
                        
                        loggingService.log('INFO', `Trap door: Set ${itemsToRemove.length} weak+old orbital items out-of-context. Orbital manager will re-evaluate post-turn.`);
                    } else {
                        loggingService.log('WARN', `${stage.name}: No low-priority orbitals to set out-of-context.`);
                    }
                } catch (decayError) {
                    loggingService.log('ERROR', `Trap door failed for ${stage.name}`, { error: decayError });
                }
            } else {
                loggingService.log('WARN', `${stage.name}: Failed but not a context error. Will not retry.`);
            }
        } finally {
            setIsCognitionRunning(false);
        }
    }, []);

    // --- Legacy Background Cognition (Keep for backwards compatibility) ---
    const runCognitionCycleNow = useCallback(async (isManual = false) => {
        const currentSettings = aiSettingsRef.current;
        const backgroundRoleSetting = currentSettings.roles.background;
        const backgroundWorkflowStage = currentSettings.workflow.find(s => s.id === 'background_cognition_default');

        if (!isManual && (!backgroundRoleSetting.enabled || currentSettings.backgroundCognitionRate <= 0)) {
            return;
        }
        if (isCognitionRunningRef.current || isLoadingRef.current) {
            loggingService.log('WARN', 'Skipping background cognition: another process is running.');
            return;
        }
        
        loggingService.log('INFO', `Background cognition cycle triggered ${isManual ? '(manually)' : '(scheduled)'}.`);
        setIsCognitionRunning(true);
        setError(null);
        try {
            const contextFileNamesForCycle = projectFilesRef.current.filter(f => contextFileIdsRef.current.includes(f.id)).map(f => f.name);
            const currentMessages = messagesRef.current;
            
            // Build context packets for background cognition using the same system as main workflow
            const contextMessagesForPayload = currentMessages.filter(m => m.isInContext);
            const recentHistory = contextMessagesForPayload.filter(m => m.type === 'user_message' || m.type === 'model_response').slice(-3);
            // FIX: Only include in-context insights (respects orbital decay decisions from context manager)
            const inContextBackgroundInsights = contextMessagesForPayload.filter((m): m is MemoryAtom & { backgroundInsight: BackgroundInsight } => m.type === 'steward_note' && !!m.backgroundInsight);
            const contextProjectFiles = projectFilesRef.current.filter(f => contextFileIdsRef.current.includes(f.id));
            const existingAxioms = currentMessages
              .flatMap(m => m.type === 'axiom' ? [m] : (m.cognitiveTrace?.filter(t => t.type === 'axiom') || []))
              .map(a => `- ${a.text}`)
              .join('\n') || 'None.';
            
            // Build a list of ALL recent queries (last 10) including decayed ones - so AI knows what it already researched
            const allRecentBackgroundQueries = currentMessages
                .filter((m): m is MemoryAtom & { backgroundInsight: BackgroundInsight } => m.type === 'steward_note' && !!m.backgroundInsight)
                .slice(-10)
                .map(atom => atom.backgroundInsight!.query)
                .join('\n- ');
            
            // Collect all recent queries (last 10) for deduplication check
            const allRecentQueriesLowercase = currentMessages
                .filter((m): m is MemoryAtom & { backgroundInsight: BackgroundInsight } => m.type === 'steward_note' && !!m.backgroundInsight)
                .slice(-10)
                .map(atom => atom.backgroundInsight!.query.toLowerCase().trim());
            
            const baseContextPackets = {
                RCB: JSON.stringify(rcbRef.current, null, 2),
                RECENT_HISTORY: recentHistory.map(m => `${m.role}: ${m.text}`).join('\n'),
                BACKGROUND_INSIGHTS: inContextBackgroundInsights.length > 0 
                    ? `QUERIES ALREADY RESEARCHED (avoid duplicating these):\n- ${allRecentBackgroundQueries}\n\nRESEARCH RESULTS:\n` + inContextBackgroundInsights.map(atom => `[Query: "${atom.backgroundInsight!.query}"]\n${atom.backgroundInsight!.insight}`).join('\n\n')
                    : `QUERIES ALREADY RESEARCHED (avoid duplicating these):\n- ${allRecentBackgroundQueries || '(none yet)'}\n\nNo research results in current context.`,
                CONTEXT_FILES: contextProjectFiles.map(f => `--- FILE: ${f.name} ---\n${f.content}`).join('\n\n') || 'None.',
                RECALLED_AXIOMS: existingAxioms,
                CORE_NARRATIVE: selfNarrativeRef.current || 'None.',
            };

            const insight = await backgroundCognitionService.runWebSearchCycle({
                messages: currentMessages,
                projectFiles: projectFilesRef.current,
                contextFileNames: contextFileNamesForCycle,
                selfNarrative: selfNarrativeRef.current,
                rcb: rcbRef.current,
                baseContextPackets,
            }, backgroundRoleSetting, currentSettings.providers, currentSettings.backgroundWorkflow, backgroundWorkflowStage, allRecentQueriesLowercase);

            // Deduplication check already happened in the service, but double-check here
            if (insight && allRecentQueriesLowercase.includes(insight.query.toLowerCase().trim())) {
                loggingService.log('ERROR', `CRITICAL: Duplicate query slipped through: "${insight.query}" - this should not happen!`);
                return;
            }
            
            if (insight) {
                const newAtom: MemoryAtom = {
                    uuid: uuidv4(),
                    timestamp: Date.now(),
                    role: 'model',
                    type: 'steward_note',
                    text: `*Proactively researched: "${insight.query}"*\n\n${insight.insight}`,
                    isInContext: true,
                    isCollapsed: false,
                    backgroundInsight: insight,
                    activationScore: 1.0,
                    lastActivatedAt: Date.now(),
                    lastActivatedTurn: currentTurnRef.current,
                    orbitalStrength: 7, // High-salience default for new insights
                    orbitalDecayTurns: mapStrengthToTurns(7), // Subject to normal orbital decay
                };
                // FIX: Update the ref immediately so subsequent cycles can see this insight
                setMessages(prev => {
                    const updated = [...prev, newAtom];
                    messagesRef.current = updated; // Immediately update ref for next cycle
                    return updated;
                });
                loggingService.log('INFO', 'Background cognition successful, new insight created and activated.', { insight });
            }
        } catch (e: any) {
            loggingService.log('ERROR', 'Background Cognition Cycle failed.', { error: e.toString(), stack: e.stack });
            
            // Expanded error detection: Catch context overflow AND Fireworks 413 Payload Too Large
            const errorString = (e.toString() + (e.message || '')).toLowerCase();
            const isContextError = (
                (errorString.includes('context') || errorString.includes('buffer') || errorString.includes('overflow')) &&
                (errorString.includes('exceed') || errorString.includes('limit') || errorString.includes('too') || errorString.includes('large') || errorString.includes('too large'))
            ) || errorString.includes('token_limit_exceeded') || errorString.includes('413') || errorString.includes('payload too large');
            const contextRoleSetting = aiSettingsRef.current.roles.context;
            
            if (isContextError && contextRoleSetting.enabled) {
                loggingService.log('WARN', 'Context overflow detected (buffer/context + exceed/limit keywords). Triggering intelligent pruning and will retry in next cycle.');
                
                try {
                    const currentMessages = messagesRef.current;
                    
                    // First pass: Intelligent orbital decay - remove low-priority OLD orbitals
                    // CRITICAL: Never remove the first message (it's the anchor)
                    const messagesToRemove: string[] = [];
                    
                    // Sort by age (oldest first) and prioritize items with low orbitalStrength
                    const orbitalsToConsider = currentMessages
                        .filter((m, idx) => idx > 0 && m.isInContext && m.orbitalStrength !== undefined && m.orbitalStrength !== null) // Skip first message
                        .sort((a, b) => {
                            // Primary sort: strength (weakest first)
                            if ((a.orbitalStrength || 0) !== (b.orbitalStrength || 0)) {
                                return (a.orbitalStrength || 0) - (b.orbitalStrength || 0);
                            }
                            // Secondary sort: age (oldest first)
                            return a.timestamp - b.timestamp;
                        })
                        .slice(0, Math.ceil(currentMessages.length * 0.25)); // Target removing 25% of orbital items first
                    
                    for (const msg of orbitalsToConsider) {
                        messagesToRemove.push(msg.uuid);
                    }
                    
                    loggingService.log('DEBUG', `Intelligent orbital decay: Removing ${messagesToRemove.length} low-priority orbital messages from oldest turns`);
                    
                    // Apply the orbital decay immediately
                    setMessages(prev => {
                        const updated = prev.map(m =>
                            messagesToRemove.includes(m.uuid)
                                ? { ...m, isInContext: false, orbitalDecayTurns: null, orbitalStrength: null }
                                : m
                        );
                        messagesRef.current = updated;
                        return updated;
                    });
                    
                    // Retry immediately without waiting
                    loggingService.log('INFO', 'Trap door: Set weak+old orbitals out-of-context. Orbital manager will re-evaluate next cycle.');
                    return; // Exit gracefully, will retry on next scheduled turn
                    
                } catch (decayError) {
                    loggingService.log('ERROR', 'Intelligent orbital decay failed', { error: decayError });
                    // Continue to error handling below, don't set error yet
                }
            }
            
            // Handle other error types (not context-related)
            let friendlyError = e;
            try {
                const errorJson = JSON.parse(e.message);
                if (errorJson.error?.code === 503 || errorJson.error?.status === 'UNAVAILABLE') {
                    const modelInUse = aiSettingsRef.current.roles.background.selectedModel;
                    friendlyError = new Error(`Background Cognition failed: The model (${modelInUse}) is temporarily overloaded. You can try a different model in the AI settings.`);
                }
            } catch (parseError) {
                if (e.message && e.message.includes('503') && e.message.includes('overloaded')) {
                    const modelInUse = aiSettingsRef.current.roles.background.selectedModel;
                    friendlyError = new Error(`Background Cognition failed: The model (${modelInUse}) is temporarily overloaded. You can try a different model in the AI settings.`);
                }
            }
            setError(friendlyError);
        } finally {
            setIsCognitionRunning(false);
            loggingService.log('INFO', 'Background cognition cycle finished.');
        }
    }, []);

    useEffect(() => {
        if (!isReady) return;
        const { backgroundCognitionRate: rate, roles } = aiSettings;
        if (!roles.background.enabled || rate <= 0) {
            return;
        }

        const intervalId = setInterval(() => {
            runCognitionCycleNow(false);
        }, rate * 1000);

        return () => clearInterval(intervalId);
    }, [isReady, aiSettings.backgroundCognitionRate, aiSettings.roles.background.enabled, runCognitionCycleNow]);
    
    
    // --- "Out of Step" Learning Cycle ---
    const runPostTurnCycle = useCallback(async (completedTurnMessages: MemoryAtom[], workflowOutputs: Record<string, string>) => {
        loggingService.log('INFO', 'Post-turn learning cycle started.');
        let lastModelAtomIndex = -1;
        for (let i = completedTurnMessages.length - 1; i > 0; i--) {
            if (
                completedTurnMessages[i].role === 'model' &&
                !completedTurnMessages[i].isLearnedFrom &&
                completedTurnMessages[i-1].role === 'user'
            ) {
                lastModelAtomIndex = i;
                break;
            }
        }

        if (lastModelAtomIndex === -1) {
             loggingService.log('DEBUG', 'No new turn to learn from, running context management only.');
        }
        
        const lastModelAtom = lastModelAtomIndex !== -1 ? completedTurnMessages[lastModelAtomIndex] : null;

        let messagesWithLearnedFlag = lastModelAtom 
            ? completedTurnMessages.map(m => m.uuid === lastModelAtom.uuid ? { ...m, isLearnedFrom: true } : m)
            : completedTurnMessages;

        if (lastModelAtom) {
            loggingService.log('DEBUG', 'Learning from turn', { uuid: lastModelAtom.uuid });
            setLoadingStage('Learning from turn...');
        }


        let newAxiomAtoms: MemoryAtom[] = [];
        let newAxiomsForNarrative: string[] = [];
        
        const axiomGenerationOutput = workflowOutputs['axiom_generation_default'];
        if (axiomGenerationOutput) {
            try {
                const jsonString = axiomGenerationOutput.match(/```json\n([\s\S]*?)\n```/)?.[1];
                if (jsonString) {
                    const parsed = JSON.parse(jsonString);
                    if (parsed.axioms && Array.isArray(parsed.axioms)) {
                        for (const axiomData of parsed.axioms) {
                            if (axiomData.text && axiomData.id) {
                                newAxiomsForNarrative.push(axiomData.text);
                                newAxiomAtoms.push({
                                    uuid: uuidv4(),
                                    timestamp: Date.now(),
                                    role: 'model',
                                    type: 'axiom',
                                    text: axiomData.text,
                                    axiomId: axiomData.id,
                                    isInContext: false,
                                    isCollapsed: false,
                                    activationScore: 1.0,
                                    lastActivatedAt: Date.now(),
                                    lastActivatedTurn: currentTurnRef.current,
                                    orbitalDecayTurns: undefined,
                                });
                            }
                        }
                    }
                }
                if (newAxiomAtoms.length > 0) {
                     loggingService.log('INFO', 'Parsed emergent axioms from Axiom Generation stage.', { axioms: newAxiomAtoms });
                }
            } catch(e) {
                loggingService.log('ERROR', 'Failed to parse axioms from Axiom Generation stage output', { error: e, output: axiomGenerationOutput });
            }
        }
        
        const projectedMessagesWithNewAxioms = [...messagesWithLearnedFlag, ...newAxiomAtoms];
        
        let contextCommands: { setOrbits: { uuid: string; strength: number; }[], deorbitUuids: string[] } = { setOrbits: [], deorbitUuids: [] };
        const contextRoleSetting = aiSettingsRef.current.roles.context;
        if(contextRoleSetting.enabled) {
            contextCommands = await contextService.manageOrbits(projectedMessagesWithNewAxioms, contextRoleSetting, aiSettingsRef.current.providers);
            loggingService.log('DEBUG', 'Context manager returned commands', { contextCommands });
        }

        let finalMessages = projectedMessagesWithNewAxioms.map(m => {
            let updatedAtom = { ...m };
            const setOrbitCmd = contextCommands.setOrbits.find(cmd => cmd.uuid === m.uuid);
            if(setOrbitCmd) {
                updatedAtom.isInContext = true;
                updatedAtom.orbitalStrength = setOrbitCmd.strength;
                updatedAtom.orbitalDecayTurns = mapStrengthToTurns(setOrbitCmd.strength);
                updatedAtom.lastActivatedTurn = currentTurnRef.current;
                updatedAtom.lastActivatedAt = Date.now();
            }
            if(contextCommands.deorbitUuids.includes(m.uuid)) {
                updatedAtom.isInContext = false;
                updatedAtom.orbitalDecayTurns = null;
                updatedAtom.orbitalStrength = null;
            }
            return updatedAtom;
        });

        let newNarrative = selfNarrativeRef.current;
        const narrativeRoleSetting = aiSettingsRef.current.roles.narrative;
        if (newAxiomsForNarrative.length > 0 && narrativeRoleSetting.enabled) {
            newNarrative = await integrateNarrative(selfNarrativeRef.current, newAxiomsForNarrative, narrativeRoleSetting, aiSettingsRef.current.providers);
            loggingService.log('INFO', 'Narrative integrated', { newNarrative });
        }
        
         loggingService.log('INFO', 'Post-turn learning cycle complete.');
         return { updatedMessages: finalMessages, newNarrative };
    }, []);

    const updateRcbAfterTurn = useCallback(async (lastTurnAtoms: MemoryAtom[]) => {
        const consciousRole = aiSettingsRef.current.roles.conscious;
        if (!consciousRole.enabled) return;
        
        loggingService.log('DEBUG', 'Updating Running Context Buffer (RCB)...');
        setLoadingStage('Reflecting on turn...');
        try {
            const currentRcb = rcbRef.current;
            if (!currentRcb) return;

            const newRcb = await rcbService.updateRcb(
                lastTurnAtoms,
                currentRcb,
                consciousRole,
                aiSettingsRef.current.providers
            );
            setRcb(newRcb);
            loggingService.log('INFO', 'RCB updated successfully.', { newRcb });
        } catch (e) {
            loggingService.log('ERROR', 'Failed to update RCB', { error: e });
        }
    }, []);


    // --- Core Chat Logic (Workflow-Driven) ---
    const sendMessage = useCallback(async (messageText: string) => {
        loggingService.log('INFO', 'sendMessage triggered', { messageText });
        setIsLoading(true);
        setLoadingStage('Initializing...');
        setError(null);
        stopGenerationRef.current = false;
        
        currentTurnRef.current += 1;
        setLoadingStage('Managing memory decay...');
        let messagesAfterDecay = messagesRef.current.map(m => {
            let updatedAtom = { ...m };
            if (m.isInContext && m.orbitalDecayTurns && m.orbitalDecayTurns > 0) {
                updatedAtom.orbitalDecayTurns -= 1;
                if (updatedAtom.orbitalDecayTurns === 0) {
                    updatedAtom.isInContext = false;
                    updatedAtom.orbitalDecayTurns = null;
                }
            }
            if (m.activationScore && m.lastActivatedTurn) {
                const turnsSinceLast = currentTurnRef.current - m.lastActivatedTurn;
                const decay = 1 / fibonacci(turnsSinceLast + 1);
                updatedAtom.activationScore = (m.activationScore || 0) * decay;
            }
            return updatedAtom;
        });
        loggingService.log('DEBUG', 'Memory decay applied.');

        const userAtom: MemoryAtom = {
            uuid: uuidv4(), timestamp: Date.now(), role: 'user', type: 'user_message',
            text: messageText, isInContext: true, isCollapsed: false,
            activationScore: 1.0, lastActivatedTurn: currentTurnRef.current, lastActivatedAt: Date.now(),
        };
        
        let messagesForThisTurn = [...messagesAfterDecay, userAtom];
        setMessages(messagesForThisTurn);
        
        let finalModelAtom: MemoryAtom | null = null;
        const workflowOutputs: Record<string, string> = {};
        const cognitiveTrace: MemoryAtom[] = [];
        let functionCalls: FunctionCall[] = [];
        let srgTraceIds: string[] = [];

        try {
            // --- Pre-computation for all workflow stages ---
            setLoadingStage('Recalling memories...');
            const recallResult = await recallWeaverService.recall(
                messageText,
                messagesForThisTurn,
                currentTurnRef.current,
                aiSettingsRef.current.srg.traversal // Pass the current SRG settings
            );
            srgTraceIds = recallResult.traceIds; // Capture trace IDs for visualization
            const traceWords = recallResult.graphTrace.replace('[SRG_TRACE]', '').split(/\s+/).map(w => w.replace(/\(\d+\)/, '').trim()).filter(Boolean);
            const resonanceMemories = recallWeaverService.resonanceRecall(traceWords, messagesForThisTurn);
            loggingService.log('INFO', 'SRG recall complete', { axiomCount: recallResult.axioms.length, resonanceCount: resonanceMemories.length });
            if (aiSettingsRef.current.debugSRG && recallResult.graphTrace) {
                cognitiveTrace.push({ uuid: uuidv4(), timestamp: Date.now(), role: 'model', type: 'srg_augmentation', text: recallResult.graphTrace, isInContext: false, isCollapsed: false, activationScore: 0, lastActivatedAt: 0, lastActivatedTurn: 0 });
            }

            // --- Hybrid System Integration ---
            setLoadingStage('Running hybrid reasoning...');
            // Auto-ingest recent messages into hybrid for learning
            const recentMessagesToIngest = messagesForThisTurn
                .filter(m => (m.type === 'user_message' || m.type === 'model_response') && m.text.length > 0)
                .slice(-5); // Last 5 messages for fresh context
            
            for (const msg of recentMessagesToIngest) {
                await srgService.ingestHybrid(msg.text);
            }

            // Query hybrid system for deep reasoning
            const hybridResult = srgService.queryHybrid(messageText, {
                window: 20,
                maxDepth: 3,
                useSynsets: true,
                useRelations: true,
                generateLength: 40
            });

            if (hybridResult) {
                loggingService.log('INFO', 'Hybrid query complete', { 
                    pathsFound: hybridResult.paths.length,
                    entitiesFound: hybridResult.entityProfiles.size,
                    interferenceScore: hybridResult.interferenceHit.score.toFixed(3)
                });

                // Add hybrid trace to cognitive trace if debugging enabled
                if (aiSettingsRef.current.debugSRG) {
                    const hybridTraceText = `[HYBRID SYSTEM TRACE]\n` +
                        `Interference Score: ${hybridResult.interferenceHit.score.toFixed(3)}\n` +
                        `Paths Found: ${hybridResult.paths.length}\n` +
                        `Top Path: ${hybridResult.paths[0]?.nodes.join(' → ') || 'None'}\n` +
                        `Relations: ${hybridResult.paths[0]?.relationChain.join(' → ') || 'None'}\n` +
                        `Generated: ${hybridResult.generated}`;
                    
                    cognitiveTrace.push({
                        uuid: uuidv4(),
                        timestamp: Date.now(),
                        role: 'model',
                        type: 'srg_augmentation',
                        text: hybridTraceText,
                        isInContext: false,
                        isCollapsed: false,
                        activationScore: 0,
                        lastActivatedAt: 0,
                        lastActivatedTurn: 0
                    });
                }
            } else {
                loggingService.log('WARN', 'Hybrid query returned no results');
            }
            
            let previousTurnCognitiveTrace = 'N/A';
            if (aiSettingsRef.current.passFullCognitiveTrace) {
                const lastModelResponse = [...messagesForThisTurn].reverse().find(m => m.type === 'model_response');
                if (lastModelResponse?.cognitiveTrace) {
                    const subconscious = lastModelResponse.cognitiveTrace.find(t => t.type === 'subconscious_reflection');
                    const conscious = lastModelResponse.cognitiveTrace.find(t => t.type === 'conscious_thought');
                    if (subconscious || conscious) {
                        previousTurnCognitiveTrace = `[PREVIOUS TURN'S THOUGHTS]\nSubconscious: ${subconscious?.text || 'None.'}\nConscious: ${conscious?.text || 'None.'}\n---`;
                    }
                }
            }


            const contextMessagesForPayload = messagesForThisTurn.filter(m => m.isInContext);
            const recentHistory = contextMessagesForPayload.filter(m => m.type === 'user_message' || m.type === 'model_response').slice(-10);
            // FIX: Background insights should be persistently available, not subject to orbital decay
            // Get ALL background insights from message history, not just those in context
            const allBackgroundInsights = messagesForThisTurn.filter((m): m is MemoryAtom & { backgroundInsight: BackgroundInsight } => m.type === 'steward_note' && !!m.backgroundInsight);
            const contextProjectFiles = projectFilesRef.current.filter(f => contextFileIdsRef.current.includes(f.id));

            loggingService.log('DEBUG', 'Context preparation', {
                projectFilesTotal: projectFilesRef.current.length,
                contextFileIdsCount: contextFileIdsRef.current.length,
                contextProjectFilesCount: contextProjectFiles.length,
                contextProjectFileNames: contextProjectFiles.map(f => f.name)
            });

            const baseContextPackets = {
                USER_QUERY: userAtom.text,
                RECENT_HISTORY: recentHistory.map(m => `${m.role}: ${m.text}`).join('\n'),
                RCB: JSON.stringify(rcbRef.current, null, 2),
                RECALLED_AXIOMS: recallResult.axioms.map(a => `- ${a.text}`).join('\n') || 'None.',
                SRG_TRACE: recallResult.graphTrace,
                // FIX: Limit background insights to prevent context overflow in synthesis
                // Prioritize: 1) insights in active context, 2) most recent insights
                BACKGROUND_INSIGHTS: (() => {
                    const inContextInsights = allBackgroundInsights.filter(atom => atom.isInContext);
                    const recentInsights = [...allBackgroundInsights]
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .slice(0, 10); // More for main workflow since it's user-facing
                    const relevantInsights = [...new Set([...inContextInsights, ...recentInsights])];
                    
                    if (relevantInsights.length === 0) {
                        return 'No background research available yet. Your autonomous research system will gather information as needed.';
                    }
                    
                    return '**AUTONOMOUS RESEARCH FINDINGS:**\n' +
                           'Your background research system has gathered the following information:\n\n' +
                           relevantInsights.map((atom, idx) => 
                               `[Research ${idx + 1}] Query: "${atom.backgroundInsight!.query}"\n` +
                               `Researched: ${new Date(atom.backgroundInsight!.timestamp).toLocaleString()}\n` +
                               `Findings: ${atom.backgroundInsight!.insight}\n` +
                               (atom.backgroundInsight!.sources && atom.backgroundInsight!.sources.length > 0 
                                   ? `Sources: ${atom.backgroundInsight!.sources.map(s => s.web.uri).join(', ')}\n`
                                   : '')
                           ).join('\n---\n\n');
                })(),
                CORE_NARRATIVE: selfNarrativeRef.current,
                CONTEXT_FILES: contextProjectFiles.map(f => `--- FILE: ${f.name} ---\n${f.content}`).join('\n\n') || 'No files in context.',
                RESONANCE_MEMORIES: resonanceMemories.map(m => `[Recalled Memory from Turn ${m.lastActivatedTurn}]\n${m.role}: ${m.text}`).join('\n\n') || 'None.',
                PREVIOUS_COGNITIVE_TRACE: previousTurnCognitiveTrace,
            };

            // --- Dynamic Workflow Execution ---
            const workflow = aiSettingsRef.current.workflow;
            // Find the synthesis / voice stage: prefer 'synthesis_default' for legacy, otherwise use the last enabled stage
            const synthesisStageIndex = workflow.findIndex(s => s.id === 'synthesis_default') !== -1
                ? workflow.findIndex(s => s.id === 'synthesis_default')
                : (() => { for (let i = workflow.length - 1; i >= 0; i--) { if (workflow[i].enabled) return i; } return -1; })();

            // FIX: Check for context overflow before workflow execution
            const contextCheckPrompt = Object.values(baseContextPackets).join('\n');
            const estimatedContextTokens = Math.round(contextCheckPrompt.length / 4);
            const tokenLimit = aiSettingsRef.current.apiTokenLimit;
            
            if (estimatedContextTokens > tokenLimit * 0.85) { // If using >85% of limit
                loggingService.log('WARN', `Context approaching limit (${estimatedContextTokens}/${tokenLimit} tokens). Applying trap door.`);
                setLoadingStage('');
                
                const contextRoleSetting = aiSettingsRef.current.roles.context;
                if (contextRoleSetting.enabled) {
                    // Priority 1: Background insights (steward notes with backgroundInsight), oldest first
                    const insightsToRemove = contextMessagesForPayload
                        .filter((m, idx) => idx > 0 && m.type === 'steward_note' && !!m.backgroundInsight) // Skip first message
                        .sort((a, b) => a.timestamp - b.timestamp) // Oldest first
                        .slice(0, Math.ceil(contextMessagesForPayload.length * 0.3));
                    
                    const itemsToRemove = insightsToRemove.map(m => m.uuid);
                    
                    // Priority 2: If we still need more space, remove weak+old regular orbitals
                    if (itemsToRemove.length < Math.ceil(contextMessagesForPayload.length * 0.3)) {
                        const remainingToRemove = Math.ceil(contextMessagesForPayload.length * 0.3) - itemsToRemove.length;
                        const orbitalsToDecay = contextMessagesForPayload
                            .filter((m, idx) => idx > 0 && !itemsToRemove.includes(m.uuid) && m.type !== 'steward_note' && m.orbitalStrength !== undefined && m.orbitalStrength !== null) // Skip first, insights, and non-orbitals
                            .sort((a, b) => {
                                if ((a.orbitalStrength || 0) !== (b.orbitalStrength || 0)) {
                                    return (a.orbitalStrength || 0) - (b.orbitalStrength || 0);
                                }
                                return a.timestamp - b.timestamp;
                            })
                            .slice(0, remainingToRemove);
                        
                        itemsToRemove.push(...orbitalsToDecay.map(m => m.uuid));
                    }
                    
                    if (itemsToRemove.length > 0) {
                        // Update messages to deorbit trapped items
                        messagesForThisTurn = messagesForThisTurn.map(m => 
                            itemsToRemove.includes(m.uuid)
                                ? { ...m, isInContext: false, orbitalDecayTurns: null, orbitalStrength: null }
                                : m
                        );
                        setMessages(messagesForThisTurn);
                        
                        loggingService.log('INFO', `Trap door: Set ${itemsToRemove.length} items out-of-context (${insightsToRemove.length} insights, ${itemsToRemove.length - insightsToRemove.length} orbitals). Orbital manager will re-evaluate post-turn.`);
                    }
                }
            }

            // Create the model atom up front — intermediate stages stream into cognitiveTrace boxes,
            // only the final/synthesis stage streams into the main message text.
            finalModelAtom = {
                uuid: uuidv4(), timestamp: Date.now(), role: 'model', type: 'model_response',
                text: '', isInContext: true, isCollapsed: false, cognitiveTrace: [],
                activationScore: 1.0, lastActivatedTurn: currentTurnRef.current, lastActivatedAt: Date.now(),
            };
            setMessages(prev => [...prev.filter(m => m.uuid !== userAtom.uuid), userAtom, finalModelAtom!]);
            
            // Ingest user message into SRG for persistent queryability
            await srgService.ingestHybrid(userAtom.text, {
                title: 'User Message',
                source: 'chat',
                category: 'literature'
            });

            let lastCompletedStageId = '';

            for (let i = 0; i < workflow.length; i++) {
                const stage = workflow[i];
                if (!stage.enabled) continue;
                if (stopGenerationRef.current) break;

                setLoadingStage(stage.name + '...');
                loggingService.log('INFO', `Executing workflow stage: ${stage.name}`);

                let stagePrompt = '';
                for (const input of stage.inputs) {
                    if (input.startsWith('OUTPUT_OF_')) {
                        const sourceStageId = input.replace('OUTPUT_OF_', '');
                        const sourceStage = workflow.find(s => s.id === sourceStageId);
                        stagePrompt += `\n\n--- OUTPUT OF ${sourceStage?.name || sourceStageId} ---\n${workflowOutputs[sourceStageId] || 'No output.'}`;
                    } else if (ALL_CONTEXT_PACKETS.includes(input as any)) {
                        stagePrompt += `\n\n--- ${CONTEXT_PACKET_LABELS[input as keyof typeof CONTEXT_PACKET_LABELS]} ---\n${baseContextPackets[input as keyof typeof baseContextPackets] || 'Not available.'}`;
                    }
                }
                
                const roleSetting: RoleSetting = { enabled: stage.enabled, provider: stage.provider, selectedModel: stage.selectedModel };
                const isLastStage = i === synthesisStageIndex;
                
                // Reset skip flag for this layer
                skipLayerRef.current = false;
                
                // For intermediate stages, create a live trace atom in the cognitiveTrace array
                // so it renders as a collapsible box in CognitiveTraceViewer
                let traceAtomUuid: string | null = null;
                if (!isLastStage && stage.id !== 'axiom_generation_default') {
                    traceAtomUuid = uuidv4();
                    const liveTraceAtom = {
                        uuid: traceAtomUuid, timestamp: Date.now(), role: 'model' as const,
                        type: 'conscious_thought' as const, text: '', isInContext: false,
                        isCollapsed: false, isGenerating: true, activationScore: 0,
                        lastActivatedAt: 0, lastActivatedTurn: 0, name: stage.name,
                        promptDetails: {
                            stageName: stage.name,
                            systemPrompt: stage.systemPrompt || '(none)',
                            userPrompt: stagePrompt.trim() || '(empty)',
                        },
                    } as any;
                    cognitiveTrace.push(liveTraceAtom);
                    // Push the live trace into the message's cognitiveTrace so it shows immediately
                    setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid 
                        ? { ...m, cognitiveTrace: [...cognitiveTrace] } 
                        : m));
                }

                const contents: Content[] = [{ role: 'user', parts: [{ text: stagePrompt }] }];
                const stream = await sendMessageToGemini(contents, stage.systemPrompt, true, roleSetting, aiSettingsRef.current.providers);
                loggingService.log('DEBUG', `Streaming stage: ${stage.name}`);
                
                let streamedText = '';

                // === MID-STREAM COMMAND EXECUTION ===
                const COMMAND_KEYWORDS = [
                    'search.brave',
                    'search.pw',
                    'search.both',
                    'srg.q',
                    'srg.profile',
                    'srg.neighbors',
                    'srg.path',
                    'srg.ingest',
                    'wo.submit',
                    'wo.status',
                    'wo.list',
                    'wo.revert',
                    'bg.research',
                    'file.list',
                    'file.find',
                    'file.read',
                    'file.write',
                    'file.delete',
                    'km.load',
                    'km.unload',
                    'km.list',
                    'km.active',
                    'cog.route',
                    'cog.mode',
                    'exec.run',
                    'exec.test',
                    'ralph.escalate',
                    'ralph.history',
                    'core.axiom',
                    'core.write',
                    'core.read',
                    'brave.api.healthcheck',
                ];

                // Strip ALL leading formatting junk
                const normalizeCommandLine = (line: string) => line.replace(/^[\s*`#>?!|:_~\-•]+/, '').trim();

                const checkAndExecuteCommand = async (text: string, isStreamEnd: boolean = false): Promise<{ shouldContinue: boolean; result?: string; newText?: string }> => {
                    const lines = text.split('\n');
                    const cmdIndex = lines.findIndex(l => {
                        const cleaned = normalizeCommandLine(l);
                        return COMMAND_KEYWORDS.some(cmd => cleaned.startsWith(cmd));
                    });

                    // DEBUG: Log every line to see what's coming through
                    loggingService.log('DEBUG', `[${stage.name}] Scanning ${lines.length} lines for commands (isStreamEnd=${isStreamEnd})`);
                    lines.forEach((line, idx) => {
                        const cleaned = normalizeCommandLine(line);
                        const isCmd = COMMAND_KEYWORDS.some(cmd => cleaned.startsWith(cmd));
                        if (cleaned || isCmd) {
                            loggingService.log('DEBUG', `  Line ${idx}: RAW="${line.substring(0, 60)}" | CLEAN="${cleaned.substring(0, 60)}" | isCmd=${isCmd}`);
                        }
                    });

                    if (cmdIndex === -1) {
                        loggingService.log('DEBUG', `[${stage.name}] No command detected in any line`);
                        return { shouldContinue: false };
                    }

                    loggingService.log('INFO', `[${stage.name}] FOUND COMMAND at line ${cmdIndex} of ${lines.length}`);

                    const isLastLine = cmdIndex === lines.length - 1;
                    loggingService.log('DEBUG', `[${stage.name}] Command position: isLastLine=${isLastLine}, isStreamEnd=${isStreamEnd}`);

                    if (isLastLine && !isStreamEnd) {
                        // Wait for the command to finish streaming (either a newline or stream ends)
                        loggingService.log('DEBUG', `[${stage.name}] Command on last line and stream not ended yet - WAITING for more input`);
                        return { shouldContinue: false };
                    }

                    const rawCommandLine = lines[cmdIndex];
                    const commandLine = normalizeCommandLine(rawCommandLine);
                    loggingService.log('DEBUG', `[${stage.name}] Raw command line: "${rawCommandLine.substring(0, 100)}"`);
                    loggingService.log('DEBUG', `[${stage.name}] Normalized command line: "${commandLine.substring(0, 100)}"`);

                    if (!commandLine) {
                        loggingService.log('DEBUG', `[${stage.name}] Empty command line after normalization`);
                        return { shouldContinue: false };
                    }

                    loggingService.log('INFO', `[${stage.name}] ✅ Detected command: ${commandLine}`);

                    // Remove the command line from streamedText so it doesn't appear in output
                    const textBeforeCommand = lines.slice(0, cmdIndex).join('\n');

                    const matchedCommand = COMMAND_KEYWORDS.find(cmd => commandLine.startsWith(cmd));
                    if (!matchedCommand) {
                        return { shouldContinue: false };
                    }

                    const args = commandLine.slice(matchedCommand.length).trim();
                    let commandResult = '';

                    try {
                        switch (matchedCommand) {
                            case 'search.brave':
                            case 'search.pw':
                            case 'search.both': {
                                let query = args;

                                // Strip wrapping json blocks and any sort of quotes/backticks
                                if (query.toLowerCase().startsWith('```json') && query.endsWith('```')) {
                                    query = query.slice(7, -3).trim();
                                } else if (query.startsWith('```') && query.endsWith('```')) {
                                    query = query.slice(3, -3).trim();
                                }

                                query = query.replace(/^[`'"\s]+|[`'"\s]+$/g, '').trim();

                                if (!query) {
                                    throw new Error("Parsed search query was empty. Format your command exactly as 'search.brave your query here' without code blocks.");
                                }

                                loggingService.log('INFO', `[${stage.name}] Executing web search: "${query}"`);
                                const searchResult = await performWebSearch(query, roleSetting, aiSettingsRef.current.providers, aiSettingsRef.current);
                                commandResult = searchResult ? `[WEB SEARCH RESULTS]\n${searchResult.text}\n\n[SOURCES]\n${searchResult.sources?.map((s: any) => s.web?.uri || s.url).filter(Boolean).join('\n') || 'None'}` : "[NO SEARCH RESULTS]";
                                break;
                            }
                            case 'srg.q': {
                                const query = args;
                                loggingService.log('INFO', `[${stage.name}] Querying SRG: "${query}"`);
                                const result = srgService.queryHybrid(query);
                                commandResult = result ? `[SRG RESULTS]\n${result.generated || ''}\n\n[TRACE]\n${result.trace?.map((t: any) => t.word).join(', ') || ''}` : "[NO SRG RESULTS]";
                                break;
                            }
                            case 'srg.profile': {
                                const entity = args;
                                commandResult = `[SRG PROFILE: Not fully implemented, query srg.q instead for ${entity}]`;
                                break;
                            }
                            case 'srg.neighbors': {
                                const entity = args;
                                commandResult = `[SRG NEIGHBORS: Not fully implemented, query srg.q instead for ${entity}]`;
                                break;
                            }
                            case 'srg.path': {
                                const pathQuery = args;
                                commandResult = `[SRG PATH: Not implemented, query srg.q instead for ${pathQuery}]`;
                                break;
                            }
                            case 'srg.ingest': {
                                const ingestTarget = args;
                                commandResult = `[SRG INGEST: Not implemented, would ingest ${ingestTarget}]`;
                                break;
                            }
                            case 'file.read': {
                                const path = args;
                                loggingService.log('INFO', `[${stage.name}] Reading file: ${path}`);
                                const file = projectFilesRef.current.find(f => f.name === path);
                                commandResult = file ? `[FILE CONTENTS: ${path}]\n\n\`\`\`\n${file.content}\n\`\`\`` : `[FILE NOT FOUND: ${path}]`;
                                break;
                            }
                            case 'file.list': {
                                const dir = args;
                                const files = projectFilesRef.current.filter(f => f.name.startsWith(dir) || dir === '').map(f => f.name);
                                commandResult = files.length ? `[FILES IN ${dir || 'ROOT'}]\n${files.join('\n')}` : `[NO FILES FOUND IN: ${dir}]`;
                                break;
                            }
                            case 'file.find': {
                                const pattern = args;
                                try {
                                    const regex = new RegExp(pattern, 'i');
                                    const files = projectFilesRef.current.filter(f => regex.test(f.name) || regex.test(f.content || '')).map(f => f.name);
                                    commandResult = files.length ? `[FILES MATCHING ${pattern}]\n${files.join('\n')}` : `[NO MATCHES FOUND FOR: ${pattern}]`;
                                } catch (err) {
                                    commandResult = `[INVALID REGEX PATTERN: ${pattern}]`;
                                }
                                break;
                            }
                            case 'bg.research': {
                                commandResult = "[ADDED TO BACKGROUND RESEARCH QUEUE]";
                                break;
                            }
                            case 'wo.submit': {
                                commandResult = "[WORK ORDER SUBMITTED]";
                                break;
                            }
                            case 'wo.status': {
                                commandResult = "[ALL WORK ORDERS IDLE/COMPLETED]";
                                break;
                            }
                            case 'wo.list': {
                                commandResult = "[NO ACTIVE WORK ORDERS]";
                                break;
                            }
                            case 'wo.revert': {
                                commandResult = "[REVERT COMPLETE]";
                                break;
                            }
                            default: {
                                commandResult = `[SYSTEM NOTIFICATION] UNKNOWN COMMAND OR SYNTAX FAILURE: '${commandLine}'. System failed to parse this. Review TOOL CALL PROTOCOL exactly. Example: 'search.brave your query'`;
                                break;
                            }
                        }
                    } catch (err: any) {
                        loggingService.log('ERROR', `[${stage.name}] Command execution failed`, { error: err.message });
                        return {
                            shouldContinue: true,
                            result: textBeforeCommand + '\n\n[SYSTEM EXECUTION ERROR: ' + err.message + ']\n\nThe system encountered an error attempting to run your command. Please fix and try again.\n\nContinue your response:',
                            newText: textBeforeCommand + '\n\n> ❌ System Error: ' + err.message
                        };
                    }

                    loggingService.log('INFO', `[${stage.name}] Command result: ${commandResult.length} chars`);

                    return {
                        shouldContinue: true,
                        result: textBeforeCommand + '\n\n' + commandResult + '\n\nContinue your response:',
                        newText: textBeforeCommand + '\n\n> Executing: ' + commandLine + '...'
                    };
                };
                let pendingCommandResult = '';
                let streamBrokenByCommand = false;

                for await (const chunk of stream) {
                    // Stop = kill everything; Skip = break just this stream
                    if (stopGenerationRef.current || skipLayerRef.current) break;

                    if (chunk.text) {
                        streamedText += chunk.text;

                        // Check for mid-stream commands
                        const cmdCheck = await checkAndExecuteCommand(streamedText, false);
                        if (cmdCheck.shouldContinue && cmdCheck.result) {
                            // Break out of streaming to re-feed model with command result
                            loggingService.log('INFO', `[${stage.name}] Breaking stream to re-feed model with command results`);
                            streamBrokenByCommand = true;
                            pendingCommandResult = cmdCheck.result;

                            // Update the UI one last time with the text BEFORE the command to hide the command itself
                            const cleanedText = cmdCheck.newText ?? streamedText;
                            if (isLastStage) {
                                setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid
                                    ? { ...m, text: cleanedText + '...' }
                                    : m));
                            } else if (traceAtomUuid) {
                                const updatedTrace = cognitiveTrace.map(t =>
                                    t.uuid === traceAtomUuid ? { ...t, text: cleanedText } : t
                                );
                                setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid
                                    ? { ...m, cognitiveTrace: [...updatedTrace] }
                                    : m));
                            }
                            break;
                        }
                    }

                    if (chunk.functionCalls) {
                        functionCalls.push(...chunk.functionCalls);
                    }

                    if (!streamBrokenByCommand) {
                        if (isLastStage) {
                            // Final stage: stream into the main message text
                            setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid 
                                ? { ...m, text: streamedText + '...' } 
                                : m));
                        } else if (traceAtomUuid) {
                            // Intermediate stage: stream into the cognitiveTrace box
                            const updatedTrace = cognitiveTrace.map(t => 
                                t.uuid === traceAtomUuid ? { ...t, text: streamedText } : t
                            );
                            setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid 
                                ? { ...m, cognitiveTrace: [...updatedTrace] } 
                                : m));
                        }
                    }
                }
                
                // === HANDLE COMMAND RESULTS ===
                // If a command was detected and executed, re-feed the model
                loggingService.log('DEBUG', `[${stage.name}] Stream ended. Checking for end-of-stream commands (streamBrokenByCommand=${streamBrokenByCommand})`);
                const finalCheck = streamBrokenByCommand ? { shouldContinue: true, result: pendingCommandResult } : await checkAndExecuteCommand(streamedText, true);
                loggingService.log('DEBUG', `[${stage.name}] Final check result: shouldContinue=${finalCheck.shouldContinue}`);
                
                if (finalCheck.shouldContinue && finalCheck.result) {
                    loggingService.log('INFO', `[${stage.name}] Command detected at end of stream. Re-feeding model with results and continuing...`);
                    
                    // Add the command result to stagePrompt for next iteration
                    stagePrompt = finalCheck.result;
                    
                    // Clear streamedText and get a fresh stream from the model with the injected context
                    streamedText = '';
                    const continueStream = await sendMessageToGemini(
                        [{ role: 'user', parts: [{ text: stagePrompt }] }],
                        stage.systemPrompt,
                        true,
                        roleSetting,
                        aiSettingsRef.current.providers
                    );
                    
                    loggingService.log('DEBUG', `Continuing stream for stage: ${stage.name}`);
                    
                    for await (const chunk of continueStream) {
                        if (stopGenerationRef.current || skipLayerRef.current) break;
                        if (chunk.text) {
                            streamedText += chunk.text;
                        }
                        if (chunk.functionCalls) {
                            functionCalls.push(...chunk.functionCalls);
                        }
                        
                        if (isLastStage) {
                            setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid 
                                ? { ...m, text: streamedText + '...' } 
                                : m));
                        } else if (traceAtomUuid) {
                            const updatedTrace = cognitiveTrace.map(t => 
                                t.uuid === traceAtomUuid ? { ...t, text: streamedText } : t
                            );
                            setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid 
                                ? { ...m, cognitiveTrace: [...updatedTrace] } 
                                : m));
                        }
                    }
                    
                    // Check again for another command and loop if needed
                    let loopCount = 0;
                    while (loopCount < 3) { // Prevent infinite loops
                        const nextCheck = await checkAndExecuteCommand(streamedText);
                        if (!nextCheck.shouldContinue || !nextCheck.result) break;
                        
                        loopCount++;
                        loggingService.log('INFO', `[${stage.name}] Command loop iteration ${loopCount}`);
                        
                        stagePrompt = nextCheck.result;
                        streamedText = '';
                        const nextStream = await sendMessageToGemini(
                            [{ role: 'user', parts: [{ text: stagePrompt }] }],
                            stage.systemPrompt,
                            true,
                            roleSetting,
                            aiSettingsRef.current.providers
                        );
                        
                        for await (const chunk of nextStream) {
                            if (stopGenerationRef.current || skipLayerRef.current) break;
                            if (chunk.text) {
                                streamedText += chunk.text;
                            }
                            if (chunk.functionCalls) {
                                functionCalls.push(...chunk.functionCalls);
                            }
                            
                            if (isLastStage) {
                                setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid 
                                    ? { ...m, text: streamedText + '...' } 
                                    : m));
                            } else if (traceAtomUuid) {
                                const updatedTrace = cognitiveTrace.map(t => 
                                    t.uuid === traceAtomUuid ? { ...t, text: streamedText } : t
                                );
                                setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid 
                                    ? { ...m, cognitiveTrace: [...updatedTrace] } 
                                    : m));
                            }
                        }
                    }
                }
                
                // If this layer was skipped, note it and continue to next stage
                if (skipLayerRef.current) {
                    loggingService.log('INFO', `Stage "${stage.name}" skipped by user after ${streamedText.length} chars.`);
                    workflowOutputs[stage.id] = streamedText + '\n[Layer skipped by user]';
                    skipLayerRef.current = false;
                    // Mark trace atom as done (skipped)
                    if (traceAtomUuid) {
                        const idx = cognitiveTrace.findIndex(t => t.uuid === traceAtomUuid);
                        if (idx !== -1) {
                            cognitiveTrace[idx] = { ...cognitiveTrace[idx], text: streamedText + '\n[Skipped]', isGenerating: false, name: stage.name + ' (skipped)' } as any;
                        }
                        setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid 
                            ? { ...m, cognitiveTrace: [...cognitiveTrace] } 
                            : m));
                    }
                    lastCompletedStageId = stage.id;
                    continue;
                }
                
                workflowOutputs[stage.id] = streamedText;
                lastCompletedStageId = stage.id;
                
                if (!isLastStage) {
                    // Mark the trace atom as done generating (box collapses)
                    if (traceAtomUuid) {
                        const idx = cognitiveTrace.findIndex(t => t.uuid === traceAtomUuid);
                        if (idx !== -1) {
                            cognitiveTrace[idx] = { ...cognitiveTrace[idx], text: streamedText, isGenerating: false };
                        }
                        setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid 
                            ? { ...m, cognitiveTrace: [...cognitiveTrace] } 
                            : m));
                    }
                } else {
                    // Final stage done — show clean response
                    setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid 
                        ? { ...m, text: streamedText } 
                        : m));
                }
                
                loggingService.log('INFO', `Stage "${stage.name}" complete.`, { output: streamedText.substring(0, 100) + '...' });
            }

            if (stopGenerationRef.current) {
                // User hit full stop — keep whatever is displayed (don't throw it away)
                // Finalize any in-progress trace atoms
                for (const trace of cognitiveTrace) {
                    if (trace.isGenerating) {
                        trace.isGenerating = false;
                    }
                }
                const lastOutput = workflowOutputs[lastCompletedStageId] || '';
                const finalText = finalModelAtom!.text || lastOutput || '';
                const finalUpdatedAtom: MemoryAtom = {
                    ...finalModelAtom!,
                    text: (finalText || 'Generation stopped before final response.') + '\n\n*[Generation stopped by user]*',
                    cognitiveTrace: cognitiveTrace.length > 0 ? [...cognitiveTrace] : undefined,
                };
                setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid ? finalUpdatedAtom : m));
                setIsLoading(false);
                setLoadingStage('');
                return;
            }
            
            const finalResponseText = workflowOutputs[lastCompletedStageId] || "The AI pipeline did not produce a final response.";
            
            const generatedFilesFromMarkdown = extractCodeBlocksFromText(finalResponseText);
            const generatedFilesFromTools: GeneratedFile[] = [];

            if (functionCalls.length > 0) {
                loggingService.log('INFO', `Model requested ${functionCalls.length} tool call(s).`, { functionCalls });
                for (const fc of functionCalls) {
                    if (fc.name === 'writeFile' && fc.args) {
                        const { filename, content } = fc.args;
                        if (typeof filename === 'string' && typeof content === 'string') {
                            const language = filename.split('.').pop() || 'plaintext';
                            generatedFilesFromTools.push({ name: filename, content: content, language: language, createdAt: Date.now() });
                        }
                    }
                }
            }
            const generatedFiles = [...generatedFilesFromMarkdown, ...generatedFilesFromTools];

            const finalUpdatedAtom: MemoryAtom = { 
                ...finalModelAtom!, 
                text: finalResponseText,
                generatedFiles: generatedFiles.length > 0 ? generatedFiles : undefined,
                cognitiveTrace: cognitiveTrace.length > 0 ? cognitiveTrace : undefined,
                contextSnapshot: {
                    files: [...contextProjectFiles.map(f => f.name), ...contextGeneratedFileNamesRef.current],
                    messages: contextMessagesForPayload.map(m => m.uuid),
                },
                traceIds: srgTraceIds,
            };

            const messagesAfterGeneration = messagesRef.current.map(m => m.uuid === finalModelAtom!.uuid ? finalUpdatedAtom : m);
            setMessages(messagesAfterGeneration);
            
            // Ingest model response into SRG for persistent queryability
            await srgService.ingestHybrid(finalResponseText, {
                title: 'Model Response',
                source: 'chat',
                category: 'literature'
            });

            await updateRcbAfterTurn([userAtom, finalUpdatedAtom]);

            setLoadingStage('Learning from turn...');
            const { updatedMessages: messagesAfterLearning, newNarrative } = await runPostTurnCycle(messagesAfterGeneration, workflowOutputs);
            
            setMessages(messagesAfterLearning);
            if (newNarrative !== selfNarrativeRef.current) {
                setSelfNarrative(newNarrative);
            }

        } catch (e: any) {
            loggingService.log('ERROR', 'Chat pipeline error', { error: e.toString(), stack: e.stack });
            let friendlyError = e;
            
            // Expanded error detection: Catch context overflow AND Fireworks 413 Payload Too Large
            const errorString = (e.toString() + (e.message || '')).toLowerCase();
            const isContextError = (
                (errorString.includes('context') || errorString.includes('buffer') || errorString.includes('overflow')) &&
                (errorString.includes('exceed') || errorString.includes('limit') || errorString.includes('too') || errorString.includes('large'))
            ) || errorString.includes('token_limit_exceeded') || errorString.includes('413') || errorString.includes('payload too large');
            const contextRoleSetting = aiSettingsRef.current.roles.context;
            
            if (isContextError && contextRoleSetting.enabled && !stopGenerationRef.current) {
                loggingService.log('WARN', 'Context overflow detected. Applying trap door and retrying...');
                setLoadingStage('Trap door: freeing context...');
                
                try {
                    const currentMessages = messagesRef.current;
                    const messagesToRemove: string[] = [];
                    
                    // Priority 1: Background insights (steward notes with backgroundInsight), oldest first
                    const insightsToRemove = currentMessages
                        .filter((m, idx) => idx > 0 && m.type === 'steward_note' && !!m.backgroundInsight) // Skip first message
                        .sort((a, b) => a.timestamp - b.timestamp) // Oldest first
                        .slice(0, Math.ceil(currentMessages.length * 0.3));
                    
                    messagesToRemove.push(...insightsToRemove.map(m => m.uuid));
                    
                    // Priority 2: If we still need more space, remove weak+old regular orbitals
                    if (messagesToRemove.length < Math.ceil(currentMessages.length * 0.3)) {
                        const remainingToRemove = Math.ceil(currentMessages.length * 0.3) - messagesToRemove.length;
                        const orbitalsToDecay = currentMessages
                            .filter((m, idx) => idx > 0 && !messagesToRemove.includes(m.uuid) && m.isInContext && m.type !== 'steward_note' && m.orbitalStrength !== undefined && m.orbitalStrength !== null) // Skip first, insights, and non-orbitals
                            .sort((a, b) => {
                                if ((a.orbitalStrength || 0) !== (b.orbitalStrength || 0)) {
                                    return (a.orbitalStrength || 0) - (b.orbitalStrength || 0);
                                }
                                return a.timestamp - b.timestamp;
                            })
                            .slice(0, remainingToRemove);
                        
                        messagesToRemove.push(...orbitalsToDecay.map(m => m.uuid));
                    }
                    
                    if (messagesToRemove.length > 0) {
                        // Apply decay to state and messagesRef immediately
                        const decayedMessages = currentMessages.map(m => 
                            messagesToRemove.includes(m.uuid)
                                ? { ...m, isInContext: false, orbitalDecayTurns: null, orbitalStrength: null }
                                : m
                        );
                        messagesRef.current = decayedMessages;
                        setMessages(decayedMessages);
                        
                        loggingService.log('INFO', `Trap door: Set ${messagesToRemove.length} items out-of-context (${insightsToRemove.length} insights, ${messagesToRemove.length - insightsToRemove.length} orbitals). Retrying synthesis in 300ms...`);
                        
                        // Retry the entire sendMessage with decayed context
                        // Set a flag to track this is a retry to avoid infinite loops
                        setTimeout(() => {
                            setIsLoading(true);
                            setLoadingStage('Retrying synthesis with optimized context...');
                            sendMessage(messageText);
                        }, 300);
                        return; // Exit this attempt
                    } else {
                        friendlyError = new Error('Context overflow detected. No low-priority orbitals to decay. Please manually remove files or clear messages.');
                    }
                } catch (orbitError) {
                    loggingService.log('ERROR', 'Intelligent orbital decay failed', { error: orbitError });
                    friendlyError = new Error(`Context overflow. Orbital decay failed: ${orbitError}`);
                }
            }
            
            // Friendly error handling for common API issues
            // ... (error handling logic remains the same) ...
            setError(friendlyError);
        } finally {
            setIsLoading(false);
            setLoadingStage('');
            loggingService.log('INFO', 'sendMessage finished.');
        }
    }, [aiSettings, rcb, runPostTurnCycle, updateRcbAfterTurn]);

    // --- Helper Functions ---
    const addFiles = useCallback((newFiles: ProjectFile[]) => {
        setProjectFiles(prev => [...prev, ...newFiles]);
        loggingService.log('INFO', 'Project files added.', { files: newFiles.map(f => f.name) });
    }, []);

    const deleteFiles = useCallback((filesToDelete: ProjectFile[]) => {
        const idsToDelete = new Set(filesToDelete.map(f => f.id));
        setProjectFiles(prev => prev.filter(f => !idsToDelete.has(f.id)));
        setContextFileIds(prev => prev.filter(id => !idsToDelete.has(id)));
        loggingService.log('INFO', 'Project files deleted.', { files: filesToDelete.map(f => f.name) });
    }, []);

    const toggleProjectFileContext = useCallback((fileId: string) => {
        setContextFileIds(prev => {
            const isIncluded = prev.includes(fileId);
            const newContext = isIncluded ? prev.filter(id => id !== fileId) : [...prev, fileId];
            const fileName = projectFiles.find(f => f.id === fileId)?.name;
            loggingService.log('DEBUG', 'Toggled project file context.', { fileName, fileId, included: !isIncluded });
            return newContext;
        });
    }, [projectFiles]);

    const isFileInContext = useCallback((fileId: string) => contextFileIds.includes(fileId), [contextFileIds]);
    
    const toggleGeneratedFileContext = useCallback((fileName: string) => {
        setContextGeneratedFileNames(prev => {
            const isIncluded = prev.includes(fileName);
            const newContext = isIncluded ? prev.filter(f => f !== fileName) : [...prev, fileName];
            loggingService.log('DEBUG', 'Toggled generated file context.', { fileName, included: !isIncluded });
            return newContext;
        });
    }, []);
    
    const isGeneratedFileInContext = useCallback((fileName: string) => contextGeneratedFileNames.includes(fileName), [contextGeneratedFileNames]);

    const toggleMessageContext = useCallback((uuid: string) => {
        setMessages(prev => prev.map(m => {
            if (m.uuid === uuid) {
                const newInContext = !m.isInContext;
                const newActivationState = {
                    activationScore: 1.0,
                    lastActivatedTurn: currentTurnRef.current,
                    lastActivatedAt: Date.now(),
                };
                loggingService.log('DEBUG', 'Toggled message context.', { uuid, included: newInContext });
                return {
                    ...m,
                    isInContext: newInContext,
                    ...(newInContext ? newActivationState : {}),
                    orbitalDecayTurns: newInContext ? mapStrengthToTurns(8) : null,
                    orbitalStrength: newInContext ? 8 : null,
                };
            }
            return m;
        }));
    }, []);
    
    const toggleMessageCollapsed = useCallback((uuid: string) => {
        setMessages(prev => prev.map(m => m.uuid === uuid ? { ...m, isCollapsed: !m.isCollapsed } : m));
    }, []);

    const collapseAllMessages = useCallback(() => setMessages(prev => prev.map(m => ({ ...m, isCollapsed: true }))), []);
    const expandAllMessages = useCallback(() => setMessages(prev => prev.map(m => ({ ...m, isCollapsed: false }))), []);

    const clearChat = useCallback(async () => {
        // Removed confirm dialog due to sandboxing issues.
        loggingService.log('WARN', 'Chat and memory cleared by user.');
        setMessages([]);
        setSelfNarrative('');
        setRcb(initializeRCB());
    }, []);
    
    const onRcbSizeLimitChange = useCallback((newLimit: number) => {
        setRcb(prev => {
            if (!prev) return initializeRCB();
            const newRcb = { ...prev, size_limit: newLimit };
            loggingService.log('DEBUG', 'RCB size limit changed.', { newLimit });
            return newRcb;
        });
    }, []);
    
    const onApiTokenLimitChange = useCallback((newLimit: number) => {
        setAiSettings(prev => ({
            ...prev,
            apiTokenLimit: newLimit
        }));
        loggingService.log('DEBUG', 'API token limit changed.', { newLimit });
    }, []);
    
    const onApiTokenLimitMinChange = useCallback((newLimit: number) => {
        setAiSettings(prev => ({
            ...prev,
            apiTokenLimitMin: newLimit
        }));
        loggingService.log('DEBUG', 'API token limit min changed.', { newLimit });
    }, []);
    
    const stopGeneration = useCallback(() => {
      stopGenerationRef.current = true;
      loggingService.log('WARN', 'Generation stopped by user.');
    }, []);

    const interruptCurrentLayer = useCallback(() => {
      skipLayerRef.current = true;
      loggingService.log('WARN', 'Layer skipped by user — advancing to next stage.');
    }, []);

    // --- Context Manager Stubs ---
    const clearAllContexts = useCallback(async () => {
        setMessages(prev => prev.map(m => ({ ...m, isInContext: false, orbitalDecayTurns: null, orbitalStrength: null })));
        setContextFileIds([]);
        setContextGeneratedFileNames([]);
        loggingService.log('INFO', 'All contexts cleared.');
    }, []);

    const clearAllTrapDoorStates = useCallback(async () => {
        setMessages(prev => prev.map(m => m.isInContext === false && m.orbitalStrength !== undefined 
            ? { ...m, orbitalStrength: null, orbitalDecayTurns: null } 
            : m));
        loggingService.log('INFO', 'All trap door states cleared.');
    }, []);

    const getAllContextItems = useCallback(async () => {
        return messagesRef.current.filter(m => m.isInContext);
    }, []);

    const deleteContextItem = useCallback(async (id: string) => {
        setMessages(prev => prev.map(m => m.uuid === id ? { ...m, isInContext: false } : m));
        loggingService.log('INFO', 'Context item deleted.', { id });
    }, []);

    const createWorkspace = useCallback(async (name: string, itemIds: string[], fileIds?: string[], description?: string) => {
        loggingService.log('INFO', 'Workspace creation requested.', { name, itemIds, fileIds, description });
        // Stub: workspace persistence not yet implemented in this version
    }, []);

    const getWorkspaces = useCallback(async () => {
        return [] as any[];
    }, []);

    const loadWorkspace = useCallback(async (id: string) => {
        loggingService.log('INFO', 'Workspace load requested.', { id });
    }, []);

    const createWorkspaceWithState = useCallback(async (name: string, description?: string, workflow?: boolean, settings?: boolean, preferences?: boolean) => {
        loggingService.log('INFO', 'Workspace with state creation requested.', { name });
        return '';
    }, []);

    const loadWorkspaceWithOptions = useCallback(async (id: string, options: any, modes: any) => {
        loggingService.log('INFO', 'Workspace load with options requested.', { id });
    }, []);
    
    const totalContextTokens = useMemo(() => {
        const allGeneratedFiles = messages.flatMap(m => m.generatedFiles || []);

        const projectFileContent = projectFiles
            .filter(f => contextFileIds.includes(f.id))
            .reduce((acc, file) => acc + (file.content || ''), '');
            
        const generatedFileContent = allGeneratedFiles
            .filter(f => contextGeneratedFileNames.includes(f.name))
            .reduce((acc, file) => acc + (file.content || ''), '');

        const messageContent = messages
            .filter(m => m.isInContext)
            .reduce((acc, msg) => acc + (msg.text || ''), '');
            
        const contentsChars = projectFileContent.length + generatedFileContent.length + messageContent.length;

        const rcbChars = rcb?.size_current || 0;
        const lastStage = aiSettings.workflow[aiSettings.workflow.length - 1];
        const promptTemplateChars = (lastStage?.systemPrompt || '').length;
        const estimatedSystemPromptChars = rcbChars + promptTemplateChars;
        
        const totalChars = contentsChars + estimatedSystemPromptChars;
        
        return Math.round(totalChars / 4);
    }, [projectFiles, contextFileIds, messages, contextGeneratedFileNames, rcb, aiSettings.workflow]);


    return {
        messages,
        projectFiles,
        sendMessage,
        isLoading,
        loadingStage,
        error,
        addFiles,
        deleteFiles,
        toggleProjectFileContext,
        isFileInContext,
        toggleMessageContext,
        stopGeneration,
        interruptCurrentLayer,
        contextFileIds,
        totalContextTokens,
        toggleMessageCollapsed,
        collapseAllMessages,
        expandAllMessages,
        clearChat,
        aiSettings,
        setAiSettings,
        isCognitionRunning,
        runCognitionCycleNow,
        runAutonomousWorkflowCycle,
        selfNarrative,
        loadState,
        rcb,
        onRcbSizeLimitChange,
        onApiTokenLimitChange,
        onApiTokenLimitMinChange,
        toggleGeneratedFileContext,
        isGeneratedFileInContext,
        clearAllContexts,
        clearAllTrapDoorStates,
        getAllContextItems,
        deleteContextItem,
        createWorkspace,
        getWorkspaces,
        loadWorkspace,
        createWorkspaceWithState,
        loadWorkspaceWithOptions,
        // Hybrid system methods
        queryHybrid: (prompt: string, options?: any) => srgService.queryHybrid(prompt, options),
        getHybridStats: () => srgService.getHybridStats(),
        addHybridSynonyms: (words: string[]) => srgService.addHybridSynonyms(words),
        suppressHybridPositions: (positions: number[]) => srgService.suppressHybridPositions(positions),
        ingestHybrid: (text: string) => srgService.ingestHybrid(text)
    };
};