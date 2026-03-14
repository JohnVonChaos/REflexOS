import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { MemoryAtom, BackgroundInsight } from '../types';
import { SettingsIcon, LightbulbIcon, BrainIcon, BookIcon, GlobeIcon, ExpandIcon, CollapseIcon, RefreshIcon } from './icons';

interface CognitiveTraceViewerProps {
  trace?: MemoryAtom[];
  insight?: BackgroundInsight;
  isExpanded: boolean;
  setIsExpanded: (isExpanded: boolean) => void;
  debugMode?: boolean;
  onInterruptLayer?: () => void;
}

const getTraceIcon = (type: MemoryAtom['type']) => {
    switch(type) {
        case 'conscious_thought': return <LightbulbIcon />;
        case 'subconscious_reflection': return <BrainIcon />;
        case 'axiom': return <BookIcon />;
        case 'srg_augmentation': return <RefreshIcon />;
        default: return null;
    }
};

const TraceLayer: React.FC<{
    atom: MemoryAtom;
    onInterruptLayer?: () => void;
    debugMode?: boolean;
    forceExpand?: boolean;
}> = ({ atom, onInterruptLayer, debugMode, forceExpand }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());

    const togglePrompt = (id: string) => {
        setExpandedPrompts(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const isLayerExpanded = forceExpand || atom.isGenerating || isHovered || expandedPrompts.size > 0;

    return (
        <div 
            className="mb-2 bg-gray-900/60 rounded border border-gray-700 overflow-hidden transition-all duration-300"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="flex items-center justify-between p-2 cursor-pointer bg-gray-800/80">
                <h5 className="flex items-center gap-2 text-xs font-bold text-gray-300 capitalize">
                    {getTraceIcon(atom.type)}
                    {(atom as any).name || atom.type.replace(/_/g, ' ')}
                    {atom.isGenerating && <span className="animate-pulse text-cyan-400"> (Thinking...)</span>}
                </h5>
                <div className="flex items-center gap-2">
                    {atom.isGenerating && onInterruptLayer && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onInterruptLayer(); setIsHovered(false); }}
                            className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded transition-colors"
                        >
                            Interrupt
                        </button>
                    )}
                    {isLayerExpanded ? <CollapseIcon /> : <ExpandIcon />}
                </div>
            </div>

            {isLayerExpanded && (
                <div className="p-3 border-t border-gray-700/50">
                    <p className="text-xs text-gray-400 whitespace-pre-wrap">{atom.text || <span className="italic">Generating...</span>}</p>

                    {debugMode && atom.promptDetails && (
                        <div className="mt-2 pl-2 border-l border-gray-800">
                            <button
                                onClick={() => togglePrompt(atom.uuid)}
                                className="text-xs text-purple-400 hover:text-purple-300 underline"
                            >
                                {expandedPrompts.has(atom.uuid) ? '▼ Hide Full Prompt' : '▶ Show Full Prompt'}
                            </button>
                            {expandedPrompts.has(atom.uuid) && (
                                <div className="mt-2 space-y-2 bg-gray-900/50 p-2 rounded text-xs">
                                    <div>
                                        <p className="font-bold text-purple-300">Stage: {atom.promptDetails.stageName}</p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-blue-300">System Prompt:</p>
                                        <pre className="mt-1 text-gray-300 whitespace-pre-wrap max-h-32 overflow-y-auto bg-black/30 p-2 rounded">
                                            {atom.promptDetails.systemPrompt}
                                        </pre>
                                    </div>
                                    <div>
                                        <p className="font-bold text-green-300">User Prompt (Assembled Context):</p>
                                        <pre className="mt-1 text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto bg-black/30 p-2 rounded">
                                            {atom.promptDetails.userPrompt}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const CognitiveTraceViewer: React.FC<CognitiveTraceViewerProps> = ({ trace, insight, isExpanded, setIsExpanded, debugMode, onInterruptLayer }) => {
    const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());

    const togglePrompt = (id: string) => {
        setExpandedPrompts(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (!trace?.length && !insight) {
        return null;
    }

    // Determine if any layer is generating; if so, we can let them auto-expand themselves
    // but we still wrap them in a container.

    return (
        <div className="mt-4 border-t border-gray-700/50 pt-2 space-y-2">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-2 text-xs text-gray-400 hover:text-cyan-400 font-semibold mb-2"
            >
                <SettingsIcon />
                <span>{isExpanded ? 'Collapse All Layers' : 'Force Expand All Layers'}</span>
                {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </button>

            <div className="space-y-2">
                {trace?.map(atom => (
                    <TraceLayer 
                        key={atom.uuid} 
                        atom={atom} 
                        onInterruptLayer={onInterruptLayer} 
                        debugMode={debugMode} 
                        forceExpand={isExpanded} 
                    />
                ))}

                {insight && (
                    <div className={`mb-2 bg-gray-900/60 rounded border border-gray-700 overflow-hidden transition-all duration-300`}>
                        <div className="flex items-center justify-between p-2 cursor-pointer bg-gray-800/80">
                            <h5 className="flex items-center gap-2 text-xs font-bold text-gray-300 capitalize">
                                <GlobeIcon /> Background Insight
                            </h5>
                        </div>
                        <div className="p-3 border-t border-gray-700/50">
                            <p className="text-xs text-cyan-400 mb-2 truncate" title={insight.query}>
                                <strong>Searched:</strong> "{insight.query}"
                            </p>
                            <div className="prose prose-xs prose-invert text-gray-300 max-h-32 overflow-y-auto p-2 bg-black/20 rounded">
                                <ReactMarkdown>{insight.insight}</ReactMarkdown>
                            </div>
                            {insight.sources.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-[10px] font-semibold text-gray-500 mb-1">Sources:</p>
                                    <ul className="space-y-0.5 max-h-20 overflow-y-auto">
                                        {insight.sources.map((source, s_index) => (
                                            <li key={s_index}>
                                                <a href={source.web.uri} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline truncate block" title={source.web.uri}>
                                                    {source.web.title || source.web.uri}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {debugMode && insight.promptDetails && (
                                <div className="mt-2 pl-2 border-l border-gray-800">
                                    <button
                                        onClick={() => togglePrompt('background-insight')}
                                        className="text-[10px] text-purple-400 hover:text-purple-300 underline"
                                    >
                                        {expandedPrompts.has('background-insight') ? '▼ Hide Full Prompt' : '▶ Show Full Prompt'}
                                    </button>
                                    {expandedPrompts.has('background-insight') && (
                                        <div className="mt-2 space-y-2 bg-gray-900/50 p-2 rounded text-[10px]">
                                            <div>
                                                <p className="font-bold text-purple-300">Stage: {insight.promptDetails.stageName}</p>
                                            </div>
                                            <div>
                                                <p className="font-bold text-blue-300">System Prompt:</p>
                                                <pre className="mt-1 text-gray-300 whitespace-pre-wrap max-h-32 overflow-y-auto bg-black/30 p-2 rounded">
                                                    {insight.promptDetails.systemPrompt}
                                                </pre>
                                            </div>
                                            <div>
                                                <p className="font-bold text-green-300">User Prompt (Assembled Context):</p>
                                                <pre className="mt-1 text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto bg-black/30 p-2 rounded">
                                                    {insight.promptDetails.userPrompt}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};