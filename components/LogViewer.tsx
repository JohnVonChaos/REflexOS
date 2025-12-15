import React, { useState, useEffect, useRef } from 'react';
import { loggingService } from '../services/loggingService';
import type { LogEntry, LogLevel } from '../types';
import { CloseIcon, TrashIcon, ExpandIcon } from './icons';

interface LogViewerProps {
    isOpen: boolean;
    onClose: () => void;
}

const LogLevelPill: React.FC<{ level: LogLevel }> = ({ level }) => {
    const styles = {
        INFO: 'bg-blue-900 text-blue-300 border-blue-700',
        DEBUG: 'bg-green-900 text-green-300 border-green-700',
        WARN: 'bg-yellow-900 text-yellow-300 border-yellow-700',
        ERROR: 'bg-red-900 text-red-300 border-red-700',
    };
    return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${styles[level]}`}>{level}</span>;
}

const ALL_LEVELS: LogLevel[] = ['INFO', 'DEBUG', 'WARN', 'ERROR'];

export const LogViewer: React.FC<LogViewerProps> = ({ isOpen, onClose }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [activeLevels, setActiveLevels] = useState<Set<LogLevel>>(new Set(ALL_LEVELS));
    const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const updateLogs = () => {
            setLogs([...loggingService.getLogs()]);
        };
        loggingService.addListener(updateLogs);
        updateLogs(); // Initial load
        return () => loggingService.removeListener(updateLogs);
    }, [isOpen]);

    useEffect(() => {
        // Auto-scroll to bottom
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const toggleLevel = (level: LogLevel) => {
        setActiveLevels(prev => {
            const newSet = new Set(prev);
            if (newSet.has(level)) {
                newSet.delete(level);
            } else {
                newSet.add(level);
            }
            return newSet;
        });
    };

    const handleClearLogs = () => {
        // Removed confirm dialog due to sandboxing issues.
        loggingService.clearLogs();
    };

    const toggleExpandLog = (index: number) => {
        setExpandedLogs(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) newSet.delete(index);
            else newSet.add(index);
            return newSet;
        });
    };
    
    const handleExpandAll = () => {
        if (expandedLogs.size === logs.length) {
            setExpandedLogs(new Set());
        } else {
            setExpandedLogs(new Set(logs.map((_, i) => i)));
        }
    };

    if (!isOpen) return null;

    const filteredLogs = logs.filter(log => activeLevels.has(log.level));

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700 flex-shrink-0">
                    <h2 className="font-semibold text-lg">Application Logs</h2>
                    <div className="flex items-center gap-2">
                         <button onClick={handleExpandAll} className="flex items-center gap-2 p-2 text-sm rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                            <ExpandIcon /> {expandedLogs.size === logs.length ? 'Collapse All' : 'Expand All'}
                        </button>
                        <button onClick={handleClearLogs} className="flex items-center gap-2 p-2 text-sm rounded-md bg-gray-700 hover:bg-red-800 text-gray-300 transition-colors"><TrashIcon /> Clear Logs</button>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700"><CloseIcon /></button>
                    </div>
                </header>
                <div className="p-4 border-b border-gray-700 flex-shrink-0 flex items-center gap-4">
                    <span className="text-sm font-semibold">Filter by Level:</span>
                    <div className="flex gap-2">
                        {ALL_LEVELS.map(level => (
                            <label key={level} className="flex items-center gap-2 cursor-pointer text-sm">
                                <input
                                    type="checkbox"
                                    checked={activeLevels.has(level)}
                                    onChange={() => toggleLevel(level)}
                                    className="form-checkbox bg-gray-700 border-gray-600 rounded text-cyan-500 focus:ring-cyan-600"
                                />
                                <LogLevelPill level={level} />
                            </label>
                        ))}
                    </div>
                </div>
                <div ref={logContainerRef} className="p-4 overflow-y-auto flex-1 font-mono text-xs space-y-2">
                    {filteredLogs.map((log, index) => (
                        <div key={index} className="p-2 rounded bg-gray-900/50 hover:bg-gray-800/50 transition-colors">
                            <div className="flex items-start gap-3 cursor-pointer" onClick={() => toggleExpandLog(index)}>
                                <span className="text-gray-500 whitespace-nowrap mt-0.5">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                <LogLevelPill level={log.level} />
                                <span className="text-gray-300 flex-1 break-words">{log.message}</span>
                                {log.data && (
                                    <span className="text-gray-500 text-[10px]">{expandedLogs.has(index) ? '▼' : '▶'}</span>
                                )}
                            </div>
                            {log.data && expandedLogs.has(index) && (
                                <div className="mt-2 ml-12">
                                    <div className="bg-black/50 p-3 rounded-md border border-gray-700 overflow-auto max-h-60">
                                        <pre className="text-gray-400 whitespace-pre-wrap break-all">
                                            <code>{JSON.stringify(log.data, null, 2)}</code>
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    {filteredLogs.length === 0 && <p className="text-gray-500 italic text-center py-4">No logs to display for the selected levels.</p>}
                </div>
            </div>
        </div>
    );
};