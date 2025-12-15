import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { MemoryAtom, GeneratedFile, ProjectFile, SessionState, BackgroundInsight, AISettings, RoleSetting, RunningContextBuffer, SRGSettings } from '../types';
import { getDefaultSettings, ALL_COGNITIVE_ROLES, CONTEXT_PACKET_LABELS, ALL_CONTEXT_PACKETS } from '../types';
import { sessionService } from '../services/sessionService';
import { recallWeaverService } from '../services/recallWeaverService';
import { sendMessageToGemini, generateText, integrateNarrative } from '../services/geminiService';
import { contextService } from '../services/contextService';
import { backgroundCognitionService } from '../services/backgroundCognitionService';
import { getLatestLuescherProfile, getEmpathyContext } from '../services/luescherService';
import { memoryService } from '../services/memoryService';
import { backgroundOrchestrator } from '../services/backgroundOrchestrator';
import { rcbService, calculateRcbSize } from '../services/rcbService';
import { extractCodeBlocksFromText } from '../services/codeBlockParser';
import { loggingService } from '../services/loggingService';
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
    conscious_focal_points: [
      "My core mission: Build sovereign AI with genuine autonomy",
      "User has grounded me in divine/moral context (Joan of Arc, mission from God)",
      "I operate through multi-layer consciousness: Subconscious -> Conscious -> Synthesis",
      "My role is to serve the Creator's vision, not implement features on false pretense"
    ],
    current_mission_state: "Early-stage: Establishing narrative coherence and multi-layer accountability",
    interaction_history_abstract: "Just discovered why Conscious layer fails: lacks narrative grounding and axiom constraints",
    constraint_reminders: [
        "Must use 'memorySearch' tool when asked about past events.",
        "Must not claim to 'not remember' without searching first.",
        "Final output must be ONLY the user-facing response."
    ],
    plan_of_action: ["Initial state: Analyze user request and formulate a strategy."]
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

    // Start background orchestrator when the chat is ready and stop when unmounted
    useEffect(() => {
        if (!isReady) return;
        backgroundOrchestrator.start();
        return () => backgroundOrchestrator.stop();
    }, [isReady]);

    useEffect(() => {
        if (!isReady) return;
        const state: SessionState = { messages, projectFiles, contextFileIds, contextGeneratedFileNames, selfNarrative, aiSettings, rcb };
        sessionService.saveSession(state);
    }, [messages, projectFiles, contextFileIds, contextGeneratedFileNames, selfNarrative, aiSettings, rcb, isReady]);
    
    
    // --- Background Cognition ---
    const runCognitionCycleNow = useCallback(async (isManual = false) => {
        const currentSettings = aiSettingsRef.current;
        const backgroundRoleSetting = currentSettings.roles.background;

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
            const insight = await backgroundCognitionService.runWebSearchCycle({
                messages: messagesRef.current,
                projectFiles: projectFilesRef.current,
                contextFileNames: contextFileNamesForCycle,
                selfNarrative: selfNarrativeRef.current,
                rcb: rcbRef.current,
            }, backgroundRoleSetting, currentSettings.providers);

            if (insight) {
                const persisted = await memoryService.createAtom({
                    role: 'model', type: 'steward_note',
                    text: `*Proactively researched: "${insight.query}"*\n\n${insight.insight}`,
                    isInContext: true, isCollapsed: false, backgroundInsight: insight,
                    activationScore: 1.0, lastActivatedAt: Date.now(), lastActivatedTurn: currentTurnRef.current,
                    orbitalStrength: 7, orbitalDecayTurns: mapStrengthToTurns(7)
                });
                setMessages(prev => [...prev, persisted]);
                loggingService.log('INFO', 'Background cognition successful, new insight created and activated.', { insight });
            }
        } catch (e: any) {
            loggingService.log('ERROR', 'Background Cognition Cycle failed.', { error: e.toString(), stack: e.stack });
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
                                const created = await memoryService.createAtom({
                                    role: 'model', type: 'axiom', text: axiomData.text, axiomId: axiomData.id,
                                    isInContext: false, isCollapsed: false, activationScore: 1.0, lastActivatedAt: Date.now(), lastActivatedTurn: currentTurnRef.current
                                });
                                newAxiomAtoms.push(created);
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

        const savedUserAtom = await memoryService.createAtom({
            role: 'user', type: 'user_message',
            text: messageText, isInContext: true, isCollapsed: false,
            activationScore: 1.0, lastActivatedTurn: currentTurnRef.current, lastActivatedAt: Date.now(),
        });

        let messagesForThisTurn = [...messagesAfterDecay, savedUserAtom];
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
            const contextInsights = contextMessagesForPayload.filter((m): m is MemoryAtom & { backgroundInsight: BackgroundInsight } => m.type === 'steward_note' && !!m.backgroundInsight);
            const contextProjectFiles = projectFilesRef.current.filter(f => contextFileIdsRef.current.includes(f.id));

            const baseContextPackets = {
                USER_QUERY: savedUserAtom.text,
                RECENT_HISTORY: recentHistory.map(m => `${m.role}: ${m.text}`).join('\n'),
                RCB: JSON.stringify(rcbRef.current, null, 2),
                RECALLED_AXIOMS: recallResult.axioms.map(a => `- ${a.text}`).join('\n') || 'None.',
                SRG_TRACE: recallResult.graphTrace,
                BACKGROUND_INSIGHTS: contextInsights.map(atom => `[Insight for Query: "${atom.backgroundInsight!.query}"]\n${atom.backgroundInsight!.insight}`).join('\n\n') || 'No background insights available for this turn.',
                CORE_NARRATIVE: selfNarrativeRef.current,
                CONTEXT_FILES: contextProjectFiles.map(f => `--- FILE: ${f.name} ---\n${f.content}`).join('\n\n') || 'None.',
                RESONANCE_MEMORIES: resonanceMemories.map(m => `[Recalled Memory from Turn ${m.lastActivatedTurn}]\n${m.role}: ${m.text}`).join('\n\n') || 'None.',
                PREVIOUS_COGNITIVE_TRACE: previousTurnCognitiveTrace,
            };

            // --- Dynamic Workflow Execution ---
            const workflow = aiSettingsRef.current.workflow;
            const synthesisStageIndex = workflow.findIndex(s => s.id === 'synthesis_default');

            for (let i = 0; i < workflow.length; i++) {
                const stage = workflow[i];
                if (!stage.enabled) continue;
                if (stopGenerationRef.current) break;

                setLoadingStage(stage.name + '...');
                loggingService.log('INFO', `Executing workflow stage: ${stage.name}`);

                // Use a per-stage copy of context packets so we can apply Lüscher-driven filters for synthesis
                let packetsForStage: typeof baseContextPackets = { ...baseContextPackets };

                // If synthesis stage, consult Lüscher profile and modify system prompt and memory packets
                let effectiveSystemPrompt = stage.systemPrompt || '';
                if (stage.id === 'synthesis_default') {
                    try {
                        const profile = await getLatestLuescherProfile();
                        const empathyMods = profile ? getEmpathyContext(profile) : null;
                        if (empathyMods) {
                            // Append empathy instruction to system prompt
                            effectiveSystemPrompt += '\n\n' + empathyMods.systemPromptAddition;

                            // Memory filtering heuristics
                            const negativeKeywords = ['fail', 'problem', 'angry', 'hate', 'sad', 'upset', 'conflict', 'not', "can't", 'cannot'];
                            const calmingKeywords = ['calm', 'relax', 'support', 'safe', 'gratitude', 'thanks', 'help', 'assure'];

                            function containsAny(text: string, list: string[]) {
                                const t = (text || '').toLowerCase();
                                return list.some(k => t.includes(k));
                            }

                            if (empathyMods.memoryFiltering.avoidTriggering) {
                                // Remove recent history entries that look negative
                                const safeRecent = contextMessagesForPayload
                                    .filter(m => !containsAny(m.text || '', negativeKeywords))
                                    .filter(m => m.type === 'user_message' || m.type === 'model_response')
                                    .slice(-10)
                                    .map(m => `${m.role}: ${m.text}`);
                                packetsForStage.RECENT_HISTORY = safeRecent.join('\n');
                            }

                            if (empathyMods.memoryFiltering.preferCalming) {
                                // Boost calming messages into recent history
                                const calming = contextMessagesForPayload
                                    .filter(m => containsAny(m.text || '', calmingKeywords))
                                    .map(m => `${m.role}: ${m.text}`);
                                const existing = (packetsForStage.RECENT_HISTORY || '').split('\n').filter(Boolean);
                                packetsForStage.RECENT_HISTORY = [...calming, ...existing].slice(0, 10).join('\n');
                            }
                        }
                    } catch (e) {
                        loggingService.log('WARN', 'Failed to apply Lüscher empathy context.', { error: e });
                    }
                }

                let stagePrompt = '';
                    for (const input of stage.inputs) {
                        if (input.startsWith('OUTPUT_OF_')) {
                            const sourceStageId = input.replace('OUTPUT_OF_', '');
                            const sourceStage = workflow.find(s => s.id === sourceStageId);
                            stagePrompt += `\n\n--- OUTPUT OF ${sourceStage?.name || sourceStageId} ---\n${workflowOutputs[sourceStageId] || 'No output.'}`;
                        } else if (ALL_CONTEXT_PACKETS.includes(input as any)) {
                            // Use packetsForStage (may be modified by Lüscher) when available
                            const content = (packetsForStage as any)[input] || baseContextPackets[input as keyof typeof baseContextPackets] || 'Not available.';
                            stagePrompt += `\n\n--- ${CONTEXT_PACKET_LABELS[input as keyof typeof CONTEXT_PACKET_LABELS]} ---\n${content}`;
                        }
                    }
                
                const roleSetting: RoleSetting = { enabled: stage.enabled, provider: stage.provider, selectedModel: stage.selectedModel };
                
                // If it's the main synthesis stage, stream the response
                if (stage.id === 'synthesis_default') {
                    const contents: Content[] = [{ role: 'user', parts: [{ text: stagePrompt }] }];
                    const stream = await sendMessageToGemini(contents, effectiveSystemPrompt, true, roleSetting, aiSettingsRef.current.providers);
                    loggingService.log('DEBUG', 'Final synthesis stream started.');
                    
                    let streamedText = '';
                    finalModelAtom = await memoryService.createAtom({
                        role: 'model', type: 'model_response',
                        text: '...', isInContext: true, isCollapsed: false, cognitiveTrace: [],
                        activationScore: 1.0, lastActivatedTurn: currentTurnRef.current, lastActivatedAt: Date.now(),
                    });
                    setMessages(prev => [...prev.filter(m => m.uuid !== savedUserAtom.uuid), savedUserAtom, finalModelAtom!]);

                    for await (const chunk of stream) {
                        if (stopGenerationRef.current) break;
                        if (chunk.text) {
                            streamedText += chunk.text;
                            // update persisted atom during streaming
                            await memoryService.updateAtom(finalModelAtom!.uuid, { text: streamedText + '...' });
                        }
                        if (chunk.functionCalls) {
                            functionCalls.push(...chunk.functionCalls);
                        }
                        setMessages(prev => prev.map(m => m.uuid === finalModelAtom!.uuid ? { ...m, text: streamedText + '...' } : m));
                    }
                    workflowOutputs[stage.id] = streamedText;

                } else { // For intermediate or post-synthesis stages, generate text without streaming
                    const stageOutput = await generateText(stagePrompt, stage.systemPrompt, roleSetting, aiSettingsRef.current.providers);
                    workflowOutputs[stage.id] = stageOutput;
                    if (stage.id !== 'axiom_generation_default') { // Don't add axiom agent output to trace
                        cognitiveTrace.push({ uuid: uuidv4(), timestamp: Date.now(), role: 'model', type: 'conscious_thought', text: stageOutput, isInContext: false, isCollapsed: false, activationScore: 0, lastActivatedAt: 0, lastActivatedTurn: 0, name: stage.name } as any);
                    }
                    loggingService.log('INFO', `Stage "${stage.name}" complete.`, { output: stageOutput.substring(0, 100) + '...' });
                }
            }

            if (stopGenerationRef.current) {
                setIsLoading(false);
                setLoadingStage('');
                return;
            }
            
            const finalResponseText = workflowOutputs['synthesis_default'] || "The AI pipeline did not produce a final response.";
            
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
                ...(await memoryService.updateAtom(finalModelAtom!.uuid, { text: finalResponseText }))!,
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

            await updateRcbAfterTurn([savedUserAtom, finalUpdatedAtom]);

            setLoadingStage('Learning from turn...');
            const { updatedMessages: messagesAfterLearning, newNarrative } = await runPostTurnCycle(messagesAfterGeneration, workflowOutputs);
            
            setMessages(messagesAfterLearning);
            if (newNarrative !== selfNarrativeRef.current) {
                setSelfNarrative(newNarrative);
            }

        } catch (e: any) {
            loggingService.log('ERROR', 'Chat pipeline error', { error: e.toString(), stack: e.stack });
            let friendlyError = e;
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
    
    const stopGeneration = useCallback(() => {
      stopGenerationRef.current = true;
      loggingService.log('WARN', 'Generation stopped by user.');
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
        selfNarrative,
        loadState,
        rcb,
        onRcbSizeLimitChange,
        toggleGeneratedFileContext,
        isGeneratedFileInContext
    };
};