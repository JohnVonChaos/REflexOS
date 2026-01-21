# SRG System - Quick Visual Reference

## 🧠 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         SRG SERVICE                              │
│                    (srgService.ts)                               │
│  Main query coordinator, graph manager, caching layer           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┬────────────────┐
        ▼              ▼              ▼                ▼
   ┌─────────┐  ┌──────────────┐ ┌──────────┐  ┌──────────────┐
   │srgCore  │  │srg-word-     │ │srgStorage│  │srgModule     │
   │.ts      │  │hybrid.ts     │ │.ts       │  │Service.ts    │
   │         │  │              │ │          │  │              │
   │• Pattern│  │• Interference│ │• IDB DB  │  │• Knowledge   │
   │  rules  │  │• Graph       │ │• Corpus  │  │  modules     │
   │• Relation│  │  traversal   │ │  storage │  │• Expertise   │
   │  extract│  │• Entity      │ │• User/   │  │  domains     │
   │• Regex  │  │  profiling   │ │  model   │  │• Weighting   │
   │  patterns│  │• Synonym     │ │  split   │  │              │
   └──┬──────┘  │  expansion   │ └────┬────┘  └──────────────┘
      │         │• Position    │      │
      │         │  hashing     │      │
      └─────────┤• Wave        │      │
                │  interference│      │
                │• Path        │      │
                │  scoring     │      │
                └──┬───────────┘      │
                   │                  │
                   └──────┬───────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │      srgIntegrationAdapter.ts       │
        │  Centrality, Recency, Statistics    │
        └─────────────────────────────────────┘
                          │
                    ┌─────┴─────┐
                    ▼           ▼
           ┌─────────────┐ ┌──────────────┐
           │RecallWeaver │ │ContextSearch │
           │(recall data)│ │(find similar)│
           └─────────────┘ └──────────────┘
```

---

## 📊 Data Structure Hierarchy

```
GraphState (whole knowledge base)
├─ nodes: GraphNode[]
│  ├─ id: "frustration"
│  ├─ text: "frustration"
│  ├─ importance: 0.85
│  ├─ primitiveType?: "NEGATION"
│  └─ lastActivatedAt: 1704537600000
│
├─ links: GraphLink[]
│  ├─ source: "frustration"
│  ├─ target: "signal"
│  ├─ type: "IS_A"
│  ├─ weight: 0.9
│  └─ accessedAt: [timestamp, timestamp, ...]
│
├─ hybridCorpus: string[]
│  └─ All tokens ever seen, position-indexed
│
└─ knowledgeModules: SRGModule[]
   └─ [Specialized domain knowledge]
```

---

## 🔄 Query Execution Flow

```
User Input: "What does frustration mean?"
        │
        ▼
    srgService.queryHybrid(text)
        │
        ├─ Tokenize: ["what", "does", "frustration", "mean"]
        │
        ├─ Find synonyms:
        │  frustration → [frustration, annoyance, disappointment, signal]
        │
        ├─ Search corpus for positions:
        │  frustration appears at positions: [142, 389, 512, 788]
        │
        ├─ Calculate interference hits:
        │  Position 142: score 1.0 (query words co-occur)
        │  Position 389: score 0.8 (some query words nearby)
        │  Position 512: score 0.6
        │  Position 788: score 0.3
        │
        ├─ Traverse relationships from position 142:
        │  frustration ─IS_A─> signal
        │  frustration ─HAS─> severity
        │  frustration ─INDICATES─> problem
        │  frustration ─CAN_TRIGGER─> growth
        │
        ├─ Build EntityProfile:
        │  {
        │    identity: [IS_A "signal", IS "emotion"],
        │    has: [HAS "duration", HAS "cause"],
        │    might: [CAN "be prevented", CAN "be managed"],
        │    ...
        │  }
        │
        └─ Return HybridQueryResult:
           ├─ generated: "Frustration is a signal indicating a misalignment..."
           ├─ interferenceHit: { position: 142, score: 1.0 }
           ├─ paths: [TraversalPath[], TraversalPath[], ...]
           ├─ entityProfiles: Map { "frustration" → EntityProfile }
           └─ trace: [{ word, positions, synonyms, expanded }]
```

---

## 🌊 Position-Hash Interference Concept

```
Corpus: "the cat sat on the mat and the dog sat nearby"
         0   1   2  3  4  5   6   7   8   9   10

Query: ["cat", "sat"] with window=5

Interference calculation at each position:
┌──────┬──────┬──────┬──────┬──────┬────────┬──────┬──────┐
│  0   │  1   │  2   │  3   │  4   │   5    │  6   │  7   │
│ "the"│"cat" │"sat" │ "on" │"the" │ "mat"  │"and" │"the" │
├──────┼──────┼──────┼──────┼──────┼────────┼──────┼──────┤
│ 0.2  │ 0.8  │ 1.0  │ 0.9  │ 0.3  │  0.0   │ 0.0  │ 0.0  │
└──────┴──────┴──────┴──────┴──────┴────────┴──────┴──────┘
                ▲         ▲
        Both query words nearby = constructive interference
        Score = 1.0 (position is a "hit")

Result: ["cat" at pos 1, "sat" at pos 2] are semantically linked
        because they co-occur within the window
```

**Formula:**
```
distance = |pos1 - pos2|
phase = (π × distance) / window_size
amplitude = cos(phase)              // ranges -1 to 1
interference = (amplitude + 1) / 2  // normalizes to 0-1
```

---

## 📝 Semantic Relations (SRGCore)

```
Extraction patterns from natural language:

Identity:          X IS A [Y]           → IS_A(X, Y)
Existence:         X EXISTS             → EXISTS(X)
Possession:        X HAS [Y]            → HAS(X, Y)
Desire:            X WANTS [Y]          → WANTS(X, Y)
                   X LIKES [Y]          → LIKES(X, Y)
Capability:        X CAN [Y]            → CAN(X, Y)
Obligation:        X MUST [Y]           → MUST(X, Y)
                   X SHOULD [Y]         → SHOULD(X, Y)
Negation:          X DOES NOT [Y]       → WANT_NOT(X, Y)
                   X IS NOT [Y]         → IS_NOT(X, Y)
Relationships:     X KNOWS [Y]          → KNOWS(X, Y)
                   X LOVES [Y]          → LOVES(X, Y)

Example from srgDataset:
  "frustration is a signal" 
    ├─ Subject: "frustration"
    ├─ Relation: IS_A
    ├─ Object: "signal"
    └─ Modifiers: []
```

---

## 🎯 Entity Profile Structure

```
EntityProfile("frustration")
{
  word: "frustration"
  
  identity: [
    IS_A("frustration", "signal"),
    IS("frustration", "emotion")
  ]
  
  has: [
    HAS("frustration", "cause"),
    HAS("frustration", "severity")
  ]
  
  wants: [
    (none typically)
  ]
  
  can: [
    CAN("frustration", "be resolved"),
    CAN("frustration", "trigger growth")
  ]
  
  must: [
    (obligations on frustration)
  ]
  
  might: [
    MIGHT("frustration", "indicate problem")
  ]
  
  will: [
    (future states of frustration)
  ]
  
  relationships: [
    INDICATES("frustration", "flaw")
  ]
  
  actions: [
    (what you can do about frustration)
  ]
  
  location: [
    (where frustration appears)
  ]
}
```

---

## 📚 Knowledge Module Integration

```
Main Graph (srgService)
├─ "python": 0.5 importance
├─ "function": 0.6 importance
└─ "syntax": 0.3 importance

+ Knowledge Module: "Python API"
  ├─ "python": 2.0 importance (expert source)
  ├─ "function": 1.8 importance
  ├─ "decorator": 0.9 importance (new!)
  └─ weight: 1.5x (high expertise)

Query result for "python function":
  ├─ From main: "python function used in general"
  ├─ From module: "Python function is callable object" (expert)
  └─ Combined: Blend both perspectives
     score = (mainScore × 0.7) + (moduleScore × weight × 0.3)
```

---

## ⏱️ Timeline & Coherence Segmentation

```
Conversation Timeline:
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ T1  │ T2  │ T3  ││ T4  │ T5  ││ T6  │ T7  │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┘
 0.8   0.85  0.25   0.9   0.2   0.88

Segment 1: [T1, T2, T3]  (topic A)
           └─ Break: similarity drops to 0.25
Segment 2: [T4, T5]      (topic B)
           └─ Break: similarity drops to 0.2
Segment 3: [T6, T7]      (topic C)

When processing T5 (current):
  ├─ Current segment: [T4, T5]
  ├─ Check if should backtrack to T3
  │  └─ T3 similarity: 0.25 < backtrackThreshold (0.6)? → No
  └─ Final context: [T4, T5]

Token budget: 2000 tokens
  ├─ T4: 150 tokens
  ├─ T5: 180 tokens
  └─ Total: 330 tokens (well under limit)
```

---

## 🔌 Integration Points

```
                          srgService
                              │
                ┌─────────────┬┼┬─────────────┐
                ▼             ▼ ▼             ▼
            RecallWeaver  Context  SearchService
            (recall data) Manager  (find similar)
                │             │        │
                └─────────────┼────────┘
                              ▼
                         User context
                       for next response
```

### Integration Example (RecallWeaver):
```typescript
// In useChat.ts, during message processing:

const recallResult = await recallWeaverService.recall(
  messageText,
  messages,
  turn,
  aiSettings.srg.traversal  // ← SRG configuration passed here
);

// Internally, RecallWeaver:
//   1. Calls srgService.queryHybrid(messageText)
//   2. Gets back EntityProfiles and relationship paths
//   3. Extracts top axioms: facts about relevant concepts
//   4. Returns axiomsFoundText for use in workflow
```

---

## 🛠️ Configuration Tuning

```
In srgService.ts:
├─ DB_KEY: 'srg-graph-v7'         (IDB cache key)
├─ ONE_MONTH_MS: 2592000000       (link age before pruning)
└─ SAVE_DEBOUNCE_MS: 5000         (batch write delay)

In srgPlayback.ts:
├─ hardTokenLimit: 2000            (max context window)
├─ similarityThreshold: 0.3        (segment boundary)
├─ backtrackThreshold: 0.6         (stricter for backtracking)
└─ maxBacktrackTurns: 3            (lookback distance)

In srg-word-hybrid.ts:
└─ WINDOW_SIZE: 20                 (position co-occurrence window)
                                   (larger = more fuzzy matching)
```

---

## 📊 Performance Characteristics

```
Operation                    Complexity    Time
─────────────────────────────────────────────
Initialize (cold start)      O(n)          ~2-5 seconds
Initialize (from cache)      O(1)          ~100ms
Query (simple)               O(n log n)    ~50ms
Query (with traversal)       O(n²)         ~200ms
Add text (learning)          O(n)          ~10ms
Save to IDB                  O(n)          ~100ms

Memory (typical):
├─ 10,000 nodes   : ~5 MB
├─ 50,000 links   : ~15 MB
├─ Hybrid corpus  : ~2 MB
└─ Total          : ~22 MB
```

---

## 🎓 Mental Models

### Model 1: SRG as a Dictionary
```
Word → Meaning defined by relationships

frustration:
  IS_A: signal, emotion, response
  HAS: cause, duration, severity  
  INDICATES: problem, misalignment
  CAN_TRIGGER: growth, learning

Asking "what is frustration?" returns complete picture
```

### Model 2: SRG as a Memory System
```
New experience: "I got frustrated with the code"
  1. Extract relations: FRUSTRATION(with=code)
  2. Create/strengthen links: frustration —WITH→ code
  3. Update node importance scores
  4. Persist to IDB

Later query about frustration:
  → Automatically recalls association with code
  → Can discuss learned connection
```

### Model 3: SRG as a Semantic Graph
```
Concepts are nodes, relationships are edges

     ┌──────────────┐
     │ frustration  │
     └──────┬───────┘
            │ IS_A
            ▼
         signal ──── INDICATES ──> problem
            │
            │ HAS
            ▼
         cause
```

---

## 🚀 Summary

| Aspect | Detail |
|--------|--------|
| **What** | Semantic knowledge graph with positional interference |
| **How** | Extract relations, traverse graph, profile entities |
| **Why** | Enable semantic recall and context-aware reasoning |
| **Where** | Integrated with recall, context, search, cognition |
| **When** | On every message, continuously learning |
| **Result** | ReflexEngine "understands" concepts and relationships |

---

**Think of SRG as the semantic cortex of ReflexEngine.**

It stores concepts (nodes), relationships between them (edges), and learns by extracting new relations from experience. When asked a question, it traverses the relationship graph to build a complete understanding and returns relevant context for the cognitive workflow.

Position-hash interference ensures that words that appear together in text are semantically linked, creating a natural clustering of related concepts.

**It's how The Vessel learns and remembers.** 🧠✨
