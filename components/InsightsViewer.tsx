
import React, { useMemo } from 'react';
import type { MemoryAtom, BackgroundInsight } from '../types';
import { CloseIcon } from './icons';
import { InsightDisplay } from './InsightDisplay';

interface InsightsViewerProps {
    isOpen: boolean;
    onClose: () => void;
    insights: (MemoryAtom & { backgroundInsight: BackgroundInsight })[];
    onToggleContext: (uuid: string) => void;
}

// Semantic similarity check for deduplication
function areSimilarInsights(a: BackgroundInsight, b: BackgroundInsight): boolean {
    // Same query = duplicate
    if (a.query.toLowerCase().trim() === b.query.toLowerCase().trim()) {
        return true;
    }

    // Both are errors with similar messages
    const aIsError = a.insight.includes('error') || a.insight.includes('500') || a.insight.includes('failed');
    const bIsError = b.insight.includes('error') || b.insight.includes('500') || b.insight.includes('failed');

    if (aIsError && bIsError) {
        // Extract error type
        const aError = a.insight.substring(0, 100).toLowerCase();
        const bError = b.insight.substring(0, 100).toLowerCase();

        // If first 100 chars are >70% similar, it's the same error
        let matches = 0;
        const minLen = Math.min(aError.length, bError.length);
        for (let i = 0; i < minLen; i++) {
            if (aError[i] === bError[i]) matches++;
        }

        return (matches / minLen) > 0.7;
    }

    return false;
}

export const InsightsViewer: React.FC<InsightsViewerProps> = ({ isOpen, onClose, insights, onToggleContext }) => {
    // Deduplicate insights - keep most recent of each group
    const dedupedInsights = useMemo(() => {
        const groups: Map<string, (MemoryAtom & { backgroundInsight: BackgroundInsight })[]> = new Map();

        // Group similar insights
        for (const insight of insights) {
            let foundGroup = false;

            for (const [key, group] of groups.entries()) {
                if (areSimilarInsights(insight.backgroundInsight, group[0].backgroundInsight)) {
                    group.push(insight);
                    foundGroup = true;
                    break;
                }
            }

            if (!foundGroup) {
                groups.set(insight.uuid, [insight]);
            }
        }

        // Return most recent from each group, with count
        return Array.from(groups.values()).map(group => ({
            ...group[group.length - 1], // Most recent
            duplicateCount: group.length,
            allUuids: group.map(i => i.uuid)
        }));
    }, [insights]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="font-semibold text-lg">Background Insights Viewer</h2>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">{dedupedInsights.length} unique ({insights.length} total)</span>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700"><CloseIcon /></button>
                    </div>
                </header>
                <div className="p-4 overflow-y-auto">
                    {dedupedInsights.length === 0 ? (
                        <p className="text-gray-400 italic text-center py-8">No background insights have been generated yet.</p>
                    ) : (
                        <div className="space-y-4">
                            {dedupedInsights.map(insightAtom => (
                                <div key={insightAtom.uuid}>
                                    {insightAtom.duplicateCount > 1 && (
                                        <div className="text-xs text-yellow-400 mb-1">
                                            ⚠️ {insightAtom.duplicateCount} duplicate{insightAtom.duplicateCount > 1 ? 's' : ''} collapsed
                                        </div>
                                    )}
                                    <InsightDisplay
                                        atom={insightAtom}
                                        onToggleContext={onToggleContext}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};