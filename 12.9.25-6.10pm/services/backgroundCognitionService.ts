

// FIX: Update import to use RoleSetting and context packets
import type { MemoryAtom, BackgroundInsight, AISettings, ProjectFile, RunningContextBuffer, RoleSetting, WorkflowStage } from '../types';
import { generateText, performWebSearch, BACKGROUND_COGNITION_PROMPT } from './geminiService';
import { loggingService } from './loggingService';
import { GoogleGenAI, Type } from '@google/genai';
import { CONTEXT_PACKET_LABELS, ALL_CONTEXT_PACKETS } from '../types';

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
      const systemInstruction = BACKGROUND_COGNITION_PROMPT.replace('{CURRENT_DATETIME}', new Date().toString());
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
}

export const backgroundCognitionService = new BackgroundCognitionService();