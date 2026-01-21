

import type { MemoryAtom, PulseResult, SRGTraversalConfig } from '../types';
import { srgService } from './srgService';
import { loggingService } from './loggingService';
import { srgStorage } from '../../services/srgStorage';
import { memoryService } from '../../services/memoryService';

const AXIOM_RECALL_K = 5; // Number of axioms to recall
const RESONANCE_RECALL_K = 3; // Number of deactivated memories to pull back into context

interface RecallResult {
    axioms: MemoryAtom[];
    graphTrace: string;
    traceIds: string[]; // Raw node IDs for visualization
}

interface TurnChain { user: MemoryAtom; model?: MemoryAtom | null; }

/**
 * Performs memory recall using the in-browser SRG's graph traversal and keyword-based axiom search.
 * This service now delegates the "collimation" of thought to the SRG service, which performs
 * a true pathfinding search to find connections between query words.
 */
class RecallWeaverService {

  private findTopAxioms(queryText: string, memory: MemoryAtom[]): MemoryAtom[] {
    const queryWords = new Set(queryText.toLowerCase().replace(/[.,'!?]/g, '').split(/\s+/).filter(Boolean));
    const allAxioms = memory.filter(atom => atom.type === 'axiom');
    const CONTEXT_BONUS = 5; // A high bonus for items explicitly in context.
    
    const scoredAxioms = allAxioms.map(atom => {
        const axiomWords = new Set(atom.text.toLowerCase().replace(/[.,'!?]/g, '').split(/\s+/).filter(Boolean));
        const intersection = new Set([...queryWords].filter(word => axiomWords.has(word)));
        
        const keywordScore = intersection.size;
        // Default to a low score if undefined to ensure older, un-activated axioms are less likely to be recalled
        const activationScore = atom.activationScore ?? 0.1;
        const contextBonus = atom.isInContext ? CONTEXT_BONUS : 0;

        // The final score is a combination of keyword relevance and temporal relevance.
        // The context bonus acts as a strong signal from the context manager that this axiom is important right now.
        const finalScore = (keywordScore + contextBonus) * activationScore;

        return { atom, score: finalScore };
      });

    return scoredAxioms
      .filter(item => item.score > 0.01) // Use a small threshold to filter out truly irrelevant items
      .sort((a, b) => b.score - a.score)
      .slice(0, AXIOM_RECALL_K)
      .map(item => item.atom);
  }

  private formatTraceResult(trace: Map<string, PulseResult[]>): { text: string; ids: string[] } {
    if (trace.size === 0) {
        return {
            text: "[SRG_TRACE] No collimated path found through the lens of the current query.",
            ids: []
        };
    }

    const allResults: PulseResult[] = [];
    for (const results of trace.values()) {
        allResults.push(...results);
    }
    allResults.sort((a, b) => a.level - b.level);

    const orderedWords = allResults.map(r => r.word);
    const orderedIds = allResults.map(r => r.nodeId);

    const wordCounts = new Map<string, number>();
    for (const word of orderedWords) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    const uniqueWordsInOrder: string[] = [];
    const seenWords = new Set<string>();
    for (const word of orderedWords) {
        if (!seenWords.has(word)) {
            uniqueWordsInOrder.push(word);
            seenWords.add(word);
        }
    }

    const outputParts = uniqueWordsInOrder.map(word => {
        const count = wordCounts.get(word)!;
        return count > 1 ? `${word}(${count})` : word;
    });

    return {
        text: `[SRG_TRACE] ${outputParts.join(' ')}`,
        ids: Array.from(new Set(orderedIds))
    };
  }

  public resonanceRecall(traceWords: string[], allMessages: MemoryAtom[]): MemoryAtom[] {
    const deactivatedMemories = allMessages.filter(m => !m.isInContext);
    if (deactivatedMemories.length === 0 || traceWords.length === 0) {
        return [];
    }
    const traceWordSet = new Set(traceWords);

    const scoredMemories = deactivatedMemories.map(atom => {
        const atomWords = new Set(atom.text.toLowerCase().replace(/[.,'!?]/g, '').split(/\s+/).filter(Boolean));
        const intersection = new Set([...traceWordSet].filter(word => atomWords.has(word)));
        const score = intersection.size * (atom.activationScore ?? 0.1);
        return { atom, score };
    });
    
    return scoredMemories
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, RESONANCE_RECALL_K)
        .map(item => item.atom);
  }

  async recall(queryText: string, memory: MemoryAtom[], currentTurn: number, srgConfig: SRGTraversalConfig): Promise<RecallResult> {
    await srgService.isReady;
    loggingService.log('DEBUG', 'Recall Weaver started.', { queryText });

    await srgService.reinforceLinksFromText(queryText);
    loggingService.log('DEBUG', 'SRG links reinforced.');

    const topAxioms = this.findTopAxioms(queryText, memory);
    loggingService.log('DEBUG', 'Axiom recall complete.', { count: topAxioms.length });

    const collimatedTrace = srgService.trace(queryText, srgConfig);
    
    const formatted = this.formatTraceResult(collimatedTrace);
    loggingService.log('DEBUG', 'SRG trace complete.', { trace: formatted.text });

    return { 
        axioms: topAxioms, 
        graphTrace: formatted.text,
        traceIds: formatted.ids 
    };
  }

    /**
     * Find past user turns similar to the query via the SRG_user corpus,
     * then follow stored traceIds to find their paired model turns.
     */
    public async recallChains(queryText: string, k: number = 3): Promise<TurnChain[]> {
        await srgStorage.initialize();
        const all = await memoryService.getAll();
        const userTurns = all.filter(a => a.type === 'user_message');
        const scored: Array<{ atom: MemoryAtom; score: number }> = [];
        for (const u of userTurns) {
            const sim = await srgStorage.computeSimilarity(queryText, u.text, 'user');
            scored.push({ atom: u, score: sim });
        }
        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, k).filter(s => s.score > 0);

        const chains: TurnChain[] = [];
        for (const t of top) {
            const user = t.atom;
            let model: MemoryAtom | null = null;
            // traceIds may include turn IDs; try to find a model atom by those IDs
            for (const id of user.traceIds || []) {
                const candidate = await memoryService.getByTurnId(id);
                if (candidate && candidate.type === 'model_response') { model = candidate; break; }
            }
            chains.push({ user, model });
        }
        return chains;
    }
}

export const recallWeaverService = new RecallWeaverService();
