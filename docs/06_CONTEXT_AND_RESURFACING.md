# Implemented: Tiered Context & Fibonacci Resurfacing (Partial)

This document briefly describes the code-level changes made to add support for tiered context management and a Fibonacci-based resurfacing scheduler.

Key changes:

- **Types**: `MemoryAtom` (in `types.ts`) now includes fields for `tier`, `contextPriority`, eviction metadata, `intrinsicValue`, and a `resurfacing` object (see enum `ResurfacingCategory`). ✅
- **ContextManager**: `services/contextService.ts` now exposes `assignTier` and `computeRestorationPriority` utilities used to decide inclusion and ordering when building context. ✅
- **Resurfacing Engine**: New `services/resurfacingService.ts` implements scheduling (`scheduleResurfacing`), advancement (`advanceResurfacingSchedule`), and `buildContextWithResurfacing` which composes a normal context plus an intrusive resurfacing set according to token budgets. ✅
- **Background Synthesis**: `services/backgroundCognitionService.ts` now includes a `runSynthesisCycle` that uses resurfacing to find semantic bridges and return candidate connections for later processing by the synthesis/axiom pipeline. ✅

Tests:
- Added unit tests for the new functions in `tests/` (uses `vitest`). Run them with:

```powershell
npm install
npm test
```

Notes and next steps:
- The synthesis cycle currently returns candidate connection strings; persistence (creating steward notes or axioms) will be implemented in a follow-up change once the memory persistence API is finalized (`memoryService.ts` is currently blank). 🔧
- The Luscher integration is intentionally skipped as requested — that lives in a separate Google App Builder flow. ✅

If you'd like, I can:
- Add persistence helpers into `memoryService.ts` and wire up synthesis output to create `steward_note` atoms.
- Implement a lightweight semantic similarity module (using embeddings or a fast bag-of-words fallback) to improve synthesis quality.
