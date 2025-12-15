
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { MemoryAtom, BackgroundInsight } from '../types';
import { SettingsIcon, LightbulbIcon, BrainIcon, BookIcon, GlobeIcon, ExpandIcon, CollapseIcon, RefreshIcon } from './icons';

interface CognitiveTraceViewerProps {
  trace?: MemoryAtom[];
  insight?: BackgroundInsight;
  isExpanded: boolean;
  setIsExpanded: (isExpanded: boolean) => void;
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

export const CognitiveTraceViewer: React.FC<CognitiveTraceViewerProps> = ({ trace, insight, isExpanded, setIsExpanded }) => {
    if (!trace?.length && !insight) {
        return null;
    }

    return (
        <div className="mt-4 border-t border-gray-700/50 pt-2">
            <button 
                onClick={() => setIsExpanded(!isExpanded)} 
                className="flex items-center gap-2 text-xs text-gray-400 hover:text-cyan-400 font-semibold"
            >
                <SettingsIcon />
                <span>{isExpanded ? 'Hide Internals' : 'Show Internals'}</span>
                {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </button>

            {isExpanded && (
                <div className="mt-2 pl-4 border-l-2 border-gray-700 space-y-4">
                    {trace?.map(atom => (
                        <div key={atom.uuid}>
                            <h5 className="flex items-center gap-2 text-xs font-bold text-gray-300 capitalize">
                                {getTraceIcon(atom.type)}
                                {atom.type.replace(/_/g, ' ')}
                            </h5>
                            <p className="text-xs text-gray-400 pl-6">{atom.text}</p>
                        </div>
                    ))}

                    {insight && (
                         <div>
                            <h5 className="flex items-center gap-2 text-xs font-bold text-gray-300 capitalize">
                                <GlobeIcon />
                                Background Insight
                            </h5>
                             <div className="pl-6 space-y-2 mt-1">
                                <p className="text-xs text-cyan-400" title={insight.query}>
                                    <strong>Searched:</strong> "{insight.query}"
                                </p>
                                <div className="prose prose-xs prose-invert text-gray-300 max-h-24 overflow-y-auto p-2 bg-black/20 rounded">
                                    <ReactMarkdown>{insight.insight}</ReactMarkdown>
                                </div>
                                {insight.sources.length > 0 && (
                                    <div>
                                        <p className="text-xs font-semibold text-gray-400 mb-1">Sources:</p>
                                        <ul className="space-y-1 max-h-20 overflow-y-auto">
                                            {insight.sources.map((source, s_index) => (
                                                <li key={s_index}>
                                                    <a 
                                                        href={source.web.uri} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-blue-400 hover:underline truncate block"
                                                        title={source.web.uri}
                                                    >
                                                        {source.web.title || source.web.uri}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};