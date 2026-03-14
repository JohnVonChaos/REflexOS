
import React, { useEffect, useState } from 'react';
import { AISettings, AIProvider, WorkflowStage } from '../types';
import { CloseIcon } from './icons/index';
import { ReflexHUD } from './ReflexHUD';

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
            <div className="bg-gray-950 border border-cyan-500/30 rounded-lg shadow-2xl w-full max-w-[1400px] h-[90vh] flex overflow-hidden">

                {/* Left Panel: Configuration */}
                <div className="w-[350px] flex-shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col">
                    <div className="p-4 border-b border-gray-800 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                        <h2 className="text-lg font-bold text-cyan-400">Background Control</h2>
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
                                <input type="text" value={backgroundRole.selectedModel} onChange={handleModelChange}
                                    placeholder="e.g. gemini-2.5-flash"
                                    className="w-full bg-black/20 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 focus:outline-none text-sm"
                                />
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

                        <div className="border-t border-gray-800" />

                        {/* ── Search Server ── */}
                        <div className="space-y-2">
                            <label className="block text-xs font-medium text-gray-400">Search Server URL</label>
                            <input
                                type="text"
                                value={settings.playwrightSearchUrl || 'http://localhost:3000'}
                                onChange={(e) => {
                                    const newSettings = { ...settings };
                                    newSettings.playwrightSearchUrl = e.target.value;
                                    onUpdateSettings(newSettings);
                                }}
                                className="w-full bg-black/20 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 focus:outline-none font-mono text-xs"
                            />
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

                {/* Right Panel: Workspace */}
                <div className="flex-1 flex flex-col bg-black relative">
                    <div className="flex-1 relative">
                        <ReflexHUD isOpen={true} onClose={() => {}} embedded={true} />
                    </div>
                </div>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 bg-gray-900/50 hover:bg-red-900/50 text-gray-400 hover:text-white p-2 rounded-full border border-gray-700 transition-colors z-50"
                >
                    <CloseIcon />
                </button>
            </div>
        </div>
    );
};

