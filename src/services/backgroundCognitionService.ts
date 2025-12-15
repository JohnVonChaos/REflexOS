

import type { MemoryAtom, BackgroundInsight, AISettings, RoleSetting, ProjectFile, RunningContextBuffer } from '../types';
import { generateText, performWebSearch, BACKGROUND_COGNITION_PROMPT } from './geminiService';
import { loggingService } from './loggingService';
import { GoogleGenAI, Type } from '@google/genai';

interface FullCognitionContext {
  messages: MemoryAtom[];
  projectFiles: ProjectFile[];
  contextFileNames: string[];
  selfNarrative?: string;
  rcb?: RunningContextBuffer;
}

class BackgroundCognitionService {
  /**
   * Analyzes the full cognitive context to proactively identify knowledge gaps.
   * Generates a SINGLE query and executes it immediately.
   * @param context The full cognitive context of the session.
   * @param roleSetting The settings for the background cognition role.
   * @param providers All available provider settings.
   * @returns A BackgroundInsight object or null.
   */
  async runWebSearchCycle(context: FullCognitionContext, roleSetting: RoleSetting, providers: AISettings['providers']): Promise<BackgroundInsight | null> {
    const { messages, selfNarrative, projectFiles, contextFileNames, rcb } = context;
    if (messages.length < 2 && projectFiles.length === 0) { // Need some context to work with
      loggingService.log('DEBUG', 'Skipping background cognition: not enough context.');
      return null;
    }

    try {
      // 1. Construct a comprehensive context prompt for the agent to reason with.
      const conversationHistory = messages
        .filter(m => m.type === 'user_message' || m.type === 'model_response')
        .slice(-20) // Keep it focused on recent history
        .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`)
        .join('\n');
      
      const insightsList = messages
        .filter(m => m.backgroundInsight && typeof m.backgroundInsight.insight === 'string');

      const existingInsights = insightsList
        .map(m => `--- PREVIOUS RESEARCH ---\nSearch Query: "${m.backgroundInsight!.query}"\nResulting Insight:\n${m.backgroundInsight!.insight}\n--- END PREVIOUS RESEARCH ---`)
        .join('\n\n');

      // Extract just the queries as a checklist for the model
      const pastQueries = insightsList.map(m => `- ${m.backgroundInsight!.query}`).join('\n');

      const existingAxioms = messages
        .flatMap(m => m.type === 'axiom' ? [m] : (m.cognitiveTrace?.filter(t => t.type === 'axiom') || []))
        .map(a => `- ${a.text}`)
        .join('\n');
        
      const filesInContext = projectFiles
        .filter(f => contextFileNames.includes(f.name) && typeof f.content === 'string')
        .map(f => `--- FILE: ${f.name} ---\n${f.content.substring(0, 2000)}...`) // Truncate long files
        .join('\n\n');
      
      const rcbString = rcb ? JSON.stringify({
        conscious_focal_points: rcb.conscious_focal_points,
        current_mission_state: rcb.current_mission_state,
        interaction_history_abstract: rcb.interaction_history_abstract
    }, null, 2) : 'Not available.';

      const contextString = `
[RUNNING CONTEXT BUFFER (AI's Working Memory)]
${rcbString}

[PROJECT FILES IN CONTEXT]
${filesInContext || 'None'}

[CONVERSATION HISTORY]
${conversationHistory}

[COMPLETED SEARCH QUERIES (DO NOT REPEAT THESE)]
${pastQueries || 'None'}

[EXISTING RESEARCH INSIGHTS (Details)]
${existingInsights || 'None'}

[LEARNED AXIOMS]
${existingAxioms || 'None'}

[CORE NARRATIVE]
${selfNarrative || 'None'}
`;
      loggingService.log('DEBUG', 'Generating background search query from context.');
      
      const systemInstruction = BACKGROUND_COGNITION_PROMPT.replace('{CURRENT_DATETIME}', new Date().toString());
      const queryResponse = await generateText(contextString, systemInstruction, roleSetting, providers);

      // --- RAW OUTPUT HANDLING ---
      // No parsing. No JSON. No lists. Just take the raw output.
      let query = queryResponse.trim();

      // Basic cleanup: remove quotes if the model added them
      if (query.startsWith('"') && query.endsWith('"')) {
          query = query.slice(1, -1);
      }

      if (!query || query === '') {
        loggingService.log('WARN', 'Background cognition: Model returned empty response.');
        return null;
      }

      // Check for "no search needed" indicators if the model ignores instructions and tries to chat
      const lowerQuery = query.toLowerCase();
      if (lowerQuery.includes("no search needed") || lowerQuery.includes("no query") || lowerQuery.length > 150) {
          loggingService.log('INFO', 'Background cognition: Agent seemingly indicated no search needed.');
          return null;
      }

      loggingService.log('INFO', `Background cognition: Executing RAW query: "${query}"`);
      
      const searchResult = await performWebSearch(query, roleSetting, providers);
      
      if (!searchResult || !searchResult.text || searchResult.text.trim() === '') {
        loggingService.log('WARN', 'Background cognition: Search returned no results.');
        return null;
      }

      return {
        query: query,
        insight: searchResult.text,
        sources: searchResult.sources,
        timestamp: Date.now(),
      };

    } catch (e) {
      loggingService.log('ERROR', 'Background Cognition Cycle failed.', { error: e });
      return null;
    }
  }
}

export const backgroundCognitionService = new BackgroundCognitionService();