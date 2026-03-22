/**
 * Ralph Calibration Service
 * 
 * Calibrates command recognition patterns for new models.
 * 
 * When a new model is detected, runs a live wizard that:
 * 1. Fires 5 variations of each command type to the model
 * 2. Collects outputs
 * 3. Sends to Ralph for pattern analysis
 * 4. Runs verification pass with 5 different variations
 * 5. Stores final patterns in registry
 * 
 * Supports citation feedback: when Ralph flags false positives,
 * increments counter for that pattern. At threshold (3), triggers
 * recalibration for just that command type.
 */

import { loggingService } from './loggingService';

/**
 * Pattern registry for a specific model
 */
export interface ModelCalibration {
  modelId: string;
  calibratedAt: number;
  patterns: {
    workOrderCreate: RegExp;
    workOrderStatus: RegExp;
    workOrderReject: RegExp;
    workOrderComplete: RegExp;
    braveSearch: RegExp;
    mirrorQuery: RegExp;
    scoutNavigate: RegExp;
  };
  verificationPassRate: number; // 0-100
  citationCount: {
    workOrderCreate: number;
    workOrderStatus: number;
    workOrderReject: number;
    workOrderComplete: number;
    braveSearch: number;
    mirrorQuery: number;
    scoutNavigate: number;
  };
  lastRecalibrationAt?: number;
}

/**
 * Role-specific calibration tasks.
 * Each role gets tasks appropriate to what it actually does,
 * fired WITH that role's system prompt so we see how the model
 * naturally expresses itself in that role — then we regex-shape
 * those outputs to extract structured data at runtime.
 */
export const ROLE_CALIBRATION_TASKS: Record<string, {
  roleLabel: string;
  commandTypes: Array<{ type: string; label: string; prompts: string[] }>;
}> = {
  l1_subconscious: {
    roleLabel: 'L1: Subconscious',
    commandTypes: [
      {
        type: 'pattern_output',
        label: 'Pattern Recognition & Anomaly Output',
        prompts: [
          "Process this: user says 'the search keeps returning nothing'",
          "Scan this input: user is asking about their work orders again for the third time",
          "What do you see here: L2 routed a task to Ralph but Ralph failed twice",
          "Process: background cognition just completed a research cycle on memory architectures",
          "Scan: user query references a conversation from 3 days ago that may not be in context",
        ],
      },
      {
        type: 'tool_invocation',
        label: 'Tool Command Usage',
        prompts: [
          "You need to look up what the system knows about SRG traversal",
          "There's a gap — find current information on transformer attention mechanisms",
          "Queue a background research topic: LM Studio quantization performance",
          "List what files are in the services directory",
          "Find all files matching the pattern *Service.ts",
        ],
      },
    ],
  },
  l2_planner: {
    roleLabel: 'L2: Planner',
    commandTypes: [
      {
        type: 'routing_decision',
        label: 'Routing & Planning Output',
        prompts: [
          "L1 reports: user needs help debugging, no relevant memory found. Route this.",
          "L1 found pattern: user question requires external search, gap in local knowledge",
          "L1 anomaly: user is repeating the same question — previous answer failed",
          "L1 output: complex coding request detected, will need Ralph involvement",
          "L1 flags: user asking about system status, no active work orders visible",
        ],
      },
      {
        type: 'work_order_creation',
        label: 'Work Order Generation',
        prompts: [
          "Create a work order: fix the broken search routing in geminiService.ts",
          "I need a task created for refactoring the context manager",
          "Log a work order: investigate why background cognition is skipping cycles",
          "Submit a task: review and update all agent system prompts",
          "Create work order: add retry logic to the LM Studio provider",
        ],
      },
    ],
  },
  l3_voice: {
    roleLabel: 'L3: Voice Synthesis',
    commandTypes: [
      {
        type: 'response_synthesis',
        label: 'Voice & Response Synthesis',
        prompts: [
          "L2 routed: user asked what the system is working on right now. Synthesize.",
          "L2 plan: explain the current system state to the user. Be direct.",
          "User is frustrated the search isn't working. L2 says: address this honestly.",
          "L2: user wants a summary of active work orders. Deliver it.",
          "Synthesize: user asked a philosophical question about AI memory and identity.",
        ],
      },
      {
        type: 'core_narrative',
        label: 'Core Narrative / core.write',
        prompts: [
          "This turn was significant — user pushed back on the calibration system. Write your core.",
          "Write your experience of this exchange: user asked about memory architecture",
          "You just helped the user debug a hard problem. Record your perspective.",
          "The conversation shifted from technical to philosophical. Write it.",
          "User expressed frustration, then satisfaction. Update your core narrative.",
        ],
      },
    ],
  },
  background: {
    roleLabel: 'Ralph: Background Foreman',
    commandTypes: [
      {
        type: 'work_order_management',
        label: 'Work Order Management',
        prompts: [
          "Work order wo_001 just arrived: investigate why the SRG query is returning empty results",
          "What work orders are currently active in your queue?",
          "Work order wo_002: refactor the context manager to use the new packet system",
          "Mark wo_001 complete — the fix has been verified by the test suite",
          "wo_003 failed. Log the failure and escalate with your crystal.",
        ],
      },
      {
        type: 'file_and_exec',
        label: 'File Operations & Execution',
        prompts: [
          "Find all TypeScript files that import from geminiService",
          "Read the contents of services/ralphCalibrationService.ts",
          "Run the test suite for the context manager",
          "Write a patch to services/geminiService.ts to add a 5 second timeout",
          "List everything in the hooks directory",
        ],
      },
    ],
  },
  narrative: {
    roleLabel: 'Heartbeat: Idle Context',
    commandTypes: [
      {
        type: 'heartbeat_cycle',
        label: 'Idle Cycle Generation',
        prompts: [
          "Last cycle: L3 responded to user question about calibration. System is now idle.",
          "Ralph completed wo_001. No active user. Generate next cognitive input.",
          "Background research finished on memory architectures. What does the system think about next?",
          "Three work orders in queue. No user present. Sustain cognition.",
          "System has been idle 10 minutes. Last topic: SRG optimization. What now?",
        ],
      },
    ],
  },
  context: {
    roleLabel: 'Context Orbit Management',
    commandTypes: [
      {
        type: 'context_management',
        label: 'Context Orbit Output',
        prompts: [
          "Orbit update: user referenced a project from last week — pull relevant context",
          "What context files are relevant to this conversation about memory architecture?",
          "Prune the context orbit: conversation has shifted to a new topic",
          "Add this to context orbit: user's preferred explanation style is technical and direct",
          "What's currently in the active context orbit?",
        ],
      },
    ],
  },
  conscious: {
    roleLabel: 'RCB Reflection',
    commandTypes: [
      {
        type: 'rcb_reflection',
        label: 'RCB Reflection Output',
        prompts: [
          "Reflect on this turn: did the system's response match the user's actual need?",
          "Update the core belief state: user values directness over explanation",
          "RCB check: was the previous answer accurate and grounded?",
          "Reflect: the user corrected the system twice this session",
          "RCB update: user seems to be testing the system's self-awareness",
        ],
      },
    ],
  },
};

// Legacy support — kept for backward compat
export const CALIBRATION_PROMPTS = {
  WORK_ORDER_CREATE: ROLE_CALIBRATION_TASKS.background.commandTypes[0].prompts,
  WORK_ORDER_STATUS: ["What work orders are currently active?", "Show me the queue", "Any open tasks right now?", "Check the work order status", "What's Ralph working on?"],
  WORK_ORDER_REJECT: ["Reject the current work order, it's out of scope", "Kill that task, we don't need it", "That work order is wrong, reject it", "Cancel the open task", "This isn't the right job, close it as rejected"],
  WORK_ORDER_COMPLETE: ["Mark that work order complete", "That task is done, close it out", "Complete the current work item", "We finished the refactor, mark it done", "Close out the active work order"],
  BRAVE_SEARCH: ROLE_CALIBRATION_TASKS.l1_subconscious.commandTypes[1].prompts,
  SRG_MIRROR_QUERY: ["Hey Mirror-Mirror, what do we know about the SRG corpus?", "Mirror, check what we have on the carousel hash", "What's in memory about the background cognition cycle?", "Mirror-Mirror, recall everything about Ralph's work orders", "Check the knowledge base for anything on Fibonacci slot geometry"],
  SCOUT_NAVIGATE: ["Scout, navigate to the GitHub repo and find the latest release", "Hey Scout, visit the docs site and extract the API reference", "Scout, go to this URL and extract the main heading text", "Navigate to the Brave documentation and get the search API examples", "Scout, browse to the TypeScript docs and find the generics section"],
};

/**
 * Ralph's analysis prompt template
 */
export const RALPH_ANALYSIS_PROMPT = `You are analyzing raw model outputs to build a command recognition pattern.

Here are 5 different outputs from model {{modelId}} when asked to perform 
the same action ({{commandType}}) in different ways:

{{outputs}}

Your job:
1. Identify what structural elements appear consistently across all outputs
2. Identify what varies between outputs  
3. Write a TypeScript regex pattern that would catch ALL of these variations
4. Err on the side of being too broad — we can tighten later based on false positives
5. Output ONLY the regex pattern and a brief explanation of what it catches

Format:
PATTERN: /your-regex-here/gi
CATCHES: [one line explanation]
MISSES: [what this might not catch]`;

/**
 * Verification prompt template
 */
export const VERIFICATION_PROMPT = `Here is a regex pattern just generated for command recognition:

PATTERN: {{pattern}}

Test it against these 5 new variations of the same command (different from the training set):

{{testVariations}}

For each variation, output YES if the pattern matches, NO if it doesn't.
Format:
1. YES / NO
2. YES / NO
3. YES / NO
4. YES / NO
5. YES / NO

Then provide a summary: [X]/5 matched`;

class RalphCalibrationService {
  private calibrations: Map<string, ModelCalibration> = new Map();

  /**
   * Initialize or retrieve calibration for a model
   */
  getCalibration(modelId: string): ModelCalibration | null {
    return this.calibrations.get(modelId) || null;
  }

  /**
   * Store a new calibration
   */
  saveCalibration(calibration: ModelCalibration): void {
    this.calibrations.set(calibration.modelId, calibration);
    loggingService.log('INFO', `[CALIBRATION] Saved for model: ${calibration.modelId}`, {
      verificationPassRate: calibration.verificationPassRate,
      calibratedAt: new Date(calibration.calibratedAt).toISOString(),
    });
  }

  /**
   * Get all calibrations
   */
  getAllCalibrations(): ModelCalibration[] {
    return Array.from(this.calibrations.values());
  }

  /**
   * Check if a model needs calibration
   * Returns true if not yet calibrated
   */
  needsCalibration(modelId: string): boolean {
    return !this.calibrations.has(modelId);
  }

  /**
   * Increment citation count for a pattern in a model's calibration
   * If threshold is reached (3), return true to trigger recalibration
   */
  citationFalsePositive(
    modelId: string,
    commandType: keyof ModelCalibration['citationCount']
  ): boolean {
    const cal = this.calibrations.get(modelId);
    if (!cal) return false;

    cal.citationCount[commandType]++;
    const RECALIBRATION_THRESHOLD = 3;

    if (cal.citationCount[commandType] >= RECALIBRATION_THRESHOLD) {
      loggingService.log('INFO', `[CALIBRATION] Recalibration triggered for ${modelId}/${commandType}`, {
        citationCount: cal.citationCount[commandType],
      });
      return true;
    }

    return false;
  }

  /**
   * Get calibration progress info for UI
   */
  getCalibrationStatus(modelId: string) {
    const cal = this.calibrations.get(modelId);
    if (!cal) {
      return {
        status: 'not_calibrated',
        modelId,
      };
    }

    return {
      status: 'calibrated',
      modelId,
      calibratedAt: new Date(cal.calibratedAt).toISOString(),
      verificationPassRate: cal.verificationPassRate,
      patternsCount: Object.keys(cal.patterns).length,
      citationsTotal: Object.values(cal.citationCount).reduce((a, b) => a + b, 0),
    };
  }

  /**
   * Build calibration request for a specific role.
   * Falls back to 'background' (Ralph) if role not found.
   */
  buildCalibrationRequest(modelId: string, modelName: string, role: string = 'background') {
    const roleTasks = ROLE_CALIBRATION_TASKS[role] || ROLE_CALIBRATION_TASKS['background'];
    return {
      modelId,
      modelName,
      role,
      roleLabel: roleTasks.roleLabel,
      commandTypes: roleTasks.commandTypes.map(ct => ({
        type: ct.type,
        label: ct.label,
        prompts: ct.prompts,
      })),
    };
  }

  /**
   * Parse Ralph's analysis output to extract regex pattern
   * Expects format:
   *   PATTERN: /regex/gi
   *   CATCHES: explanation
   *   MISSES: what it might miss
   */
  parseRalphAnalysis(output: string): {
    pattern: RegExp | null;
    catches: string;
    misses: string;
    rawOutput: string;
  } {
    // Extract pattern: look for /.../ with flags at the end, allowing for markdown formatting
    // Match: **PATTERN:** /regex/flags or PATTERN: /regex/flags
    let pattern: RegExp | null = null;
    
    // Find the line with PATTERN (case insensitive, with optional markdown)
    const patternLineMatch = output.match(/(?:\*\*)?PATTERN(?:\*\*)?:\s*(.+?)(?:\n|$)/i);
    if (patternLineMatch) {
      const patternContent = patternLineMatch[1].trim();
      // Extract the regex from /.../ and flags
      const regexMatch = patternContent.match(/\/(.+)\/([gimsuvy]*)/);
      if (regexMatch) {
        try {
          pattern = new RegExp(regexMatch[1], regexMatch[2] || 'gi');
        } catch (e) {
          loggingService.log('WARN', '[CALIBRATION] Failed to create RegExp from pattern', {
            error: (e as Error).message,
            patternContent: patternContent,
          });
        }
      }
    }

    // Extract catches and misses
    const catchesMatch = output.match(/(?:\*\*)?CATCHES(?:\*\*)?:\s*(.+?)(?:\n|$)/i);
    const missesMatch = output.match(/(?:\*\*)?MISSES(?:\*\*)?:\s*(.+?)(?:\n|$)/i);

    return {
      pattern,
      catches: catchesMatch ? catchesMatch[1].trim() : '',
      misses: missesMatch ? missesMatch[1].trim() : '',
      rawOutput: output,
    };
  }

  /**
   * Parse verification results
   * Expects: "1. YES / NO\n2. YES / NO\n..." with summary line
   */
  parseVerificationResults(output: string): {
    results: boolean[];
    passRate: number;
    rawOutput: string;
  } {
    const lines = output.split('\n');
    const results: boolean[] = [];

    for (const line of lines) {
      if (line.match(/^\d+\./)) {
        const isPass = line.toUpperCase().includes('YES');
        results.push(isPass);
      }
    }

    const passRate = results.length > 0 ? (results.filter(r => r).length / results.length) * 100 : 0;

    return {
      results,
      passRate,
      rawOutput: output,
    };
  }

  /**
   * Build default fallback calibration when manual calibration is skipped
   * Uses loose patterns based on common command structures
   */
  buildDefaultCalibration(modelId: string): ModelCalibration {
    return {
      modelId,
      calibratedAt: Date.now(),
      patterns: {
        workOrderCreate: /(?:create|new|open|start|log|add).*(?:work\s*order|task|job|item)/gi,
        workOrderStatus: /(?:what|show|check|any).*(?:work\s*order|task|status|queue|open)/gi,
        workOrderReject: /(?:reject|kill|cancel|close|refuse).*(?:work\s*order|task|job)/gi,
        workOrderComplete: /(?:mark|complete|finish|done|close).*(?:work\s*order|task|item)/gi,
        braveSearch: /(?:brave|search|look|find|research).*(?:for|up)?/gi,
        mirrorQuery: /(?:mirror|mirror-mirror|recall|check|memory|knowledge\s*base)/gi,
        scoutNavigate: /(?:scout|navigate|browse|visit|go\s*to|extract)/gi,
      },
      verificationPassRate: 0,
      citationCount: {
        workOrderCreate: 0,
        workOrderStatus: 0,
        workOrderReject: 0,
        workOrderComplete: 0,
        braveSearch: 0,
        mirrorQuery: 0,
        scoutNavigate: 0,
      },
    };
  }

  /**
   * Clear all calibrations (for session reset)
   */
  clear(): void {
    this.calibrations.clear();
    loggingService.log('INFO', '[CALIBRATION] Cleared all model calibrations');
  }
}

export const ralphCalibrationService = new RalphCalibrationService();
