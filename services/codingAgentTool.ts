/**
 * REFLEX CODING AGENT TOOL
 * 
 * Integrates CodingAgentService into Reflex's workflow as a callable tool.
 * Can be invoked during:
 *  - Background cognition cycles (autonomous code maintenance)
 *  - Explicit tool calls from dual-process reasoning
 *  - Scheduled self-improvement tasks
 * 
 * Example workflow stage using this tool:
 * {
 *   id: "code_maintenance",
 *   name: "Code Maintenance & Self-Improvement",
 *   enabled: true,
 *   provider: "lmstudio",
 *   selectedModel: "local-model",
 *   systemPrompt: "You are a code improvement planner...",
 *   inputs: ["RECENT_HISTORY", "CONTEXT_FILES"],
 *   enableTimedCycle: true,
 *   timerSeconds: 300,
 *   backgroundIntervalMinutes: 30
 * }
 */

import { codingAgentService, CodingTask, CodingTaskResult } from './codingAgentService';
import { srgService } from './srgService';
import type { MemoryAtom } from '../types';

export interface CodingTaskSpec {
  name: string;
  cwd: string;
  files: Array<{ path: string; content: string }>;
  test_command: string;
  goal: string;
  model?: string;
  crystal?: string;
}

class CodingAgentTool {
  /**
   * Callable tool for Reflex workflows: runCodingTask
   * 
   * Usage in workflow:
   *   const result = await codingAgentTool.runCodingTask(taskSpec);
   *   // Then handle result and create memory atoms
   */
  async runCodingTask(taskSpec: CodingTaskSpec): Promise<CodingTaskResult> {
    const task: CodingTask = {
      id: `task-${Date.now()}`,
      name: taskSpec.name,
      cwd: taskSpec.cwd,
      files: taskSpec.files,
      test_command: taskSpec.test_command,
      goal: taskSpec.goal,
      timeout_ms: 60000,
      model: taskSpec.model,
      crystal: taskSpec.crystal,
    };

    const result = await codingAgentService.runCodingTask(task);
    return result;
  }

  /**
   * Create memory atoms from a coding task result
   * 
   * This is called after runCodingTask() completes.
   * Imports the outcome into Reflex's memory so future reasoning can learn from it.
   */
  async importTaskResult(result: CodingTaskResult): Promise<MemoryAtom> {
    const outcome = result.success ? 'SUCCESS' : 'FAILURE';
    const summary =
      `[Coding Agent] Task ${result.taskId}: ${outcome}\n` +
      `Model: ${result.modelUsed ?? 'unknown'} | ` +
      `Iterations: ${result.iterationCount} | ` +
      `Duration: ${result.duration_ms}ms\n` +
      (result.error ? `Error: ${result.error}\n` : '') +
      (result.output ? `Output:\n${result.output.slice(0, 2000)}` : '');

    // Teach SRG about this outcome so future reasoning can reference it
    const srgText = result.success
      ? `Coding task "${result.taskId}" succeeded using model "${result.modelUsed ?? 'unknown'}" in ${result.iterationCount} iteration(s). All tests passed.`
      : `Coding task "${result.taskId}" failed using model "${result.modelUsed ?? 'unknown'}". ${result.error ?? 'Tests did not pass.'}`;
    srgService.ingestHybrid(srgText);

    const atom: MemoryAtom = {
      uuid: `coding-result-${result.taskId}`,
      type: 'steward_note',
      role: 'model',
      text: summary,
      timestamp: Date.now(),
      isInContext: true,
      isCollapsed: false,
    };
    return atom;
  }

  /**
   * Parse Reflex's reasoning output to extract a coding task
   * 
   * Dual-process engine might output something like:
   * "TASK: Upgrade session profile tracking
   *  CWD: ./services
   *  FILES: sessionService.ts
   *  TEST: npm test -- sessionService
   *  GOAL: Add a new field `lastModifiedAt` to SessionProfile and update the schema."
   */
  extractTaskFromReasoning(reasoningText: string): CodingTaskSpec | null {
    const taskMatch = reasoningText.match(/TASK:\s*(.+)/);
    const cwdMatch  = reasoningText.match(/CWD:\s*(.+)/);
    const testMatch = reasoningText.match(/TEST:\s*(.+)/);
    const goalMatch = reasoningText.match(/GOAL:\s*([\s\S]+?)(?:\n[A-Z]+:|$)/);

    if (!taskMatch || !cwdMatch || !testMatch || !goalMatch) return null;

    return {
      name:         taskMatch[1].trim(),
      cwd:          cwdMatch[1].trim(),
      test_command: testMatch[1].trim(),
      goal:         goalMatch[1].trim(),
      files: [], // caller populates from disk before invoking
    };
  }

  /** List available models in LM Studio (via agent CLI) */
  async listAvailableModels(): Promise<string[]> {
    return await codingAgentService.listModels();
  }

  /**
   * View leaderboard (proxy to agent)
   */
  async viewLeaderboard(limit = 20): Promise<any[]> {
    return await codingAgentService.viewLeaderboard(limit);
  }
}

export const codingAgentTool = new CodingAgentTool();
