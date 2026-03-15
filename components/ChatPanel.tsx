

import React, { useState, useRef, useEffect } from 'react';
import type { MemoryAtom, AISettings, ProjectFile, RunningContextBuffer } from '../types';
import { Message } from './Message';
import { PaperPlaneIcon, StopIcon, TrashIcon, CollapseIcon, ExpandIcon, MicrophoneIcon, SettingsIcon, CloseIcon, RefreshIcon, WorkflowIcon, CpuChipIcon } from './icons';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { ToggleSwitch } from './ToggleSwitch';
import { WorkflowDesigner } from './WorkflowDesigner';
import { ReflexHUD } from './ReflexHUD';
import { contextSearchService } from '../services/contextSearchService';
import { srgService } from '../services/srgService';
import SessionImportModal, { ImportOptions, ImportModeSettings } from './SessionImportModal';

const ContextManager: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    messages: MemoryAtom[];
    projectFiles: ProjectFile[];
    contextFileIds: string[];
    onToggleMessageContext: (uuid: string) => void;
    onToggleFileContext: (fileId: string) => void;
    onClearAllContexts: () => Promise<void>;
    onClearTrapDoorStates: () => Promise<void>;
    onFetchAllItems: () => Promise<any[]>;
    onDeleteContextItem: (id: string) => Promise<void>;
    onCreateWorkspace: (name: string, itemIds: string[], fileIds?: string[], description?: string) => Promise<void>;
    onGetWorkspaces: () => Promise<any[]>;
    onLoadWorkspace: (id: string) => Promise<void>;
    onCreateWorkspaceWithState?: (name: string, description?: string, workflow?: boolean, settings?: boolean, preferences?: boolean) => Promise<string>;
    onLoadWorkspaceWithOptions?: (id: string, options: any, modes: any) => Promise<void>;
}> = ({ isOpen, onClose, messages, projectFiles, contextFileIds, onToggleMessageContext, onToggleFileContext, onClearAllContexts, onClearTrapDoorStates, onFetchAllItems, onDeleteContextItem, onCreateWorkspace, onGetWorkspaces, onLoadWorkspace, onCreateWorkspaceWithState, onLoadWorkspaceWithOptions }) => {
    if (!isOpen) return null;
    const [allItems, setAllItems] = useState<any[]>([]);
    const [workspaces, setWorkspaces] = useState<any[]>([]);
    const [newWorkspaceName, setNewWorkspaceName] = useState('');
    const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(undefined);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [showImportModal, setShowImportModal] = useState(false);
    const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | undefined>(undefined);
    const [isImporting, setIsImporting] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [expandedArchiveGroups, setExpandedArchiveGroups] = useState<Set<string>>(new Set());
    const [sortBySize, setSortBySize] = useState(false);

    // Estimate tokens (rough: chars / 4)
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);

    const refreshAllItems = async () => {
        try {
            const items = await onFetchAllItems();
            setAllItems(items || []);
        } catch (e) {
            console.error('Failed to fetch context items', e);
        }
    };

    const refreshWorkspaces = async () => {
        try {
            const ws = await onGetWorkspaces();
            setWorkspaces(ws || []);
        } catch (e) {
            console.error('Failed to fetch workspaces', e);
        }
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.trim().length === 0) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            // Search against ALL messages, not just stored items
            const queryLower = query.toLowerCase();
            const allAvailableMessages = messages.filter(m =>
                m.type === 'user_message' || m.type === 'model_response' || m.type === 'steward_note'
            );

            // Score each message by relevance
            const scoredResults = allAvailableMessages
                .map(msg => {
                    const text = (msg.text || '').toLowerCase();
                    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

                    // Direct keyword matching
                    let directScore = 0;
                    const matchedTerms: string[] = [];
                    for (const word of queryWords) {
                        if (text.includes(word)) {
                            directScore += 1;
                            matchedTerms.push(word);
                        }
                    }
                    directScore = Math.min(directScore / Math.max(queryWords.length, 1), 1);

                    // SRG semantic search if available
                    let srgScore = 0;
                    try {
                        const hybridResult = srgService.queryHybrid(query, {
                            maxDepth: 2,
                        });
                        if (hybridResult && hybridResult.trace && hybridResult.trace.length > 0) {
                            srgScore = Math.min(hybridResult.trace.length * 0.3, 1);
                        }
                    } catch (e) {
                        // SRG not ready, just use keyword
                    }

                    const finalScore = srgScore > 0.1 ? srgScore * 0.8 + directScore * 0.2 : directScore;

                    return {
                        messageUuid: msg.uuid,
                        text: text.substring(0, 100),
                        tier: msg.isInContext ? 'LIVE' : 'DEEP',
                        relevance: finalScore,
                        matchedTerms: matchedTerms,
                        reason: matchedTerms.length > 0
                            ? `Matched: ${matchedTerms.slice(0, 2).join(', ')}`
                            : 'Semantic match',
                        id: msg.uuid,
                    };
                })
                .filter(r => r.relevance > 0.05) // Filter out noise
                .sort((a, b) => b.relevance - a.relevance);

            setSearchResults(scoredResults);
        } catch (e) {
            console.error('Search failed:', e);
            setSearchResults([]);
        }
        setIsSearching(false);
    };

    // Fetch items and workspaces when modal opens
    useEffect(() => {
        if (isOpen) {
            (async () => {
                try {
                    const items = await onFetchAllItems();
                    console.log('Fetched items:', items?.length || 0, items);
                    setAllItems(items || []);
                } catch (e) {
                    console.error('Failed to fetch items in useEffect:', e);
                }

                try {
                    const ws = await onGetWorkspaces();
                    console.log('Fetched workspaces:', ws?.length || 0, ws);
                    setWorkspaces(ws || []);
                } catch (e) {
                    console.error('Failed to fetch workspaces in useEffect:', e);
                }
            })();
        }
    }, [isOpen, onFetchAllItems, onGetWorkspaces]);

    const contextFiles = projectFiles.filter(f => contextFileIds.includes(f.id));
    const contextInsights = messages.filter(m => m.isInContext && m.type === 'steward_note' && !!m.backgroundInsight);
    const contextRegularMessages = messages.filter(m => m.isInContext && (m.type === 'user_message' || m.type === 'model_response'));
    const liveItems = allItems.filter((it: any) => it.tier === 'LIVE');
    const deepItems = allItems.filter((it: any) => it.tier === 'DEEP');

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full h-full flex flex-col relative overflow-hidden" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="font-semibold text-lg">Context Manager</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700"><CloseIcon /></button>
                </header>

                <div className="flex-1 flex gap-4 p-4 overflow-hidden">
                    {/* LEFT SIDE: Current Context (4/5 width) */}
                    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                        {/* SEARCH SECTION */}
                        <div className="border border-purple-600 rounded-lg p-3 bg-purple-950/20 flex-shrink-0">
                            <h3 className="text-sm font-semibold text-purple-400 mb-2">🔍 Find & Add Context</h3>
                            <div className="flex gap-2 items-center mb-2">
                                <input
                                    value={searchQuery}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    placeholder="Search all messages..."
                                    className="bg-gray-900 p-2 rounded-md text-sm flex-grow"
                                />
                                {searchResults.length > 0 && (
                                    <button
                                        onClick={async () => {
                                            for (const result of searchResults) {
                                                if (result.messageUuid && !messages.find(m => m.uuid === result.messageUuid && m.isInContext)) {
                                                    onToggleMessageContext(result.messageUuid);
                                                }
                                            }
                                        }}
                                        className="px-2 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-xs font-semibold whitespace-nowrap"
                                    >
                                        Add All ({searchResults.length})
                                    </button>
                                )}
                            </div>
                            {searchResults.length > 0 && (
                                <div className="bg-gray-900/50 rounded-md p-2 max-h-[250px] overflow-y-auto">
                                    <ul className="space-y-1">
                                        {searchResults.map((result: any) => (
                                            <li key={result.messageUuid} className="p-2 bg-gray-800 rounded border border-gray-700 flex justify-between items-start gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-gray-300 truncate">{result.text}</p>
                                                    <p className="text-xs text-purple-300 mt-0.5">{result.reason}</p>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        onToggleMessageContext(result.messageUuid);
                                                        handleSearch(searchQuery); // Refresh search
                                                    }}
                                                    className="text-xs px-2 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded-md flex-shrink-0"
                                                >
                                                    +
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {searchQuery && searchResults.length === 0 && !isSearching && (
                                <p className="text-xs text-gray-500 italic">No results found.</p>
                            )}
                        </div>

                        {/* CURRENT CONTEXT SECTION */}


                        {/* CURRENT CONTEXT SECTION */}
                        <div className="border border-cyan-600 rounded-lg p-3 bg-gray-900/30 flex-1 overflow-hidden flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-sm font-semibold text-cyan-400">📎 In Context ({contextRegularMessages.length + contextInsights.length + contextFiles.length})</h3>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setSortBySize(!sortBySize)}
                                        className={`px-2 py-0.5 rounded text-xs transition-colors ${sortBySize ? 'bg-cyan-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                                        title={sortBySize ? "Sorted by size (largest first)" : "Sort by size"}
                                    >
                                        {sortBySize ? '↓' : '↕'} Size
                                    </button>
                                    {(contextRegularMessages.length > 0 || contextInsights.length > 0 || contextFiles.length > 0) && (
                                        <button
                                            onClick={async () => { await onClearAllContexts(); await refreshAllItems(); }}
                                            className="px-1.5 py-0.5 bg-red-700 hover:bg-red-600 text-white rounded text-xs"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-2">
                                {contextFiles.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-semibold text-gray-400 mb-1">Files ({contextFiles.length})</h4>
                                        <ul className="space-y-0.5">
                                            {(sortBySize
                                                ? [...contextFiles].sort((a, b) => estimateTokens(b.content) - estimateTokens(a.content))
                                                : contextFiles
                                            ).map(file => {
                                                const tokens = estimateTokens(file.content);
                                                return (
                                                    <li key={file.id} className="flex justify-between items-center p-1.5 text-xs bg-gray-900/50 rounded">
                                                        <span className="truncate text-gray-300 flex-1">{file.name}</span>
                                                        <span className="text-[10px] text-gray-500 mx-2">~{tokens.toLocaleString()}t</span>
                                                        <button onClick={() => onToggleFileContext(file.id)} className="text-xs px-1.5 py-0.5 bg-red-700 hover:bg-red-600 rounded flex-shrink-0">✕</button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                                {contextRegularMessages.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-semibold text-gray-400 mb-1">Messages ({contextRegularMessages.length})</h4>
                                        <ul className="space-y-0.5">
                                            {(sortBySize
                                                ? [...contextRegularMessages].sort((a, b) => estimateTokens(b.text || '') - estimateTokens(a.text || ''))
                                                : contextRegularMessages
                                            ).map(msg => {
                                                const tokens = estimateTokens(msg.text || '');
                                                return (
                                                    <li key={msg.uuid} className="flex justify-between items-start p-1.5 text-xs bg-gray-900/50 rounded gap-2">
                                                        <p className="truncate text-gray-400 flex-1">{msg.text?.substring(0, 60)}</p>
                                                        <span className="text-[10px] text-gray-500">~{tokens.toLocaleString()}t</span>
                                                        <button onClick={() => onToggleMessageContext(msg.uuid)} className="text-xs px-1.5 py-0.5 bg-red-700 hover:bg-red-600 rounded flex-shrink-0">✕</button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                                {contextInsights.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-semibold text-gray-400 mb-1">Background Insights ({contextInsights.length})</h4>
                                        <ul className="space-y-0.5">
                                            {(sortBySize
                                                ? [...contextInsights].sort((a, b) => estimateTokens(b.backgroundInsight?.insight || '') - estimateTokens(a.backgroundInsight?.insight || ''))
                                                : contextInsights
                                            ).map(insight => {
                                                const tokens = estimateTokens(insight.backgroundInsight?.insight || '');
                                                return (
                                                    <li key={insight.uuid} className="flex justify-between items-start p-1.5 text-xs bg-purple-900/30 rounded gap-2 border border-purple-700/50">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-purple-300 font-semibold truncate">{insight.backgroundInsight?.query || 'Unknown query'}</p>
                                                            <p className="text-gray-400 text-[10px] truncate">{insight.backgroundInsight?.insight?.substring(0, 50) || 'No content'}</p>
                                                        </div>
                                                        <span className="text-[10px] text-purple-400 font-bold">~{tokens.toLocaleString()}t</span>
                                                        <button onClick={() => onToggleMessageContext(insight.uuid)} className="text-xs px-1.5 py-0.5 bg-red-700 hover:bg-red-600 rounded flex-shrink-0">✕</button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                                {contextRegularMessages.length === 0 && contextInsights.length === 0 && contextFiles.length === 0 && (
                                    <p className="text-xs text-gray-500 italic">Use search or toggle messages to add.</p>
                                )}
                            </div>
                        </div>

                        {/* ARCHIVED SECTION */}
                        {deepItems.length > 0 && (
                            <div className="border border-gray-600 rounded-lg p-3 bg-gray-900/30 flex-shrink-0">
                                <h3 className="text-sm font-semibold text-gray-400 mb-1">🗑️ Archived ({deepItems.length})</h3>
                                <details className="text-xs">
                                    <summary className="cursor-pointer text-gray-400 hover:text-gray-300">View archived items...</summary>
                                    <ul className="space-y-0.5 mt-2 max-h-[150px] overflow-y-auto">
                                        {deepItems.map((it: any) => (
                                            <li key={it.id} className="flex justify-between items-start p-1.5 bg-gray-800/50 rounded gap-2">
                                                <div className="truncate text-gray-400 flex-1 text-xs">{String(it.text || '').substring(0, 60)}</div>
                                                <button
                                                    onClick={async () => {
                                                        // Restore archived item
                                                        if (it.messageUuid) {
                                                            onToggleMessageContext(it.messageUuid);
                                                        }
                                                    }}
                                                    className="text-xs px-1.5 py-0.5 bg-green-700 hover:bg-green-600 rounded flex-shrink-0 whitespace-nowrap"
                                                >
                                                    Restore
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            </div>
                        )}
                    </div>

                    {/* RIGHT SIDE: Workspaces (1/5 width) */}
                    <div className="w-1/5 border border-gray-600 rounded-lg p-3 bg-gray-900/30 flex flex-col gap-2">
                        <h3 className="text-sm font-semibold text-cyan-400">💾 Workspaces</h3>
                        <input
                            value={newWorkspaceName}
                            onChange={(e) => setNewWorkspaceName(e.target.value)}
                            placeholder="Name"
                            className="bg-gray-900 p-1.5 rounded-md text-xs"
                        />
                        <button
                            onClick={async () => {
                                const itemIds = messages.filter(m => m.isInContext).map(m => m.uuid);
                                await onCreateWorkspace(newWorkspaceName || `ws_${Date.now()}`, itemIds, contextFileIds);
                                setNewWorkspaceName('');
                                await refreshWorkspaces();
                            }}
                            className="px-2 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs font-semibold"
                        >
                            Save
                        </button>
                        <hr className="border-gray-700" />
                        <select
                            value={selectedWorkspaceId || ''}
                            onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                            className="bg-gray-900 p-1.5 rounded-md text-xs"
                        >
                            <option value="">Load...</option>
                            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                        {selectedWorkspaceId && (
                            <button
                                onClick={async () => {
                                    if (onLoadWorkspaceWithOptions) {
                                        setPendingWorkspaceId(selectedWorkspaceId);
                                        setShowImportModal(true);
                                    } else {
                                        await onLoadWorkspace(selectedWorkspaceId);
                                        await refreshAllItems();
                                    }
                                }}
                                className="px-2 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-md text-xs font-semibold"
                            >
                                Restore
                            </button>
                        )}
                    </div>
                </div>

                {/* Import Modal */}
                <SessionImportModal
                    isOpen={showImportModal}
                    onClose={() => {
                        setShowImportModal(false);
                        setPendingWorkspaceId(undefined);
                    }}
                    onImport={async (options: ImportOptions, modes: ImportModeSettings) => {
                        if (!pendingWorkspaceId || !onLoadWorkspaceWithOptions) return;

                        setIsImporting(true);
                        try {
                            await onLoadWorkspaceWithOptions(pendingWorkspaceId, options, modes);
                            await refreshAllItems();
                            setShowImportModal(false);
                            setPendingWorkspaceId(undefined);
                        } catch (e) {
                            console.error('Import failed:', e);
                            alert('Failed to import workspace. Check console for details.');
                        } finally {
                            setIsImporting(false);
                        }
                    }}
                    isLoading={isImporting}
                />
            </div>
        </div>
    );
};

const ContextUsageBar: React.FC<{
    rcb: RunningContextBuffer | undefined,
    onSizeLimitChange: (newLimit: number) => void;
}> = ({ rcb, onSizeLimitChange }) => {
    if (!rcb) return null;

    const usagePercentage = rcb.size_limit > 0 ? (rcb.size_current / rcb.size_limit) * 100 : 0;
    const usageColor = usagePercentage > 90 ? 'bg-red-500' : usagePercentage > 75 ? 'bg-yellow-500' : 'bg-cyan-500';
    const minLimit = 1000;
    const maxLimit = 4000000; // ~1 million tokens

    return (
        <div className="flex-1 px-4 flex items-center gap-4">
            <label className="text-xs font-semibold text-gray-400 whitespace-nowrap" title={`AI's internal 'working memory' for self-correction and planning. Last updated: ${rcb.lastUpdatedAt ? new Date(rcb.lastUpdatedAt).toLocaleString() : 'N/A'}`}>Context Buffer</label>
            <div className="w-full group flex items-center gap-2">
                <div className="w-full bg-gray-700 rounded-full h-2.5 relative">
                    <div className={`${usageColor} h-2.5 rounded-full`} style={{ width: `${usagePercentage}%` }}></div>
                </div>
                <input
                    type="number"
                    min={minLimit}
                    max={maxLimit}
                    step="100"
                    value={rcb.size_limit}
                    onChange={(e) => onSizeLimitChange(parseInt(e.target.value, 10) || minLimit)}
                    className="w-24 bg-gray-800 border border-gray-600 rounded-md p-1.5 text-xs text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                    title="Set context buffer character limit"
                />
                <span className="text-xs text-gray-400 w-36 text-right">
                    ~{(rcb.size_current / 4).toLocaleString()} / {(rcb.size_limit / 4).toLocaleString()} tokens
                </span>
            </div>
        </div>
    );
};

const ApiContextUsageBar: React.FC<{
    totalTokens: number;
    tokenLimit: number;
    tokenLimitMin: number;
    onTokenLimitChange: (newLimit: number) => void;
    onTokenLimitMinChange: (newLimit: number) => void;
    onManage: () => void;
}> = ({ totalTokens, tokenLimit, tokenLimitMin, onTokenLimitChange, onTokenLimitMinChange, onManage }) => {
    if (tokenLimit <= 0) return null;

    const usagePercentage = (totalTokens / tokenLimit) * 100;
    const usageColor = usagePercentage > 95 ? 'bg-red-600' : usagePercentage > 80 ? 'bg-yellow-500' : 'bg-cyan-500';
    const maxLimit = 4000000; // ~1 million tokens equivalent

    return (
        <div className="flex-1 px-4 flex items-center gap-4">
            <label className="text-xs font-semibold text-gray-400 whitespace-nowrap" title="Total tokens from all files and messages currently included in the context for the next API call.">
                API Context
            </label>
            <div className="w-full group flex items-center gap-2">
                <div className="w-full bg-gray-700 rounded-full h-2.5 relative" title={`${usagePercentage.toFixed(1)}% used`}>
                    <div className={`${usageColor} h-2.5 rounded-full`} style={{ width: `${Math.min(usagePercentage, 100)}%` }}></div>
                    {usagePercentage > 100 && (
                        <div className="absolute top-0 left-0 h-full w-full flex items-center justify-center text-white text-[8px] font-bold animate-pulse">OVER LIMIT</div>
                    )}
                </div>
                <span className="text-xs text-gray-400 w-36 text-right">
                    {totalTokens.toLocaleString()} / {tokenLimit.toLocaleString()} tokens
                </span>
                <input
                    type="number"
                    min={1000}
                    max={maxLimit}
                    step="1000"
                    value={tokenLimit}
                    onChange={(e) => onTokenLimitChange(parseInt(e.target.value, 10) || 1048576)}
                    className="w-24 bg-gray-800 border border-gray-600 rounded-md p-1.5 text-xs text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                    title="Set maximum API context limit"
                />
                <input
                    type="number"
                    min={1000}
                    max={maxLimit}
                    step="1000"
                    value={tokenLimitMin}
                    onChange={(e) => onTokenLimitMinChange(parseInt(e.target.value, 10) || 32000)}
                    className="w-24 bg-gray-800 border border-gray-600 rounded-md p-1.5 text-xs text-white focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                    title="Set minimum API context target (for intelligent pruning)"
                />
                <button
                    onClick={onManage}
                    className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-gray-300"
                    title="Manage items in context"
                >
                    Manage
                </button>
            </div>
        </div>
    );
};


interface ChatPanelProps {
    messages: MemoryAtom[];
    projectFiles: ProjectFile[];
    sendMessage: (message: string) => void;
    isLoading: boolean;
    loadingStage: string;
    error: Error | null;
    onToggleMessageContext: (uuid: string) => void;
    onStopGeneration: () => void;
    onInterruptLayer: () => void;
    contextFileIds: string[];
    onToggleFileContext: (fileId: string) => void;
    totalContextTokens: number;
    onToggleMessageCollapsed: (uuid: string) => void;
    onCollapseAll: () => void;
    onExpandAll: () => void;
    onClearChat: () => void;
    aiSettings: AISettings;
    setAiSettings: React.Dispatch<React.SetStateAction<AISettings>>;
    isCognitionRunning: boolean;
    onRunCognitionNow: () => void;
    rcb: RunningContextBuffer | undefined;
    onRcbSizeLimitChange: (newLimit: number) => void;
    onApiTokenLimitChange: (newLimit: number) => void;
    onApiTokenLimitMinChange: (newLimit: number) => void;
    onViewTrace: (traceIds: string[]) => void;
    onClearAllContexts: () => Promise<void>;
    onClearAllTrapDoorStates: () => Promise<void>;
    onFetchAllContextItems: () => Promise<any[]>;
    onDeleteContextItem: (id: string) => Promise<void>;
    onCreateWorkspace: (name: string, itemIds: string[], fileIds?: string[], description?: string) => Promise<void>;
    onGetWorkspaces: () => Promise<any[]>;
    onLoadWorkspace: (id: string) => Promise<void>;
    onCreateWorkspaceWithState?: (name: string, description?: string, workflow?: boolean, settings?: boolean, preferences?: boolean) => Promise<string>;
    onLoadWorkspaceWithOptions?: (id: string, options: any, modes: any) => Promise<void>;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
    messages,
    projectFiles,
    sendMessage,
    isLoading,
    loadingStage,
    error,
    onToggleMessageContext,
    onStopGeneration,
    onInterruptLayer,
    contextFileIds,
    onToggleFileContext,
    totalContextTokens,
    onToggleMessageCollapsed,
    onCollapseAll,
    onExpandAll,
    onClearChat,
    aiSettings,
    setAiSettings,
    isCognitionRunning,
    onRunCognitionNow,
    rcb,
    onRcbSizeLimitChange,
    onApiTokenLimitChange,
    onApiTokenLimitMinChange,
    onViewTrace,
    onClearAllContexts,
    onClearAllTrapDoorStates,
    onFetchAllContextItems,
    onDeleteContextItem,
    onCreateWorkspace,
    onGetWorkspaces,
    onLoadWorkspace,
}) => {
    const [input, setInput] = useState('');
    const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { isListening, transcript, startListening, stopListening, isSupported, error: speechError } = useSpeechRecognition();

    const [isWorkflowDesignerOpen, setIsWorkflowDesignerOpen] = useState(false);
    const [isContextManagerOpen, setIsContextManagerOpen] = useState(false);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const visibleMessages = messages.filter(m => m.type === 'user_message' || m.type === 'model_response');
    const lastVisibleMessageId = visibleMessages[visibleMessages.length - 1]?.uuid;

    useEffect(() => {
        scrollToBottom();
    }, [lastVisibleMessageId, isLoading]);

    useEffect(() => {
        if (transcript) {
            setInput(transcript);
        }
    }, [transcript]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [input]);

    const handleSend = () => {
        const lastStage = aiSettings.workflow[aiSettings.workflow.length - 1];
        const activeModel = lastStage?.selectedModel;
        if (input.trim() && activeModel) {
            if (isLoading) {
                // Queue message if still generating
                setQueuedMessage(input.trim());
                setInput('');
            } else {
                sendMessage(input.trim());
                setInput('');
            }
            if (isListening) {
                stopListening();
            }
        } else if (!activeModel) {
            alert(`Please configure the final stage of your workflow in the Workflow Designer.`);
        }
    };

    // Send queued message when generation completes
    React.useEffect(() => {
        if (!isLoading && queuedMessage) {
            const timer = setTimeout(() => {
                sendMessage(queuedMessage);
                setQueuedMessage(null);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isLoading, queuedMessage, sendMessage]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const activeSynthesisModelName = aiSettings.workflow[aiSettings.workflow.length - 1]?.selectedModel || "None";

    return (
        <div className="flex flex-col h-full bg-gray-800">
            <header className="flex-shrink-0 p-3 border-b border-gray-700">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold">Conversation</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={onCollapseAll} title="Collapse All" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md"><CollapseIcon /></button>
                        <button onClick={onExpandAll} title="Expand All" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md"><ExpandIcon /></button>
                    </div>
                </div>
                <div className="flex flex-col gap-2 mt-2">
                    <ContextUsageBar rcb={rcb} onSizeLimitChange={onRcbSizeLimitChange} />
                    <ApiContextUsageBar totalTokens={totalContextTokens} tokenLimit={aiSettings.apiTokenLimit} tokenLimitMin={aiSettings.apiTokenLimitMin} onTokenLimitChange={onApiTokenLimitChange} onTokenLimitMinChange={onApiTokenLimitMinChange} onManage={() => setIsContextManagerOpen(true)} />
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {visibleMessages.map((msg) => (
                    <Message
                        key={msg.uuid}
                        atom={msg}
                        onToggleContext={onToggleMessageContext}
                        onToggleCollapsed={onToggleMessageCollapsed}
                        allMessages={messages}
                        allFiles={projectFiles}
                        onViewTrace={onViewTrace}
                        debugMode={aiSettings.debugSRG}
                        onInterruptLayer={onInterruptLayer}
                    />
                ))}
                <div ref={messagesEndRef} />
            </div>

            <footer className="flex-shrink-0 p-4 border-t border-gray-700 bg-gray-800">
                {error && (
                    <div className="bg-red-900/50 border border-red-700 text-red-300 p-3 rounded-md mb-2 text-sm flex justify-between items-center gap-4">
                        <p><strong>Error:</strong> {error.message}</p>
                        {error.message.toLowerCase().includes("model") && (
                            <button
                                onClick={() => setIsWorkflowDesignerOpen(true)}
                                className="flex-shrink-0 px-3 py-1 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-md text-xs whitespace-nowrap transition-colors"
                                title="Open Workflow Designer"
                            >
                                Change Model
                            </button>
                        )}
                    </div>
                )}
                {speechError && (
                    <div className="text-red-400 text-xs text-center mb-2">
                        Speech Recognition Error: {speechError}
                    </div>
                )}
                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isLoading ? "Type to queue your message for after this generation..." : "Type your message or ask about the files..."}
                        rows={1}
                        className={`w-full rounded-lg p-3 pr-40 resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none max-h-48 border transition-colors ${isLoading ? 'bg-gray-600 border-yellow-600' : 'bg-gray-700 border-gray-600'}`}
                    />
                    {queuedMessage && <div className="absolute bottom-12 left-3 right-3 text-xs text-yellow-400 bg-yellow-900/30 rounded px-2 py-1">Queued: "{queuedMessage}"</div>}
                    <div className="absolute right-3 bottom-2 flex items-center gap-2">
                        {isLoading ? (
                            <>
                                <button
                                    onClick={onInterruptLayer}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 text-black rounded-md hover:bg-yellow-400 transition-colors text-sm font-semibold"
                                    title="Skip this layer and pass its partial output to the next stage"
                                >
                                    ⏭ Skip
                                </button>
                                <button
                                    onClick={onStopGeneration}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
                                >
                                    <StopIcon /> Stop
                                </button>
                            </>
                        ) : (
                            <>
                                {isSupported && (
                                    <button
                                        onClick={isListening ? stopListening : startListening}
                                        className={`p-2 rounded-full transition-colors ${isListening ? 'bg-red-600 text-white animate-pulse' : 'text-gray-400 hover:bg-gray-600'}`}
                                        title={isListening ? 'Stop listening' : 'Start voice input'}
                                    >
                                        <MicrophoneIcon />
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsWorkflowDesignerOpen(true)}
                                    className={`p-2 rounded-full transition-colors ${isWorkflowDesignerOpen ? 'bg-cyan-800 text-white' : 'text-gray-400 hover:bg-gray-600'}`}
                                    title="Workflow Designer"
                                >
                                    <WorkflowIcon />
                                </button>
                            </>
                        )}
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || !activeSynthesisModelName || activeSynthesisModelName === 'None'}
                            className="p-2 bg-cyan-600 text-white rounded-full hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                            title={isLoading ? "Message will be queued" : "Send message"}
                        >
                            <PaperPlaneIcon />
                        </button>
                    </div>
                </div>
                {isLoading && (
                    <div className="flex items-center justify-center gap-2 text-sm text-cyan-400 pt-2">
                        <div className="animate-spin">⟳</div>
                        <span className="animate-pulse font-semibold">{loadingStage}</span>
                    </div>
                )}
            </footer>

            {isWorkflowDesignerOpen && (
                <WorkflowDesigner
                    isOpen={isWorkflowDesignerOpen}
                    onClose={() => setIsWorkflowDesignerOpen(false)}
                    settings={aiSettings}
                    setSettings={setAiSettings}
                    onClearMessages={onClearChat}
                    messages={messages}
                />
            )}

            <ContextManager
                isOpen={isContextManagerOpen}
                onClose={() => setIsContextManagerOpen(false)}
                messages={messages}
                projectFiles={projectFiles}
                contextFileIds={contextFileIds}
                onToggleMessageContext={onToggleMessageContext}
                onToggleFileContext={onToggleFileContext}
                onClearAllContexts={onClearAllContexts}
                onClearTrapDoorStates={onClearAllTrapDoorStates}
                onFetchAllItems={onFetchAllContextItems}
                onDeleteContextItem={onDeleteContextItem}
                onCreateWorkspace={onCreateWorkspace}
                onGetWorkspaces={onGetWorkspaces}
                onLoadWorkspace={onLoadWorkspace}
            />

        </div>
    );
};