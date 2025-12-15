
import React from 'react';
import type { MemoryAtom } from '../types';
import { CloseIcon, BookIcon } from './icons';
import { ToggleSwitch } from './ToggleSwitch';

interface AxiomsViewerProps {
    isOpen: boolean;
    onClose: () => void;
    axioms: MemoryAtom[];
    onToggleContext: (uuid: string) => void;
}

export const AxiomsViewer: React.FC<AxiomsViewerProps> = ({ isOpen, onClose, axioms, onToggleContext }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="font-semibold text-lg">Axiom Viewer</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700"><CloseIcon /></button>
                    </div>
                </header>
                <div className="p-4 overflow-y-auto">
                    {axioms.length === 0 ? (
                        <p className="text-gray-400 italic text-center py-8">No axioms have been generated yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {axioms.map(axiom => (
                                <li
                                    key={axiom.uuid}
                                    className="group relative flex items-start gap-3 p-3 rounded-md bg-gray-900/50 hover:bg-gray-700/50"
                                >
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-gray-900 text-white text-xs rounded-md py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-gray-600 shadow-lg">
                                        <div>Created: {new Date(axiom.timestamp).toLocaleString()}</div>
                                        <div>Last Activated: {axiom.lastActivatedAt ? new Date(axiom.lastActivatedAt).toLocaleString() : 'N/A'}</div>
                                    </div>

                                    <div className="flex-shrink-0 pt-1"><BookIcon /></div>
                                    <span className="flex-1 text-sm text-gray-300">{axiom.text}</span>
                                    <div className="flex-shrink-0 flex items-center gap-3">
                                        {axiom.isInContext && (
                                            <span className="text-xs text-cyan-400 bg-cyan-900/50 px-2 py-0.5 rounded-full">
                                                {axiom.orbitalDecayTurns === -1 
                                                    ? 'Orbit: Permanent' 
                                                    : `Orbit: ${axiom.orbitalDecayTurns ?? 'New'} turns`}
                                            </span>
                                        )}
                                        <ToggleSwitch 
                                            checked={axiom.isInContext} 
                                            onToggle={() => onToggleContext(axiom.uuid)} 
                                            title="Include in context" 
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};
