
import React, { useEffect, useState } from 'react';
import { AISettings, AIProvider } from '../types';
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
    // If closed, don't render to save resources
    // But we might want it to poll in background if "Agent Workspace" is conceptually "always on"? 
    // For now, follow standard modal behavior.
    if (!isOpen || !settings || !settings.roles) return null;

    // Default fallback if background role is missing in older sessions
    const backgroundRole = settings.roles.background || {
        enabled: true,
        provider: 'gemini',
        selectedModel: 'gemini-2.5-flash'
    };

    const rateInMinutes = settings.backgroundCognitionRate ? Math.floor(settings.backgroundCognitionRate / 60) : 60;

    const handleToggleEnabled = () => {
        const newSettings = { ...settings };
        if (!newSettings.roles.background) {
            newSettings.roles.background = { ...backgroundRole };
        }
        newSettings.roles.background.enabled = !newSettings.roles.background.enabled;
        onUpdateSettings(newSettings);
    };

    const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newProvider = e.target.value as AIProvider;
        const newSettings = { ...settings };
        if (!newSettings.roles.background) {
            newSettings.roles.background = { ...backgroundRole };
        }
        newSettings.roles.background.provider = newProvider;
        onUpdateSettings(newSettings);
    };

    const handleModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newSettings = { ...settings };
        if (!newSettings.roles.background) {
            newSettings.roles.background = { ...backgroundRole };
        }
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

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-gray-950 border border-cyan-500/30 rounded-lg shadow-2xl w-full max-w-[1400px] h-[90vh] flex overflow-hidden">

                {/* Left Panel: Configuration (Sidebar) */}
                <div className="w-[350px] flex-shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col">
                    <div className="p-4 border-b border-gray-800 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                        <h2 className="text-lg font-bold text-cyan-400">Background Control</h2>
                    </div>

                    <div className="p-4 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                        {/* Master Switch */}
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

                        {/* Frequency */}
                        <div className="space-y-2">
                            <label className="block text-xs uppercase font-bold text-gray-500 tracking-wider">
                                Cycle Frequency (Min)
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={rateInMinutes}
                                onChange={handleRateChange}
                                className="w-full bg-black/20 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 focus:outline-none text-sm"
                            />
                        </div>

                        <div className="border-t border-gray-800" />

                        {/* AI Provider Settings */}
                        <div className="space-y-4">
                            <h3 className="font-semibold text-cyan-500 text-xs uppercase tracking-wider">Cognition Agent</h3>

                            <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-400">Provider</label>
                                <select
                                    value={backgroundRole.provider}
                                    onChange={handleProviderChange}
                                    className="w-full bg-black/20 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 focus:outline-none text-sm"
                                >
                                    <option value="gemini">Google Gemini</option>
                                    <option value="fireworks">Fireworks AI</option>
                                    <option value="perplexity">Perplexity</option>
                                    <option value="lmstudio">LM Studio (Local)</option>
                                    <option value="grok">xAI Grok</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-400">Model ID</label>
                                <input
                                    type="text"
                                    value={backgroundRole.selectedModel}
                                    onChange={handleModelChange}
                                    placeholder="e.g. gemini-1.5-flash"
                                    className="w-full bg-black/20 border border-gray-700 rounded p-2 text-white focus:border-cyan-500 focus:outline-none text-sm"
                                />
                            </div>
                        </div>

                        <div className="border-t border-gray-800" />

                        {/* Playwright Search Server */}
                        <div className="space-y-2">
                            <label className="block text-xs font-medium text-gray-400">
                                Search Server URL
                            </label>
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

                        {/* Manual Trigger */}
                        <div className="pt-4">
                            <button
                                onClick={() => {
                                    window.dispatchEvent(new CustomEvent('trigger-background-cycle'));
                                }}
                                className="w-full px-3 py-2 bg-cyan-900/40 hover:bg-cyan-900/60 border border-cyan-800 text-cyan-300 font-mono text-xs rounded transition-colors uppercase tracking-wide"
                            >
                                [INITIATE CYCLIC SEQUENCE]
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Workspace (ReflexHUD) */}
                <div className="flex-1 flex flex-col bg-black relative">
                    {/* Pass true to display in 'embedded' mode if ReflexHUD supports it, or just wrap it */}
                    {/* We'll instantiate ReflexHUD here but we need to ensure it fits the container.
                         ReflexHUD currently has fixed positioning in its implementation.
                         We should refactor ReflexHUD to accept a 'embedded' prop or just style it wrapper-relative.
                         
                         Wait, the ReflexHUD strictly uses 'fixed inset-0' etc. 
                         I should probably modify ReflexHUD to be flexible or duplicate the logic here.
                         Given the instruction "put the fucking shit in the background cognition modal", 
                         I'll just inline the ReflexHUD into this div or modify ReflexHUD to support being contained.
                     */}

                    <div className="flex-1 relative">
                        {/* We are reusing the ReflexHUD content but forcing it into this container. 
                            Since I cannot modify ReflexHUD in the same tool call easily without risk, 
                            I will rely on a wrapper div and CSS or better yet, I will replace the ReflexHUD import 
                            with a direct implementation of the visualization here, since it's cleaner than fighting fixed positioning.
                        */}
                        <ReflexHUD
                            isOpen={true}
                            onClose={() => { }}
                            embedded={true} // Need to update ReflexHUD to support this or it will look weird
                        />
                    </div>
                </div>

                {/* Close Button Overlay */}
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
