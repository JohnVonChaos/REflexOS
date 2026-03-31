/**
 * Ralph Routing Service
 * 
 * Ralph watches the L2 token stream in real-time.
 * When Ralph detects "Hey Ralph", "Hey Brave", or other signal tokens,
 * Ralph intercepts that segment and executes it.
 * 
 * Ralph is NOT a parser. Ralph is an executor.
 * Ralph takes whatever L2 outputs and decides what to do with it.
 */

import { loggingService } from './loggingService';
import { workOrderService } from './workOrderService';

export interface RalphRequest {
  segment: string;           // The actual text chunk from L2
  context: {
    activeWorkOrders: any[];
    recentConversation: any[];
    ralphHistory: any[];
  };
  requester: string;         // 'L2' | 'L3' | 'system'
}

export interface RalphResult {
  action: 'route_to_search' | 'create_work_order' | 'accept' | 'reject' | 'clarify' | 'escalate' | 'passthrough';
  payload: any;
  receipt?: string;
  shouldContinueStream?: boolean;
}

class RalphRoutingService {
  /**
   * Main entry point: Feed L2 output segments to Ralph
   * Ralph watches the token stream and decides what to do
   */
  async routeL2Segment(request: RalphRequest): Promise<RalphResult> {
    const segment = request.segment.trim();
    
    loggingService.log('INFO', '[RALPH] Routing segment', { 
      segmentLength: segment.length,
      requester: request.requester
    });

    // ─────────────────────────────────────────────────────────────
    // RALPH DECISION LOGIC
    // ─────────────────────────────────────────────────────────────
    
    // 1. "Hey Ralph" → Ralph takes full control of this segment
    if (this.hasHeyRalph(segment)) {
      return await this.handleHeyRalph(segment, request);
    }

    // 2. "Hey Brave" or search intent → Route to Brave (web search)
    if (this.hasHeyBrave(segment) || this.hasSearchIntent(segment)) {
      return await this.handleSearch(segment, request);
    }

    // 3. Work order patterns: "wo.submit", "create work order", "add task"
    if (this.hasWorkOrderSignal(segment)) {
      return await this.handleWorkOrder(segment, request);
    }

    // 4. Default: pass through (narrative, not a command)
    return {
      action: 'passthrough',
      payload: { text: segment },
      shouldContinueStream: true,
    };
  }

  /**
   * RALPH'S DECISION TREE
   * When Ralph sees "Hey Ralph", Ralph runs the full OEUR protocol
   * and decides one of: SUBMIT, REJECT, CLARIFY, ACCEPT, DISCUSS
   */
  private async handleHeyRalph(segment: string, request: RalphRequest): Promise<RalphResult> {
    loggingService.log('INFO', '[RALPH] Detected "Hey Ralph" signal');

    // Extract the actual request from the segment
    // Everything from "Hey Ralph" onwards is the request
    const heyRalphIdx = segment.toLowerCase().indexOf('hey ralph');
    const request_text = segment.slice(heyRalphIdx);

    // Call Ralph executor (the actual Claude instance that makes decisions)
    const ralphDecision = await this.callRalphExecutor(request_text, request.context);

    // Parse Ralph's response: first digit determines action
    const digit = this.extractRalphDecisionDigit(ralphDecision);

    switch (digit) {
      case '1':
        // SUBMIT: Create work order
        return this.submitWorkOrder(ralphDecision, request);
      
      case '2':
        // REJECT: Send back to L2 for retry
        return {
          action: 'reject',
          payload: { explanation: ralphDecision, shouldRetryL2: true },
          shouldContinueStream: false,
        };
      
      case '3':
        // CLARIFY: Ask for more info
        return {
          action: 'clarify',
          payload: { question: ralphDecision, shouldRetryL2: true },
          shouldContinueStream: false,
        };
      
      case '4':
        // ACCEPT: Acknowledge and continue
        return {
          action: 'accept',
          payload: { acknowledgment: ralphDecision },
          shouldContinueStream: true,
        };
      
      case '5':
        // DISCUSS: Escalate to human
        return {
          action: 'escalate',
          payload: { concern: ralphDecision, flaggedForHuman: true },
          shouldContinueStream: false,
        };
      
      default:
        // No decision digit: treat as passthrough
        return {
          action: 'passthrough',
          payload: { text: ralphDecision },
          shouldContinueStream: true,
        };
    }
  }

  /**
   * Route to web search (Brave API)
   */
  private async handleSearch(segment: string, request: RalphRequest): Promise<RalphResult> {
    loggingService.log('INFO', '[RALPH] Detected search signal');

    // Extract search query from segment
    const query = this.extractSearchQuery(segment);

    if (!query) {
      return {
        action: 'passthrough',
        payload: { text: segment, warning: 'Could not extract search query' },
        shouldContinueStream: true,
      };
    }

    return {
      action: 'route_to_search',
      payload: { query, segment },
      shouldContinueStream: true,
    };
  }

  /**
   * Create work order from natural language
   */
  private async handleWorkOrder(segment: string, request: RalphRequest): Promise<RalphResult> {
    loggingService.log('INFO', '[RALPH] Detected work order signal');

    const title = this.extractWorkOrderTitle(segment);
    const description = segment;

    const workOrder = workOrderService.createWorkOrder(
      title || 'Work Order from L2',
      description,
      'ralph_routing'
    );

    const receipt = `WO-${workOrder.id}`;

    return {
      action: 'create_work_order',
      payload: { workOrder },
      receipt,
      shouldContinueStream: true,
    };
  }

  /**
   * Call Ralph executor (Claude Sonnet 4) with full context
   * Ralph makes the actual decision
   */
  private async callRalphExecutor(
    request_text: string,
    context: RalphRequest['context']
  ): Promise<string> {
    try {
      // Build Ralph's context
      const woContext = context.activeWorkOrders.length
        ? context.activeWorkOrders.map(wo => `[${wo.id}] ${wo.status} — ${wo.title}`).join("\n")
        : "None";

      const contextBlock = `== ACTIVE WORK ORDERS ==
${woContext}

== REQUEST ==
${request_text}`;

      // For now, return a mock response
      // In production, this would call Claude Sonnet 4
      loggingService.log('INFO', '[RALPH] Would call Claude Sonnet 4 with context', {
        requestLength: request_text.length,
      });

      // TODO: Implement actual Claude call here
      // For now, return a passthrough
      return request_text;
    } catch (e) {
      loggingService.log('ERROR', '[RALPH] Error calling executor', { error: String(e) });
      return request_text;
    }
  }

  /**
   * Signal detectors
   */
  private hasHeyRalph(text: string): boolean {
    return /hey\s+ralph/i.test(text);
  }

  private hasHeyBrave(text: string): boolean {
    return /hey\s+brave/i.test(text);
  }

  private hasSearchIntent(text: string): boolean {
    return /search|look\s+up|research|find/i.test(text);
  }

  private hasWorkOrderSignal(text: string): boolean {
    return /wo\.submit|create\s+work\s+order|add\s+task/i.test(text);
  }

  /**
   * Extract Ralph's decision digit (1-5) from response
   */
  private extractRalphDecisionDigit(response: string): string {
    const match = response.match(/^[1-5]/);
    return match?.[0] || '';
  }

  /**
   * Extract search query from "Hey Brave" or search text
   */
  private extractSearchQuery(text: string): string | null {
    // Try to extract from "Hey Brave, search for X"
    const match = text.match(/(?:hey\s+brave|search\s+for)\s+["\']?([^"\'.\n]+)["\']?/i);
    if (match?.[1]) return match[1];

    // Fall back to anything after "search" or "look up"
    const fallback = text.match(/(?:search|look\s+up)\s+(.+?)(?:\.|$)/i);
    return fallback?.[1] || null;
  }

  /**
   * Extract work order title from segment
   */
  private extractWorkOrderTitle(text: string): string | null {
    // Try "wo.submit "Title""
    const match = text.match(/wo\.submit\s+["\']?([^"\'.\n]+)["\']?/i);
    if (match?.[1]) return match[1];

    // Try "create work order: Title"
    const fallback = text.match(/(?:create\s+work\s+order|add\s+task)[:\s]+["\']?([^"\'.\n]+)["\']?/i);
    return fallback?.[1] || null;
  }

  /**
   * Submit work order after Ralph approves
   */
  private submitWorkOrder(ralphResponse: string, request: RalphRequest): RalphResult {
    // Extract title from Ralph's formatted response
    const titleMatch = ralphResponse.match(/title:\s*([^\n]+)/i);
    const title = titleMatch?.[1]?.trim() || 'Work Order from Ralph';

    const workOrder = workOrderService.createWorkOrder(
      title,
      ralphResponse,
      'ralph_submission'
    );

    return {
      action: 'create_work_order',
      payload: { workOrder },
      receipt: `WO-${workOrder.id}`,
      shouldContinueStream: true,
    };
  }
}

export const ralphRoutingService = new RalphRoutingService();
