# Repository Architecture — File Map

**Purpose:** A compact, text-only map of the repository: directory groups, each TypeScript/TSX file with a short **What** (purpose) and **How** (implementation approach / key exports).

---

## Usage
- Location: `docs/architecture-files.md` (this file)
- Contents: readable file-by-file mapping that helps engineers onboard and locate responsibilities quickly.

---

## Top-level / root
- `vite.config.ts`
  - What: Vite build/dev configuration.
  - How: Exports Vite settings (plugins, aliases, React plugin) used by `dev`/`build` commands.

- `vitest.config.ts`
  - What: Vitest test-runner configuration.
  - How: Configures test environment, setup files, and reporters.

- `types.ts` (root)
  - What: Shared TypeScript types and default helpers used across the codebase.
  - How: Declares interfaces (AI settings, WorkflowStage, MemoryAtom, etc.) and simple factory helpers like `getDefaultSettings()`.

- `index.tsx`
  - What: Web UI entry point.
  - How: Mounts the React root and renders the main `App` component.

- `App.tsx` / `src/App.tsx`
  - What: Top-level React application wrapper and global event routing.
  - How: Composes UI panels, listens for events (Lüscher/fire events), and initializes core services.

---

## `src/` (primary source)

### `src/types.ts`
- What: Project-specific types and defaults.
- How: Shared declarations used by UI and orchestrator code.

### `src/hooks/`
- `useChat.ts` — What: Chat state & send/receive logic. How: Exposes hooks for message lifecycle and provider integration.
- `useSrgForceLayout.ts` — What: SRG force-layout calculations. How: Provides layout state & tick updates for SRG visualizations.
- `useSpeechRecognition.ts` — What: Web Speech wrapper. How: Manages recognition lifecycle and partial transcripts.
- `useForceLayout.ts` — What: Generic force layout helper (legacy/demo). How: Returns ticks and position updates.

### `src/components/` (UI)
- `WorkflowDesigner.tsx`
  - What: Workflow & provider settings editor (stages, backgroundRunMode, Lüscher toggles).
  - How: Local form state, `setSettings()` on save, exposes Run-Lüscher button and `backgroundRunMode` select.

- `ToggleSwitch.tsx` — What: Styled on/off switch. How: Controlled component with `checked` and `onToggle`.
- `Message.tsx` — What: Chat message renderer. How: Shows content, metadata, and cognitive trace when present.
- `MemoryCrystal.tsx` — What: Memory atom viewer. How: Lists and renders atom summaries for inspection.
- `SRGExplorer.tsx` — What: SRG visualization panel. How: Uses force layout hook + D3-like rendering.
- `ChatPanel.tsx` — What: Main chat UI. How: Uses `useChat` to drive messages and controls.
- `InsightsViewer.tsx` / `InsightDisplay.tsx` — What: Steward notes and insights viewers. How: Renders candidate insights and details.
- `LogViewer.tsx` — What: Debug logs UI. How: Subscribes to logging service for live entries.
- `ImportModuleModal.tsx`, `ImportHistoryPanel.tsx` — What: Module import UI. How: Parses files and forwards to `chatImportService`.
- `CodeBlock.tsx`, `DiffViewer.tsx` — What: Code & diff renderers. How: Syntax highlight and side-by-side diff.
- `icons/index.tsx` — What: Small SVG icon components. How: Exports reusable icon React components.

### `src/services/` (domain services)
- `networkRetry.ts` — What: Robust fetch helper with retries.
  - How: `fetchWithRetry()` has exponential backoff, honors `Retry-After`, deterministic first retry for reliable tests.

- `geminiService.ts` — What: LLM abstraction (Google Gemini + OpenAI-compatible flows).
  - How: `generateText()` wraps model calls using `fetchWithRetry`, exports role prompts (SUBCONSCIOUS/CONSCIOUS).

- `rcbService.ts` — What: Running Context Buffer update & reflection.
  - How: `updateRcb()` sets canonical `rcb.timestamp`, runs reflection prompts, and adds `time_divergence` warnings when needed.

- `backgroundCognitionService.ts` — What: Implements chained background cycles (Subconscious → Conscious → Synthesis).
  - How: `runChainedCycle()` coordinates per-layer generation and persists `subconscious_reflection` and `conscious_thought` atoms.

- `backgroundOrchestrator.ts` — What: Schedules background cycles per stage and idle reflection.
  - How: Tracks `lastRunByStage`, enforces `backgroundIntervalMinutes`, and runs chained or independent cycles per `backgroundRunMode`.

- `pipelineOrchestrator.ts` — What: Runs a pipeline for a workflow stage.
  - How: Builds context, injects Lüscher into prompts (if present), calls `geminiService`/`modelIo`, parses model output and stores results.

- `srgService.ts` — What: High-level SRG helpers and view composition.
  - How: `getSrgView()` composes compact SRG payloads (nodes, links, trace snippets) for stages and playback.

- `srgStorage.ts` — What: SRG persistence layer.
  - How: In-memory store with IndexedDB persistence (idb-keyval), supports add/get operations and timeline persistence.

- `srgPlayback.ts` — What: Playback & windowing logic for SRG timelines.
  - How: `getPlaybackWindow()` uses semantic interference thresholds and local continuity to compute coherent playback blocks.

- `srgSimilarity.ts` — What: SRG similarity computation.
  - How: `computeSrgSimilarity()` blends lexical/structural similarity with `provenanceWeight` and normalizes by min-sum.

- `srgCore.ts` — What: SRG low-level algorithms (position hashing, relation extraction).
  - How: Tokenization, relation pattern extraction (IS_A/WANT/HAS), and interference hashing.

- `srgDataset.ts`, `srg-word-*` — What: Dataset & demo helpers.
  - How: Sample corpora, tokenization helpers for tests/demos.

- `srgModuleService.ts` — What: Knowledge module management (import, toggle, per-stage selection).
  - How: Imports modules from chat, computes module interference, returns `getActiveModulesForStage()`.

- `recallWeaverService.ts` — What: Builds recall chains across SRG traces.
  - How: Searches trace graphs and links candidate recall pairs for resurfacing.

- `memoryService.ts` — What: Memory atom creation, persistence, and event emission.
  - How: Persists atoms to storage, schedules resurfacing, writes to SRG, emits new-atom events.

- `resurfacingService.ts` — What: Scheduling for memory resurfacing.
  - How: Computes intrinsic values and schedules restore times (Fibonacci-like scheduler).

- `contextService.ts` — What: Builds context packets and assigns tiers.
  - How: Selects context items (hot/warm/cold) and ranks them using SRG similarity.

- `interferenceAnalyzer.ts` — What: Calculates token interference metrics.
  - How: Uses positional hashing to compute local co-occurrence and influence scores.

- `graphService.ts` — What: Graph utility helpers for visuals.
  - How: Node/link formatting, transforms and aggregation helpers.

- `modelIo.ts` — What: Low-level provider I/O wrappers.
  - How: Normalizes provider-specific HTTP calls and responses.

- `toolService.ts` — What: Executes external tools (search, web scrapers, etc.).
  - How: Runs registered tools and returns structured outputs for stages.

- `chatImportService.ts` — What: Imports chat archives into memory & SRG.
  - How: Parses various export formats, creates memory atoms, and links replies.

- `codeBlockParser.ts` — What: Extracts code blocks & metadata from text inputs.
  - How: Regex-based extraction used by code-focused tooling.

- `luescherService.ts` — What: Lüscher intake and result persistence.
  - How: Persists Lüscher results to `workflowStage.lastLuscher` and exposes helpers to transform marble sorter outputs.

- `loggingService.ts` — What: Centralized logging used across services and UI.
  - How: Append/subscribe interface used by `LogViewer` and tests.

- `introspectionService.ts` — What: Debug & state dump helpers.
  - How: Exposes functions to dump SRG traces, orchestrator state, and internal data for diagnostics.

- `toolService.ts` and other misc helpers — What/How: see above (shared utilities used by pipeline flows).

---

## `services/` (legacy / duplicated implementations)
- Many services have legacy or alternative duplicates here (e.g., `backgroundCognitionService.ts`, `srgService.ts`, `rcbService.ts`, etc.).
- These may be older variants or copies used by demo builds; they largely replicate the behavior found in `src/services/` with minor differences.

---

## `components/` (legacy / top-level UI)
- Many UI components live in this top-level `components/` folder (older copies or alternate entry points): `WorkflowDesigner.tsx`, `ChatPanel.tsx`, `AxiomsViewer.tsx`, `SrgPlaybackPanel.tsx`, etc.
- These mirror or complement `src/components/` and are used by different demos or builds.

---

## `jelly/` (Lüscher, marble sorter demo)
- `jelly/App.tsx`, `jelly/index.tsx`, `jelly/components/JellybeanHumanCheck.tsx`, `jelly/types.ts`, `jelly/vite.config.ts`
  - What: Demo UI for Lüscher intake and human verification flows.
  - How: Standalone mini app with its own Vite config that emits Lüscher events for the main app.

---

## `12.9.25-6.10pm/` (snapshot / historical)
- Purpose: A dated snapshot containing components, services, and hooks used as fixtures or older references.
- How: Useful for regression comparisons and reproducing prior behaviors in tests.

---

## `tests/` (unit + integration)
- Top tests: `networkRetry.test.ts`, `geminiRetry.test.ts`, `backgroundCognitionChained.test.ts`, `backgroundOrchestrator.test.ts`, `pipelineOrchestrator.test.ts`, `srg*` tests, `workflowDesigner*.test.tsx`, etc.
- They validate retry semantics, SRG similarity & playback, chained cognition ordering, RCB timestamp behavior, Lüscher gating, and UI events.

---

## Notes & Highlights
- SRG stack flow: `srgCore` → `srgStorage` → `srgService` → `srgPlayback`/`srgSimilarity` → `backgroundCognitionService`.
- RCB: `rcbService.updateRcb()` is the canonical anchor for narrative time and flags `time_divergence` > 1 year.
- Lüscher: `luescherService` + `jelly/` demo persist `lastLuscher` at the workflow stage and pipeline injects it into prompts.
- Network reliability: `fetchWithRetry()` is used by `geminiService` to handle provider errors deterministically.

---

## How this was built
- Scanned repository for all `.ts` / `.tsx` files and grouped by logical folders.
- Summarized purpose (What) and key implementation/export (How) in short lines to aid quick scanning.

---

If you'd like I can:
- ✅ Commit and push this file to the `docs/architecture-diagram` branch (I can do that now), or
- ✨ Add more detail per-file (top functions & call sites), or
- 🎨 Produce a condensed SVG visual that lists directories and arrows (for README embedding).

Which option do you want next?