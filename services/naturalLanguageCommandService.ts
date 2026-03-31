/**
 * Natural Language Command Detection Service
 * 
 * Pure detection service — identifies signal tokens in streaming output.
 * Does NOT extract work orders, assign titles, or trigger side effects.
 * That's the Ralph routing layer's job.
 * 
 * Signals detected:
 * 1. "Hey Ralph" → Entire segment routes to Ralph executor
 * 2. "Hey Brave" + search verb → Search signal
 */

import { loggingService } from './loggingService';

export interface DetectedCommand {
  type: 'hey_ralph' | 'hey_brave_search' | 'none';
  confidence: number; // 0-1
  rawText?: string;
  startIndex?: number;
}

class NaturalLanguageCommandService {
  /**
   * Tokenize text into words (simple whitespace split + cleanup)
   * Preserves word boundaries for adjacency detection
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/[^\w]/g, ''))
      .filter(t => t.length > 0);
  }

  /**
   * Detect "Hey Ralph" — triggers work order auto-creation
   * Pattern: "Hey Ralph" (case-insensitive, optional punctuation)
   */
  detectHeyRalph(text: string): DetectedCommand | null {
    const tokens = this.tokenize(text);
    
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i] === 'hey' && tokens[i + 1] === 'ralph') {
        loggingService.log('INFO', '[NLC] Detected "Hey Ralph" trigger');
        return {
          type: 'hey_ralph',
          confidence: 0.95,
          rawText: `${tokens[i]} ${tokens[i + 1]}`,
          startIndex: text.toLowerCase().indexOf('hey ralph'),
        };
      }
    }
    
    return null;
  }

  /**
   * Detect "Hey Brave" + search verb in next 5 tokens
   * Pattern: "Hey Brave" followed by "search", "look up", "research", "find"
   */
  detectHeyBraveSearch(text: string): DetectedCommand | null {
    const tokens = this.tokenize(text);
    const searchVerbs = ['search', 'lookup', 'research', 'find'];
    
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i] === 'hey' && tokens[i + 1] === 'brave') {
        // Look for search verb in next 5 tokens
        const lookahead = tokens.slice(i + 2, i + 7);
        const searchVerbIdx = lookahead.findIndex(t => searchVerbs.includes(t));
        
        if (searchVerbIdx !== -1) {
          loggingService.log('INFO', '[NLC] Detected "Hey Brave" search trigger');
          return {
            type: 'hey_brave_search',
            confidence: 0.9,
            rawText: `${tokens[i]} ${tokens[i + 1]} ... ${lookahead[searchVerbIdx]}`,
            startIndex: text.toLowerCase().indexOf('hey brave'),
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Main detection pipeline — try all triggers in order
   * Returns first match found
   */
  detectCommand(text: string): DetectedCommand {
    // 1. Hey Ralph (highest priority — full output escalation)
    const heyRalph = this.detectHeyRalph(text);
    if (heyRalph) return heyRalph;
    
    // 2. Hey Brave Search
    const heyBrave = this.detectHeyBraveSearch(text);
    if (heyBrave) return heyBrave;
    
    // No command found
    return { type: 'none', confidence: 0 };
  }

  /**
   * Check if text contains natural language search signal
   * Returns true if "Hey Brave" with search verb detected
   */
  isSearchSignal(text: string): boolean {
    const cmd = this.detectCommand(text);
    return cmd.type === 'hey_brave_search';
  }
}

export const nlCommandService = new NaturalLanguageCommandService();
