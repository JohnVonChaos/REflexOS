

// FIX: Update import to use RoleSetting and context packets
import type { MemoryAtom, BackgroundInsight, AISettings, ProjectFile, RunningContextBuffer, RoleSetting, WorkflowStage } from '../types';
import { generateText, performWebSearch, BACKGROUND_COGNITION_PROMPT, SUBCONSCIOUS_PROMPT, CONSCIOUS_PROMPT } from './geminiService';
import { getDefaultSettings } from '../types';
import { loggingService } from './loggingService';
import { srgStorage } from './srgStorage';
import { srgService } from './srgService';
import { GoogleGenAI, Type } from '@google/genai';
import { CONTEXT_PACKET_LABELS, ALL_CONTEXT_PACKETS } from '../types';
import { resurfacingService } from './resurfacingService';
import { sessionService } from './sessionService';
import { dualProcessEngine } from './dualProcessEngine';
import { contextDiffer } from './contextDiffer';
import { scratchpadService } from './scratchpad';
import type { DistilledInsight } from '../types/dualProcess';

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
   * MULTI-LAYER BACKGROUND COGNITION WITH SRG-FIRST RECALL (DOCUMENTATION)
   *
   * The background cognition system uses a chained three-layer architecture
   * modelled after the main pipeline so that idle-time processing behaves like
   * an internal thought process. The default execution mode is "chained":
   *
   *   SUBCONSCIOUS: produce a raw, associative brainstorm (fast, divergent)
   *   CONSCIOUS:  refine and critique the brainstorm (focused, coherent)
   *   SYNTHESIS:  merge SRG-derived context + any web results into actionable
   *               insights and steward notes
   *
   * The chained cycle preserves ordering and passes the previous layer's
   * output forward (subconscious -> conscious -> synthesis). Outputs are
   * persisted as `subconscious_reflection` and `conscious_thought` atoms for
   * traceability and debugging. Per-workflow stages can opt-out to run the
   * "independent" mode which runs synthesis only.
   */
  async runWebSearchCycle(
    context: FullCognitionContext,
    roleSetting: RoleSetting,
    providers: AISettings['providers'],
    workflow: WorkflowStage[],
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
            generateLength: 500  // Increased from 60 to get meaningful passages
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

        const searchResult = await performWebSearch(query, roleSetting, providers, { playwrightSearchUrl: 'http://localhost:3005' } as any);

        if (searchResult && searchResult.text) {
          loggingService.log('INFO', `[BACKGROUND CONSCIOUS] Web search returned ${searchResult.text.length} chars - distilling...`);

          // ========== DUAL-PROCESS DISTILLATION ==========
          // Generator/Refiner compress raw insight into compact knowledge chunk
          try {
            const distilled = await dualProcessEngine.distillInsight(
              {
                query,
                insight: searchResult.text,
                sources: searchResult.sources || []
              },
              roleSetting,
              providers,
              workflow // Pass configured background stages
            );

            webResults = `[WEB SEARCH RESULTS - DISTILLED]\n${distilled.distilledChunk}\n\n[Compression: ${distilled.originalLength} → ${distilled.compressedLength} chars (${Math.round((1 - distilled.compressedLength / distilled.originalLength) * 100)}% reduction)]`;
            sources = distilled.sources;

            loggingService.log('INFO', `[BACKGROUND CONSCIOUS] Distilled to ${distilled.compressedLength} chars (${Math.round((1 - distilled.compressedLength / distilled.originalLength) * 100)}% reduction)`);
          } catch (distillError) {
            loggingService.log('WARN', '[BACKGROUND CONSCIOUS] Distillation failed, using raw results', { error: distillError });
            webResults = `[WEB SEARCH RESULTS]\n${searchResult.text}`;
            sources = searchResult.sources;
          }
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
        promptDetails: {
          userPrompt: contextString,
          systemPrompt: systemInstructionWithManifest,
          stageName: 'Background Cognition (3-Layer)'
        }
      };

    } catch (e) {
      loggingService.log('ERROR', 'Background Cognition Cycle failed.', { error: e });
      return null;
    }
  }

  private buildContextString(context: FullCognitionContext, workflowStage?: WorkflowStage): string {
    const { messages, baseContextPackets, selfNarrative, projectFiles, contextFileNames, rcb } = context;

    // --- SAFETY TRUNCATION ---
    // Target ~100k characters max to be safe for 128k token limit (roughly 4 chars/token, so 400k chars is theoretical max, but overhead/safety margin needed)
    // Actually 128k tokens is huge. The error said 184829 tokens? No, "prompt is too long: 184829". If unit is tokens, that's massive.
    // If unit is chars, 184k chars is only ~46k tokens.
    // Wait, the error said: "prompt is too long: 184829, model maximum context length: 131071".
    // 131071 is exactly 2^17 - 1. This is likely a token count or a very specific character count limit. 
    // Given Gemini's 2M context, this lower limit (128k) suggests the 'flash' model or a specific RPM/TPM tier limit or the library's local check.
    // Let's assume a Safe Max of 60,000 characters to be extremely conservative and fast.

    const MAX_CONTEXT_CHARS = 60000;

    // Use workflow-style context packets if available
    if (baseContextPackets && workflowStage) {
      let contextString = '';
      let currentLength = 0;

      // Priority order: RCB -> User Query -> Recent History -> Files -> everything else
      // We will loop through inputs but just append for now, truncation happens at end if needed?
      // Better to check as we go.

      for (const input of workflowStage.inputs) {
        if (currentLength > MAX_CONTEXT_CHARS) break;

        if (ALL_CONTEXT_PACKETS.includes(input as any)) {
          const label = CONTEXT_PACKET_LABELS[input as keyof typeof CONTEXT_PACKET_LABELS];
          const rawContent = baseContextPackets[input] || 'Not available.';
          const truncatedContent = rawContent.length > 20000 ? rawContent.substring(0, 20000) + '...[TRUNCATED]' : rawContent;

          contextString += `\n\n--- ${label} ---\n${truncatedContent}`;
          currentLength += truncatedContent.length;
        }
      }
      return contextString;
    }

    // Fallback Legacy Building

    // 1. RCB (High Priority)
    const rcbString = rcb ? JSON.stringify({
      conscious_focal_points: rcb.conscious_focal_points,
      current_mission_state: rcb.current_mission_state,
      plan_of_action: rcb.plan_of_action,
    }, null, 2) : 'Not available.';

    // 2. Recent Messages (High Priority)
    // Only take last 10 instead of 20 to save space
    const conversationHistory = messages
      .filter(m => m.type === 'user_message' || m.type === 'model_response')
      .slice(-10)
      .map(m => {
        // Truncate individual massive messages (like previous huge generations)
        const text = m.text || '';
        return `${m.role === 'user' ? 'User' : 'AI'}: ${text.length > 2000 ? text.substring(0, 2000) + '...' : text}`;
      })
      .join('\n');

    // 3. Files (Medium Priority - Biggest Danger)
    const filesInContext = projectFiles
      .filter(f => contextFileNames.includes(f.name) && typeof f.content === 'string')
      .map(f => `--- FILE: ${f.name} ---\n${f.content.substring(0, 5000)}...`) // Hard truncate files at 5k chars
      .join('\n\n');

    // 4. Existing Insights (Lower Priority)
    const existingInsights = messages
      .filter(m => m.backgroundInsight && typeof m.backgroundInsight.insight === 'string')
      .slice(-3) // Only last 3 insights
      .map(m => `--- INSIGHT ---\n${m.backgroundInsight!.insight.substring(0, 1000)}...`)
      .join('\n\n');

    return `
[RUNNING CONTEXT BUFFER]
${rcbString}

[CONVERSATION HISTORY]
${conversationHistory}

[PROJECT FILES]
${filesInContext || 'None'}

[PREVIOUS INSIGHTS]
${existingInsights || 'None'}

[CORE NARRATIVE]
${selfNarrative ? selfNarrative.substring(0, 2000) : 'None'}
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

  async runSynthesisCycle(allMessages: any[], currentTurn: number, priorOutputs?: { subconscious?: string; conscious?: string }): Promise<string[]> {
    try {
      const fullContext = await (resurfacingService as any).buildContextWithResurfacing(allMessages, currentTurn, 'idle', '');

      const oldMemories = fullContext.total.filter((item: any) => (item.timestamp || 0) < currentTurn - 50);
      const recentMemories = fullContext.total.filter((item: any) => (item.timestamp || 0) >= currentTurn - 10);

      // If the conscious layer supplied output, include it as a recent memory to inform synthesis
      if (priorOutputs && priorOutputs.conscious) {
        recentMemories.push({ text: priorOutputs.conscious, timestamp: currentTurn });
      }

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
      const stopwords = new Set(['the', 'and', 'a', 'to', 'of', 'in', 'for', 'is', 'it', 'i', 'you', 'that', 'on', 'my', 'with', 'have', 'be']);
      const counts: Record<string, number> = {};
      for (const w of words) {
        if (stopwords.has(w) || w.length < 3) continue;
        counts[w] = (counts[w] || 0) + 1;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, c]) => `${w}(${c})`).join(', ');

      const reflectionText = `Reflection: Recent user focus appears to be on: ${top}. Consider researching or preparing resources related to these topics.`;

      const { memoryService } = await import('./memoryService');
      await memoryService.createAtom({ type: 'conscious_thought', role: 'model', text: reflectionText, isInContext: false, isCollapsed: false, activationScore: 0.5 });
      loggingService.log('INFO', 'Reflection cycle persisted a conscious thought.', { topWords: top });
    } catch (e) {
      loggingService.log('ERROR', 'Reflection cycle failed', { error: e });
    }
  }

  /**
   * runChainedCycle(allMessages, currentTurn, roleSetting?, providers?)
   * ------------------------------------------------------------------
   * Execute a single chained background cognition cycle consisting of:
   *  1) Subconscious brainstorm (raw associations driven by SRG + context)
   *  2) Conscious refinement (distill brainstorm into a plan/summary)
   *  3) Synthesis (combine conscious output with resurfacing results)
   *
   * Each stage is short-lived and returns text that is passed to the next
   * stage; final synthesis results are returned and optionally persisted as
   * steward notes. The function accepts optional role and provider settings
   * so scheduled stage runs can use per-stage provider configuration.
   */

  /**
   * Run a chained subconscious -> conscious -> synthesis background cycle.
   */
  async runChainedCycle(allMessages: any[], currentTurn: number, roleSetting?: RoleSetting, providers?: AISettings['providers']) {
    try {
      const defaults = getDefaultSettings();
      const role = roleSetting || defaults.roles.background;
      const provs = providers || defaults.providers;

      const userOrModel = allMessages.filter(m => m.type === 'user_message' || m.type === 'model_response');
      if (userOrModel.length === 0) {
        loggingService.log('DEBUG', 'runChainedCycle skipping: No conversation history to analyze.');
        return { subconscious: '', conscious: '', synthesis: [] };
      }

      loggingService.log('INFO', '[BACKGROUND SUBCONSCIOUS] Running subconscious layer (chained).');
      const convo = userOrModel.slice(-40).map(m => `${m.role}: ${m.text}`).join('\n');
      const sysSub = SUBCONSCIOUS_PROMPT.replace('{CURRENT_DATETIME}', new Date().toString());
      const subconscious = (await generateText(convo, sysSub, role, provs)) || '';

      loggingService.log('INFO', '[BACKGROUND CONSCIOUS] Running conscious layer (chained).');
      const sysCon = CONSCIOUS_PROMPT.replace('{CURRENT_DATETIME}', new Date().toString());
      const consciousInput = `Raw brainstorm:\n${subconscious}\n\nContext:\n${convo}`;
      const conscious = (await generateText(consciousInput, sysCon, role, provs)) || '';

      loggingService.log('INFO', '[BACKGROUND SYNTHESIS] Running synthesis layer (chained).');
      const synthesis = await this.runSynthesisCycle(allMessages, currentTurn, { subconscious, conscious });

      try {
        const { memoryService } = await import('./memoryService');
        if (subconscious && subconscious.trim()) await memoryService.createAtom({ type: 'subconscious_reflection', role: 'model', text: subconscious, isInContext: false });
        if (conscious && conscious.trim()) await memoryService.createAtom({ type: 'conscious_thought', role: 'model', text: conscious, isInContext: false });
      } catch (e) {
        loggingService.log('WARN', 'Failed to persist chained outputs', { error: e });
      }

      return { subconscious, conscious, synthesis };
    } catch (e) {
      loggingService.log('ERROR', 'runChainedCycle failed', { error: e });
      return { subconscious: '', conscious: '', synthesis: [] };
    }
  }

  /**
   * Run the configured Dual Process (Generator -> Refiner) cycle.
   * This bypasses web search and directly executes the configured 'backgroundWorkflow' stages.
   */
  async runDualProcessCycle(
    context: FullCognitionContext,
    providers: AISettings['providers'],
    workflow: WorkflowStage[]
  ): Promise<void> {
    try {
      loggingService.log('INFO', `[DUAL PROCESS] Starting cycle with ${workflow.length} stages.`);

      // 1. Build Shared Context
      const contextString = this.buildContextString(context);

      let previousOutput = "";

      for (const stage of workflow) {
        if (!stage.enabled) continue;

        loggingService.log('INFO', `[DUAL PROCESS] Running stage: ${stage.name} (${stage.id})`);

        // Resolve inputs (Context + Output of previous)
        let stageInput = contextString;
        if (previousOutput) {
          stageInput += `\n\n[PREVIOUS STAGE OUTPUT]\n${previousOutput}`;
        }

        // Generate
        const roleSetting: RoleSetting = {
          enabled: true,
          provider: stage.provider,
          selectedModel: stage.selectedModel
        };

        const output = await generateText(stageInput, stage.systemPrompt, roleSetting, providers);
        previousOutput = output;

        // Log to Scratchpad for HUD visibility
        await scratchpadService.append(
          stage.id.includes('generator') ? 'GENERATOR' : stage.id.includes('refiner') ? 'REFINER' : 'SYSTEM',
          output,
          'THOUGHT',
          'LOW'
        );

        // Persist to Memory (Optional: make this configurable or only for final stage)
        // For now, we only persist to scratchpad to keep "Thought" separate from "Memory" unless explicitly committed.

        loggingService.log('INFO', `[DUAL PROCESS] Stage ${stage.name} complete.`);
      }

    } catch (e) {
      loggingService.log('ERROR', 'runDualProcessCycle failed', { error: e });
    }
  }
}

export const backgroundCognitionService = new BackgroundCognitionService();

export async function runWebResearchCycle(
  topic: string
): Promise<string[]> {
  try {
    const session = await sessionService.loadSession();
    const providers = session?.aiSettings?.providers || getDefaultSettings().providers;
    // Use background role or default to a safe fallback
    const roleSetting = session?.aiSettings?.workflow?.find(w => w.id === 'background_cognition') || {
      id: 'web_research',
      name: 'Web Research',
      provider: 'gemini',
      selectedModel: 'gemini-2.5-flash',
      enabled: true
    };

    // Use performWebSearch instead of browser tools
    const searchResult = await performWebSearch(topic, roleSetting as RoleSetting, providers);

    if (!searchResult || !searchResult.text) {
      console.error('Search failed or returned no text.');
      return [];
    }

    // Adapt the single result text to the string[] expected return type
    // The previous implementation returned full content of 3 pages. 
    // This implementation returns the synthesized answer/summary from the search provider.
    return [searchResult.text];

  } catch (error) {
    console.error('runWebResearchCycle failed:', error);
    return [];
  }
}