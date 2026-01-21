


import React, { useState, useRef, useEffect } from 'react';
import type { MemoryAtom, AISettings, ProjectFile, RunningContextBuffer } from '../types';
import { Message } from './Message';
import { PaperPlaneIcon, StopIcon, TrashIcon, CollapseIcon, ExpandIcon, MicrophoneIcon, SettingsIcon, CloseIcon, RefreshIcon, WorkflowIcon } from './icons';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { ToggleSwitch } from './ToggleSwitch';
import { WorkflowDesigner } from './WorkflowDesigner';

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
}> = ({ isOpen, onClose, messages, projectFiles, contextFileIds, onToggleMessageContext, onToggleFileContext, onClearAllContexts, onClearTrapDoorStates, onFetchAllItems, onDeleteContextItem }) => {
    if (!isOpen) return null;
  const [showAllItems, setShowAllItems] = useState(false);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(undefined);

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
    
    const contextFiles = projectFiles.filter(f => contextFileIds.includes(f.id));
    const contextInsights = messages.filter(m => m.isInContext && m.type === 'steward_note' && !!m.backgroundInsight);
    const contextRegularMessages = messages.filter(m => m.isInContext && (m.type === 'user_message' || m.type === 'model_response'));

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="font-semibold text-lg">Context Manager</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700"><CloseIcon /></button>
                </header>
                <div className="p-4 overflow-y-auto space-y-6">
                  <div className="flex gap-2 mb-2 items-center">
                    <button onClick={async () => { await onClearAllContexts(); await refreshAllItems(); await refreshWorkspaces(); }} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded-md text-xs">Set-Aside All Context</button>
                    <button onClick={async () => { await onClearTrapDoorStates(); await refreshAllItems(); }} className="px-3 py-1 bg-yellow-700 hover:bg-yellow-600 text-white rounded-md text-xs">Clear Trap Door</button>
                    <button onClick={async () => { setShowAllItems(prev => !prev); if (!showAllItems) await refreshAllItems(); }} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-xs">{showAllItems ? 'Hide All Items' : 'Show All Items'}</button>
                    <div className="ml-4 flex items-center gap-2">
                        <input value={newWorkspaceName} onChange={(e) => setNewWorkspaceName(e.target.value)} placeholder="New workspace name" className="bg-gray-900 p-1 rounded-md text-sm w-44" />
                        <button onClick={async () => {
                            const itemIds = allItems.filter(it => it.tier === 'LIVE').map(it => it.id);
                            await onCreateWorkspace(newWorkspaceName || `ws_${Date.now()}`, itemIds, contextFileIds);
                            setNewWorkspaceName('');
                            await refreshWorkspaces();
                        }} className="px-2 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs">Save Workspace</button>
                        <select value={selectedWorkspaceId} onChange={(e) => setSelectedWorkspaceId(e.target.value)} className="bg-gray-900 p-1 rounded-md text-sm">
                            <option value="">Select workspace...</option>
                            {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                        <button onClick={async () => { if (selectedWorkspaceId) { await onLoadWorkspace(selectedWorkspaceId); await refreshAllItems(); await refreshWorkspaces(); } }} className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded-md text-xs">Load Workspace</button>
                    </div>
                  </div>
                    <div>
                        <h3 className="font-semibold text-gray-300 mb-2">Files in Context ({contextFiles.length})</h3>
                        <ul className="space-y-1 bg-gray-900/50 p-2 rounded-md">
                            {contextFiles.map(file => (
                                <li key={file.id} className="flex justify-between items-center p-1.5">
                                    <span className="text-sm truncate">{file.name}</span>
                                    <ToggleSwitch checked={true} onToggle={() => onToggleFileContext(file.id)} />
                                </li>
                            ))}
                        </ul>
                    </div>
                     {contextInsights.length > 0 && (
                        <div>
                            <h3 className="font-semibold text-gray-300 mb-2">Insights in Context ({contextInsights.length})</h3>
                            <ul className="space-y-1 bg-gray-900/50 p-2 rounded-md">
                                {contextInsights.map(msg => (
                                    <li key={msg.uuid} className="flex justify-between items-center p-1.5">
                                        <span className="text-sm truncate italic text-gray-400">Insight: "{msg.backgroundInsight!.query}"</span>
                                        <ToggleSwitch checked={true} onToggle={() => onToggleMessageContext(msg.uuid)} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                     <div>
                        <h3 className="font-semibold text-gray-300 mb-2">Messages in Context ({contextRegularMessages.length})</h3>
                        <ul className="space-y-2 bg-gray-900/50 p-2 rounded-md">
                            {contextRegularMessages.map(msg => (
                                <li key={msg.uuid} className="flex justify-between items-center p-1.5 text-sm">
                                    <p className="truncate text-gray-400 italic">[{msg.role}] {msg.text}</p>
                                    <ToggleSwitch checked={true} onToggle={() => onToggleMessageContext(msg.uuid)} />
                                </li>
                            ))}
                        </ul>
                    </div>
                    {showAllItems && (
                      <div>
                        <h3 className="font-semibold text-gray-300 mb-2">All Stored Context Items ({allItems.length})</h3>
                        <ul className="space-y-1 bg-gray-900/50 p-2 rounded-md">
                          {allItems.map((it) => (
                            <li key={it.id} className="flex justify-between items-center p-1.5">
                              <div className="text-sm truncate">{it.id} — {String(it.text).substring(0, 120)}</div>
                              <div className="flex items-center gap-2">
                                            <button onClick={async () => { await (onDeleteContextItem as any)(it.id); await refreshAllItems(); }} className="text-xs px-2 py-1 bg-amber-700 hover:bg-amber-600 rounded-md">Set-Aside</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
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
    onManage: () => void;
}> = ({ totalTokens, tokenLimit, onManage }) => {
    if (tokenLimit <= 0) return null;

    const usagePercentage = (totalTokens / tokenLimit) * 100;
    const usageColor = usagePercentage > 95 ? 'bg-red-600' : usagePercentage > 80 ? 'bg-yellow-500' : 'bg-cyan-500';

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
  onViewTrace: (traceIds: string[]) => void;
  onClearAllContexts: () => Promise<void>;
  onClearAllTrapDoorStates: () => Promise<void>;
  onFetchAllContextItems: () => Promise<any[]>;
  onDeleteContextItem: (id: string) => Promise<void>;
  onCreateWorkspace: (name: string, itemIds: string[], fileIds?: string[], description?: string) => Promise<void>;
  onGetWorkspaces: () => Promise<any[]>;
  onLoadWorkspace: (id: string) => Promise<void>;
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
  onViewTrace,
}) => {
  const [input, setInput] = useState('');
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
    if (input.trim() && !isLoading && activeModel) {
      sendMessage(input.trim());
      setInput('');
      if (isListening) {
        stopListening();
      }
    } else if (!activeModel) {
        alert(`Please configure the final stage of your workflow in the Workflow Designer.`);
    }
  };

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
                <button onClick={onClearChat} title="Clear Chat" className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-700 rounded-md"><TrashIcon /></button>
            </div>
        </div>
        <div className="flex flex-col gap-2 mt-2">
            <ContextUsageBar rcb={rcb} onSizeLimitChange={onRcbSizeLimitChange} />
            <ApiContextUsageBar totalTokens={totalContextTokens} tokenLimit={aiSettings.apiTokenLimit} onManage={() => setIsContextManagerOpen(true)} />
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
            placeholder="Type your message or ask about the files..."
            rows={1}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 pr-40 resize-none focus:ring-2 focus:ring-cyan-500 focus:outline-none max-h-48"
            disabled={isLoading}
          />
          <div className="absolute right-3 bottom-2 flex items-center gap-2">
            {isLoading ? (
              <button
                onClick={onStopGeneration}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm"
              >
                <StopIcon /> Stop
              </button>
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
              disabled={isLoading || !input.trim() || !activeSynthesisModelName || activeSynthesisModelName === 'None'}
              className="p-2 bg-cyan-600 text-white rounded-full hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              <PaperPlaneIcon />
            </button>
          </div>
        </div>
         {isLoading && <div className="text-center text-xs text-cyan-400 animate-pulse pt-2">{loadingStage}</div>}
      </footer>
      
      {isWorkflowDesignerOpen && (
          <WorkflowDesigner
            isOpen={isWorkflowDesignerOpen}
            onClose={() => setIsWorkflowDesignerOpen(false)}
            settings={aiSettings}
            setSettings={setAiSettings}
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