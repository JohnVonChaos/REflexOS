import React, { useState, useEffect, useRef } from 'react';
import {
    CloseIcon as XMarkIcon,
    ExpandIcon as ArrowsPointingOutIcon,
    CollapseIcon as ArrowsPointingInIcon,
    CpuChipIcon,
    ClockIcon,
    ScaleIcon,
    ChatBubbleLeftRightIcon
} from './icons/index';
import { scratchpadService } from '../services/scratchpad';
import { contextDiffer } from '../services/contextDiffer';
import { WorkOrderPanel } from './WorkOrderPanel';
import type { ScratchpadEntry, ContextDiffEvent } from '../types/dualProcess';

export interface ChatEntry {
    role: 'user' | 'agent';
    text: string;
}

interface ReflexHUDProps {
    isOpen: boolean;
    onClose: () => void;
    embedded?: boolean;
    // Unified stream chat props — when provided, chat is merged into the log feed
    chatInput?: string;
    onChatInputChange?: (val: string) => void;
    onSendMessage?: () => void;
    chatHistory?: ChatEntry[];
    agentThinking?: boolean;
    chatEndRef?: React.RefObject<HTMLDivElement>;
}

export const ReflexHUD: React.FC<ReflexHUDProps> = ({
    isOpen,
    onClose,
    embedded = false,
    chatInput = '',
    onChatInputChange,
    onSendMessage,
    chatHistory = [],
    agentThinking = false,
    chatEndRef,
}) => {
    const [entries, setEntries] = useState<ScratchpadEntry[]>([]);
    const [diffEvents, setDiffEvents] = useState<ContextDiffEvent[]>([]);
    const [tension, setTension] = useState({ generator: 0, refiner: 0 });
    const [isFullscreen, setIsFullscreen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const prevEntryCountRef = useRef(0);
    const prevChatLengthRef = useRef(0);

    // Auto-scroll ONLY when new content arrives AND user is already near the bottom
    useEffect(() => {
        const el = scrollRef.current;
        const newEntries = entries.length > prevEntryCountRef.current;
        const newChat = chatHistory.length > prevChatLengthRef.current;
        if (el && (newEntries || newChat)) {
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            // Only pull to bottom if user is within 120px of the bottom
            if (distanceFromBottom < 120) {
                el.scrollTop = el.scrollHeight;
            }
        }
        prevEntryCountRef.current = entries.length;
        prevChatLengthRef.current = chatHistory.length;
    }, [entries, chatHistory]);

    useEffect(() => {
        if (!isOpen) return;

        const fetchData = async () => {
            try {
                const history = await scratchpadService.getRecentEntries(50);
                setEntries(history);

                const t = await scratchpadService.getTensionHistory();
                setTension(t);

                // Ideally context differ events would be stored and retrieved too
                // For now we might need to expose an event stream or poll a "last diff"
                // Assuming typical React usage, we might just fetch the last diff from a store if we had one
                // Since contextDiffer returns events only on process, we might not see "live" diffs here unless we hook into it.
                // For MVP, we'll leave diffs empty or mock if needed until we wire up a "DiffStore" similar to Scratchpad.
            } catch (e) {
                console.error("HUD Fetch Error", e);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 1000); // 1s polling
        return () => clearInterval(interval);
    }, [isOpen]);

    if (!isOpen) return null;

    const fixedClasses = isFullscreen
        ? "fixed inset-0 z-50 bg-gray-950 text-cyan-500 font-mono text-sm flex flex-col"
        : "fixed bottom-0 right-0 w-[800px] h-[600px] z-50 bg-gray-950 border-t border-l border-cyan-800 shadow-2xl text-cyan-500 font-mono text-sm flex flex-col rounded-tl-lg transition-all duration-300";

    const embeddedClasses = "absolute inset-0 bg-gray-950 text-cyan-500 font-mono text-sm flex flex-col";

    const containerClasses = embedded ? embeddedClasses : fixedClasses;

    // When embedded, render just the cockpit panels — no chrome, no footer
    if (embedded) {
        return (
            <div className="absolute inset-0 bg-gray-950 text-cyan-500 font-mono text-sm flex overflow-hidden">
                {/* Left Panel: Work Orders — full height */}
                <div className="w-64 flex-shrink-0 border-r border-cyan-900 bg-gray-900/20 overflow-y-auto overflow-x-hidden hidden md:block">
                    <WorkOrderPanel />
                </div>

                {/* Center: Log stream */}
                <div className="flex-1 flex flex-col bg-black/40 relative min-h-0">
                    <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_1px] z-10" />
                    <h3 className="absolute top-4 right-4 text-xs font-bold text-cyan-900/50 pointer-events-none uppercase tracking-[0.2em] z-0">Cognitive_Trace_Log</h3>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 z-20">
                        {entries.length === 0 && chatHistory.length === 0 && (
                            <div className="flex h-full items-center justify-center text-cyan-900">NO_ACTIVITY_DETECTED</div>
                        )}
                        {entries.map((entry) => (
                            <div key={entry.id} className={`flex flex-col border-l-2 pl-3 py-1 ${
                                entry.role === 'GENERATOR' ? 'border-green-500/50 text-green-400/90'
                                : entry.role === 'REFINER' ? 'border-purple-500/50 text-purple-400/90'
                                : 'border-blue-500/50 text-blue-400/90'
                            }`}>
                                <div className="flex items-center gap-2 text-[10px] opacity-70 mb-1 font-bold">
                                    <span className="uppercase">{typeof entry.role === 'string' ? entry.role : 'ERR_ROLE'}</span>
                                    <span className="text-gray-600">::</span>
                                    <span>{typeof entry.actionType === 'string' ? entry.actionType : 'ERR_ACTION'}</span>
                                    <span className="text-gray-600">::</span>
                                    <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                    {entry.tension === 'HIGH' && <span className="text-red-500 ml-auto">[TENSION:HIGH]</span>}
                                </div>
                                <div className="whitespace-pre-wrap leading-relaxed text-sm">
                                    {typeof entry.content === 'object' ? JSON.stringify(entry.content) : entry.content}
                                </div>
                            </div>
                        ))}
                        {chatHistory.map((msg, i) => (
                            <div key={`chat-${i}`} className={`flex gap-2 items-start ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'agent' && <span className="text-cyan-400 font-bold font-mono text-[10px] flex-shrink-0 mt-1">RALPH</span>}
                                <span className={`rounded px-3 py-1.5 text-xs max-w-[80%] whitespace-pre-wrap leading-relaxed ${
                                    msg.role === 'user' ? 'bg-gray-700 text-gray-100 border-r-2 border-gray-500' : 'bg-cyan-950 text-cyan-200 border border-cyan-900'
                                }`}>{msg.text}</span>
                                {msg.role === 'user' && <span className="text-gray-600 font-bold font-mono text-[10px] flex-shrink-0 mt-1">YOU</span>}
                            </div>
                        ))}
                        {agentThinking && (
                            <div className="flex gap-2 items-start">
                                <span className="text-cyan-400 font-bold font-mono text-[10px] flex-shrink-0 mt-1">RALPH</span>
                                <span className="text-cyan-800 text-xs italic animate-pulse">thinking...</span>
                            </div>
                        )}
                    </div>

                    {/* Chat input — only the center column, pinned above the status bar */}
                    {onSendMessage && (
                        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-t border-cyan-900 bg-gray-950">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={e => onChatInputChange?.(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key !== 'Enter' || !chatInput.trim() || agentThinking) return;
                                    e.preventDefault();
                                    onSendMessage();
                                }}
                                placeholder="Inject into stream..."
                                disabled={agentThinking}
                                className="flex-1 bg-gray-900 border border-gray-700 hover:border-cyan-700 focus:border-cyan-500 rounded-lg px-4 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-50 font-mono transition-colors"
                            />
                            <button
                                onClick={onSendMessage}
                                disabled={agentThinking || !chatInput.trim()}
                                className="flex-shrink-0 px-4 py-2 bg-cyan-800 hover:bg-cyan-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-bold rounded-lg transition-colors font-mono"
                            >⏎</button>
                        </div>
                    )}
                </div>

                {/* Right Panel: Stats — full height */}
                <div className="w-56 border-l border-cyan-900 bg-gray-900/20 p-4 hidden lg:block overflow-y-auto">
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-cyan-700 mb-2 border-b border-cyan-900 pb-1">SYSTEM_METRICS</h3>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs"><span className="text-cyan-600">MEMORY_USAGE</span><span className="text-cyan-300">{(window.performance as any)?.memory?.usedJSHeapSize ? Math.round((window.performance as any).memory.usedJSHeapSize / 1024 / 1024) + ' MB' : 'N/A'}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-cyan-600">ENTRIES</span><span className="text-cyan-300">{entries.length}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-cyan-600">UPTIME</span><span className="text-cyan-300">03:42:12</span></div>
                        </div>
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-cyan-700 mb-2 border-b border-cyan-900 pb-1">ACTIVE_DIRECTIVES</h3>
                        <ul className="text-xs space-y-2 text-gray-400">
                            <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">●</span><span>Maintain Cognitive Loop</span></li>
                            <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">●</span><span>Monitor Inputs</span></li>
                            <li className="flex items-start gap-2"><span className="text-purple-500 mt-0.5">●</span><span>Distill Insights</span></li>
                        </ul>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={containerClasses}>
            {/* Header / Cybernetic HUD Bar */}
            <header className="flex items-center justify-between px-4 py-2 border-b border-cyan-900 bg-gray-900/50 backdrop-blur">
                <div className="flex items-center gap-3">
                    <CpuChipIcon className="w-5 h-5 text-cyan-400 animate-pulse" />
                    <span className="font-bold tracking-widest text-cyan-400">REFLEX_OS // AGENT_WORKSPACE</span>
                    <span className="text-xs px-2 py-0.5 bg-cyan-900/30 text-cyan-300 rounded border border-cyan-800">
                        v2.4.0
                    </span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-xs text-cyan-600">
                        <ScaleIcon className="w-4 h-4" />
                        <span>GEN:{tension.generator} / REF:{tension.refiner}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsFullscreen(!isFullscreen)} className="hover:text-cyan-200">
                            {isFullscreen ? <ArrowsPointingInIcon className="w-5 h-5" /> : <ArrowsPointingOutIcon className="w-5 h-5" />}
                        </button>
                        <button onClick={onClose} className="hover:text-red-400">
                            <XMarkIcon className="w-5 h-5 font-bold" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Cockpit Area */}
            <div className="flex-1 flex overflow-hidden">

                {/* Left Panel: Work Orders */}
                <div className="w-64 flex-shrink-0 border-r border-cyan-900 bg-gray-900/20 overflow-y-auto overflow-x-hidden hidden md:block">
                    <WorkOrderPanel />
                </div>

                {/* Center Panel: The Arena (Scratchpad) */}
                <div className="flex-1 flex flex-col bg-black/40 relative">
                    {/* Overlay Grid/Scanlines */}
                    <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_1px] z-10"></div>

                    <h3 className="absolute top-4 right-4 text-xs font-bold text-cyan-900/50 pointer-events-none uppercase tracking-[0.2em] z-0">
                        Cognitive_Trace_Log
                    </h3>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 z-20">
                        {entries.length === 0 && chatHistory.length === 0 && (
                            <div className="flex h-full items-center justify-center text-cyan-900">
                                NO_ACTIVITY_DETECTED
                            </div>
                        )}
                        {entries.map((entry) => (
                            <div
                                key={entry.id}
                                className={`flex flex-col border-l-2 pl-3 py-1 ${entry.role === 'GENERATOR'
                                    ? 'border-green-500/50 text-green-400/90'
                                    : entry.role === 'REFINER'
                                        ? 'border-purple-500/50 text-purple-400/90'
                                        : 'border-blue-500/50 text-blue-400/90'
                                    }`}
                            >
                                <div className="flex items-center gap-2 text-[10px] opacity-70 mb-1 font-bold">
                                    <span className="uppercase">{typeof entry.role === 'string' ? entry.role : 'ERR_ROLE'}</span>
                                    <span className="text-gray-600">::</span>
                                    <span>{typeof entry.actionType === 'string' ? entry.actionType : 'ERR_ACTION'}</span>
                                    <span className="text-gray-600">::</span>
                                    <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                    {entry.tension === 'HIGH' && <span className="text-red-500 ml-auto">[TENSION:HIGH]</span>}
                                </div>
                                <div className="whitespace-pre-wrap leading-relaxed text-sm">
                                    {typeof entry.content === 'object' ? JSON.stringify(entry.content) : entry.content}
                                </div>
                            </div>
                        ))}

                        {/* ── Inline chat messages flow into the stream ── */}
                        {chatHistory.map((msg, i) => (
                            <div key={`chat-${i}`} className={`flex gap-2 items-start ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                {msg.role === 'agent' && (
                                    <span className="text-cyan-400 font-bold font-mono text-[10px] flex-shrink-0 mt-1">RALPH</span>
                                )}
                                <span className={`rounded px-3 py-1.5 text-xs max-w-[80%] whitespace-pre-wrap leading-relaxed ${
                                    msg.role === 'user'
                                        ? 'bg-gray-700 text-gray-100 border-r-2 border-gray-500'
                                        : 'bg-cyan-950 text-cyan-200 border border-cyan-900'
                                }`}>{msg.text}</span>
                                {msg.role === 'user' && (
                                    <span className="text-gray-600 font-bold font-mono text-[10px] flex-shrink-0 mt-1">YOU</span>
                                )}
                            </div>
                        ))}
                        {agentThinking && (
                            <div className="flex gap-2 items-start">
                                <span className="text-cyan-400 font-bold font-mono text-[10px] flex-shrink-0 mt-1">RALPH</span>
                                <span className="text-cyan-800 text-xs italic animate-pulse">thinking...</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Knowledge / Stats */}
                <div className="w-56 border-l border-cyan-900 bg-gray-900/20 p-4 border-t-0 hidden lg:block overflow-y-auto">
                    <div className="mb-6">
                        <h3 className="text-xs font-bold text-cyan-700 mb-2 border-b border-cyan-900 pb-1 flex items-center gap-2">
                            SYSTEM_METRICS
                        </h3>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-cyan-600">MEMORY_USAGE</span>
                                <span className="text-cyan-300">{(window.performance as any)?.memory?.usedJSHeapSize ? Math.round((window.performance as any).memory.usedJSHeapSize / 1024 / 1024) + ' MB' : 'N/A'}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-cyan-600">ENTRIES</span>
                                <span className="text-cyan-300">{entries.length}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-cyan-600">UPTIME</span>
                                <span className="text-cyan-300">03:42:12</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-xs font-bold text-cyan-700 mb-2 border-b border-cyan-900 pb-1">
                            ACTIVE_DIRECTIVES
                        </h3>
                        <ul className="text-xs space-y-2 text-gray-400">
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">●</span>
                                <span>Maintain Cognitive Loop</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">●</span>
                                <span>Monitor Inputs</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-purple-500 mt-0.5">●</span>
                                <span>Distill Insights</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Footer: chat input when embedded+interactive, otherwise status bar */}
            {embedded && onSendMessage ? (
                <div className="flex-shrink-0 flex flex-col border-t border-cyan-900 bg-gray-950">
                    {/* Thin status strip */}
                    <div className="flex justify-between items-center px-3 py-0.5 text-[10px] text-cyan-800 border-b border-cyan-900/40">
                        <div className="flex gap-4">
                            <span>STATUS: ONLINE</span>
                            <span>MODE: DUAL_PROCESS_ENABLED</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {agentThinking && <span className="animate-pulse text-cyan-400">RALPH THINKING...</span>}
                            {!agentThinking && <span className="text-cyan-900">AWAITING_INPUT_STREAM...</span>}
                        </div>
                    </div>
                    {/* Input row */}
                    <div className="flex items-center gap-2 px-3 py-2">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={e => onChatInputChange?.(e.target.value)}
                            onKeyDown={async e => {
                                if (e.key !== 'Enter' || !chatInput.trim() || agentThinking) return;
                                e.preventDefault();
                                onSendMessage();
                            }}
                            placeholder="Inject into stream..."
                            disabled={agentThinking}
                            className="flex-1 bg-gray-900 border border-gray-700 hover:border-cyan-700 focus:border-cyan-500 rounded-lg px-4 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-50 font-mono transition-colors"
                        />
                        <button
                            onClick={onSendMessage}
                            disabled={agentThinking || !chatInput.trim()}
                            className="flex-shrink-0 px-4 py-2 bg-cyan-800 hover:bg-cyan-600 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-bold rounded-lg transition-colors font-mono"
                        >
                            ⏎
                        </button>
                    </div>
                </div>
            ) : (
                <footer className="bg-cyan-950/80 border-t border-cyan-900 px-3 py-1 flex justify-between items-center text-[10px] text-cyan-600">
                    <div className="flex gap-4">
                        <span>STATUS: ONLINE</span>
                        <span>MODE: DUAL_PROCESS_ENABLED</span>
                    </div>
                    <div className="animate-pulse text-cyan-400">
                        AWAITING_INPUT_STREAM...
                    </div>
                </footer>
            )}
        </div>
    );
};
