// agent.ts
// Minimal autonomous coding agent for ReflexOS pipeline.
// Located at project root. Invoked as:
//   npx tsx agent.ts task.json
//   npx tsx agent.ts models

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import fetch from 'node-fetch';

type CodingTask = {
  id: string;
  name: string;
  cwd: string;
  files: { path: string; content: string }[];
  test_command: string;
  goal: string;
  timeout_ms?: number;
};

type AgentScoreRow = {
  id: number;
  task: string;
  model: string;
  success: number;
  duration_ms: number;
  iteration: number;
  timestamp: string;
};

const LMSTUDIO_URL =
  process.env.LMSTUDIO_URL || 'http://localhost:1234/v1/chat/completions';
const DEFAULT_MODEL =
  process.env.LMSTUDIO_MODEL || 'deepseek-coder-v2'; // or whatever you use

const SCORES_PATH = path.resolve(__dirname, 'agent_scores.json');

function readJsonFile<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

function writeJsonFile(p: string, data: any) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function loadScores(): AgentScoreRow[] {
  if (!fs.existsSync(SCORES_PATH)) return [];
  try {
    return readJsonFile<AgentScoreRow[]>(SCORES_PATH);
  } catch {
    return [];
  }
}

function appendScore(row: AgentScoreRow) {
  const scores = loadScores();
  scores.push(row);
  writeJsonFile(SCORES_PATH, scores);
}

async function listModels(): Promise<void> {
  try {
    const resp = await fetch(
      LMSTUDIO_URL.replace('/chat/completions', '/models'),
    );
    if (!resp.ok) {
      console.error('Failed to list models:', resp.status, await resp.text());
      process.exit(1);
    }
    const data = (await resp.json()) as any;
    const models = data.data || data.models || [];
    for (const m of models) {
      const id = m.id || m.name || JSON.stringify(m);
      console.log(id);
    }
  } catch (e: any) {
    console.error('Error listing models:', e.message || e);
    process.exit(1);
  }
}

async function callModel(
  task: CodingTask,
  iteration: number,
): Promise<string> {
  const systemPrompt = [
    'You are a local coding agent.',
    'You will receive a set of files and a coding goal.',
    'Propose concrete edits as unified patches.',
    'Format:',
    '',
    'FILE: relative/path/to/file.ts',
    '```diff',
    '--- before',
    '+++ after',
    '@@',
    '...diff here...',
    '```',
    '',
    'Only output one or more FILE blocks with diff code fences.',
    'Do not run tests yourself.',
  ].join('\n');

  const filesSection = task.files
    .map(
      (f) =>
        `### File: ${f.path}\n` +
        '```ts\n' +
        f.content.slice(0, 20000) +
        '\n```',
    )
    .join('\n\n');

  const userPrompt = [
    `TASK ID: ${task.id}`,
    `GOAL: ${task.goal}`,
    `WORKING DIR: ${task.cwd}`,
    `TEST COMMAND: ${task.test_command}`,
    `ITERATION: ${iteration}`,
    '',
    'Here are the current files:',
    filesSection,
  ].join('\n\n');

  const body = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: false,
    max_tokens: 4096,
  };

  const resp = await fetch(LMSTUDIO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Model call failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as any;
  const content =
    data.choices?.[0]?.message?.content ??
    data.choices?.[0]?.text ??
    JSON.stringify(data);
  return content as string;
}

function applyDiffs(taskDir: string, diffText: string) {
  // Extremely dumb "patch by whole file" parser:
  // Looks for FILE: path + ``` ``` blocks and overwrites file content.
  const fileBlocks = diffText.split(/FILE:\s+/g).slice(1);
  for (const block of fileBlocks) {
    const [header, rest] = block.split('\n', 2);
    const relPath = header.trim();
    const match = rest.match(/```[\s\S]*?\n([\s\S]*?)```/);
    if (!match) continue;
    const newContent = match[1];

    const absPath = path.join(taskDir, relPath);
    const dir = path.dirname(absPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(absPath, newContent, 'utf8');
  }
}

function runTests(task: CodingTask, taskDir: string): { ok: boolean; out: string } {
  const start = Date.now();
  try {
    const result = spawnSync(task.test_command, {
      shell: true,
      cwd: taskDir,
      encoding: 'utf8',
      timeout: task.timeout_ms || 60000,
    });
    const out = (result.stdout || '') + (result.stderr || '');
    const ok = result.status === 0;
    return { ok, out };
  } catch (e: any) {
    return { ok: false, out: String(e) };
  } finally {
    const dur = Date.now() - start;
    console.log(`Test run duration: ${dur} ms`);
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npx tsx agent.ts <task.json> | models');
    process.exit(1);
  }

  if (arg === 'models') {
    await listModels();
    process.exit(0);
  }

  const taskPath = path.resolve(arg);
  if (!fs.existsSync(taskPath)) {
    console.error('Task file not found:', taskPath);
    process.exit(1);
  }

  const task = readJsonFile<CodingTask>(taskPath);

  const taskDir = path.dirname(taskPath);
  const start = Date.now();
  let success = false;
  let lastOutput = '';
  const maxIterations = 3;
  let iteration = 0;
  const modelId = DEFAULT_MODEL;

  for (iteration = 1; iteration <= maxIterations; iteration++) {
    console.log(`Iteration ${iteration}/${maxIterations} for task ${task.id}`);
    const patchText = await callModel(task, iteration);
    applyDiffs(taskDir, patchText);
    const result = runTests(task, taskDir);
    lastOutput = result.out;
    if (result.ok) {
      success = true;
      break;
    } else {
      console.log('Tests failed, will retry if iterations remain.');
    }
  }

  const duration_ms = Date.now() - start;
  const row: AgentScoreRow = {
    id: Date.now(),
    task: task.id,
    model: modelId,
    success: success ? 1 : 0,
    duration_ms,
    iteration,
    timestamp: new Date().toISOString(),
  };
  appendScore(row);

  // Print a compact summary for /run-agent to capture if desired
  console.log(
    `[agent] Task ${task.id} ${success ? 'SUCCESS' : 'FAIL'} in ${duration_ms}ms, iterations=${iteration}, model=${modelId}`,
  );

  if (!success) {
    console.error(lastOutput.slice(0, 4000));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('Agent fatal error:', e?.stack || e);
  process.exit(1);
});
