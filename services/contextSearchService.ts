import { srgService } from './srgService';
import { contextTierManager } from './contextTierManager';

interface ContextSearchResult {
    itemId: string;
    text: string;
    tier: 'LIVE' | 'POSTIT' | 'DEEP';
    relevance: number; // 0-1 score
    matchedTerms: string[];
    reason: string; // Why this matched
    messageUuid?: string;
    fileId?: string;
}

/**
 * Context Search Engine
 * Uses SRG to semantically search through stored context items
 * Finds related items based on concept/meaning, not just keyword matching
 */
class ContextSearchService {
    async searchContext(query: string): Promise<ContextSearchResult[]> {
        if (!query || query.trim().length === 0) return [];

        try {
            // Get all stored context items
            const allItems = await contextTierManager.getAllContextItems();
            const results: ContextSearchResult[] = [];

            // For each item, calculate relevance using SRG
            for (const item of allItems) {
                const relevance = await this.calculateItemRelevance(query, item);
                
                if (relevance.score > 0.1) { // Threshold to filter noise
                    results.push({
                        itemId: item.id,
                        text: String(item.text || '').substring(0, 150),
                        tier: item.tier || 'DEEP',
                        relevance: relevance.score,
                        matchedTerms: relevance.terms,
                        reason: relevance.reason,
                        messageUuid: item.messageUuid,
                        fileId: item.fileId,
                    });
                }
            }

            // Sort by relevance (highest first)
            results.sort((a, b) => b.relevance - a.relevance);
            
            return results;
        } catch (error) {
            console.error('[ContextSearch] Error searching context:', error);
            return [];
        }
    }

    /**
     * Calculate how relevant an item is to a query
     * Uses SRG semantic similarity + term matching
     */
    private async calculateItemRelevance(
        query: string, 
        item: any
    ): Promise<{ score: number; terms: string[]; reason: string }> {
        const itemText = String(item.text || '');
        
        // Avoid empty items
        if (itemText.trim().length === 0) {
            return { score: 0, terms: [], reason: 'Empty item' };
        }

        // Strategy 1: Direct keyword matching (baseline)
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const itemWords = itemText.toLowerCase().split(/\s+/);
        const directMatches = queryWords.filter(qw => itemWords.some(iw => iw.includes(qw) || qw.includes(iw)));
        const directScore = Math.min(directMatches.length / Math.max(queryWords.length, 1), 1);

        // Strategy 2: SRG semantic similarity
        // Use SRG's hybrid query to find conceptual relationships
        let srgScore = 0;
        let srgTerms: string[] = [];
        let srgReason = '';

        try {
            // Truncate to reasonable length for SRG (it works better on shorter texts)
            const truncatedText = itemText.substring(0, 500);
            const hybridResult = srgService.queryHybrid(query, {
                contextText: truncatedText,
                maxResults: 5,
            });

            if (hybridResult && hybridResult.matchedEntities && hybridResult.matchedEntities.length > 0) {
                // Score based on how many entities matched and their strength
                srgScore = Math.min(hybridResult.matchedEntities.length * 0.3, 1);
                srgTerms = hybridResult.matchedEntities.slice(0, 3).map(e => typeof e === 'string' ? e : (e as any).name || '');
                srgReason = `Found ${hybridResult.matchedEntities.length} semantic connections`;
            }
        } catch (e) {
            console.log('[ContextSearch] SRG query failed, falling back to keyword matching:', e);
        }

        // Combine scores: weight SRG heavily, keyword as fallback
        const combinedScore = srgScore > 0.1 ? srgScore * 0.8 + directScore * 0.2 : directScore;
        const matchedTerms = srgTerms.length > 0 ? srgTerms : directMatches;
        const reason = srgTerms.length > 0 ? srgReason : `Matched keywords: ${directMatches.join(', ')}`;

        return {
            score: combinedScore,
            terms: matchedTerms,
            reason: reason,
        };
    }

    /**
     * Smart search that handles common patterns
     * E.g., "show me authentication stuff" → searches for auth concepts
     */
    async smartSearch(userQuery: string): Promise<ContextSearchResult[]> {
        // Expand query using SRG synonyms if available
        const expandedQuery = this.expandQueryWithSynonyms(userQuery);
        const results = await this.searchContext(expandedQuery);
        
        // Also try the original
        if (expandedQuery !== userQuery) {
            const originalResults = await this.searchContext(userQuery);
            
            // Merge, keeping highest relevance for each item
            const merged = new Map<string, ContextSearchResult>();
            for (const r of results) {
                merged.set(r.itemId, r);
            }
            for (const r of originalResults) {
                if (!merged.has(r.itemId) || r.relevance > merged.get(r.itemId)!.relevance) {
                    merged.set(r.itemId, r);
                }
            }
            
            return Array.from(merged.values()).sort((a, b) => b.relevance - a.relevance);
        }

        return results;
    }

    private expandQueryWithSynonyms(query: string): string {
        // Try to expand using SRG trace
        try {
            const traceResults = srgService.trace(query);
            if (traceResults && traceResults.size > 0) {
                const expandedTerms = Array.from(traceResults.keys()).slice(0, 3);
                return `${query} ${expandedTerms.join(' ')}`;
            }
        } catch (e) {
            // SRG not ready, just use query as-is
        }
        return query;
    }
}

export const contextSearchService = new ContextSearchService();
