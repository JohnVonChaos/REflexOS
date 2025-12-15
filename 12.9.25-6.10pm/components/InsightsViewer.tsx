
import React from 'react';
import type { MemoryAtom, BackgroundInsight } from '../types';
import { CloseIcon } from './icons';
import { InsightDisplay } from './InsightDisplay';

interface InsightsViewerProps {
    isOpen: boolean;
    onClose: () => void;
    insights: (MemoryAtom & { backgroundInsight: BackgroundInsight })[];
    onToggleContext: (uuid: string) => void;
}

export const InsightsViewer: React.FC<InsightsViewerProps> = ({ isOpen, onClose, insights, onToggleContext }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="font-semibold text-lg">Background Insights Viewer</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700"><CloseIcon /></button>
                    </div>
                </header>
                <div className="p-4 overflow-y-auto">
                    {insights.length === 0 ? (
                        <p className="text-gray-400 italic text-center py-8">No background insights have been generated yet.</p>
                    ) : (
                        <div className="space-y-4">
                            {insights.map(insightAtom => (
                                <InsightDisplay 
                                    key={insightAtom.uuid} 
                                    atom={insightAtom} 
                                    onToggleContext={onToggleContext} 
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};