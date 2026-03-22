
import React, { useState, useRef, useEffect } from 'react';
import { AISettings, AIProvider, WorkflowStage } from '../types';
import { CloseIcon, ChevronDownIcon, SettingsIcon } from './icons/index';
import { ReflexHUD } from './ReflexHUD';
import { generateText } from '../services/geminiService';
import { workOrderService } from '../services/workOrderService';
import { fuzzyCommandCaptureService } from '../services/fuzzyCommandCaptureService';
import { ralphCalibrationService } from '../services/ralphCalibrationService';
import { CalibrationWizardModal } from './CalibrationWizardModal';

interface BackgroundCognitionModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AISettings;
    onUpdateSettings: (newSettings: AISettings) => void;
}

export const BackgroundCognitionModal: React.FC<BackgroundCognitionModalProps> = ({
    isOpen,
    onClose,
    settings,
    onUpdateSettings,
}) => {
    const [leftOpen, setLeftOpen] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'agent'; text: string }[]>([]);
    const [agentThinking, setAgentThinking] = useState(false);
    
    // Calibration wizard state
    const [showCalibrationWizard, setShowCalibrationWizard] = useState(false);
    const [calibrationModelId, setCalibrationModelId] = useState('');
    const [calibrationModelName, setCalibrationModelName] = useState('');
    const [lastSeenBackgroundModel, setLastSeenBackgroundModel] = useState(settings.roles.background?.selectedModel || '');
    const [modelVerificationErrors, setModelVerificationErrors] = useState<Record<string, string>>({});
    const [lastVerifiedModels, setLastVerifiedModels] = useState<Record<string, string>>({});

    /**
     * Verify that a model exists and can respond
     * Returns true if model is verified and ready, false if offline/missing
     */
    const verifyModel = async (modelId: string, provider: AIProvider): Promise<boolean> => {
        try {
            // Quick test: try a simple generateText call with 5-second timeout
            const timeoutPromise = new Promise<boolean>((_, reject) =>
                setTimeout(() => reject(new Error('Model verification timeout (5s) - Model may be offline')), 5000)
            );

            const testPromise = (async () => {
                await generateText(
                    'Respond with just the word: OK',
                    'You are a helpful assistant.',
                    { enabled: true, provider, selectedModel: modelId },
                    settings.providers
                );
                return true;
            })();

            await Promise.race([testPromise, timeoutPromise]);
            return true;
        } catch (error) {
            return false;
        }
    };

    /**
     * Verify the BACKGROUND cognitive role model on modal open or when settings change.
     * Only checks the model actively selected for background cognition, not all roles.
     */
    useEffect(() => {
        if (!isOpen || !settings.roles) return;

        const verifyBackgroundModel = async () => {
            const newErrors: Record<string, string> = {};
            const newVerified: Record<string, string> = {};

            const bgRole = settings.roles.background;
            if (!bgRole || !bgRole.enabled || !bgRole.selectedModel) {
                setModelVerificationErrors({});
                return;
            }

            // Skip if we already verified this exact model
            if (lastVerifiedModels['background'] === bgRole.selectedModel) {
                return;
            }

            const isVerified = await verifyModel(bgRole.selectedModel, bgRole.provider);

            if (!isVerified) {
                newErrors['background'] = `Background model "${bgRole.selectedModel}" verification failed - may be offline or unreachable`;
            }

            newVerified['background'] = bgRole.selectedModel;

            setModelVerificationErrors(newErrors);
            setLastVerifiedModels(newVerified);
        };

        verifyBackgroundModel();
    }, [isOpen, settings.roles]);

    /**
     * Detect when a new background model is configured
     * Verify it before showing calibration wizard
     */
    useEffect(() => {
        if (!isOpen) return;

        const currentModel = settings.roles.background?.selectedModel || '';
        
        // Skip if no model is set
        if (!currentModel) return;
        
        // Skip if this is the same model we already checked
        if (currentModel === lastSeenBackgroundModel) return;

        // First check if model needs calibration
        if (!ralphCalibrationService.needsCalibration(currentModel)) {
            setLastSeenBackgroundModel(currentModel);
            return;
        }

        // Verify the model is online before opening wizard
        const verifyAndOpenWizard = async () => {
            const isVerified = await verifyModel(currentModel, settings.roles.background?.provider || 'gemini');
            
            if (isVerified) {
                setCalibrationModelId(currentModel);
                setCalibrationModelName(currentModel);
                setShowCalibrationWizard(true);
            } else {
                // Model is offline - don't open wizard, just mark as checked
                // User will see the error message and can retry with "Retry Calibration" button
                setModelVerificationErrors(prev => ({
                    ...prev,
                    background: `Background model "${currentModel}" verification failed - may be offline or unreachable`
                }));
            }
            
            setLastSeenBackgroundModel(currentModel);
        };

        verifyAndOpenWizard();
    }, [isOpen, settings.roles.background?.selectedModel, lastSeenBackgroundModel]);

    const handleCalibrationComplete = () => {
        // Calibration is saved automatically by the wizard
        // Just close the wizard
        setShowCalibrationWizard(false);
    };


    const executeRalphCommands = (text: string) => {
        // Fuzzy extraction: catch work orders in any format
        const fuzzyCommands = fuzzyCommandCaptureService.extractWorkOrderCommands(text);
        for (const cmd of fuzzyCommands) {
            if (cmd.type === 'work_order' && cmd.payload?.title) {
                workOrderService.createWorkOrder(cmd.payload.title, cmd.payload.description || '');
            }
        }

        // Also try strict format: CREATE_WORK_ORDER: title="..." description="..."
        const createMatches = [...text.matchAll(/CREATE_WORK_ORDER:\s*title="([^"]+)"\s*description="([^"]+)"/gi)];
        for (const m of createMatches) {
            workOrderService.createWorkOrder(m[1], m[2]);
        }

        // Completion patterns: "COMPLETE:" "DONE:" "FINISHED:" or exact format
        const completeMatches = [
            ...text.matchAll(/COMPLETE_WORK_ORDER:\s*id="([^"]+)"/gi),
            ...text.matchAll(/(?:complete|finish|done)\s*(?:work\s*order|task|order)?:\s*([a-z0-9_]+)/gi),
        ];
        for (const m of completeMatches) {
            const id = m[1];
            if (id && id.startsWith('wo_')) {
                workOrderService.setCompleted(id);
            }
        }

        // Rejection patterns: "REJECT:" "REFUSE:" or exact format
        const rejectMatches = [
            ...text.matchAll(/REJECT_WORK_ORDER:\s*id="([^"]+)"\s*reason="([^"]+)"/gi),
            ...text.matchAll(/(?:reject|refuse)\s*(?:work\s*order|task|order)?:\s*([a-z0-9_]+)\s*(?:reason|because)?:?\s*(.+?)(?=\n|$)/gi),
        ];
        for (const m of rejectMatches) {
            const id = m[1];
            const reason = m[2] || 'Rejected by Ralph';
            if (id && id.startsWith('wo_')) {
                workOrderService.setRejected(id, reason);
            }
        }

        // Null patterns: "NULL:" "VOID:" or exact format
        const nullMatches = [
            ...text.matchAll(/NULL_WORK_ORDER:\s*id="([^"]+)"/gi),
            ...text.matchAll(/(?:null|void|cancel)\s*(?:work\s*order|task|order)?:\s*([a-z0-9_]+)/gi),
        ];
        for (const m of nullMatches) {
            const id = m[1];
            if (id && id.startsWith('wo_')) {
                workOrderService.setUnresolved(id, 'Nulled by Ralph');
            }
        }

        // Update patterns: exact format only (complex to fuzzy match)
        const updateMatches = [...text.matchAll(/UPDATE_WORK_ORDER:\s*id="([^"]+)"\s*title="([^"]+)"\s*description="([^"]+)"/gi)];
        for (const m of updateMatches) {
            const wo = workOrderService.get(m[1]);
            if (wo) {
                wo.title = m[2];
                wo.description = m[3];
                wo.updatedAt = Date.now();
            }
        }
    };

    const sendToAgent = async () => {
        if (!chatInput.trim() || agentThinking) return;
        const userMsg = chatInput.trim();
        setChatInput('');
        setChatHistory(h => [...h, { role: 'user', text: userMsg }]);
        setAgentThinking(true);
        try {
            const bgRole = settings.roles.background;

            // Build work order context so Ralph knows what exists
            const allOrders = workOrderService.getAll();
            const woContext = allOrders.length > 0
                ? `\n\nCURRENT WORK ORDERS:\n` + allOrders.map(wo =>
                    `  [${wo.id}] ${wo.title} — STATUS: ${wo.status}${wo.description ? ' | ' + wo.description.slice(0, 80) : ''}`
                  ).join('\n')
                : `\n\nCURRENT WORK ORDERS: none`;

            const RALPH_SYSTEM = `You are Ralph, the Background Foreman of this AI system.
You manage work orders, run code maintenance tasks, and oversee the cognitive background loop.

AVAILABLE AGENTS:
You can delegate tasks to specialized agents by addressing them by name:
  • Brave: Web search agent.
  • Mirror-Mirror: Memory and SRG recall agent.
  • Scout: Playwright navigation agent. Direct page access and content extraction.

Address agents by name when you need their help: "Hey [Agent Name], [your request]"

You can execute work order commands by including them ANYWHERE in your reply, formatted exactly like this:
  CREATE_WORK_ORDER: title="<title>" description="<description>"
  COMPLETE_WORK_ORDER: id="<order_id>"
  REJECT_WORK_ORDER: id="<order_id>" reason="<reason>"
  NULL_WORK_ORDER: id="<order_id>"
  UPDATE_WORK_ORDER: id="<order_id>" title="<new_title>" description="<new_description>"

You may include multiple commands. Commands will be parsed and executed automatically.
After issuing commands, confirm what you did in plain language.${woContext}`;

            const historyContext = chatHistory.slice(-6)
                .map(m => `${m.role === 'user' ? 'User' : 'Ralph'}: ${m.text}`)
                .join('\n');
            const prompt = historyContext ? `${historyContext}\nUser: ${userMsg}` : userMsg;

            const reply = await generateText(prompt, RALPH_SYSTEM, bgRole, settings.providers);

            // ── Parse and execute Ralph's work order commands (fuzzy matching) ──
            executeRalphCommands(reply);

            setChatHistory(h => [...h, { role: 'agent', text: reply }]);
        } catch (err: any) {
            setChatHistory(h => [...h, { role: 'agent', text: `[ERROR] ${err?.message || 'Failed to reach Ralph.'}` }]);
        } finally {
            setAgentThinking(false);
        }
    };

    if (!isOpen || !settings || !settings.roles) return null;

    const backgroundRole = settings.roles.background || {
        enabled: true,
        provider: 'gemini',
        selectedModel: 'gemini-2.5-flash'
    };

    const rateInMinutes = settings.backgroundCognitionRate ? Math.floor(settings.backgroundCognitionRate / 60) : 60;

    // ── Code Maintenance stage helpers ──────────────────────────────────────
    const codeMaintenanceStage: WorkflowStage = (settings.backgroundWorkflow || []).find(s => s.id === 'code_maintenance') || {
        id: 'code_maintenance',
        name: 'Code Maintenance & Self-Improvement',
        enabled: false,
        provider: 'lmstudio',
        selectedModel: '',
        systemPrompt: '',
        inputs: [],
        enableTimedCycle: false,
        timerSeconds: 600,
    };

    const updateCodeMaintenanceStage = (patch: Partial<WorkflowStage>) => {
        const newSettings = { ...settings };
        const bw = [...(newSettings.backgroundWorkflow || [])];
        const idx = bw.findIndex(s => s.id === 'code_maintenance');
        const updated = { ...codeMaintenanceStage, ...patch };
        if (idx >= 0) bw[idx] = updated; else bw.push(updated);
        newSettings.backgroundWorkflow = bw;
        onUpdateSettings(newSettings);
    };

    const handleToggleEnabled = () => {
        const newSettings = { ...settings };
        if (!newSettings.roles.background) newSettings.roles.background = { ...backgroundRole };
        newSettings.roles.background.enabled = !newSettings.roles.background.enabled;
        onUpdateSettings(newSettings);
    };

    const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newSettings = { ...settings };
        if (!newSettings.roles.background) newSettings.roles.background = { ...backgroundRole };
        newSettings.roles.background.provider = e.target.value as AIProvider;
        onUpdateSettings(newSettings);
    };

    const handleModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSettings = { ...settings };
        if (!newSettings.roles.background) newSettings.roles.background = { ...backgroundRole };
        newSettings.roles.background.selectedModel = e.target.value;
        onUpdateSettings(newSettings);
    };

    const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const mins = parseInt(e.target.value);
        if (!isNaN(mins) && mins > 0) {
            const newSettings = { ...settings };
            newSettings.backgroundCognitionRate = mins * 60;
            onUpdateSettings(newSettings);
        }
    };

    const PROVIDERS: { value: AIProvider; label: string }[] = [
        { value: 'gemini', label: 'Google Gemini' },
        { value: 'fireworks', label: 'Fireworks AI' },
        { value: 'perplexity', label: 'Perplexity' },
        { value: 'lmstudio', label: 'LM Studio (Local)' },
        { value: 'grok', label: 'xAI Grok' },
    ];

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-gray-950 border border-cyan-500/30 rounded-lg shadow-2xl w-full max-w-[1400px] h-[90vh] flex flex-col overflow-hidden">

                {/* Model Verification Status Bar */}
                {Object.keys(modelVerificationErrors).length > 0 && (
                    <div className="bg-red-900/40 border-b border-red-700 px-4 py-2">
                        <div className="space-y-1">
                            {Object.entries(modelVerificationErrors).map(([role, error]) => (
                                <div key={role} className="text-xs text-red-300">
                                    ⚠️ {error}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Content row: left strip + HUD + close button — flex-1, fills above the status bar */}
                <div className="flex flex-1 min-h-0 relative">

                {/* Left Panel: Configuration — collapsible */}
                {leftOpen ? (
                <div className="w-[350px] flex-shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col transition-all duration-200">
                    <div className="p-4 border-b border-gray-800 flex items-center gap-2">
                        <SettingsIcon />
                        <h2 className="text-lg font-bold text-cyan-400 flex-1">Background Control</h2>
                        {/* Collapse left */}
                        <button
                            onClick={() => setLeftOpen(false)}
                            title="Collapse panel"
                            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-cyan-300 transition-colors"
                        >
                            <span style={{ display: 'inline-block', transform: 'rotate(90deg)' }}>
                                <ChevronDownIcon size={16} />
                            </span>
                        </button>
                    </div>

                    <div className="p-4 space-y-6 overflow-y-auto flex-1 custom-scrollbar">

                        {/* ── Master Switch ── */}
                        <div className="flex items-center justify-between bg-gray-800/80 p-3 rounded-lg border border-gray-700">
                            <div>
                                <h3 className="font-semibold text-gray-200 text-sm">Active State</h3>
                                <p className="text-xs text-gray-400">Enable autonomous cycles</p>
                            </div>
                            <button
                                onClick={handleToggleEnabled}
                                className={`w-10 h-5 rounded-full transition-colors relative ${backgroundRole.enabled ? 'bg-cyan-600' : 'bg-gray-600'}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${backgroundRole.enabled ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>

                        {/* ── Frequency ── */}
                        <div className="space-y-2">
                            <label className="block text-xs uppercase font-bold text-gray-500 tracking-wider">Cycle Frequency (Min)</label>
                            <input
                                type="number" min="1" value={rateInMinutes} onChange={handleRateChange}
                                className="w-full bg-black/20 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 focus:outline-none text-sm"
                            />
                        </div>

                        <div className="border-t border-gray-800" />

                        {/* ── Cognition Agent ── */}
                        <div className="space-y-4">
                            <h3 className="font-semibold text-cyan-500 text-xs uppercase tracking-wider">Cognition Agent</h3>
                            <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-400">Provider</label>
                                <select value={backgroundRole.provider} onChange={handleProviderChange}
                                    className="w-full bg-black/20 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 focus:outline-none text-sm">
                                    {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-400">Model ID</label>
                                <div className="flex gap-2">
                                    <input type="text" value={backgroundRole.selectedModel} onChange={handleModelChange}
                                        placeholder="e.g. gemini-2.5-flash"
                                        className="flex-1 bg-black/20 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 focus:outline-none text-sm"
                                    />
                                    <button
                                        onClick={() => {
                                            // Verify model is online, then open wizard
                                            const verifyAndRetry = async () => {
                                                const isVerified = await verifyModel(backgroundRole.selectedModel, backgroundRole.provider);
                                                if (isVerified) {
                                                    setLastSeenBackgroundModel('');
                                                    setCalibrationModelId(backgroundRole.selectedModel);
                                                    setCalibrationModelName(backgroundRole.selectedModel);
                                                    setShowCalibrationWizard(true);
                                                    // Clear error if verification succeeds
                                                    setModelVerificationErrors(prev => {
                                                        const next = { ...prev };
                                                        delete next.background;
                                                        return next;
                                                    });
                                                }
                                            };
                                            verifyAndRetry();
                                        }}
                                        title="Verify model is online, then retry calibration"
                                        className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-xs font-semibold whitespace-nowrap transition-colors"
                                    >
                                        Retry Calibration
                                    </button>
                                </div>
                                {modelVerificationErrors.background && (
                                    <div className="p-2 bg-red-900/50 border border-red-700 rounded text-xs text-red-300">
                                        ⚠️ {modelVerificationErrors.background}
                                    </div>
                                )}
                            </div>
                            </div>

                        <div className="border-t border-gray-800" />

                        {/* ── Code Maintenance Agent ── */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-purple-400 text-xs uppercase tracking-wider">Code Maintenance Agent</h3>
                                <button
                                    onClick={() => updateCodeMaintenanceStage({ enabled: !codeMaintenanceStage.enabled })}
                                    className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${codeMaintenanceStage.enabled ? 'bg-purple-600' : 'bg-gray-600'}`}
                                >
                                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${codeMaintenanceStage.enabled ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-400">Provider</label>
                                <select
                                    value={codeMaintenanceStage.provider}
                                    onChange={e => updateCodeMaintenanceStage({ provider: e.target.value as AIProvider })}
                                    className="w-full bg-black/20 border border-gray-700 rounded p-2 text-white focus:border-purple-500 focus:outline-none text-sm"
                                >
                                    {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-400">Model ID</label>
                                <input
                                    type="text"
                                    value={codeMaintenanceStage.selectedModel}
                                    onChange={e => updateCodeMaintenanceStage({ selectedModel: e.target.value })}
                                    placeholder="e.g. qwen2.5-coder-7b"
                                    className="w-full bg-black/20 border border-gray-700 rounded p-2 text-white focus:border-purple-500 focus:outline-none text-sm"
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-gray-400">Auto-run on timer</label>
                                <button
                                    onClick={() => updateCodeMaintenanceStage({ enableTimedCycle: !codeMaintenanceStage.enableTimedCycle })}
                                    className={`w-10 h-5 rounded-full transition-colors relative ${codeMaintenanceStage.enableTimedCycle ? 'bg-purple-600' : 'bg-gray-600'}`}
                                >
                                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${codeMaintenanceStage.enableTimedCycle ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>

                            {codeMaintenanceStage.enableTimedCycle && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-medium text-gray-400">Interval (seconds)</label>
                                    <input
                                        type="number" min="60"
                                        value={codeMaintenanceStage.timerSeconds || 600}
                                        onChange={e => updateCodeMaintenanceStage({ timerSeconds: parseInt(e.target.value) || 600 })}
                                        className="w-full bg-black/20 border border-gray-700 rounded p-2 text-white focus:border-purple-500 focus:outline-none text-sm"
                                    />
                                </div>
                            )}

                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('trigger-code-maintenance'))}
                                className="w-full px-3 py-2 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-800 text-purple-300 font-mono text-xs rounded transition-colors uppercase tracking-wide"
                            >
                                [RUN CODE MAINTENANCE NOW]
                            </button>
                        </div>

                        {/* ── Manual Triggers ── */}
                        <div className="pt-2 space-y-2">
                            <button
                                onClick={() => window.dispatchEvent(new CustomEvent('trigger-background-cycle'))}
                                className="w-full px-3 py-2 bg-cyan-900/40 hover:bg-cyan-900/60 border border-cyan-800 text-cyan-300 font-mono text-xs rounded transition-colors uppercase tracking-wide"
                            >
                                [INITIATE CYCLIC SEQUENCE]
                            </button>
                        </div>
                    </div>
                </div>
                ) : (
                    <div className="w-12 flex-shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col items-center py-4 gap-4">
                    {/* Gear icon = open settings */}
                    <button
                        onClick={() => setLeftOpen(true)}
                        title="Open Background Control"
                        className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-cyan-300 transition-colors"
                    >
                        <SettingsIcon />
                    </button>
                    {/* Tri-color status dot: green=active, yellow=paused, red=misconfigured */}
                    {(() => {
                        const misconfigured = !backgroundRole.selectedModel || backgroundRole.selectedModel.trim() === '';
                        const paused = !backgroundRole.enabled;
                        const dotClass = misconfigured
                            ? 'bg-red-500'
                            : paused
                                ? 'bg-yellow-400'
                                : 'bg-green-500 animate-pulse';
                        const dotTitle = misconfigured
                            ? 'Error: no model configured'
                            : paused
                                ? 'Paused'
                                : 'Active';
                        return (
                            <div
                                className={`w-2.5 h-2.5 rounded-full ${dotClass}`}
                                title={dotTitle}
                            />
                        );
                    })()}
                    </div>
                )}

                {/* Right Panel: Unified HUD + Chat Stream */}
                <div className="flex-1 relative min-h-0">
                    <ReflexHUD
                        isOpen={true}
                        onClose={() => {}}
                        embedded={true}
                        chatInput={chatInput}
                        onChatInputChange={setChatInput}
                        onSendMessage={sendToAgent}
                        chatHistory={chatHistory}
                        agentThinking={agentThinking}
                    />
                </div>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 bg-gray-900/50 hover:bg-red-900/50 text-gray-400 hover:text-white p-2 rounded-full border border-gray-700 transition-colors z-50"
                >
                    <CloseIcon />
                </button>

                </div>{/* end content row */}

                {/* Status bar — full width, very bottom of modal */}
                <div className="flex-shrink-0 bg-cyan-950/80 border-t border-cyan-900 px-4 py-1 flex justify-between items-center text-[10px] text-cyan-600">
                    <div className="flex gap-4">
                        <span>STATUS: ONLINE</span>
                        <span>MODE: DUAL_PROCESS_ENABLED</span>
                    </div>
                    <div className={`flex items-center gap-2 ${agentThinking ? 'text-cyan-400' : 'text-cyan-800'}`}>
                        {agentThinking && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" />}
                        {agentThinking ? 'BGT_PROCESSING...' : 'AWAITING_INPUT_STREAM...'}
                    </div>
                </div>
            </div>

            {/* Calibration Wizard Modal */}
            <CalibrationWizardModal
                isOpen={showCalibrationWizard}
                onClose={() => setShowCalibrationWizard(false)}
                modelId={calibrationModelId}
                modelName={calibrationModelName}
                role="background"
                roleSystemPrompt={
                    settings.backgroundWorkflow?.find(s => s.id === 'ralph_executor')?.systemPrompt
                }
                settings={settings}
                onCalibrationComplete={handleCalibrationComplete}
            />
        </div>
    );
};


