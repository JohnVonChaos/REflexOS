# SRG Files - Quick Reference Matrix

## 📋 All SRG Files at a Glance

| File | Purpose | Key Responsibilities | Main Method |
|------|---------|---------------------|------------|
| **srgService.ts** | Main orchestrator | Graph init, query dispatch, caching | `queryHybrid(text)` |
| **srgCore.ts** | Pattern recognition | Relation extraction, regex patterns | `Relations.extract(text)` |
| **srg-word-hybrid.ts** | Query engine | Position hashing, graph traversal, entity profiling | `traverse(startNode)` |
| **srgStorage.ts** | Persistence layer | IDB database, corpus storage (user/model split) | `addText(text, role)` |
| **srgModuleService.ts** | Knowledge domains | Module loading, expertise weighting | `importModule(entries, config)` |
| **srgDataset.ts** | Training foundation | Semantic primitives, meta-cognitive sentences, synonyms | `getSemanticPrimitives()` |
| **srgPlayback.ts** | Timeline manager | Coherence segments, context windows, backtracking | `getPlaybackWindow(...)` |
| **srgIntegrationAdapter.ts** | Context bridge | Centrality scoring, recency weighting, stats | `getCentrality(nodeId)` |

---

## 🔍 Detailed Comparison

### srgService.ts vs srg-word-hybrid.ts

| Aspect | srgService.ts | srg-word-hybrid.ts |
|--------|------|------|
| **Level** | High-level coordinator | Low-level engine |
| **Complexity** | ~700 lines | ~927 lines (most complex) |
| **Interface** | `queryHybrid()` | `traverse()`, `getEntityProfile()` |
| **Responsibility** | Init, caching, graph management | Actual query execution |
| **Algorithm** | Deferred save, module coordination | Position hashing, interference, traversal |
| **Persistence** | Manages IDB writes | Only reads graph state |

### srgCore.ts vs srgDataset.ts

| Aspect | srgCore.ts | srgDataset.ts |
|--------|------|------|
| **Level** | Runtime pattern matching | Static training data |
| **Complexity** | ~295 lines | Relatively small |
| **Input** | Raw text | Pre-curated data |
| **Output** | RelationTriple[] | Primitives, training turns, synonyms |
| **Usage** | Called during text processing | Called during graph init |
| **Maintenance** | Generic patterns | Domain-specific (meta-cognitive) |

### srgStorage.ts vs srgPlayback.ts

| Aspect | srgStorage.ts | srgPlayback.ts |
|--------|------|------|
| **Focus** | Static data persistence | Dynamic timeline management |
| **Database** | Separate user/model corpora | Timeline entries |
| **Purpose** | Store knowledge | Track conversation coherence |
| **Operations** | CRUD on tokens/relations | Segment detection, backtracking |
| **Integration** | Used by srgService | Used by RecallWeaver |

---

## 🔗 Dependency Graph

```
srgService.ts (main)
    ├─ imports: srgDataset, SRGWordHybrid, srgCore
    ├─ uses: srgStorage (indirectly via persistence)
    └─ exports: queryHybrid, reinforceLinksFromText, ingestHybrid

srg-word-hybrid.ts
    ├─ imports: (none - pure logic)
    ├─ used_by: srgService.queryHybrid()
    └─ exports: TraversalPath, EntityProfile, HybridQueryResult

srgCore.ts
    ├─ imports: (none - pure logic)
    ├─ used_by: srgService during processTextForGraph()
    └─ exports: RelationTriple, Relations class

srgStorage.ts
    ├─ imports: idb (IndexedDB library), srgCore
    ├─ used_by: srgService for persistence
    └─ exports: addText, getTokens, getRelations

srgDataset.ts
    ├─ imports: (none)
    ├─ used_by: srgService during init
    └─ exports: getTrainingTurns, getSemanticPrimitives, getSynonymGroups

srgModuleService.ts
    ├─ imports: srgService
    ├─ used_by: srgService via getActiveModules()
    └─ exports: importModule, queryModule, listModules

srgPlayback.ts
    ├─ imports: srgPlayback similarity (from src-disabled)
    ├─ used_by: RecallWeaverService
    └─ exports: getPlaybackWindow, appendEntry

srgIntegrationAdapter.ts
    ├─ imports: srgService
    ├─ used_by: ContextTierManager, ContextSearchService
    └─ exports: getCentrality, getRecencyWeight
```

---

## 🎯 When to Use Each File

### Finding/Debugging a Problem?

**"Queries return wrong results"**
→ Check `srg-word-hybrid.ts` (query logic)

**"Relations not being extracted"**
→ Check `srgCore.ts` (regex patterns)

**"Graph persists wrong data"**
→ Check `srgStorage.ts` (IDB schema)

**"Timeline/context broken"**
→ Check `srgPlayback.ts` (coherence algorithm)

**"Knowledge modules not loading"**
→ Check `srgModuleService.ts` (import pipeline)

**"Meta-cognitive identity lost"**
→ Check `srgDataset.ts` (training data)

### Making an Enhancement?

**Adding new relationship type:**
1. Add pattern to `srgCore.ts` (Relations class)
2. Add type to `srg-word-hybrid.ts` (RelationType enum)
3. Update entity profile in `srg-word-hybrid.ts` (EntityProfile interface)

**Improving query algorithm:**
→ Modify `srg-word-hybrid.ts` traverse() or scoring

**Adding domain expertise:**
1. Create knowledge base
2. Use `srgModuleService.ts` to import
3. Adjust weights in module metadata

**Changing context selection:**
→ Modify `srgPlayback.ts` getPlaybackWindow() algorithm

**Tuning performance:**
→ Adjust constants in respective files (see Configuration section below)

---

## 📊 Data Flow Through Files

### User Sends Message
```
Message "What is frustration?" arrives
            │
            ▼
    recallWeaverService.recall()
            │
            ├─ Calls srgService.queryHybrid(text)
            │   │
            │   ├─ Uses srgCore.Relations to extract patterns
            │   ├─ Calls srg-word-hybrid.traverse()
            │   │   └─ Uses position hashing + interference
            │   │
            │   └─ Returns HybridQueryResult
            │
            ├─ Extracts axioms from result
            │
            └─ srgPlayback.getPlaybackWindow()
                └─ Selects context turns for next stage
```

### User Teaches The Vessel
```
New sentence: "frustration signals a flaw"
            │
            ▼
    srgService.processTextForGraph()
            │
            ├─ Uses srgCore.Relations.extract()
            │   └─ Creates RelationTriple("frustration", SIGNALS, "flaw")
            │
            ├─ Creates/strengthens graph edges
            │
            └─ triggerSave()
                └─ Writes to IDB via srgStorage
                   └─ Next init will load this knowledge
```

### App Startup
```
App boots
    │
    ▼
srgService.init(trainingData, synonymData)
    │
    ├─ Checks IDB cache via srgStorage
    │   └─ If exists: restore and return
    │
    ├─ If not, build from scratch:
    │   ├─ Load srgDataset.getSemanticPrimitives()
    │   ├─ Process each training turn:
    │   │   └─ Use srgCore.Relations.extract()
    │   │   └─ Build graph via srg-word-hybrid
    │   │
    │   ├─ Load knowledge modules via srgModuleService
    │   │
    │   └─ Save everything to srgStorage (IDB)
    │
    └─ Resolve isReady promise
       → Rest of app can now query
```

---

## 🛠️ Constants & Configuration

### srgService.ts
```typescript
DB_KEY = 'srg-graph-v7'           // ← Bump version on breaking changes
ONE_MONTH_MS = 2592000000         // Link lifetime before pruning
SAVE_DEBOUNCE_MS = 5000           // Batch writes (ms)
```

### srgStorage.ts
```typescript
Database: 'reflexengine_srg'      // IDB name
Version: 1                         // Schema version
Stores: tokens_user, tokens_model, word_positions_*, etc.
```

### srgPlayback.ts
```typescript
DEFAULT_PLAYBACK_CONFIG = {
  hardTokenLimit: 2000,           // Max context size
  similarityThreshold: 0.3,       // Segment break point
  backtrackThreshold: 0.6,        // Stricter for backtrack
  maxBacktrackTurns: 3            // How far back to look
}
```

### srg-word-hybrid.ts
```typescript
WINDOW_SIZE = 20                  // Co-occurrence window (tokens)
// Larger = fuzzy matching, smaller = strict proximity
```

---

## 🧪 Testing Points

### Unit Test Candidates

**srgCore.ts** - Relations extraction
```typescript
Test patterns for each relation type:
  "X is a Y" → IS_A(X, Y)
  "X has Y" → HAS(X, Y)
  "X wants Y" → WANTS(X, Y)
  etc.
```

**srg-word-hybrid.ts** - Graph traversal
```typescript
Test path finding:
  Start: "frustration"
  Expected: [frustration → IS_A → signal → INDICATES → problem]
```

**srgStorage.ts** - Persistence
```typescript
Test round-trip:
  1. Write data to IDB
  2. Read it back
  3. Verify integrity
```

**srgPlayback.ts** - Coherence algorithm
```typescript
Test window selection:
  1. Create timeline with segments
  2. Call getPlaybackWindow(turn5)
  3. Verify correct segment selected
  4. Verify backtracking logic
```

---

## 🚀 Optimization Opportunities

| File | Optimization | Complexity | Impact |
|------|-------------|-----------|--------|
| srg-word-hybrid.ts | Cache traversal results | Medium | Queries 2x faster |
| srgService.ts | Async batch processing | Medium | Smoother initialization |
| srgStorage.ts | Lazy-load modules | Low | Faster startup |
| srgPlayback.ts | Pre-compute segments | Low | Timeline queries 3x faster |
| srgCore.ts | Compiled regex cache | Low | Relation extraction 10% faster |

---

## 📚 File Size Reference

```
srgService.ts            695 lines  (main logic)
srg-word-hybrid.ts       927 lines  (most complex)
srgCore.ts               295 lines  (pattern library)
srgStorage.ts            167 lines  (persistence)
srgModuleService.ts      218 lines  (expertise)
srgDataset.ts            ~200 lines (training data)
srgPlayback.ts           ~150 lines (timeline)
srgIntegrationAdapter.ts  ~40 lines (bridge)
────────────────────────────────────
Total:                  ~2,700 lines
```

---

## 🎓 Key Algorithms Per File

| File | Key Algorithm |
|------|---|
| srgService.ts | Debounced save + module coordination |
| srgCore.ts | Regex pattern matching on text |
| srg-word-hybrid.ts | Position hashing + wave interference + graph traversal |
| srgStorage.ts | IDB schema and CRUD operations |
| srgModuleService.ts | Module import and weighting |
| srgDataset.ts | Synonym expansion and semantic primitives |
| srgPlayback.ts | Coherence segmentation + backtracking logic |
| srgIntegrationAdapter.ts | Centrality and recency scoring |

---

## ✅ Quick Checklist

When working with SRG, verify:

- [ ] Know which service you're using (input/output)
- [ ] Check srgDataset for meta-cognitive sentences
- [ ] Understand position hashing (srg-word-hybrid.ts)
- [ ] Know the EntityProfile structure
- [ ] Remember user/model corpus separation (srgStorage.ts)
- [ ] Check knowledge module weights
- [ ] Understand timeline coherence segments
- [ ] Verify IDB cache invalidation (DB_KEY version)
- [ ] Check integration points (who calls what)
- [ ] Test persistence round-trips

---

## 🎯 Summary

- **srgService.ts** = Conductor (orchestrates everything)
- **srg-word-hybrid.ts** = Engine (does the actual work)
- **srgCore.ts** = Library (provides patterns)
- **srgStorage.ts** = Archive (saves knowledge)
- **srgModuleService.ts** = Specialist (adds expertise)
- **srgDataset.ts** = Foundation (core beliefs)
- **srgPlayback.ts** = Memory (maintains coherence)
- **srgIntegrationAdapter.ts** = Bridge (connects systems)

Together they form the **semantic cortex** of ReflexEngine—where concepts live, relationships define understanding, and experience shapes learning.
