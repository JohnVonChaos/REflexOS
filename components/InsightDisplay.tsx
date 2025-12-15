
import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { MemoryAtom, BackgroundInsight } from '../types';
import { ToggleSwitch } from './ToggleSwitch';

interface InsightDisplayProps {
  atom: MemoryAtom & { backgroundInsight: BackgroundInsight };
  onToggleContext: (uuid: string) => void;
}

export const InsightDisplay: React.FC<InsightDisplayProps> = ({ atom, onToggleContext }) => {
    // Safety check for required data
    if (!atom || !atom.backgroundInsight) {
        return (
            <div className="p-2 bg-gray-800/50 rounded-md border border-gray-700/50 text-gray-400 text-xs">
                Invalid insight data
            </div>
        );
    }

    const insight = atom.backgroundInsight;

    return (
        <div
            className="group relative p-2 bg-gray-800/50 rounded-md border border-gray-700/50 space-y-2"
        >
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-gray-900 text-white text-xs rounded-md py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-gray-600 shadow-lg">
                <div>Created: {new Date(atom.timestamp).toLocaleString()}</div>
                <div>Last Activated: {atom.lastActivatedAt ? new Date(atom.lastActivatedAt).toLocaleString() : 'N/A'}</div>
            </div>

            <div className="flex justify-between items-center">
                <p className="text-xs font-semibold text-gray-400">Background Insight</p>
                <div className="flex items-center gap-3">
                    {atom.isInContext && (
                        <span className="text-xs text-cyan-400 bg-cyan-900/50 px-2 py-0.5 rounded-full">
                            {atom.orbitalDecayTurns === -1 
                                ? 'Orbit: Permanent' 
                                : `Orbit: ${atom.orbitalDecayTurns ?? 'New'} turns`}
                        </span>
                    )}
                    <ToggleSwitch 
                        checked={atom.isInContext} 
                        onToggle={() => onToggleContext(atom.uuid)} 
                        title={atom.isInContext ? "Exclude from context" : "Include in context"}
                    />
                </div>
            </div>
            <div className="space-y-2">
                <p className="text-xs text-cyan-400" title={insight.query || ''}>
                    <strong>Searched:</strong> "{insight.query || 'N/A'}"
                </p>
                <div className="prose prose-xs prose-invert max-w-full text-gray-300 max-h-24 overflow-y-auto p-2 bg-black/20 rounded">
                    <ReactMarkdown>{insight.insight || 'No insight text available'}</ReactMarkdown>
                </div>
                {insight.sources && Array.isArray(insight.sources) && insight.sources.length > 0 && (
                    <details className="text-xs">
                        <summary className="cursor-pointer text-gray-400 font-semibold">Sources ({insight.sources.length})</summary>
                        <ul className="space-y-1 mt-1 pl-2 max-h-20 overflow-y-auto">
                            {insight.sources.map((source, s_index) => (
                                <li key={s_index}>
                                    <a 
                                        href={source?.web?.uri} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:underline truncate block"
                                        title={source?.web?.uri}
                                    >
                                        {source.web.title || source.web.uri}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </details>
                )}
            </div>
        </div>
    );
};
