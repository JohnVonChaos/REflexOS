

// FIX: Update import to use RoleSetting and context packets
import type { MemoryAtom, BackgroundInsight, AISettings, ProjectFile, RunningContextBuffer, RoleSetting, WorkflowStage } from '../types';
import { generateText, performWebSearch, BACKGROUND_COGNITION_PROMPT } from './geminiService';
import { loggingService } from './loggingService';
import { srgStorage } from './srgStorage';
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
  // FIX: Updated to use workflow-style context assembly
  async runWebSearchCycle(
    context: FullCognitionContext, 
    roleSetting: RoleSetting, 
    providers: AISettings['providers'],
    workflowStage?: WorkflowStage,
    recentQueriesForDedup?: string[] // Add recent queries for early deduplication
  ): Promise<BackgroundInsight | null> {
    const { messages, baseContextPackets } = context;
    if (messages.length < 2) {
      loggingService.log('DEBUG', 'Skipping background cognition: not enough context.');
      return null;
    }

    try {
      let contextString = '';
      
      // If we have workflow-style context packets, use them
      if (baseContextPackets && workflowStage) {
        for (const input of workflowStage.inputs) {
          if (ALL_CONTEXT_PACKETS.includes(input as any)) {
            const label = CONTEXT_PACKET_LABELS[input as keyof typeof CONTEXT_PACKET_LABELS];
            const content = baseContextPackets[input] || 'Not available.';
            contextString += `\n\n--- ${label} ---\n${content}`;
          }
        }
      } else {
        // Fallback to legacy hardcoded context for backwards compatibility
        const { selfNarrative, projectFiles, contextFileNames, rcb } = context;
        
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

        contextString = `
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
      loggingService.log('DEBUG', 'Generating background search query from context.');
      const systemInstruction = BACKGROUND_COGNITION_PROMPT.replace('{CURRENT_DATETIME}', new Date().toISOString());
      const queryResponse = await generateText(contextString, systemInstruction, roleSetting, providers);

      let query = '';
      try {
        const jsonString = queryResponse.match(/```json\n([\s\S]*?)\n```/)?.[1];
        if (jsonString) {
            const parsed = JSON.parse(jsonString);
            if (typeof parsed.query === 'string') {
                query = parsed.query.trim();
            }
        }
      } catch (e) {
        loggingService.log('WARN', 'Failed to parse JSON from background cognition. Falling back to raw text.', { response: queryResponse, error: e });
        // Fallback for models that don't follow JSON instructions well
        if (!queryResponse.includes('{')) {
            query = queryResponse.trim().replace(/"/g, '');
        }
      }

      if (!query || query.trim() === '') {
        loggingService.log('ERROR', 'Background cognition: Agent failed to generate query despite simple prompt. Skipping cycle.');
        return null;
      }

      // Check for duplicates BEFORE doing the expensive web search
      if (recentQueriesForDedup && recentQueriesForDedup.includes(query.toLowerCase().trim())) {
        loggingService.log('WARN', `Background cognition: Skipping duplicate query "${query}" - already researched recently.`);
        return null;
      }

      loggingService.log('INFO', `Background cognition: Agent generated proactive query - "${query}"`);

      const searchResult = await performWebSearch(query, roleSetting, providers);
      
      if (!searchResult) {
        loggingService.log('WARN', 'Background cognition: Search returned no result.');
        return null;
      }

      const { text: insightText, sources } = searchResult;

      if (!insightText || insightText.trim() === '') {
        loggingService.log('WARN', 'Background cognition: Search returned no text insight.');
        return null;
      }
      
      return {
        query,
        insight: insightText,
        sources,
        timestamp: Date.now(),
      };

    } catch (e) {
      loggingService.log('ERROR', 'Background Cognition Cycle failed.', { error: e });
      return null;
    }
  }

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