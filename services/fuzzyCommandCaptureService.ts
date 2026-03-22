import { loggingService } from './loggingService';
import { extractAgentMessage } from './agentRegistry';

export interface ExtractedCommand {
    type: 'work_order' | 'search' | 'agent_message';
    rawText: string;
    context: string;
    confidence: number; // 0-1
    payload?: {
        title?: string;
        description?: string;
        query?: string;
        agentName?: string;
        intent?: string;
    };
}

export interface AgentMessage {
    agentName: string;
    intent: string;
    rawText: string;
    senderLayer?: string; // which layer/component sent this
    confidence: number;
}

class FuzzyCommandCaptureService {
    /**
     * Scan output text for work order command patterns
     * Uses loose matching to catch malformed attempts
     * Work orders typically have patterns like:
     *   - "TASK: ..."
     *   - "DO: ..."
     *   - "FIX: ..."
     *   - "IMPLEMENT: ..."
     *   - "CREATE: ..."
     */
    extractWorkOrderCommands(text: string): ExtractedCommand[] {
        const commands: ExtractedCommand[] = [];
        
        // Fuzzy work order patterns - look for verbs followed by descriptions
        const patterns = [
            { regex: /(?:task|do|implement|create|fix|refactor|update|add|build|write):\s*([^\n]+?)(?=\n|$)/gi, confidence: 0.9 },
            { regex: /^\s*[•\-\*]\s*(implement|create|fix|add|update|build|write|refactor):\s*(.+?)$/gm, confidence: 0.8 },
            { regex: /(?:should|need to|must)\s+(implement|create|fix|add|update|build|write|refactor)\s+(.+?)(?:\n|$)/gi, confidence: 0.7 },
        ];

        for (const { regex, confidence } of patterns) {
            let match;
            while ((match = regex.exec(text)) !== null) {
                const matchedText = match[0];
                const startIdx = Math.max(0, match.index - 100);
                const endIdx = Math.min(text.length, match.index + matchedText.length + 100);
                const context = text.substring(startIdx, endIdx).trim();

                // Extract title and description
                const fullText = match[match.length - 1] || match[1];
                const [title, ...descParts] = fullText.split(/[:\-]/).map(s => s.trim());

                commands.push({
                    type: 'work_order',
                    rawText: matchedText,
                    context,
                    confidence,
                    payload: {
                        title: title || 'Untitled Task',
                        description: descParts.length > 0 ? descParts.join(': ').trim() : fullText,
                    },
                });
            }
        }

        return commands;
    }

    /**
     * Scan output text for search command patterns
     * Patterns:
     *   - "SEARCH: ..."
     *   - "LOOK UP: ..."
     *   - "FIND: ..."
     *   - "RESEARCH: ..."
     */
    extractSearchCommands(text: string): ExtractedCommand[] {
        const commands: ExtractedCommand[] = [];

        const patterns = [
            { regex: /(?:search|look\s+up|research|find):\s*["']?([^"'\n]+?)["']?(?=\n|$)/gi, confidence: 0.9 },
            { regex: /search\s+for\s+["']?([^"'\n]+?)["']?(?=\n|$)/gi, confidence: 0.85 },
            { regex: /look\s+(?:for|up)\s+["']?([^"'\n]+?)["']?(?=\n|$)/gi, confidence: 0.8 },
        ];

        for (const { regex, confidence } of patterns) {
            let match;
            while ((match = regex.exec(text)) !== null) {
                const matchedText = match[0];
                const query = match[1];
                const startIdx = Math.max(0, match.index - 100);
                const endIdx = Math.min(text.length, match.index + matchedText.length + 100);
                const context = text.substring(startIdx, endIdx).trim();

                commands.push({
                    type: 'search',
                    rawText: matchedText,
                    context,
                    confidence,
                    payload: {
                        query,
                    },
                });
            }
        }

        return commands;
    }

    /**
     * Scan output text for agent message patterns
     * Patterns:
     *   - "Hey [Agent], [request]"
     *   - "[Agent], [request]"
     *   - "[Agent]: [request]"
     */
    extractAgentMessages(text: string): AgentMessage[] {
        const messages: AgentMessage[] = [];
        
        // Split by newlines and process each line for potential agent messages
        const lines = text.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length < 5) continue; // Skip very short lines
            
            const agentMsg = extractAgentMessage(trimmed);
            if (agentMsg) {
                messages.push({
                    agentName: agentMsg.agentName,
                    intent: agentMsg.intent,
                    rawText: trimmed,
                    confidence: 0.95,
                });
            }
        }
        
        return messages;
    }

    /**
     * Extract both work order and search commands from output
     */
    extractAllCommands(text: string): ExtractedCommand[] {
        const workOrders = this.extractWorkOrderCommands(text);
        const searches = this.extractSearchCommands(text);
        const agentMsgs = this.extractAgentMessages(text);
        
        const agentCommands: ExtractedCommand[] = agentMsgs.map(msg => ({
            type: 'agent_message',
            rawText: msg.rawText,
            context: text,
            confidence: msg.confidence,
            payload: {
                agentName: msg.agentName,
                intent: msg.intent,
            },
        }));
        
        return [...workOrders, ...searches, ...agentCommands].sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Check if text contains malformed search command (e.g., syntax error, incomplete)
     * Returns true if command found but confidence is low or pattern is unusual
     */
    hasMalformedSearchCommand(text: string): boolean {
        const searches = this.extractSearchCommands(text);
        if (searches.length === 0) return false;
        
        // Malformed if: low confidence, or very short/long query
        return searches.some(cmd => {
            const query = cmd.payload?.query || '';
            return cmd.confidence < 0.8 || query.length < 3 || query.length > 500;
        });
    }

    /**
     * Format extraction example for model reference
     */
    getCommandExamples(): string {
        return `
WORK ORDER EXAMPLES:
- TASK: Refactor authentication module
- DO: Update session timeout to 30 minutes
- IMPLEMENT: New logging system with structured output
- CREATE: Database migration for user profiles
- FIX: Memory leak in background service

SEARCH COMMAND EXAMPLES:
- SEARCH: "TypeScript generic types tutorial"
- RESEARCH: performance optimization patterns
- FIND: "React hooks best practices"
- Look up: Redis connection pooling
`;
    }

    /**
     * For search commands that failed/malformed in one model,
     * prepare guidance for fallback model
     */
    buildSearchRedirectionPrompt(originalOutput: string, failedQuery: string): string {
        return `The following text contains a search command but it was malformed or incomplete:

ORIGINAL OUTPUT:
\`\`\`
${originalOutput}
\`\`\`

SEARCH QUERY TO EXECUTE:
"${failedQuery}"

Please execute this search query directly and return the results. Format as a brief summary of key findings.`;
    }
}

export const fuzzyCommandCaptureService = new FuzzyCommandCaptureService();
