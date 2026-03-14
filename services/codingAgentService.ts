/**
 * CODING AGENT SERVICE  (browser-safe)
 *
 * All Node.js work (fs, child_process, better-sqlite3) runs inside the local
 * Express server (server/browserServer.ts).  This module is the browser-side
 * client — it speaks to the server via plain fetch().
 *
 * Server endpoints consumed:
 *   POST /run-agent          { task: CodingTask }  → CodingTaskResult
 *   GET  /agent-leaderboard  ?limit=N              → AgentScoreRow[]
 *   GET  /agent-models                             → string[]
 */

const AGENT_SERVER_URL = 'http://localhost:3005';

export interface CodingTask {
  id: string;
  name: string;
  cwd: string;                   // absolute working directory on the server host
  files: Array<{
    path: string;                // relative to cwd
    content: string;
  }>;
  test_command: string;          // e.g. "npm test" or "python -m pytest"
  goal: string;
  timeout_ms?: number;           // default: 60 000
  model?: string;                // optional explicit model name
  crystal?: string;              // optional accumulated failure context
}

export interface CodingTaskResult {
  taskId: string;
  success: boolean;
  output: string;
  error?: string;
  duration_ms: number;
  modelUsed?: string;
  iterationCount: number;
  dbPath: string;
}

export interface AgentScoreRow {
  id: number;
  task: string;
  model: string;
  success: number;
  duration_ms: number;
  iteration: number;
  timestamp: string;
}

class CodingAgentService {
  private async post<T>(endpoint: string, body: unknown): Promise<T> {
    const res = await fetch(`${AGENT_SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Agent server ${endpoint} failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async get<T>(endpoint: string): Promise<T> {
    const res = await fetch(`${AGENT_SERVER_URL}${endpoint}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Agent server ${endpoint} failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Run a coding task.  The Express server handles file writes, subprocess
   * spawning, test execution, and SQLite reading.
   */
  async runCodingTask(task: CodingTask): Promise<CodingTaskResult> {
    return this.post<CodingTaskResult>('/run-agent', { task });
  }

  /** List available LM Studio models (proxied through server). */
  async listModels(): Promise<string[]> {
    try {
      return await this.get<string[]>('/agent-models');
    } catch {
      return [];
    }
  }

  /** View the agent's scoring leaderboard (proxied through server). */
  async viewLeaderboard(limit = 20): Promise<AgentScoreRow[]> {
    try {
      return await this.get<AgentScoreRow[]>(`/agent-leaderboard?limit=${limit}`);
    } catch {
      return [];
    }
  }
}

export const codingAgentService = new CodingAgentService();

