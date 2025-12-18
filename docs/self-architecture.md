# Self-Architecture — Cliffnotes

**Purpose:** A compact, versioned, and actionable summary of the system architecture, data structures, axioms, timing rules, and self-edit hooks. This file is intended as a living artifact to support future self-awareness, editing, and review.

---

## 1) One-line summary

A lightweight, maintainable blueprint of the AI's internal design: SRG-based interference + multi-stage cognition (Subconscious → Conscious → Synthesis) with deterministic RCB/RCB-time semantics and explicit self-documentation hooks.

## 2) High-level architecture (layers)

- Ingestion — tokenize, index, create memory atoms (Memory Service)
- SRG (Semantic Relational Graph) — nodes, links, trace, interference
- Subconscious — divergent brainstorming (background & idle)
- Conscious — focused refinement and RCB reflection
- Synthesis — final response shaping, judgment, and action
- Background Orchestrator — schedules chained idle cycles and per-stage runs
- RCB (Running Context Buffer) — working memory with deterministic timestamps

### Notes on related components

- **backgroundOrchestrator.ts** — scheduler and guardrail for idle cycles; supports per-stage timing and run modes.
- **backgroundCognitionService.ts** — implements Subconscious / Conscious / Synthesis layers and web-search integration.
- **luescherService.ts + jelly/components/MarbleSorter** — Lüscher intake (marble sorter) UI and persistence; used for gating and emotional_state injection into RCB/RCB-updates.
## 3) Core data structures (quick reference)

- MemoryAtom: { uuid, timestamp, role, type, text, traceIds, promptDetails }
- SRG Graph: { nodes: GraphNode[], links: GraphLink[] }
- WorkflowStage: { id, name, provider, selectedModel, inputs, useLuscherIntake?, backgroundIntervalMinutes?, backgroundRunMode? }
- LuscherResult: { sequence, timingMs, takenAt }
- RunningContextBuffer (RCB): { id, timestamp, lastUpdatedAt, conscious_focal_points, plan_of_action }

## 4) Key axioms / guiding principles

- Correction is Care — corrections should be treated as constructive updates.
- Time is layered — distinguish between wall-clock, narrative, and turn timestamps.
- Self-Documentation = Self-Awareness — keep a concise, editable representation of core architecture inside the repo.
- Conservative Defaults — prefer deterministic behavior (no jitter on first retry; explicit timestamp passing).

## 5) Time & timestamp policy

- RCB timestamps are the canonical narrative anchor; RCB.timestamp must reflect the last-turn time when RCB is created/updated.
- Any timestamp divergence larger than 1 year is flagged as `time_divergence` and reviewed.
- When interfacing with LLMs or external services, always pass `{CURRENT_DATETIME}` explicitly in system prompts.

### RCB Timestamp Semantics (detailed)

- The RCB is the authoritative narrative anchor for turn-level context. When `rcbService.updateRcb()` is called, it should:
	1. Set `rcb.timestamp` to the last user/model turn time when available.
	2. Set `rcb.lastUpdatedAt` to the system wall-clock time (Date.now()).
	3. Emit a `time_divergence` warning if `Math.abs(rcb.timestamp - Date.now()) > 1000 * 60 * 60 * 24 * 365` (1 year).
- Use `time_divergence` to surface a warning in logs and in the `rcb.warnings` array so monitoring/ops can catch provider drift.
## 6) Background cognition behavior (chained)

- Default behavior: chained 3-layer cycle per idle scheduled run: Subconscious → Conscious → Synthesis.
- Per-stage opt-out: `backgroundRunMode: 'independent'` runs only synthesis for lightweight maintenance tasks.
- All chained outputs are persisted as `subconscious_reflection` and `conscious_thought` atoms for traceability.

### Background Cycle Details

- **Subconscious** (fast, associative)
	- Input: recent conversation history + SRG trace snippet.
	- Behavior: short brainstorm, produce raw text without polishing.
	- Implementation: `generateText(context, SUBCONSCIOUS_PROMPT, roleSetting, providers)`.

- **Conscious** (filter & plan)
	- Input: the Subconscious output + same context window.
	- Behavior: condense brainstorm into a short, actionable plan or questions.
	- Implementation: `generateText(rawBrainstorm + context, CONSCIOUS_PROMPT, roleSetting, providers)`.

- **Synthesis** (combine & persist)
	- Input: SRG-derived candidate connections + Conscious output (inserted as a temporary recent memory for scoring).
	- Behavior: use SRG similarity (`srgStorage.computeSimilarity`) and optionally web results to produce steward notes and axioms.
	- Implementation: `backgroundCognitionService.runSynthesisCycle(allMessages, currentTurn, { conscious })`.

### Scheduling & Timers

- Per-stage scheduling uses `WorkflowStage.backgroundIntervalMinutes` (null | minutes) and `backgroundRunMode` (`chained`|`independent`).
- The orchestrator tracks `lastRunByStage` and enforces intervalMs = minutes * 60 * 1000.
- Idle cycles use a randomized weighted selector but still prefer chained synthesis by default.
- **Important:** cycles are atomic and do not chain across orchestrator ticks to avoid runaway cascading runs.
## 7) Self-edit & versioning policy

- Store this file in `docs/self-architecture.md` and update on any infra/major design changes.
- Commit style: `docs: update self-architecture (reason)`; include brief rhyming note for context.
- Keep a `CHANGES.md` entry for major edits and the date + author.

### Suggested PR checklist for edits that change behavior

1. Update `docs/self-architecture.md` with the rationale and example usage.
2. Add/modify tests that demonstrate the intended behavior (unit + integration where appropriate).
3. Run the full test suite locally and ensure no regressions before committing.
4. Add a `CHANGES.md` entry and reference test names in the PR description.
## 8) Quick dev API / anchors

- `srgService.trace(query, options)` — get SRG pulse results
- `srgStorage.computeSimilarity(a,b)` — semantic similarity used by synthesis
- `backgroundCognitionService.runChainedCycle(history, now)` — run full 3-layer cycle
- `backgroundOrchestrator.cycle()` — orchestrator driver
- `rcbService.updateRcb(lastTurn)` — RCB update entrypoint

Other helpers:

- `srgService.getSrgView({ stageId, taskType, textContext })` — compact SRG payload used in pipeline stages.
- `srgModuleService.getActiveModulesForStage(workflow, stageId)` — stage-specific modules that influence SRG traversal.
- `fetchWithRetry(input, init, opts)` — network helper honoring Retry-After, exponential backoff and deterministic first retry.

## 9) How to edit safely

1. Update `docs/self-architecture.md` with clear rationale for change.
2. Add tests that assert the behavioral change (timing, orchestration, gating).
3. Commit on a descriptive branch: `docs/self-architecture`.
4. Run full test suite and get at least one approving review before merging.

### Tests to add when changing behavior

- Orchestrator timing tests: assert `lastRunByStage` increments and that per-stage intervals are respected.
- Chained cycle ordering tests: assert that Subconscious output is passed into Conscious, and Conscious into Synthesis.
- Luscher gating tests: assert that `useLuscherIntake` blocks sends and that `lastLuscher` is injected into stage prompts.
---

*Generated: 2025-12-18 — commit locally to branch `docs/self-architecture` recommended.*

---

## 10) Architecture diagram 📊

Visual overview of the system is embedded here for quick orientation. The diagram highlights the SRG, the chained background cognition pipeline (Subconscious → Conscious → Synthesis), RCB anchors, Lüscher intake, and network/retry semantics.

![Architecture Diagram](./architecture.svg)

> Tip: the SVG is intentionally compact and editable; PRs that refine layout or labels are welcome.
