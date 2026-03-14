# ReflexOS Coding Agent Pipeline

> Complete technical reference for the autonomous code maintenance system.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Flow Diagram](#data-flow-diagram)
3. [Trigger Mechanisms](#trigger-mechanisms)
4. [Phase 1: LLM Task Proposal](#phase-1-llm-task-proposal)
5. [Phase 2: Task Parsing](#phase-2-task-parsing)
6. [Phase 3: File Attachment](#phase-3-file-attachment)
7. [Phase 4: Task Execution](#phase-4-task-execution)
8. [Phase 5: Result Import](#phase-5-result-import)
9. [UI Configuration](#ui-configuration)
10. [File Map](#file-map)
11. [Interfaces & Types](#interfaces--types)
12. [Prompts Reference](#prompts-reference)
13. [Server Endpoints](#server-endpoints)
14. [Scoring & Leaderboard](#scoring--leaderboard)
15. [Status: What Exists vs. What's Missing](#status-what-exists-vs-whats-missing)

---

## Architecture Overview

The coding agent is a **5-phase pipeline** embedded in the background cognition system. When a `code_maintenance` workflow stage fires, the system:

1. Asks an LLM to **propose** a single coding task (structured output)
2. **Parses** the proposal into a typed task spec
3. **Attaches** relevant project files from the current context
4. **Executes** the task via a local agent subprocess (through the Express server)
5. **Imports** the result into memory and teaches SRG about the outcome

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                           │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────┐                     │
│  │ BackgroundCog.   │───▶│  useChat.ts       │                    │
│  │ Modal (UI)       │    │  runAutonomous    │                    │
│  │ [RUN NOW] button │    │  WorkflowCycle()  │                    │
│  └─────────────────┘    └────────┬─────────┘                    │
│                                  │                               │
│                    ┌─────────────▼──────────────┐                │
│                    │ backgroundCognitionService  │                │
│                    │ .runWebSearchCycle()        │                │
│                    │                             │                │
│                    │ if stage.id === 'code_      │                │
│                    │ maintenance' → branch to    │                │
│                    │ runCodeMaintenanceCycle()   │                │
│                    └─────────────┬──────────────┘                │
│                                  │                               │
│         ┌────────────────────────┼────────────────────┐          │
│         ▼                        ▼                    ▼          │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────────┐    │
│  │ geminiService │  │ codingAgentTool  │  │ codingAgentTool │    │
│  │ .generateText │  │ .extractTask     │  │ .importTask     │    │
│  │ (LLM call)   │  │ FromReasoning()  │  │ Result()        │    │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬────────┘    │
│         │ Phase 1           │ Phase 2              │ Phase 5     │
│         │                   │                      │             │
│         │            ┌──────▼──────────┐           │             │
│         │            │ codingAgent     │           │             │
│         │            │ Service         │◀──────────┘             │
│         │            │ .runCodingTask()│                         │
│         │            └──────┬─────────┘                         │
│         │                   │ Phase 3+4                          │
└─────────│───────────────────│────────────────────────────────────┘
          │                   │
          │                   │  HTTP POST /run-agent
          │                   ▼
┌─────────│───────────────────────────────────────────────────────┐
│         │           EXPRESS SERVER (port 3005)                   │
│         │                                                       │
│         │   ┌───────────────────────────────────────┐           │
│         │   │ POST /run-agent                       │           │
│         │   │  1. Write task files to temp dir      │           │
│         │   │  2. Write task.json                   │           │
│         │   │  3. Spawn: npx tsx agent.ts task.json │           │
│         │   │  4. Collect stdout/stderr             │           │
│         │   │  5. Read/write agent_scores.json      │           │
│         │   │  6. Return CodingTaskResult           │           │
│         │   └───────────────┬───────────────────────┘           │
│         │                   │                                   │
│         │                   ▼                                   │
│         │         ┌─────────────────┐                           │
│         │         │   agent.ts      │  ◀── DOES NOT EXIST YET  │
│         │         │   (subprocess)  │                           │
│         │         └─────────────────┘                           │
│         │                                                       │
│  ┌──────▼────────────────────────┐                              │
│  │ LM Studio / Gemini / OpenAI  │                               │
│  │ (API at configured endpoint) │                               │
│  └───────────────────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
TRIGGER (button click or timer)
  │
  ▼
CustomEvent('trigger-code-maintenance')
  │
  ▼
App.tsx event listener
  │  finds code_maintenance stage in aiSettings.backgroundWorkflow
  │
  ▼
useChat.ts → runAutonomousWorkflowCycle(stage)
  │  builds FullCognitionContext:
  │    - messages (conversation history)
  │    - projectFiles (files in context)
  │    - contextFileNames
  │    - baseContextPackets (assembled from stage.inputs)
  │    - rcb (Running Context Buffer)
  │
  ▼
backgroundCognitionService.runWebSearchCycle(context, roleSetting, providers, workflow, stage)
  │  detects stage.id === 'code_maintenance'
  │  branches to runCodeMaintenanceCycle()
  │
  ├──── PHASE 1: generateText(contextString, stage.systemPrompt, roleSetting, providers)
  │     │  LLM returns structured proposal: TASK / CWD / TEST / GOAL
  │     ▼
  ├──── PHASE 2: codingAgentTool.extractTaskFromReasoning(proposal)
  │     │  Regex parse → CodingTaskSpec { name, cwd, test_command, goal, files: [] }
  │     ▼
  ├──── PHASE 3: Attach project files matching spec.cwd
  │     │  spec.files = projectFiles.filter(f => f.path.startsWith(cwd))
  │     ▼
  ├──── PHASE 4: codingAgentTool.runCodingTask(spec)
  │     │  → codingAgentService.runCodingTask(task)
  │     │  → POST http://localhost:3005/run-agent { task }
  │     │  → Server spawns: npx tsx agent.ts task.json
  │     │  → Returns CodingTaskResult
  │     ▼
  └──── PHASE 5: codingAgentTool.importTaskResult(result)
        │  → Creates MemoryAtom (type: steward_note)
        │  → Teaches SRG via srgService.ingestHybrid()
        │  → Returns atom to backgroundCognitionService
        │
        ▼
  BackgroundInsight returned to useChat → pushed to messages state
```

---

## Trigger Mechanisms

### 1. Manual Button Press

**File:** `components/BackgroundCognitionModal.tsx`

The **[RUN CODE MAINTENANCE NOW]** button dispatches a `CustomEvent`:

```typescript
window.dispatchEvent(new CustomEvent('trigger-code-maintenance'));
```

**File:** `App.tsx` (event listener, ~line 185)

```typescript
window.addEventListener('trigger-code-maintenance', () => {
  const stage = aiSettings.backgroundWorkflow.find(s => s.id === 'code_maintenance');
  if (stage) chat.runAutonomousWorkflowCycle(stage);
});
```

### 2. Timed Auto-Run

**File:** `hooks/useChat.ts` (~line 219)

When the stage has `enableTimedCycle: true` and `timerSeconds > 0`:

```typescript
aiSettings.backgroundWorkflow.forEach(stage => {
  if (stage.enabled && stage.enableTimedCycle && stage.timerSeconds > 0) {
    setInterval(() => runAutonomousWorkflowCycle(stage), stage.timerSeconds * 1000);
  }
});
```

### 3. Background Scheduler (Alternative Path)

**File:** `services/backgroundScheduler.ts`

The `BackgroundScheduler` class runs a 5-second tick loop. For each workflow stage with `enableTimedCycle`, it can run either `chained` or `independent` mode. If `code_maintenance` is in the workflow array and enabled with a timer, it will be picked up here too.

---

## Phase 1: LLM Task Proposal

**Where:** `backgroundCognitionService.runCodeMaintenanceCycle()` → `generateText()`

### System Prompt

Defined on the `code_maintenance` WorkflowStage default in `types.ts` (line ~498):

```
You are a coding assistant with access to this project's source files.
Propose ONE small, testable code improvement using EXACTLY this format:

TASK: <short name>
CWD: <absolute path to working directory>
TEST: <test command to verify success>
GOAL: <one paragraph describing the change and why it helps>

Do not include anything else.
```

### User Prompt (Dynamic Context)

Built by `backgroundCognitionService.buildContextString(context, workflowStage)`.

The `code_maintenance` stage has `inputs: ['CONTEXT_FILES', 'RECENT_HISTORY']`, so the context assembles:

```
--- Files in Context ---
<content of all files currently loaded, each truncated to 20k chars>

--- Recent Conversation History ---
<recent user/model messages, truncated to 20k chars>
```

**Safety limit:** Total context capped at **60,000 characters** (`MAX_CONTEXT_CHARS`).

### LLM Routing

**File:** `services/geminiService.ts` → `generateText()`

Based on the stage's `provider` setting:

| Provider | Endpoint | Auth |
|----------|----------|------|
| `gemini` | Gemini SDK (`@google/genai`) | API key |
| `lmstudio` | `http://localhost:1234/v1/chat/completions` | None |
| `openai` | OpenAI SDK endpoint | API key |
| `openrouter` | `https://openrouter.ai/api/v1/chat/completions` | Bearer token |

Default for `code_maintenance`: **`lmstudio`** (local model).

The actual API call (for LM Studio) looks like:

```json
{
  "model": "<selectedModel from stage config>",
  "messages": [
    {
      "role": "system",
      "content": "You are a coding assistant with access to this project's source files..."
    },
    {
      "role": "user",
      "content": "\n\n--- Files in Context ---\n<files>\n\n--- Recent Conversation History ---\n<history>"
    }
  ],
  "stream": false,
  "max_tokens": 16000
}
```

### Expected LLM Output

```
TASK: Fix unused import in sessionService
CWD: C:\Users\johnv\Downloads\copy-of-reflexengine-otto-matic (23)\services
TEST: npm test -- sessionService
GOAL: Remove the unused `path` import from sessionService.ts to clean up the module and reduce potential confusion for future developers.
```

---

## Phase 2: Task Parsing

**Where:** `codingAgentTool.extractTaskFromReasoning(proposal)`

**File:** `services/codingAgentTool.ts`

Simple regex extraction:

```typescript
const taskMatch = reasoningText.match(/TASK:\s*(.+)/);
const cwdMatch  = reasoningText.match(/CWD:\s*(.+)/);
const testMatch = reasoningText.match(/TEST:\s*(.+)/);
const goalMatch = reasoningText.match(/GOAL:\s*([\s\S]+?)(?:\n[A-Z]+:|$)/);
```

Returns `null` if any field is missing → cycle aborts gracefully.

Output type:

```typescript
interface CodingTaskSpec {
  name: string;         // from TASK:
  cwd: string;          // from CWD:
  test_command: string;  // from TEST:
  goal: string;         // from GOAL:
  files: [];            // empty — populated in Phase 3
}
```

---

## Phase 3: File Attachment

**Where:** `backgroundCognitionService.runCodeMaintenanceCycle()`

After parsing, the pipeline attaches all project files whose path starts with the proposed `cwd`:

```typescript
const cwd = spec.cwd.replace(/\\/g, '/');
spec.files = (context.projectFiles ?? [])
  .filter(f => f.path?.replace(/\\/g, '/').startsWith(cwd))
  .map(f => ({ path: f.path, content: f.content ?? '' }));
```

These files get written to the temp directory by the server before spawning the agent.

---

## Phase 4: Task Execution

### Browser → Server

**File:** `services/codingAgentService.ts`

The `CodingTaskSpec` is wrapped into a `CodingTask`:

```typescript
const task: CodingTask = {
  id: `task-${Date.now()}`,
  name: taskSpec.name,
  cwd: taskSpec.cwd,
  files: taskSpec.files,
  test_command: taskSpec.test_command,
  goal: taskSpec.goal,
  timeout_ms: 60000,
};
```

Sent via: `POST http://localhost:3005/run-agent { task }`

### Server Processing

**File:** `server/browserServer.ts`

1. **Validate** — requires `task.id`, `task.cwd`, `task.test_command`
2. **Create temp directory** at `server/../temp-coding-tasks/<task.id>/`
3. **Write files** — each `task.files[]` entry written relative to temp dir
4. **Write task.json** — full task object serialized
5. **Spawn subprocess:**
   ```
   npx tsx agent.ts task.json
   ```
   - `agent.ts` resolved at `path.resolve(__dirname, '../agent.ts')` → **project root**
   - `cwd` set to the directory containing `agent.ts`
   - On Windows: `shell: true`
6. **Timeout** — kills process after `task.timeout_ms` (default 60s), returns exit code 124
7. **Collect output** — stdout + stderr concatenated
8. **Read scores** — from `agent_scores.json` next to `agent.ts`
9. **Append score row** to `agent_scores.json`
10. **Return `CodingTaskResult`**

### Return Type

```typescript
interface CodingTaskResult {
  taskId: string;
  success: boolean;        // exit code === 0
  output: string;          // stdout + stderr
  error?: string;          // "Agent exited with code N"
  duration_ms: number;
  modelUsed?: string;      // from agent_scores.json
  iterationCount: number;  // from agent_scores.json
  dbPath: string;          // path to agent_scores.json
}
```

### ⚠️ CRITICAL: `agent.ts` Does Not Exist

The file at the project root (`agent.ts`) has **not been created yet**. The server will fail with a spawn error when trying to execute it. This is the only missing piece in the pipeline.

**Expected location:** `c:\Users\johnv\Downloads\copy-of-reflexengine-otto-matic (23)\agent.ts`

**Expected capabilities:**
- Accept `task.json` path as CLI argument
- Read the task spec (files, goal, test_command, cwd)
- Connect to LM Studio (or configured LLM) to generate code changes
- Apply changes to the task files
- Run `test_command` to verify
- Iterate on failure (up to some max)
- Write results to `agent_scores.json`
- Support `models` subcommand: `npx tsx agent.ts models` → print available models
- Exit 0 on success, non-zero on failure

---

## Phase 5: Result Import

**Where:** `codingAgentTool.importTaskResult(result)`

**File:** `services/codingAgentTool.ts`

### Memory Atom Creation

```typescript
const atom: MemoryAtom = {
  uuid: `coding-result-${result.taskId}`,
  type: 'steward_note',
  role: 'model',
  text: summary,          // formatted outcome string
  timestamp: Date.now(),
  isInContext: true,       // visible in conversation
  isCollapsed: false,
};
```

Summary format:
```
[Coding Agent] Task task-1710259200000: SUCCESS
Model: deepseek-coder | Iterations: 2 | Duration: 15432ms
Output:
<first 2000 chars of stdout+stderr>
```

### SRG Knowledge Ingestion

```typescript
srgService.ingestHybrid(srgText);
```

On success: `Coding task "task-..." succeeded using model "..." in N iteration(s). All tests passed.`

On failure: `Coding task "task-..." failed using model "...". <error message>`

This teaches the SRG so future reasoning cycles can recall past coding outcomes.

### Return to Caller

The atom is returned up the chain:

```
codingAgentTool.importTaskResult()
  → backgroundCognitionService.runCodeMaintenanceCycle() returns [atom]
  → backgroundCognitionService.runWebSearchCycle() wraps as BackgroundInsight
  → useChat.ts pushes atom to messages state (visible in UI)
```

---

## UI Configuration

**File:** `components/BackgroundCognitionModal.tsx`

The sidebar modal exposes these settings for the code maintenance stage:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| **Enabled** | Toggle | `false` | Master on/off for code maintenance |
| **Provider** | Dropdown | `lmstudio` | Which LLM provider to use for task proposals |
| **Model ID** | Text input | `""` (empty) | Model identifier (e.g., `deepseek-coder-v2`) |
| **Auto-run on timer** | Toggle | `false` | Enable periodic auto-execution |
| **Timer interval** | Number (seconds) | — | How often to auto-run (only shown when auto-run is on) |
| **[RUN CODE MAINTENANCE NOW]** | Button | — | Triggers immediate execution |

The stage settings are stored in `aiSettings.backgroundWorkflow[]` and persisted with the session.

---

## File Map

| File | Layer | Role |
|------|-------|------|
| `types.ts` | Shared | `WorkflowStage` interface, `code_maintenance` defaults, context packet types |
| `components/BackgroundCognitionModal.tsx` | UI | Settings panel + manual trigger button |
| `App.tsx` | UI | Event listener for `trigger-code-maintenance` |
| `hooks/useChat.ts` | Orchestration | `runAutonomousWorkflowCycle()`, timer scheduling, context building |
| `services/backgroundCognitionService.ts` | Core | `runWebSearchCycle()` routing, `runCodeMaintenanceCycle()`, `buildContextString()` |
| `services/geminiService.ts` | LLM | `generateText()`, LM Studio/Gemini/OpenAI routing |
| `services/codingAgentTool.ts` | Tool | `extractTaskFromReasoning()`, `runCodingTask()`, `importTaskResult()` |
| `services/codingAgentService.ts` | HTTP Client | Browser-side fetch wrapper for server endpoints |
| `server/browserServer.ts` | Server | `/run-agent`, `/agent-leaderboard`, `/agent-models` endpoints |
| **`agent.ts`** | **Execution** | **⚠️ MISSING — autonomous coding subprocess** |
| `agent_scores.json` | Data | Scoring/leaderboard persistence (created at runtime) |

---

## Interfaces & Types

### WorkflowStage (from `types.ts`)

```typescript
interface WorkflowStage {
  id: string;
  name: string;
  enabled: boolean;
  provider: AIProvider;           // 'gemini' | 'lmstudio' | 'openai' | 'openrouter'
  selectedModel: string;
  systemPrompt: string;
  inputs: ContextPacketType[];
  enableWebSearch?: boolean;
  enableTimedCycle?: boolean;
  timerSeconds?: number;
  backgroundIntervalMinutes?: number | null;
  backgroundRunMode?: 'chained' | 'independent';
}
```

### CodingTaskSpec (from `codingAgentTool.ts`)

```typescript
interface CodingTaskSpec {
  name: string;
  cwd: string;
  files: Array<{ path: string; content: string }>;
  test_command: string;
  goal: string;
}
```

### CodingTask (from `codingAgentService.ts`)

```typescript
interface CodingTask {
  id: string;
  name: string;
  cwd: string;
  files: Array<{ path: string; content: string }>;
  test_command: string;
  goal: string;
  timeout_ms?: number;
}
```

### CodingTaskResult (from `codingAgentService.ts`)

```typescript
interface CodingTaskResult {
  taskId: string;
  success: boolean;
  output: string;
  error?: string;
  duration_ms: number;
  modelUsed?: string;
  iterationCount: number;
  dbPath: string;
}
```

### AgentScoreRow (from `server/browserServer.ts`)

```typescript
interface AgentScoreRow {
  id: number;
  task: string;
  model: string;
  success: number;       // 1 or 0
  duration_ms: number;
  iteration: number;
  timestamp: string;     // ISO date
}
```

### FullCognitionContext (from `backgroundCognitionService.ts`)

```typescript
interface FullCognitionContext {
  messages: MemoryAtom[];
  projectFiles: ProjectFile[];
  contextFileNames: string[];
  selfNarrative?: string;
  rcb?: RunningContextBuffer;
  baseContextPackets?: Record<string, string>;
}
```

---

## Prompts Reference

### Code Maintenance System Prompt

**Source:** `types.ts` → `getDefaultSettings()` → `backgroundWorkflow[code_maintenance].systemPrompt`

```
You are a coding assistant with access to this project's source files.
Propose ONE small, testable code improvement using EXACTLY this format:

TASK: <short name>
CWD: <absolute path to working directory>
TEST: <test command to verify success>
GOAL: <one paragraph describing the change and why it helps>

Do not include anything else.
```

### Context Packets Used

| Packet | Label | Content |
|--------|-------|---------|
| `CONTEXT_FILES` | "Files in Context" | Full content of all files currently loaded in the UI |
| `RECENT_HISTORY` | "Recent Conversation History" | Last N user/model messages |

---

## Server Endpoints

All served on **`http://localhost:3005`** by `server/browserServer.ts`.

### POST /run-agent

**Request:**
```json
{
  "task": {
    "id": "task-1710259200000",
    "name": "Fix unused import",
    "cwd": "C:\\Users\\johnv\\...\\services",
    "files": [
      { "path": "sessionService.ts", "content": "..." }
    ],
    "test_command": "npm test -- sessionService",
    "goal": "Remove unused import...",
    "timeout_ms": 60000
  }
}
```

**Response:**
```json
{
  "taskId": "task-1710259200000",
  "success": true,
  "output": "All tests passed.\n",
  "duration_ms": 15432,
  "modelUsed": "deepseek-coder-v2",
  "iterationCount": 2,
  "dbPath": "C:\\...\\agent_scores.json"
}
```

### GET /agent-leaderboard?limit=N

Returns last N `AgentScoreRow[]` entries, newest first.

### GET /agent-models

Runs `npx tsx agent.ts models` and returns stdout lines as `string[]`.

---

## Scoring & Leaderboard

**File:** `agent_scores.json` (created at runtime next to `agent.ts`)

Each task execution appends a row:

```json
{
  "id": 1710259215432,
  "task": "task-1710259200000",
  "model": "deepseek-coder-v2",
  "success": 1,
  "duration_ms": 15432,
  "iteration": 2,
  "timestamp": "2026-03-12T14:00:15.432Z"
}
```

The leaderboard is viewable via:
- `GET /agent-leaderboard` endpoint
- `codingAgentTool.viewLeaderboard()` method
- Future UI component (not yet built)

---

## Status: What Exists vs. What's Missing

### ✅ Complete & Wired Up

| Component | Status |
|-----------|--------|
| `WorkflowStage` type + `code_maintenance` defaults | ✅ |
| UI modal with enable/provider/model/timer settings | ✅ |
| Manual trigger button + event wiring | ✅ |
| Timer-based auto-scheduling | ✅ |
| Context building (`buildContextString`) | ✅ |
| LLM task proposal via `generateText()` | ✅ |
| Task parsing (`extractTaskFromReasoning`) | ✅ |
| File attachment from project context | ✅ |
| Browser HTTP client (`codingAgentService`) | ✅ |
| Server endpoint (`POST /run-agent`) | ✅ |
| Temp directory + file writing | ✅ |
| Subprocess spawning infrastructure | ✅ |
| Score reading/writing (`agent_scores.json`) | ✅ |
| Leaderboard endpoint | ✅ |
| Model listing endpoint | ✅ |
| Result import to memory (`importTaskResult`) | ✅ |
| SRG knowledge ingestion of outcomes | ✅ |

### ❌ Missing

| Component | What's Needed |
|-----------|---------------|
| **`agent.ts`** (project root) | The autonomous coding agent subprocess. Must: read `task.json`, connect to LM Studio, generate code edits, apply them, run tests, iterate, write scores, support `models` subcommand. |

### Pipeline Will Fail At

```
Phase 4 → POST /run-agent → spawn('npx', ['tsx', 'agent.ts', ...])
                                                    ^^^^^^^^^^^
                                              FILE NOT FOUND
```

---

## Next Steps

To complete the pipeline, create `agent.ts` at the project root with:

1. **CLI interface:** Accept `task.json` path or `models` subcommand
2. **Task reader:** Parse `CodingTask` from the JSON file
3. **LLM integration:** Connect to LM Studio at `http://localhost:1234/v1/chat/completions`
4. **Code generation:** Send files + goal → receive diffs/edits
5. **File writer:** Apply edits to the temp directory files
6. **Test runner:** Execute `test_command`, capture pass/fail
7. **Iteration loop:** On failure, feed error back to LLM, retry (max 3-5 iterations)
8. **Score writer:** Append `AgentScoreRow` to `agent_scores.json`
9. **Exit code:** 0 = all tests pass, non-zero = failure
10. **Models subcommand:** `GET http://localhost:1234/v1/models` → print model IDs
