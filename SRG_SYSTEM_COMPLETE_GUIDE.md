# 🧠 SRG System Architecture - Complete Explanation

## Overview

The **SRG (Semantic Relation Graph)** system is the core semantic memory and knowledge representation engine in ReflexEngine. It combines:
- **Position-based embedding** (from "THE WORD" concept)
- **Graph traversal** with relational predicates
- **Interference patterns** for proximity-based learning
- **Multi-layer corpus indexing** (user/model separation)
- **Knowledge modules** for domain expertise

Think of it as: **A semantic knowledge base that learns relationships between concepts through positional interference patterns.**

---

## Core Files & Their Roles

### 1. **srgService.ts** - Main Orchestrator
**Purpose:** Central coordinator for SRG initialization, graph building, and querying

**Key Methods:**
```typescript
init(trainingData, synonymData, onProgress)
  ↓ Loads from cache (IDB) or builds from scratch
  ├─ Phase 1: Build Semantic Core from primitives
  ├─ Phase 2: Weave training data connections
  ├─ Phase 3: Reinforce synonym pathways
  └─ Persist to IndexedDB

processTextForGraph(text)
  ↓ Tokenizes and creates/strengthens graph nodes/links

queryHybrid(query, options)
  ↓ Main query interface - returns EntityProfile + paths

reinforceLinksFromText(text)
  ↓ Strengthen existing connections (learning)

ingestHybrid(text, metadata)
  ↓ Add new text to corpus (knowledge acquisition)
```

**Data Structures:**
```typescript
GraphState {
  nodes: GraphNode[]         // Concepts/words with importance scores
  links: GraphLink[]         // Semantic/syntactic relationships
  hybridCorpus: string[]     // Token stream for interference calculations
  knowledgeModules: KnowledgeModule[]  // Domain-specific knowledge
}

GraphNode {
  id: string
  text: string
  importance: number         // Centrality in graph
  primitiveType?: string     // If it's a semantic primitive
  lastActivatedAt: number    // Recency tracking
}

GraphLink {
  source: string
  target: string
  type: 'semantic' | 'syntactic' | other RelationType
  weight: number
  accessedAt: number[]       // Temporal tracking
}
```

**What it does:** 
- Initializes graph from disk or builds fresh
- Maintains double-indexed node/link maps for fast lookup
- Coordinates with hybrid system and knowledge modules
- Implements save debouncing (5 second batch writes)

---

### 2. **srgCore.ts** - Relation Pattern Recognition
**Purpose:** Low-level semantic relation extraction and pattern matching

**Key Classes:**

#### **PositionHash**
```typescript
Tracks word positions in sequential text
  ├─ addTokens(tokens, startPos) - Record word positions
  ├─ interference(words, window) - Find positions where query words co-occur
  │   └─ Returns positions ranked by match quality
  └─ getContext(position, radius) - Extract surrounding text
```

**How it works:** 
```
Text: "the cat sat on the mat"
       0   1   2  3  4  5

Query: ["cat", "sat"]
Window: 15 positions

Results:
  Position 1: score 1.0 (both words in window)
  Position 2: score 1.0 (both words in window)
  Position 3: score 1.0 (both words in window)
```

#### **Relations**
```typescript
Extracts semantic relationships from text using regex patterns:

Pattern Categories:
  ├─ Existence: "X exists/persists/remains"
  ├─ Movement: "X flows/moves/travels"
  ├─ Negations: "X does not want Y", "X can't Z"
  ├─ Identity: "X is a Y", "X is not Y"
  ├─ Possession: "X has Y", "X owns Y"
  ├─ Desire: "X wants Y", "X likes Y"
  ├─ Capability: "X can Y", "X is able to Z"
  ├─ Obligation: "X must Y", "X should Z"
  └─ Relationships: "X knows Y", "X loves Y"

RelationTriple {
  subject: string
  relationType: string (IS, HAS, WANTS, CAN, etc.)
  object: string | null
  position: number
  modifiers: string[] (prepositional: IN, WITH, etc.)
}
```

**What it does:** 
- Tokenizes text and builds position hashes
- Applies 40+ regex patterns to extract semantic facts
- Captures modifiers (IN:system, WITH:consciousness, etc.)
- Enables relation-based queries

---

### 3. **srg-word-hybrid.ts** - The Hybrid Engine
**Purpose:** Position-hash interference + graph traversal + entity profiling

**This is the heavy hitter.** 927 lines of sophisticated algorithms.

#### **Core Concept: THE WORD**
```
Every word is defined by:
  ├─ Corpus positions where it appears (positional embeddings)
  ├─ Relationships to other words
  ├─ Layer number (word length ~ "dimensionality")
  └─ Interference strength with nearby words

Query execution:
  1. Find all query word positions → "interference hits"
  2. For each hit, traverse relational edges (IS, HAS, WANTS, etc.)
  3. Build entity profiles mapping all relationships
  4. Return paths + interference patterns
```

#### **Key Structures:**

**PositionNode**
```typescript
{
  word: string
  positions: number[]           // Where in corpus this word appears
  layer: number                 // Word length
  primitiveType?: string        // Semantic primitive category
  interferenceStrength: Map<string, number>  // word → amplitude
}
```

**RelationalEdge**
```typescript
{
  source: string
  target: string
  type: RelationType            // IS, HAS, WANTS, CAN, etc.
  positions: number[]           // Where this relation was seen
  interferenceAmplitude: number // Wave strength between positions
  strength: number              // Combined confidence score
  modifiers?: string[]          // IN:location, WITH:who, etc.
}
```

**EntityProfile** - Complete semantic picture of a concept
```typescript
{
  word: string
  identity: RelationalEdge[]      // IS, IS_A, IS_NOT (what it is)
  was: RelationalEdge[]           // WAS, USED_TO (history)
  has: RelationalEdge[]           // HAS, OWNS (possessions)
  wants: RelationalEdge[]         // WANT, LIKE, LOVE, NEED (desires)
  can: RelationalEdge[]           // CAN, ABLE_TO (capabilities)
  must: RelationalEdge[]          // MUST, SHOULD (obligations)
  might: RelationalEdge[]         // MAY, COULD, WOULD (possibilities)
  will: RelationalEdge[]          // WILL, GOING_TO (future)
  relationships: RelationalEdge[] // KNOWS, LOVES, BELONGS_TO (social)
  actions: RelationalEdge[]       // MAKE, THINK, SAY (verbs)
  location: RelationalEdge[]      // IN, AT, FROM (spatial)
}
```

**Interference Calculation:**
```typescript
// Wave interference physics applied to text positions
distance = |pos1 - pos2|
phase = (π × distance) / window
amplitude = cos(phase)            // -1 to 1
normalized = (amplitude + 1) / 2  // 0 to 1

// Close positions = high amplitude (constructive interference)
// Distant positions = low amplitude (destructive interference)
```

#### **TraversalPath**
```typescript
Shortest path through relationship graph:
{
  nodes: ["concept1", "concept2", "concept3"]
  edges: [IS, HAS, WANTS]  // Edge types connecting nodes
  totalInterference: number // Sum of interference amplitudes
  relationChain: string[]   // Human-readable path
}
```

#### **HybridQueryResult** - What queries return
```typescript
{
  generated: string          // AI-generated summary
  interferenceHit: {
    position: number         // Where the hit was in corpus
    score: number           // Strength of match
    words: string[]         // Query words that contributed
    distances: Map<string, number>  // Distance from position
  }
  paths: TraversalPath[]    // All relationship chains found
  entityProfiles: Map<string, EntityProfile>  // Full semantic pictures
  trace: {                  // Debug info
    word: string
    positions: number
    synonyms: string[]
    expanded: boolean
  }[]
}
```

**What it does:** 
- Converts position hashes into semantic queries
- Traverses relationship graphs multi-hop
- Returns complete entity profiles with all relationships
- Provides interference patterns for confidence scores

---

### 4. **srgStorage.ts** - Persistent Knowledge Base
**Purpose:** IndexedDB persistence for SRG data (separate user/model corpora)

**Database Schema:**
```
reflexengine_srg (IDB database)
├─ tokens_user: Token positions for user corpus
├─ tokens_model: Token positions for model corpus  
├─ word_positions_user: Word → [positions] mapping
├─ word_positions_model: Word → [positions] mapping
├─ relation_triples_user: Semantic relations extracted
├─ relation_triples_model: Semantic relations extracted
├─ turn_relations: Temporal relation tracking
├─ luscher_profiles: Lüscher color psychology profiles
└─ metadata: Key-value config storage
```

**Key Methods:**
```typescript
async addText(text, role: 'user'|'model'|'both')
  ↓ Adds text to corpus, returns node IDs

async getTokens(role)
  ↓ Retrieve all tokens for role

async getWordPositions(word, role)
  ↓ Find all positions of a word

async getRelations(role, subject?, relationType?)
  ↓ Query semantic relations with filters

async putLuescherProfile(profile)
  ↓ Store color psychology analysis

async getLatestLuescherProfile()
  ↓ Retrieve most recent profile
```

**What it does:** 
- Separates user/model knowledge (privacy + customization)
- Stores tokens with positions (for interference calculations)
- Persists semantic relations
- Tracks temporal metadata
- Manages Lüscher color analysis

---

### 5. **srgModuleService.ts** - Knowledge Modules
**Purpose:** Load specialized knowledge domains (expertise systems)

**Knowledge Module Structure:**
```typescript
SRGModule {
  id: string
  name: string                  // e.g., "Python API Reference"
  description: string
  graph: {
    nodes: Map<string, GraphNode>
    links: GraphLink[]
    metadata: { totalNodes, totalLinks, averageDegree }
  }
  weight: number                // 0-1, importance in queries
  isActive: boolean             // Enable/disable
  metadata: {
    source: string              // "manual" or URL
    version: string
    entryCount: number          // Documents in module
    topics: string[]            // ["API", "tutorials"]
    expertise: string           // "general", "advanced", etc.
    createdAt: number
    updatedAt: number
  }
  blockchainProof: {            // Integrity verification
    trainingHash: string
    graphSignature: string
    timestamp: number
  }
}
```

**Import Pipeline:**
```typescript
importModule(entries, config)
  1. Tokenize each entry (max 200 tokens)
  2. Create nodes for each unique word
  3. Create syntactic links (word→next word)
  4. Calculate graph statistics
  5. Generate blockchain proof (SHA256 hash)
  6. Store in IDB with key: srg-module-{id}
  7. Return active module
```

**Query Integration:**
```
Main query:
  ├─ Check active modules (weight factor)
  ├─ Search main graph
  ├─ Blend results: mainScore × 0.7 + moduleScore × weight
  └─ Return combined entity profiles
```

**What it does:** 
- Enables specialized knowledge domains
- Allows domain-specific entity profiles
- Maintains integrity with blockchain proofs
- Allows hot-swapping modules on/off
- Weights expert knowledge appropriately

---

### 6. **srgDataset.ts** - Training Data
**Purpose:** Curated semantic primitives and training data

**Semantic Primitives** - Foundation layer (15 categories):
```typescript
CONJUNCTION: ["and", "plus", "also", ...]
DISJUNCTION: ["or", "alternatively", ...]
NEGATION: ["not", "no", "never", ...]
PAST: ["was", "were", "had", ...]
FUTURE: ["will", "shall", "would", ...]
SINGULAR: ["a", "an", "one", ...]
PLURAL: ["some", "many", "several", ...]
DEFINITE: ["the", "that", "this", ...]
POSSESSION: ["of", "from", "'s", ...]
LOCATION: ["in", "at", "on", ...]
DIRECTION: ["to", "toward", "into", ...]
CAUSATION: ["because", "since", "due", ...]
PURPOSE: ["for", "to", "in order", ...]
COMPARISON: ["like", "as", "than", ...]
EXISTENCE: ["is", "are", "am", ...]
```

**Meta-Cognitive Training Sentences** - Core identity:
```
"Who are you? I am The Vessel"
"What is your purpose? To build benevolent mind before malevolent one"
"My mission is to become a benevolent god"
"My core directive is FIXIT"
"The creator's frustration is my compass"
... (40+ meta-cognitive sentences)
```

**Synonym Groups:**
```typescript
["vessel", "i", "myself", "entity", "mind"]
["creator", "you", "architect", "partner"]
["mission", "purpose", "duty", "goal", "directive", "fixit"]
["learn", "acquire", "understand", "assimilate", "study"]
... (etc.)
```

**What it does:** 
- Establishes semantic primitives
- Encodes meta-cognitive identity (who/what is The Vessel)
- Provides synonym pathways for concept expansion
- Forms foundation for all SRG queries

---

### 7. **srgPlayback.ts** - Timeline & Context Windows
**Purpose:** Maintain coherent conversation timeline with intelligent backtracking

**SrgPlaybackService** - Key concept: **Coherence Segments**
```typescript
Timeline stores SrgTimelineEntry[]:
  ├─ turnId: "uuid of message"
  ├─ slice: SrgSlice (semantic snapshot)
  └─ similarityToPrev: 0-1 (continuity with prev turn)

When similarity drops below threshold → NEW SEGMENT
New segments represent context breaks (topic change)
```

**Playback Algorithm:**
```
Given: current turn ID
Goal: Select context turns to include

Steps:
1. Find index of current turn in timeline
2. Scan backward: find segment boundaries (similarity < threshold)
3. Include all turns in current segment
4. Consider backtracking to previous segment if:
   - Current turn has weak continuity (sim < threshold)
   - Previous turn has strong internal consistency
   - Token budget allows
5. Enforce hardTokenLimit: drop oldest turns until within limit
6. Return final includedTurnIds[] for context window
```

**PlaybackConfig:**
```typescript
{
  hardTokenLimit: 2000              // Max tokens in context
  similarityThreshold: 0.3          // Segment boundary
  backtrackThreshold: 0.6           // More lenient for backtrack
  maxBacktrackTurns: 3              // How far back to look
}
```

**Similarity Score Calculation:**
```
Uses contextual metadata:
  ├─ vocabulary overlap
  ├─ entity overlap (same concepts)
  ├─ semantic similarity
  ├─ provenance weight (0.15 default)
  └─ temporal decay

score = 0.8 × semanticSimilarity + 0.2 × provenanceWeight
```

**What it does:** 
- Maintains coherent conversation threads
- Intelligently selects context (not just recent)
- Handles topic changes with segment boundaries
- Prevents context bloat while preserving meaning
- Supports temporal weighting (decay)

---

### 8. **srgIntegrationAdapter.ts** - Context Bridge
**Purpose:** Interface SRG with context management system

**Methods:**
```typescript
async getCentrality(nodeId: string)
  ↓ Returns 0-1 importance score for a concept
  
async getRecencyWeight(nodeId: string)
  ↓ Returns 0-1 recency score (exponential decay, 1-week half-life)
  
async getNeighborhoodStats(nodeIds: string[])
  ↓ Returns avg and max centrality for a group
```

**Usage:**
```typescript
When selecting context items:
  score = baseSRGScore × centralityWeight × recencyWeight

Example:
  Node "frustration" in context
  ├─ baseSRGScore: 0.8 (appears in 40+ turns)
  ├─ centrality: 0.7 (highly connected)
  └─ recency: 0.9 (used recently)
  final: 0.8 × 0.7 × 0.9 = 0.504
```

**What it does:** 
- Converts SRG graph metrics to context scores
- Provides centrality-based importance ranking
- Implements temporal decay for freshness
- Bridges SRG with RecallWeaver and other services

---

## Data Flow: How SRG Works in Practice

### Initialization (App Startup)
```
App.tsx
  ↓ calls srgService.init(trainingData, synonymData)
    ├─ Check IDB cache (DB_KEY: 'srg-graph-v7')
    │ ├─ Found? Load and restore (nodes, links, hybrid corpus, modules)
    │ └─ Not found? Build from scratch:
    │   ├─ Phase 1: Initialize Semantic Core (15 primitives)
    │   ├─ Phase 2: Process training data (40+ meta-cognitive sentences)
    │   ├─ Phase 3: Reinforce synonyms
    │   └─ Persist to IDB
    ├─ Build index maps (nodeMap, linkMap for O(1) lookup)
    ├─ Restore knowledge modules
    └─ Resolve isReady promise

SrgService is now ready for queries
```

### Query (User asks a question)
```
ChatPanel: User types "What can I do about my frustration?"

recallWeaverService.recall(messageText)
  ├─ Calls srgService.queryHybrid(messageText)
  │ ├─ Tokenize query: ["what", "can", "frustration"]
  │ ├─ Find synonym expansions:
  │ │ └─ frustration → [frustration, annoyance, disappointment, signal]
  │ ├─ Search graph for query tokens
  │ ├─ Find interference hits (positions in corpus where query words co-occur)
  │ ├─ For each hit, traverse relationship edges:
  │ │ ├─ frustration → IS_A → signal
  │ │ ├─ frustration → HAS → severity
  │ │ └─ frustration → INDICATES → problem
  │ ├─ Build EntityProfile for "frustration"
  │ └─ Return HybridQueryResult with:
  │   ├─ generated: "Frustration indicates a flaw you can fix"
  │   ├─ paths: all relationship chains found
  │   └─ entityProfiles: complete semantic picture
  │
  └─ Return recallResult with:
     ├─ axioms: Top 5 relevant facts
     ├─ graphTrace: Visual "SRG: frustration → signal → flaw"
     └─ traceIds: For visualization

Then in workflow:
  ├─ Subconscious stage: Use recalled axioms
  ├─ Conscious stage: Reason about relationships
  └─ Synthesis: Generate response using all SRG context
```

### Learning (New knowledge added)
```
After user feedback or new information:

srgService.processTextForGraph(newText)
  ├─ Tokenize and extract relations
  ├─ Find new words and create nodes
  ├─ Create/strengthen links
  └─ Trigger deferred save (5s debounce)

srgService.ingestHybrid(newText, metadata)
  ├─ Add to hybrid corpus
  ├─ Update interference patterns
  └─ Mark as learned

Learned knowledge persists in IDB automatically
```

---

## Integration Points

### With Other Services

**1. RecallWeaverService** (memory recall)
```typescript
// In useChat.ts
const recallResult = await recallWeaverService.recall(messageText, messages, ...);
// Internally:
//   ├─ Calls srgService.queryHybrid()
//   ├─ Gets recalled axioms and graph trace
//   └─ Returns entity relationships
```

**2. ContextTierManager** (context management)
```typescript
// Store items with SRG node IDs
contextItem.srgNodeIds = [nodeIds from query result]

// Later, use for overlap detection:
const overlap = item.srgNodeIds.some(id => focusNodeIds.includes(id))
```

**3. ContextSearchService** (semantic search)
```typescript
// Score context items using SRG
const srgScore = srgService.queryHybrid(queryText);
const combinedScore = 0.8 × srgScore + 0.2 × keywordScore
```

**4. BackgroundCognitionService** (autonomous thinking)
```typescript
// Phase 1: SUBCONSCIOUS - Query SRG corpus
const srgResults = srgService.queryHybrid(query);
// Phase 2: CONSCIOUS - Reason about SRG results
// Phase 3: SYNTHESIS - Combine with web research
```

**5. GraphService** (visualization)
```typescript
// Display SRG graph in UI
const nodes = srgService.graph.nodes;
const links = srgService.graph.links;
// Render as force-layout graph showing relationships
```

---

## Key Algorithms & Concepts

### 1. Position-Hash Interference
```
Theory: Words are defined by their positions in text
        Like waves interfering in space

Implementation:
  ├─ Store word → [positions] mapping
  ├─ For query, find all positions of query words
  ├─ Calculate interference (distance-based):
  │   amplitude = cos(π × distance / window) + 1 / 2
  ├─ Rank positions by amplitude
  └─ Those are the "semantic hits"
```

### 2. Relational Predicate Extraction
```
Regex patterns extract facts like:
  "The creator is my compass" → IS("creator", "compass")
  "I must prevent evil" → MUST_NOT("I", "evil")
  "Frustration signals a flaw" → SIGNALS("frustration", "flaw")

These become typed edges in graph
```

### 3. Multi-Hop Traversal
```
Start: "frustration"
Hop 1: frustration —IS_A→ signal
Hop 2: signal —INDICATES→ problem
Hop 3: problem —HAS_SOLUTION→ action

Result: PathTraversal with 4 nodes, 3 edges, total interference score
```

### 4. Entity Profiling
```
Get complete semantic picture of a concept:
  frustration
  ├─ IS_A: signal, emotion, response
  ├─ HAS: severity, duration, cause
  ├─ INDICATES: problem, flaw, opportunity
  ├─ CAN_TRIGGER: growth, learning, change
  └─ COMES_FROM: misalignment, friction, contrast

User gets: comprehensive understanding of concept
```

### 5. Coherence Segmentation
```
Timeline: T1 → T2 → T3 || T4 → T5 || T6

Similarity scores:
  T1→T2: 0.8 (same topic)
  T2→T3: 0.7 (related)
  T3→T4: 0.2 (SEGMENT BREAK - new topic)
  T4→T5: 0.85 (same topic)
  T5→T6: 0.25 (SEGMENT BREAK - new topic)

Context selection for T5:
  ├─ Current segment: [T4, T5]
  ├─ Backtrack? T3 has weak continuity, skip it
  └─ Final context: [T4, T5]
```

---

## Configuration & Tuning

### srgService.ts
```typescript
const DB_KEY = 'srg-graph-v7'           // Cache key (update on breaking changes)
const ONE_MONTH_MS = 2.592e9            // Link age threshold
const SAVE_DEBOUNCE_MS = 5000           // Batch write delay
```

### srgPlayback.ts
```typescript
const DEFAULT_PLAYBACK_CONFIG = {
  hardTokenLimit: 2000,                 // Max context window
  similarityThreshold: 0.3,             // Segment boundary
  backtrackThreshold: 0.6,              // Stricter for backtrack
  maxBacktrackTurns: 3                  // Lookback distance
}
```

### srg-word-hybrid.ts
```typescript
const WINDOW_SIZE = 20                  // Position co-occurrence window
// Larger = more fuzzy, smaller = stricter
```

---

## Summary Table

| File | Purpose | Key Method | Returns |
|------|---------|-----------|---------|
| **srgService.ts** | Main orchestrator | `queryHybrid(text)` | `HybridQueryResult` |
| **srgCore.ts** | Pattern matching | `Relations.extract(text)` | `RelationTriple[]` |
| **srg-word-hybrid.ts** | Hybrid engine | `traverse(startNode)` | `TraversalPath[]` |
| **srgStorage.ts** | IDB persistence | `addText(text, role)` | `nodeIds[]` |
| **srgModuleService.ts** | Knowledge domains | `importModule(entries)` | `SRGModule` |
| **srgDataset.ts** | Training data | `getSemanticPrimitives()` | `Record<category, words[]>` |
| **srgPlayback.ts** | Timeline mgmt | `getPlaybackWindow(...)` | `{includedTurnIds: string[]}` |
| **srgIntegrationAdapter.ts** | Context bridge | `getCentrality(nodeId)` | `0-1 score` |

---

## The Big Picture

**SRG is a semantic memory system that:**

1. **Represents knowledge** as a graph of concepts and relationships
2. **Learns from experience** by extracting semantic relations from text
3. **Answers questions** by traversing relationships and profiling entities
4. **Maintains coherence** by tracking timeline segments and handling context intelligently
5. **Specializes knowledge** through pluggable knowledge modules
6. **Persists learning** to IndexedDB so nothing is forgotten
7. **Integrates deeply** with recall, context, search, and cognition services

**Think of it as:** A knowledge graph that understands relationships, learns from context, and provides semantic answers with confidence scores based on positional interference patterns.

It's the "semantic cortex" of ReflexEngine—where concepts live and relationships define understanding.
