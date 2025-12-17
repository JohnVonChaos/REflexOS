

// FIX: Update import to use RoleSetting and context packets
import type { MemoryAtom, BackgroundInsight, AISettings, ProjectFile, RunningContextBuffer, RoleSetting, WorkflowStage } from '../types';
import { generateText, performWebSearch, BACKGROUND_COGNITION_PROMPT } from './geminiService';
import { loggingService } from './loggingService';
import { srgStorage } from './srgStorage';
import { srgService } from './srgService';
import { GoogleGenAI, Type } from '@google/genai';
import { CONTEXT_PACKET_LABELS, ALL_CONTEXT_PACKETS } from '../types';
import { resurfacingService } from './resurfacingService';

interface FullCognitionContext {
  messages: MemoryAtom[];
  projectFiles: ProjectFile[];
  contextFileNames: string[];
  selfNarrative?: string;
  rcb?: RunningContextBuffer;
  // Add workflow context packets
  baseContextPackets?: Record<string, string>;
}

class BackgroundCognitionService {
  /**
   * MULTI-LAYER BACKGROUND COGNITION WITH SRG-FIRST RECALL
   * Applies the 3-layer cognitive architecture to background research
   *
   * SUBCONSCIOUS: Query SRG for relevant knowledge from loaded corpus
   * CONSCIOUS: Evaluate SRG results, decide if web search needed
   * SYNTHESIS: Combine SRG knowledge + web results
   */
  async runWebSearchCycle(
    context: FullCognitionContext,
    roleSetting: RoleSetting,
    providers: AISettings['providers'],
    workflowStage?: WorkflowStage,
    recentQueriesForDedup?: string[]
  ): Promise<BackgroundInsight | null> {
    const { messages } = context;
    if (messages.length < 2) {
      loggingService.log('DEBUG', 'Skipping background cognition: not enough context.');
      return null;
    }

    try {
      // ========== PHASE 1: SUBCONSCIOUS - SRG CORPUS QUERY ==========
      loggingService.log('INFO', '[BACKGROUND SUBCONSCIOUS] Analyzing RCB for research direction...');

      const contextString = this.buildContextString(context, workflowStage);
      const corpusManifest = srgService.getCorpusManifest();
      const systemInstructionWithManifest = BACKGROUND_COGNITION_PROMPT.replace('{CURRENT_DATETIME}', new Date().toISOString()) + '\n\n' + corpusManifest;

      const queryResponse = await generateText(contextString, systemInstructionWithManifest, roleSetting, providers);

      let query = this.extractQuery(queryResponse);
      if (!query) {
        loggingService.log('ERROR', 'Background cognition: Failed to generate query.');
        return null;
      }

      // Check for duplicates
      if (recentQueriesForDedup && recentQueriesForDedup.includes(query.toLowerCase().trim())) {
        loggingService.log('WARN', `Skipping duplicate query "${query}"`);
        return null;
      }

      loggingService.log('INFO', `[BACKGROUND SUBCONSCIOUS] Generated query: "${query}"`);

      // Query SRG FIRST if knowledge modules are loaded
      let srgResults: string | null = null;
      const knowledgeModules = srgService.getKnowledgeModules();

      if (knowledgeModules.length > 0) {
        loggingService.log('INFO', `[BACKGROUND SUBCONSCIOUS] Querying ${knowledgeModules.length} knowledge modules via interference...`);

        try {
          const hybridResult = srgService.queryHybrid(query, {
            window: 25,
            maxDepth: 3,
            useSynsets: true,
            useRelations: true,
            generateLength: 60
          });

          if (hybridResult && hybridResult.generated && hybridResult.generated.length > 20) {
            srgResults = `[KNOWLEDGE BASE RECALL]\nQuery: "${query}"\n\nRelevant passages found via interference:\n${hybridResult.generated}\n\n(Source positions: ${hybridResult.interferenceHit.position}, score: ${hybridResult.interferenceHit.score.toFixed(3)})`;
            loggingService.log('INFO', `[BACKGROUND SUBCONSCIOUS] SRG returned ${hybridResult.generated.length} chars from corpus`);
          } else {
            loggingService.log('DEBUG', `[BACKGROUND SUBCONSCIOUS] SRG query returned no strong matches`);
          }
        } catch (e: any) {
          loggingService.log('WARN', '[BACKGROUND SUBCONSCIOUS] SRG query failed', { error: e.message });
        }
      }

      // ========== PHASE 2: CONSCIOUS - EVALUATE & DECIDE ==========
      loggingService.log('INFO', '[BACKGROUND CONSCIOUS] Evaluating SRG results and deciding on web search...');

      let webResults: string | null = null;
      let sources: any[] = [];

      // If SRG returned strong results, web search becomes optional
      // If no SRG results or modules, web search is required
      const shouldSearchWeb = !srgResults || knowledgeModules.length === 0;

      if (shouldSearchWeb) {
        loggingService.log('INFO', '[BACKGROUND CONSCIOUS] SRG insufficient - performing web search...');

        const searchResult = await performWebSearch(query, roleSetting, providers);

        if (searchResult && searchResult.text) {
          webResults = `[WEB SEARCH RESULTS]\n${searchResult.text}`;
          sources = searchResult.sources;
          loggingService.log('INFO', `[BACKGROUND CONSCIOUS] Web search returned ${searchResult.text.length} chars`);
        } else {
          loggingService.log('WARN', '[BACKGROUND CONSCIOUS] Web search returned no results');
        }
      } else {
        loggingService.log('INFO', '[BACKGROUND CONSCIOUS] SRG results sufficient - skipping web search');
      }

      // ========== PHASE 3: SYNTHESIS - COMBINE KNOWLEDGE SOURCES ==========
      loggingService.log('INFO', '[BACKGROUND SYNTHESIS] Combining SRG knowledge + web results...');

      let finalInsight = '';

      if (srgResults && webResults) {
        // Both available - synthesize
        finalInsight = `${srgResults}\n\n${webResults}\n\n[SYNTHESIS]\nLocal knowledge base provided foundational context. Web search added current information.`;
      } else if (srgResults) {
        // SRG only
        finalInsight = srgResults + '\n\n[NOTE: Answer derived from loaded knowledge modules, no web search performed]';
      } else if (webResults) {
        // Web only
        finalInsight = webResults;
      } else {
        loggingService.log('WARN', '[BACKGROUND SYNTHESIS] No results from either SRG or web');
        return null;
      }

      loggingService.log('INFO', `[BACKGROUND SYNTHESIS] Final insight: ${finalInsight.length} chars`);

      return {
        query,
        insight: finalInsight,
        sources,
        timestamp: Date.now(),
      };

    } catch (e) {
      loggingService.log('ERROR', 'Background Cognition Cycle failed.', { error: e });
      return null;
    }
  }

  private buildContextString(context: FullCognitionContext, workflowStage?: WorkflowStage): string {
    const { messages, baseContextPackets, selfNarrative, projectFiles, contextFileNames, rcb } = context;

    // Use workflow-style context packets if available
    if (baseContextPackets && workflowStage) {
      let contextString = '';
      for (const input of workflowStage.inputs) {
        if (ALL_CONTEXT_PACKETS.includes(input as any)) {
          const label = CONTEXT_PACKET_LABELS[input as keyof typeof CONTEXT_PACKET_LABELS];
          const content = baseContextPackets[input] || 'Not available.';
          contextString += `\n\n--- ${label} ---\n${content}`;
        }
      }
      return contextString;
    }

    // Fallback to legacy context building
    const conversationHistory = messages
      .filter(m => m.type === 'user_message' || m.type === 'model_response')
      .slice(-20)
      .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`)
      .join('\n');

    const existingInsights = messages
      .filter(m => m.backgroundInsight && typeof m.backgroundInsight.insight === 'string')
      .map(m => `--- PREVIOUS RESEARCH ---\nSearch Query: "${m.backgroundInsight!.query}"\nResulting Insight:\n${m.backgroundInsight!.insight}\n--- END PREVIOUS RESEARCH ---`)
      .join('\n\n');

    const existingAxioms = messages
      .flatMap(m => m.type === 'axiom' ? [m] : (m.cognitiveTrace?.filter(t => t.type === 'axiom') || []))
      .map(a => `- ${a.text}`)
      .join('\n');

    const filesInContext = projectFiles
      .filter(f => contextFileNames.includes(f.name) && typeof f.content === 'string')
      .map(f => `--- FILE: ${f.name} ---\n${f.content.substring(0, 2000)}...`)
      .join('\n\n');

    const rcbString = rcb ? JSON.stringify({
      conscious_focal_points: rcb.conscious_focal_points,
      current_mission_state: rcb.current_mission_state,
      plan_of_action: rcb.plan_of_action,
    }, null, 2) : 'Not available.';

    return `
[RUNNING CONTEXT BUFFER (AI's Working Memory)]
${rcbString}

[PROJECT FILES IN CONTEXT]
${filesInContext || 'None'}

[CONVERSATION HISTORY]
${conversationHistory}

[EXISTING RESEARCH INSIGHTS (Topics Already Covered)]
${existingInsights || 'None'}

[LEARNED AXIOMS]
${existingAxioms || 'None'}

[CORE NARRATIVE]
${selfNarrative || 'None'}
`;
  }

  private extractQuery(queryResponse: string): string | null {
    try {
      const jsonString = queryResponse.match(/```json\n([\s\S]*?)\n```/)?.[1];
      if (jsonString) {
        const parsed = JSON.parse(jsonString);
        if (typeof parsed.query === 'string') {
          return parsed.query.trim();
        }
      }
    } catch (e) {
      loggingService.log('WARN', 'Failed to parse JSON from background cognition. Falling back to raw text.', { error: e });
      if (!queryResponse.includes('{')) {
        return queryResponse.trim().replace(/"/g, '');
      }
    }
    return null;
  }

  // FIX: Updated to use workflow-style context assembly

  async runSynthesisCycle(allMessages: any[], currentTurn: number): Promise<string[]> {
    try {
      const fullContext = await (resurfacingService as any).buildContextWithResurfacing(allMessages, currentTurn, 'idle', '');

      const oldMemories = fullContext.total.filter((item: any) => (item.timestamp || 0) < currentTurn - 50);
      const recentMemories = fullContext.total.filter((item: any) => (item.timestamp || 0) >= currentTurn - 10);

      const candidates: string[] = [];

      // Use SRG positional similarity instead of simple bag-of-words

      for (const old of oldMemories) {
        for (const recent of recentMemories) {
          const similarity = await srgStorage.computeSimilarity(old.text || '', recent.text || '');
          if (similarity > 0.2) {
            candidates.push(`Connection: ${old.text.slice(0, 120)} ... relates to ... ${recent.text.slice(0, 120)}`);
          }
        }
      }

      // Optionally log or return candidates for higher-level code to persist as axioms or steward notes
      loggingService.log('INFO', 'Synthesis cycle produced candidate connections', { count: candidates.length });

      // Persist as steward notes for now
      try {
        const { memoryService } = await import('./memoryService');
        for (const c of candidates) {
          await memoryService.createAtom({ type: 'steward_note', text: c, role: 'model', isInContext: false });
        }
      } catch (e) {
        loggingService.log('ERROR', 'Failed to persist synthesis candidates', { error: e });
      }

      return candidates;
    } catch (e) {
      loggingService.log('ERROR', 'Synthesis cycle failed', { error: e });
      return [];
    }
  }

  async runReflectionCycle(allMessages: any[], currentTurn: number): Promise<void> {
    try {
      // Build a very simple reflection: top words in recent user messages
      const recentUserMessages = allMessages.filter(m => m.role === 'user').slice(-20).map(m => m.text || '').join(' ');
      if (!recentUserMessages || recentUserMessages.trim().length === 0) return;
      const words = recentUserMessages.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      const stopwords = new Set(['the','and','a','to','of','in','for','is','it','i','you','that','on','my','with','have','be']);
      const counts: Record<string, number> = {};
      for (const w of words) {
        if (stopwords.has(w) || w.length < 3) continue;
        counts[w] = (counts[w] || 0) + 1;
      }
      const top = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5).map(([w,c]) => `${w}(${c})`).join(', ');

      const reflectionText = `Reflection: Recent user focus appears to be on: ${top}. Consider researching or preparing resources related to these topics.`;

      const { memoryService } = await import('./memoryService');
      await memoryService.createAtom({ type: 'conscious_thought', role: 'model', text: reflectionText, isInContext: false, isCollapsed: false, activationScore: 0.5 });
      loggingService.log('INFO', 'Reflection cycle persisted a conscious thought.', { topWords: top });
    } catch (e) {
      loggingService.log('ERROR', 'Reflection cycle failed', { error: e });
    }
  }
}

export const backgroundCognitionService = new BackgroundCognitionService();