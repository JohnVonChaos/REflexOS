import type { MemoryAtom, AISettings } from '../types';
import { generateText } from './geminiService';
import { srgService } from './srgService';
import { loggingService } from './loggingService';

export interface ProcessedConversation {
  conversationId: string;
  source: string;
  title: string;
  summary: string;
  keyPoints: string[];
  fullTranscript: string;
  turnCount: number;
  tokens: number;
}

/**
 * Process imported conversations: group by ID, summarize, and create knowledge modules.
 * This replaces the old flat import that created individual atoms for each turn.
 */
export class ConversationProcessingService {
  
  /**
   * Group atoms by conversation ID and process each conversation
   */
  async processImportedConversations(
    atoms: MemoryAtom[],
    aiSettings?: AISettings
  ): Promise<ProcessedConversation[]> {
    try {
      // Group atoms by conversationId
      const grouped: Record<string, MemoryAtom[]> = {};
      for (const atom of atoms) {
        const convId = atom.conversationId || 'uncategorized';
        if (!grouped[convId]) grouped[convId] = [];
        grouped[convId].push(atom);
      }

      loggingService.log('INFO', 'Grouped imported atoms by conversation', { groups: Object.keys(grouped).length });

      // Process each conversation group
      const processed: ProcessedConversation[] = [];
      for (const [conversationId, conversationAtoms] of Object.entries(grouped)) {
        try {
          // Sort atoms by timestamp to maintain order
          conversationAtoms.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

          // Build transcript
          const transcript = conversationAtoms
            .map(atom => {
              const speaker = atom.role === 'user' ? 'User' : 'Assistant';
              return `${speaker}: ${atom.text || ''}`;
            })
            .join('\n\n');

          // Generate summary and title via LLM
          const summaryResult = await this.summarizeConversation(transcript, aiSettings);

          const processed_conv: ProcessedConversation = {
            conversationId,
            source: atoms[0]?.source || 'unknown',
            title: summaryResult.title,
            summary: summaryResult.summary,
            keyPoints: summaryResult.keyPoints,
            fullTranscript: transcript,
            turnCount: conversationAtoms.length,
            tokens: Math.ceil(transcript.length / 4),
          };

          processed.push(processed_conv);

          // Add to SRG as a knowledge module
          await this.addToSRGAsModule(processed_conv);

          loggingService.log('INFO', 'Processed conversation', { 
            conversationId, 
            turns: conversationAtoms.length,
            tokens: processed_conv.tokens 
          });
        } catch (e) {
          loggingService.log('ERROR', 'Failed to process conversation group', { conversationId, error: e });
        }
      }

      return processed;
    } catch (e) {
      loggingService.log('ERROR', 'Failed to process imported conversations', { error: e });
      throw e;
    }
  }

  /**
   * Summarize a conversation transcript using the LLM
   */
  private async summarizeConversation(
    transcript: string,
    aiSettings?: AISettings
  ): Promise<{ title: string; summary: string; keyPoints: string[] }> {
    try {
      const prompt = `You are a conversation summarizer. Analyze this conversation transcript and provide:
1. A concise title (max 10 words)
2. A 2-3 sentence summary of the main topics discussed
3. 3-5 key points or insights from the conversation

TRANSCRIPT:
${transcript}

Respond in JSON format:
{
  "title": "...",
  "summary": "...",
  "keyPoints": ["...", "...", "..."]
}`;

      const systemInstruction = 'You are a helpful assistant that summarizes conversations.';
      const roleSetting: any = { enabled: true, provider: 'gemini', selectedModel: 'gemini-2.0-flash' };
      const providers = (aiSettings?.providers || {}) as any;

      const response = await generateText(prompt, systemInstruction, roleSetting, providers);

      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse JSON from summarization response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || 'Untitled Conversation',
        summary: parsed.summary || 'No summary generated',
        keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      };
    } catch (e) {
      loggingService.log('WARN', 'Failed to summarize via LLM, using fallback', { error: e });
      // Fallback: just use first 200 chars as summary
      return {
        title: 'Imported Conversation',
        summary: transcript.substring(0, 200) + '...',
        keyPoints: [],
      };
    }
  }

  /**
   * Add processed conversation to SRG as a knowledge module
   */
  private async addToSRGAsModule(processed: ProcessedConversation): Promise<void> {
    try {
      // Create a knowledge module entry in SRG
      // The module contains the full transcript and summary
      const moduleText = `## ${processed.title}\n\nSource: ${processed.source}\nConversation ID: ${processed.conversationId}\n\n**Summary:** ${processed.summary}\n\n**Key Points:**\n${processed.keyPoints.map(kp => `- ${kp}`).join('\n')}\n\n---\n\n**Full Transcript:**\n${processed.fullTranscript}`;

      // Add to SRG via reinforcement (this ingests into the hybrid corpus)
      await srgService.reinforceLinksFromText(moduleText);
      loggingService.log('INFO', 'Added conversation module to SRG', { 
        conversationId: processed.conversationId,
      });
    } catch (e) {
      loggingService.log('WARN', 'Failed to add conversation to SRG', { error: e });
    }
  }
}

export const conversationProcessingService = new ConversationProcessingService();
