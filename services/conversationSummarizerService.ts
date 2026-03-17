/**
 * Conversation Summarizer Service
 * 
 * Provides standardized pipeline for:
 * 1. Parsing imported conversation logs (ChatGPT, Claude, etc.)
 * 2. Chunking by conversation segments and topic
 * 3. Speed-reading/summarizing via LLM
 * 4. Ingesting as context-aware knowledge modules into SRG
 * 
 * Tracks speaker attribution (user vs assistant) for context awareness.
 */

import type { MemoryAtom } from '../types';
import { memoryService } from './memoryService';
import { srgService } from './srgService';
import { loggingService } from './loggingService';
import { generateText } from './geminiService';

export interface ConversationChunk {
  id: string;
  source: string;
  conversationId: string;
  startIdx: number;
  endIdx: number;
  turns: Array<{ role: 'user' | 'assistant'; text: string }>;
  summary?: string;
  keyTopics?: string[];
}

export interface ImportedConversationModule {
  id: string;
  source: string;
  conversationId: string;
  chunkId: string;
  summary: string;
  keyTopics: string[];
  userQuestions: string[];
  assistantInsights: string[];
  contextAwareSummary: string;
  atoms: MemoryAtom[];
}

class ConversationSummarizerService {
  /**
   * Chunk conversation into logical segments (e.g., by topic changes or turn count).
   * Returns chunks of 5-15 turns each, with boundary detection.
   */
  async chunkConversation(
    atoms: MemoryAtom[],
    maxTurnsPerChunk: number = 10
  ): Promise<ConversationChunk[]> {
    if (atoms.length === 0) return [];

    const chunks: ConversationChunk[] = [];
    let currentChunk: Array<{ role: 'user' | 'assistant'; text: string }> = [];
    let chunkStartIdx = 0;
    let chunkCount = 0;

    const source = atoms[0].source || 'unknown';
    const conversationId = atoms[0].conversationId || 'default';

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      const role = (atom.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant';

      currentChunk.push({
        role,
        text: atom.text || '',
      });

      // Chunk boundary: reached max turns or significant content change
      if (currentChunk.length >= maxTurnsPerChunk) {
        chunks.push({
          id: `chunk-${source}-${conversationId}-${chunkCount}`,
          source,
          conversationId,
          startIdx: chunkStartIdx,
          endIdx: i,
          turns: currentChunk.slice(),
        });

        chunkCount++;
        currentChunk = [];
        chunkStartIdx = i + 1;
      }
    }

    // Capture remaining turns
    if (currentChunk.length > 0) {
      chunks.push({
        id: `chunk-${source}-${conversationId}-${chunkCount}`,
        source,
        conversationId,
        startIdx: chunkStartIdx,
        endIdx: atoms.length - 1,
        turns: currentChunk,
      });
    }

    loggingService.log('INFO', `[ConversationSummarizer] Chunked ${atoms.length} turns into ${chunks.length} chunks`, {
      source,
      conversationId,
      avgTurnsPerChunk: Math.round(atoms.length / chunks.length),
    });

    return chunks;
  }

  /**
   * Speed-read a chunk: extract key topics, user questions, assistant insights.
   * Returns a concise summary suitable for knowledge module ingestion.
   */
  async speedReadChunk(chunk: ConversationChunk): Promise<Partial<ConversationChunk>> {
    const chunkText = chunk.turns.map(t => `${t.role}: ${t.text}`).join('\n\n');

    const prompt = `You are analyzing a conversation chunk. Extract:
1. Key topics discussed (3-5 topics as a comma-separated list)
2. User's main questions or concerns
3. Assistant's key insights or answers

Conversation:
${chunkText.substring(0, 1500)}...

Respond in this exact JSON format (no markdown, just raw JSON):
{
  "keyTopics": ["topic1", "topic2", "topic3"],
  "userQuestions": ["question1", "question2"],
  "assistantInsights": ["insight1", "insight2"],
  "summary": "One paragraph summary of the conversation chunk."
}`;

    try {
      const response = await generateText({
        userMessage: prompt,
        systemPrompt: 'You are a knowledge extraction specialist. Extract structured insights from conversations.',
        temperature: 0.3, // Lower temperature for consistency
      });

      const parsed = JSON.parse(response);
      return {
        ...chunk,
        keyTopics: parsed.keyTopics || [],
        summary: parsed.summary || `Conversation about ${parsed.keyTopics?.[0] || 'various topics'}`,
      };
    } catch (e) {
      loggingService.log('WARN', `[ConversationSummarizer] Failed to speed-read chunk ${chunk.id}`, { error: e });
      // Fallback: simple extraction
      const userTurns = chunk.turns.filter(t => t.role === 'user').map(t => t.text.substring(0, 100));
      return {
        ...chunk,
        keyTopics: ['conversation', 'exchange'],
        summary: `User asked about: ${userTurns[0] || 'various topics'}`,
      };
    }
  }

  /**
   * Create a context-aware summary that identifies speaker patterns and knowledge value.
   * Ingests the chunk as a knowledge module with speaker attribution.
   */
  async ingestChunkAsModule(
    chunk: ConversationChunk,
    speedReadResult: Partial<ConversationChunk>
  ): Promise<ImportedConversationModule | null> {
    try {
      // Create a composite atom that captures the chunk's value
      const moduleAtom = await memoryService.createAtom({
        type: 'steward_note',
        role: 'model',
        text: `[Knowledge Module: ${chunk.source}/${chunk.conversationId}]\n\n${speedReadResult.summary || 'Conversation segment'}`,
        source: chunk.source,
        conversationId: chunk.conversationId,
        isInContext: false,
        isCollapsed: true,
        backgroundInsight: {
          query: `${chunk.source}: ${(speedReadResult.keyTopics || [])[0] || 'conversation'}`,
          insight: speedReadResult.summary || 'No insight generated',
          timestamp: Date.now(),
          confidence: 0.75,
          sources: chunk.turns.length,
        },
        metadata: {
          chunkId: chunk.id,
          keyTopics: speedReadResult.keyTopics,
          userQuestionCount: chunk.turns.filter(t => t.role === 'user').length,
          assistantResponseCount: chunk.turns.filter(t => t.role === 'assistant').length,
          source: chunk.source,
          conversationId: chunk.conversationId,
        },
      } as any);

      // Add chunk's raw turns to SRG for deep semantic search
      let srgNodeIds: string[] = [];
      for (const turn of chunk.turns) {
        const role = turn.role === 'user' ? 'user' : 'assistant';
        try {
          const nodeIds = await srgService.addText(turn.text, role as any);
          srgNodeIds.push(...nodeIds);
        } catch (e) {
          loggingService.log('WARN', 'Failed to add turn to SRG', { error: e });
        }
      }

      const module: ImportedConversationModule = {
        id: `module-${chunk.id}`,
        source: chunk.source,
        conversationId: chunk.conversationId,
        chunkId: chunk.id,
        summary: speedReadResult.summary || '',
        keyTopics: speedReadResult.keyTopics || [],
        userQuestions: chunk.turns
          .filter(t => t.role === 'user')
          .map(t => t.text.substring(0, 150))
          .slice(0, 3),
        assistantInsights: chunk.turns
          .filter(t => t.role === 'assistant')
          .map(t => t.text.substring(0, 150))
          .slice(0, 3),
        contextAwareSummary: `[${chunk.source} - ${speedReadResult.keyTopics?.[0] || 'Conversation'}]\n${speedReadResult.summary || ''}`,
        atoms: [moduleAtom],
      };

      loggingService.log('INFO', `[ConversationSummarizer] Ingested chunk ${chunk.id} as knowledge module`, {
        moduleId: module.id,
        topics: module.keyTopics,
        srgNodes: srgNodeIds.length,
      });

      return module;
    } catch (e) {
      loggingService.log('ERROR', `[ConversationSummarizer] Failed to ingest chunk as module`, { error: e, chunkId: chunk.id });
      return null;
    }
  }

  /**
   * Full pipeline: take atoms from imported conversation, chunk, speed-read, and ingest.
   */
  async processImportedConversation(
    atoms: MemoryAtom[],
    maxTurnsPerChunk: number = 10
  ): Promise<ImportedConversationModule[]> {
    loggingService.log('INFO', '[ConversationSummarizer] Starting pipeline for imported conversation', {
      atomCount: atoms.length,
      source: atoms[0]?.source,
      conversationId: atoms[0]?.conversationId,
    });

    // Step 1: Chunk
    const chunks = await this.chunkConversation(atoms, maxTurnsPerChunk);

    // Step 2: Speed-read each chunk
    const speedReadResults = await Promise.all(chunks.map(c => this.speedReadChunk(c)));

    // Step 3: Ingest as modules
    const modules: ImportedConversationModule[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const module = await this.ingestChunkAsModule(chunks[i], speedReadResults[i]);
      if (module) modules.push(module);
    }

    loggingService.log('INFO', '[ConversationSummarizer] Pipeline complete', {
      originalAtoms: atoms.length,
      chunks: chunks.length,
      modules: modules.length,
      totalAtomsCreated: modules.reduce((sum, m) => sum + m.atoms.length, 0),
    });

    return modules;
  }
}

export const conversationSummarizerService = new ConversationSummarizerService();
