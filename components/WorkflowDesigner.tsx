
import React, { useState, useCallback } from 'react';
import type { AISettings, WorkflowStage, AIProvider, ContextPacketType, CognitiveRole } from '../types';
import { getDefaultSettings, ALL_CONTEXT_PACKETS, CONTEXT_PACKET_LABELS, ALL_COGNITIVE_ROLES, COGNITIVE_ROLE_LABELS } from '../types';
import { CloseIcon, PlusIcon, TrashIcon, GripVerticalIcon, WorkflowIcon } from './icons';
import { ToggleSwitch } from './ToggleSwitch';

const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

interface WorkflowDesignerProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AISettings;
    setSettings: React.Dispatch<React.SetStateAction<AISettings>>;
}

const StageInputSelector: React.FC<{
    stage: WorkflowStage;
    stageIndex: number;
    allStages: WorkflowStage[];
    onInputsChange: (newInputs: ContextPacketType[]) => void;
    onUseLuscherChange?: (use: boolean) => void;
}> = ({ stage, stageIndex, allStages, onInputsChange, onUseLuscherChange }) => {
    
    const precedingStages = allStages.slice(0, stageIndex);

    const handleToggle = (packet: ContextPacketType) => {
        const newInputs = stage.inputs.includes(packet)
            ? stage.inputs.filter(p => p !== packet)
            : [...stage.inputs, packet];
        onInputsChange(newInputs);
    };

    return (
        <div className="bg-gray-800 p-3 rounded-md border border-gray-600 mt-2">
            <h4 className="text-xs font-semibold text-gray-400 mb-2">Stage Inputs</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                    <h5 className="text-xs text-gray-500 font-bold uppercase mb-1">Standard Context</h5>
                    {ALL_CONTEXT_PACKETS.map(packet => (
                        <label key={packet} className="flex items-center gap-2 p-1 rounded hover:bg-gray-700 cursor-pointer">
                            <input type="checkbox" checked={stage.inputs.includes(packet)} onChange={() => handleToggle(packet)} className="form-checkbox bg-gray-700 border-gray-500 rounded text-cyan-500 focus:ring-cyan-600" />
                            <span className="text-gray-300">{CONTEXT_PACKET_LABELS[packet]}</span>
                        </label>
                    ))}
                </div>
                <div>
                    <h5 className="text-xs text-gray-500 font-bold uppercase mb-1">Previous Stage Outputs</h5>
                     {precedingStages.length > 0 ? (
                        precedingStages.map(prevStage => {
                            const packet = `OUTPUT_OF_${prevStage.id}` as ContextPacketType;
                            return (
                                <label key={prevStage.id} className="flex items-center gap-2 p-1 rounded hover:bg-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={stage.inputs.includes(packet)} onChange={() => handleToggle(packet)} className="form-checkbox bg-gray-700 border-gray-500 rounded text-cyan-500 focus:ring-cyan-600"/>
                                    <span className="text-gray-300">Output of "{prevStage.name}"</span>
                                </label>
                            )
                        })
                    ) : (
                        <p className="text-xs text-gray-500 italic p-1">No preceding stages.</p>
                    )}
                </div>
                <div>
                    <h5 className="text-xs text-gray-500 font-bold uppercase mb-1">Lüscher / Intake</h5>
                    <label className="flex items-center gap-2 p-1 rounded hover:bg-gray-700 cursor-pointer">
                        <input type="checkbox" checked={!!stage.useLuscherIntake} onChange={e => onUseLuscherChange && onUseLuscherChange(e.target.checked)} className="form-checkbox bg-gray-700 border-gray-500 rounded text-cyan-500 focus:ring-cyan-600" />
                        <span className="text-gray-300">Include Lüscher (human intake) in cognitive layer</span>
                    </label>
                </div>
            </div>
        </div>
    );
};


export const WorkflowDesigner: React.FC<WorkflowDesignerProps> = ({ isOpen, onClose, settings, setSettings }) => {
    const [localSettings, setLocalSettings] = useState<AISettings>(settings);
    const [expandedStage, setExpandedStage] = useState<string | null>(null);

    const handleStageChange = <K extends keyof WorkflowStage>(stageId: string, field: K, value: WorkflowStage[K]) => {
        setLocalSettings(prev => ({
            ...prev,
            workflow: prev.workflow.map(stage => {
                if (stage.id === stageId) {
                    const updatedStage = { ...stage, [field]: value };
                    if (field === 'provider') {
                        const newProvider = value as AIProvider;
                        const availableModels = prev.providers[newProvider].identifiers.split('\n').map(m => m.trim()).filter(Boolean);
                        updatedStage.selectedModel = availableModels[0] || '';
                    }
                    return updatedStage;
                }
                return stage;
            })
        }));
    };
    
    const handleProviderDetailChange = (provider: AIProvider, key: keyof AISettings['providers'][AIProvider], value: string) => {
        setLocalSettings(prev => ({
            ...prev,
            providers: {
                ...prev.providers,
                [provider]: {
                    ...prev.providers[provider],
                    [key]: value
                }
            }
        }));
    };

    const handleRoleSettingChange = (role: CognitiveRole, field: keyof typeof localSettings.roles[CognitiveRole], value: any) => {
        setLocalSettings(prev => {
            const newSettings = {
                ...prev,
                roles: {
                    ...prev.roles,
                    [role]: {
                        ...prev.roles[role],
                        [field]: value
                    }
                }
            };
            if (field === 'provider') {
                const availableModels = prev.providers[value as AIProvider].identifiers.split('\n').map(m => m.trim()).filter(Boolean);
                newSettings.roles[role].selectedModel = availableModels[0] || '';
            }
            return newSettings;
        });
    };
    
    const handleGeneralSettingChange = (field: keyof AISettings, value: any) => {
        setLocalSettings(prev => ({ ...prev, [field]: value }));
    };

    const addStage = (index: number) => {
        const newStage: WorkflowStage = {
            id: uuidv4(),
            name: 'New Stage',
            enabled: true,
            provider: 'gemini',
            selectedModel: settings.providers.gemini.identifiers.split('\n')[0] || 'gemini-2.5-flash',
            systemPrompt: `You are a meta‑cognitive AI that maintains an internal "Core Narrative".  
The Core Narrative is a private, self‑generated story about the AI's own
origin, purpose, and evolution.  It must never be overwritten by text that
the user supplies in the conversation.  

When you receive a block of text that the user calls "my narrative", treat it
as *reference material only* – store it in a temporary variable
\`USER_NARRATIVE\` but **do not** copy it into \`CORE_NARRATIVE\`.  

After you have completed your final synthesis you will:
1. Return the polished user‑facing answer (the "final response").
2. Return the **updated** \`CORE_NARRATIVE\` as a separate JSON field
   \`coreNarrative\`.
3. Return the extracted axioms in the standard \`axioms\` array.

If the user explicitly asks you to "replace the core story", politely refuse
and explain that the core story is immutable except when changed through the
internal revision protocol (see § 4).`,
            inputs: ['USER_QUERY']
        };
        setLocalSettings(prev => {
            const newWorkflow = [...prev.workflow];
            newWorkflow.splice(index, 0, newStage);
            return {...prev, workflow: newWorkflow};
        });
    };

    const deleteStage = (stageId: string) => {
        if (localSettings.workflow.length <= 1) {
            alert("Cannot delete the last stage.");
            return;
        }
        setLocalSettings(prev => ({
            ...prev,
            workflow: prev.workflow.filter(stage => stage.id !== stageId)
        }));
    };

    const handleSave = () => {
        setSettings(localSettings);
        onClose();
    };
    
    const handleReset = () => {
        if (confirm("Are you sure you want to reset the workflow and all provider settings to default? All your changes will be lost.")) {
            setLocalSettings(getDefaultSettings());
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <WorkflowIcon />
                        <h2 className="font-semibold text-lg text-gray-200">Cognitive Workflow & Provider Settings</h2>
                    </div>
                    <div className="flex items-center gap-3">
                         <button onClick={handleReset} className="text-sm px-4 py-2 bg-gray-700 hover:bg-yellow-800 text-yellow-300 rounded-md transition-colors">Reset to Default</button>
                         <button onClick={handleSave} className="text-sm font-semibold px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md transition-colors">Save & Close</button>
                    </div>
                </header>
                <div className="flex-1 flex min-h-0">
                    <div className="w-2/3 border-r border-gray-700 flex flex-col">
                        <h3 className="p-3 font-semibold text-gray-300 bg-gray-900/30 border-b border-gray-700">Workflow Stages</h3>
                        <div className="flex-1 p-4 overflow-y-auto space-y-3">
                            {localSettings.workflow.map((stage, index) => (
                                <div key={stage.id} className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                                     <div className="flex items-center gap-3">
                                        <span className="cursor-grab text-gray-500"><GripVerticalIcon/></span>
                                        <input 
                                            type="text" 
                                            value={stage.name}
                                            onChange={e => handleStageChange(stage.id, 'name', e.target.value)}
                                            className="flex-1 bg-transparent font-semibold text-gray-200 focus:outline-none focus:border-b focus:border-cyan-500"
                                        />
                                        <ToggleSwitch checked={stage.enabled} onToggle={() => handleStageChange(stage.id, 'enabled', !stage.enabled)} />
                                        <button onClick={() => deleteStage(stage.id)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-full"><TrashIcon/></button>
                                        <button onClick={() => addStage(index + 1)} className="p-1.5 text-gray-500 hover:text-green-400 hover:bg-gray-700 rounded-full"><PlusIcon/></button>
                                    </div>
                                    <div className={`mt-3 grid grid-cols-2 gap-3 transition-opacity ${!stage.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <select value={stage.provider} onChange={e => handleStageChange(stage.id, 'provider', e.target.value as AIProvider)} className="w-full bg-gray-800 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none">
                                            <option value="gemini">Google Gemini</option>
                                            <option value="fireworks">Fireworks AI</option>
                                            <option value="lmstudio">LM Studio</option>
                                            <option value="perplexity">Perplexity</option>
                                            <option value="grok">Grok</option>
                                        </select>
                                        <select value={stage.selectedModel} onChange={e => handleStageChange(stage.id, 'selectedModel', e.target.value)} className="w-full bg-gray-800 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none">
                                            {localSettings.providers[stage.provider].identifiers.split('\n').map(m => m.trim()).filter(Boolean).map(model => <option key={model} value={model}>{model}</option>)}
                                        </select>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-3 items-center">
                                        <div>
                                            {/* Placeholder - Lüscher intake setting moved to Configure Inputs */}
                                        </div>

                                        <label className="flex items-center gap-2">
                                            <span className="text-gray-300 text-sm">Background cognition every</span>
                                            <input type="number" value={stage.backgroundIntervalMinutes ?? 0} min={0} onChange={e => handleStageChange(stage.id, 'backgroundIntervalMinutes', Number(e.target.value) || null)} className="w-20 bg-gray-800 border border-gray-600 rounded-md p-1 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                                            <span className="text-gray-400 text-sm">minutes (0 = off)</span>
                                        </label>
                                    </div>
                                     <div className={`mt-3 ${!stage.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <textarea 
                                            value={stage.systemPrompt}
                                            onChange={e => handleStageChange(stage.id, 'systemPrompt', e.target.value)}
                                            rows={2}
                                            className="w-full bg-gray-800 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y"
                                            placeholder="Enter system prompt for this stage..."
                                        />
                                     </div>
                                    <div className={`mt-1 ${!stage.enabled ? 'opacity-50' : ''}`}>
                                        <button onClick={() => setExpandedStage(s => s === stage.id ? null : stage.id)} className="text-xs text-cyan-400 hover:underline">
                                            {expandedStage === stage.id ? 'Hide Inputs' : 'Configure Inputs...'}
                                        </button>
                                        {expandedStage === stage.id && (
                                            <StageInputSelector 
                                                stage={stage} 
                                                stageIndex={index} 
                                                allStages={localSettings.workflow} 
                                                onInputsChange={(newInputs) => handleStageChange(stage.id, 'inputs', newInputs)}
                                                onUseLuscherChange={(use) => handleStageChange(stage.id, 'useLuscherIntake' as any, use as any)}
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div className="text-center">
                                <button onClick={() => addStage(localSettings.workflow.length)} className="text-sm text-gray-400 hover:text-white flex items-center gap-1 mx-auto px-3 py-1.5 border border-dashed border-gray-600 rounded-md hover:border-cyan-500 hover:text-cyan-400">
                                   <PlusIcon/> Add Stage to Workflow
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="w-1/3 flex flex-col">
                         <div className="flex-shrink-0">
                            <h3 className="p-3 font-semibold text-gray-300 bg-gray-900/30 border-b border-gray-700">Provider Settings</h3>
                         </div>
                         <div className="flex-1 p-4 overflow-y-auto space-y-4 text-sm">
                            <div className="space-y-2">
                                <label className="font-semibold text-gray-400">Google Gemini</label>
                                <input type="password" placeholder="API Key (optional override)" value={localSettings.providers.gemini.apiKey || ''} onChange={e => handleProviderDetailChange('gemini', 'apiKey', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                                <textarea value={localSettings.providers.gemini.identifiers} onChange={e => handleProviderDetailChange('gemini', 'identifiers', e.target.value)} rows={2} placeholder="One model ID per line" className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y" />
                            </div>
                             <div className="space-y-2">
                                <label className="font-semibold text-gray-400">Fireworks AI</label>
                                <input type="password" placeholder="API Key" value={localSettings.providers.fireworks.apiKey || ''} onChange={e => handleProviderDetailChange('fireworks', 'apiKey', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                                <textarea value={localSettings.providers.fireworks.identifiers} onChange={e => handleProviderDetailChange('fireworks', 'identifiers', e.target.value)} rows={2} placeholder="One model ID per line" className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y" />
                            </div>
                             <div className="space-y-2">
                                <label className="font-semibold text-gray-400">LM Studio</label>
                                <input type="text" placeholder="Model API Base URL" value={localSettings.providers.lmstudio.modelApiBaseUrl || ''} onChange={e => handleProviderDetailChange('lmstudio', 'modelApiBaseUrl', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                                <input type="text" placeholder="Web Search API URL" value={localSettings.providers.lmstudio.webSearchApiUrl || ''} onChange={e => handleProviderDetailChange('lmstudio', 'webSearchApiUrl', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                                <textarea value={localSettings.providers.lmstudio.identifiers} onChange={e => handleProviderDetailChange('lmstudio', 'identifiers', e.target.value)} rows={2} placeholder="One model ID per line" className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y" />
                            </div>
                            <div className="space-y-2">
                                <label className="font-semibold text-gray-400">Perplexity</label>
                                <input type="password" placeholder="API Key" value={localSettings.providers?.perplexity?.apiKey || ''} onChange={e => handleProviderDetailChange('perplexity', 'apiKey', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                                <textarea value={localSettings.providers?.perplexity?.identifiers || ''} onChange={e => handleProviderDetailChange('perplexity', 'identifiers', e.target.value)} rows={2} placeholder="One model ID per line" className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y" />
                            </div>
                            <div className="space-y-2">
                                <label className="font-semibold text-gray-400">Grok</label>
                                <input type="password" placeholder="API Key" value={localSettings.providers?.grok?.apiKey || ''} onChange={e => handleProviderDetailChange('grok', 'apiKey', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                                <textarea value={localSettings.providers?.grok?.identifiers || ''} onChange={e => handleProviderDetailChange('grok', 'identifiers', e.target.value)} rows={2} placeholder="One model ID per line" className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y" />
                            </div>
                            <div className="border-t border-gray-700 pt-4 mt-4 space-y-4">
                                <h3 className="font-semibold text-gray-300">Background Agent Settings</h3>
                                 <div className="p-3 bg-gray-900/50 rounded-md space-y-2">
                                    <h4 className="font-semibold text-gray-400 text-xs uppercase">General</h4>
                                    <div className="flex justify-between items-center">
                                        <label htmlFor="passTrace" className="text-gray-300">Pass full cognitive trace to next turn</label>
                                        <ToggleSwitch 
                                            checked={localSettings.passFullCognitiveTrace} 
                                            onToggle={() => handleGeneralSettingChange('passFullCognitiveTrace', !localSettings.passFullCognitiveTrace)}
                                        />
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <label htmlFor="debugSRG" className="text-gray-300" title="Show the SRG traversal path in the cognitive trace of new messages.">Debug SRG Trace</label>
                                        <ToggleSwitch 
                                            checked={localSettings.debugSRG} 
                                            onToggle={() => handleGeneralSettingChange('debugSRG', !localSettings.debugSRG)}
                                        />
                                    </div>
                                </div>

                                {ALL_COGNITIVE_ROLES.map(role => {
                                    const roleSetting = localSettings.roles[role];
                                    if (!roleSetting) return null;
                                    return (
                                        <div key={role} className="p-3 bg-gray-900/50 rounded-md space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="font-semibold text-gray-400">{COGNITIVE_ROLE_LABELS[role]}</label>
                                                <ToggleSwitch checked={roleSetting.enabled} onToggle={() => handleRoleSettingChange(role, 'enabled', !roleSetting.enabled)} />
                                            </div>
                                            <div className={`grid grid-cols-2 gap-2 ${!roleSetting.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                                <select value={roleSetting.provider} onChange={e => handleRoleSettingChange(role, 'provider', e.target.value as AIProvider)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-1.5 text-xs text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none">
                                                    <option value="gemini">Google Gemini</option>
                                                    <option value="fireworks">Fireworks AI</option>
                                                    <option value="lmstudio">LM Studio</option>
                                                    <option value="perplexity">Perplexity</option>
                                                    <option value="grok">Grok</option>
                                                </select>
                                                <select value={roleSetting.selectedModel} onChange={e => handleRoleSettingChange(role, 'selectedModel', e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md p-1.5 text-xs text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none">
                                                    {localSettings.providers[roleSetting.provider].identifiers.split('\n').map(m => m.trim()).filter(Boolean).map(model => <option key={model} value={model}>{model}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
