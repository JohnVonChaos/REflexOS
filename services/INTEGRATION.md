# INTEGRATION GUIDE
**How to integrate SRG-WORD Hybrid with your existing systems**

## Table of Contents
1. [Integrating with SRG TypeScript Service](#integrating-with-srg)
2. [Porting from THE WORD Python](#porting-from-the-word)
3. [ReflexOmega Memory Crystals](#reflexomega-integration)
4. [Production Deployment](#production-deployment)
5. [Performance Tuning](#performance-tuning)

---

## Integrating with SRG

### Option 1: Replace Trace Method

```typescript
// File: srgService.ts (modified)
import SRGWordHybrid from './srg-word-hybrid';

class SRGService {
  private hybrid: SRGWordHybrid = new SRGWordHybrid();
  private graph: GraphState = { nodes: [], links: [] };
  
  async init(trainingData: string[], synonymData: string[][], onProgress) {
    onProgress('Initializing hybrid system...');
    
    // Build hybrid knowledge base
    for (const text of trainingData) {
      this.hybrid.ingest(text);
    }
    
    // Add synonym groups
    for (const group of synonymData) {
      this.hybrid.addSynonyms(group);
    }
    
    onProgress('Hybrid system ready');
  }
  
  public trace(query: string, config?: SRGTraversalConfig): Map<string, PulseResult[]> {
    // Use hybrid instead of original BFS/DFS traversal
    const result = this.hybrid.query(query, {
      window: config?.windowSize || 20,
      maxDepth: config?.maxDepth || 2,
      useSynsets: true,
      useRelations: true
    });
    
    if (!result) {
      return new Map();
    }
    
    // Convert hybrid result to SRG format
    return this.convertToSRGPulseResults(result);
  }
  
  private convertToSRGPulseResults(hybridResult: HybridQueryResult): Map<string, PulseResult[]> {
    const results = new Map<string, PulseResult[]>();
    
    // Get query words from trace
    const queryWords = hybridResult.trace.map(t => t.word);
    
    // Convert paths to pulse results
    for (const path of hybridResult.paths) {
      for (const startWord of queryWords) {
        if (path.nodes.includes(startWord)) {
          const pulseResults: PulseResult[] = path.nodes.map((word, idx) => ({
            nodeId: word,
            word: word,
            level: idx
          }));
          
          results.set(startWord, pulseResults);
        }
      }
    }
    
    return results;
  }
}
```

### Option 2: Parallel Hybrid Mode

```typescript
class EnhancedSRGService extends SRGService {
  private hybrid: SRGWordHybrid = new SRGWordHybrid();
  private useHybrid: boolean = true;
  
  async init(trainingData: string[], synonymData: string[][], onProgress) {
    // Call original init
    await super.init(trainingData, synonymData, onProgress);
    
    // Also initialize hybrid
    onProgress('Building hybrid index...');
    for (const text of trainingData) {
      this.hybrid.ingest(text);
    }
    for (const group of synonymData) {
      this.hybrid.addSynonyms(group);
    }
  }
  
  public trace(query: string, config?: SRGTraversalConfig): Map<string, PulseResult[]> {
    if (this.useHybrid) {
      return this.traceHybrid(query, config);
    } else {
      return super.trace(query, config);
    }
  }
  
  public setMode(useHybrid: boolean) {
    this.useHybrid = useHybrid;
  }
  
  // Compare both approaches
  public async benchmark(query: string, config?: SRGTraversalConfig) {
    const t0 = performance.now();
    const originalResults = super.trace(query, config);
    const t1 = performance.now();
    
    const hybridResults = this.traceHybrid(query, config);
    const t2 = performance.now();
    
    return {
      original: {
        results: originalResults,
        time: t1 - t0
      },
      hybrid: {
        results: hybridResults,
        time: t2 - t1
      }
    };
  }
}
```

### Option 3: Feature Augmentation

```typescript
class SRGServiceWithInterference extends SRGService {
  private hybrid: SRGWordHybrid = new SRGWordHybrid();
  
  // Add interference scoring to existing graph
  private calculateEffectiveWeight(
    link: GraphLink,
    config: SRGTraversalConfig,
    now: number
  ): number {
    // Original SRG scoring
    const baseScore = super.calculateEffectiveWeight(link, config, now);
    
    // Add interference amplitude
    const sourceNode = this.hybrid.nodes.get(link.source);
    const targetNode = this.hybrid.nodes.get(link.target);
    
    if (sourceNode && targetNode) {
      const interference = sourceNode.interferenceStrength.get(link.target) || 0;
      // Combine: 70% original + 30% interference
      return baseScore * 0.7 + interference * 0.3;
    }
    
    return baseScore;
  }
  
  // Add entity profiling
  public getEntityProfile(word: string): EntityProfile | null {
    return this.hybrid.buildEntityProfile(word);
  }
}
```

---

## Porting from THE WORD Python

### Data Migration

```typescript
// Convert Python model to TypeScript
import fs from 'fs';
import SRGWordHybrid from './srg-word-hybrid';

async function migrateFromPython(pythonModelDir: string) {
  const hybrid = new SRGWordHybrid();
  
  // 1. Load tokens
  const tokensPath = `${pythonModelDir}/tokens.txt`;
  const tokens = fs.readFileSync(tokensPath, 'utf-8').split(' ');
  
  console.log(`Loading ${tokens.length} tokens...`);
  hybrid.ingest(tokens.join(' '));
  
  // 2. Load synsets
  const synsetsPath = `${pythonModelDir}/synsets.json`;
  if (fs.existsSync(synsetsPath)) {
    const synsetData = JSON.parse(fs.readFileSync(synsetsPath, 'utf-8'));
    
    // Convert synset_to_words
    for (const [synsetId, words] of Object.entries(synsetData.synset_to_words)) {
      hybrid.addSynonyms(words as string[]);
    }
    
    console.log(`Loaded ${Object.keys(synsetData.synset_to_words).length} synsets`);
  }
  
  // 3. Load relations
  const relationsPath = `${pythonModelDir}/relations.json`;
  if (fs.existsSync(relationsPath)) {
    const relData = JSON.parse(fs.readFileSync(relationsPath, 'utf-8'));
    
    console.log(`Loaded ${relData.triples?.length || 0} relations`);
    // Relations are automatically extracted during ingest,
    // but you could also manually add them:
    // for (const triple of relData.triples) {
    //   hybrid.addEdge(triple[0], triple[2], triple[1], triple[3]);
    // }
  }
  
  return hybrid;
}

// Usage
const hybrid = await migrateFromPython('./models/my-word-model');
```

### API Compatibility Layer

```typescript
// Wrapper to match Python API
class TheWordCompat {
  private hybrid: SRGWordHybrid;
  
  constructor() {
    this.hybrid = new SRGWordHybrid();
  }
  
  // Python: engine.ingest(text)
  ingest(text: string): number {
    const beforeSize = this.hybrid.corpus.length;
    this.hybrid.ingest(text);
    return this.hybrid.corpus.length - beforeSize; // tokens added
  }
  
  // Python: engine.query(prompt, length=30, window=20, use_synsets=True, use_relations=True)
  query(
    prompt: string,
    options: {
      length?: number,
      window?: number,
      use_synsets?: boolean,
      use_relations?: boolean,
      in_chat_mode?: boolean
    } = {}
  ) {
    const result = this.hybrid.query(prompt, {
      generateLength: options.length || 30,
      window: options.window || 20,
      useSynsets: options.use_synsets !== false,
      useRelations: options.use_relations !== false
    });
    
    if (!result) return null;
    
    // Match Python return format
    return {
      hits: result.paths.length,
      position: result.interferenceHit.position,
      score: result.interferenceHit.score,
      generated: result.generated,
      trace: result.trace,
      relations_used: result.paths.slice(0, 10)
    };
  }
  
  // Python: engine.stats()
  stats() {
    return this.hybrid.getStats();
  }
  
  // Python: engine.suppress_positions(positions)
  suppress_positions(positions: number[]): number {
    this.hybrid.suppressPositions(positions);
    return positions.length;
  }
}
```

---

## ReflexOmega Integration

### Memory Crystal with Interference

```typescript
interface InterferenceMemoryCrystal {
  version: string;
  timestamp: number;
  corpus: string[];
  nodes: Map<string, PositionNode>;
  edges: Map<string, RelationalEdge>;
  synsets: {
    wordToSynset: Map<string, number>;
    synsetToWords: Map<number, Set<string>>;
  };
  metadata: {
    totalTokens: number;
    uniqueWords: number;
    relationCount: number;
  };
}

class MemoryCrystalManager {
  private hybrid: SRGWordHybrid;
  
  async persist(): Promise<InterferenceMemoryCrystal> {
    return {
      version: '1.0.0',
      timestamp: Date.now(),
      corpus: this.hybrid.corpus,
      nodes: this.hybrid.nodes,
      edges: this.hybrid.edges,
      synsets: {
        wordToSynset: this.hybrid.synsets['wordToSynset'],
        synsetToWords: this.hybrid.synsets['synsetToWords']
      },
      metadata: this.hybrid.getStats()
    };
  }
  
  async restore(crystal: InterferenceMemoryCrystal): Promise<void> {
    // Restore corpus
    this.hybrid.corpus = crystal.corpus;
    
    // Restore nodes
    this.hybrid.nodes = crystal.nodes;
    
    // Restore edges
    this.hybrid.edges = crystal.edges;
    
    // Restore synsets
    this.hybrid.synsets['wordToSynset'] = crystal.synsets.wordToSynset;
    this.hybrid.synsets['synsetToWords'] = crystal.synsets.synsetToWords;
    
    console.log(`Restored crystal: ${crystal.metadata.totalTokens} tokens`);
  }
  
  async transferToAgent(targetAgent: ReflexAgent): Promise<void> {
    const crystal = await this.persist();
    
    // Transfer via ReflexOmega's consciousness transfer protocol
    await targetAgent.loadMemoryCrystal(crystal);
  }
}
```

### Multi-Agent Coordination

```typescript
class MultiAgentHybridSystem {
  private agents: Map<string, SRGWordHybrid> = new Map();
  
  createAgent(agentId: string, specialization: string[]): void {
    const agent = new SRGWordHybrid();
    
    // Initialize with specialization synsets
    for (const domain of specialization) {
      const domainSynsets = this.getDomainSynsets(domain);
      for (const group of domainSynsets) {
        agent.addSynonyms(group);
      }
    }
    
    this.agents.set(agentId, agent);
  }
  
  async collaborativeQuery(query: string): Promise<Map<string, HybridQueryResult>> {
    const results = new Map<string, HybridQueryResult>();
    
    // Query all agents in parallel
    const promises = Array.from(this.agents.entries()).map(async ([id, agent]) => {
      const result = agent.query(query, {
        maxDepth: 3,
        useRelations: true
      });
      if (result) {
        results.set(id, result);
      }
    });
    
    await Promise.all(promises);
    
    // Synthesize results via interference voting
    return this.synthesizeResults(results);
  }
  
  private synthesizeResults(
    results: Map<string, HybridQueryResult>
  ): Map<string, HybridQueryResult> {
    // Combine paths from all agents, weighted by interference scores
    const combinedPaths: TraversalPath[] = [];
    
    for (const result of results.values()) {
      combinedPaths.push(...result.paths);
    }
    
    // Sort by total interference
    combinedPaths.sort((a, b) => b.totalInterference - a.totalInterference);
    
    // Return top consensus paths
    // (Implementation details depend on ReflexOmega architecture)
    return results;
  }
}
```

---

## Production Deployment

### Persistence Layer

```typescript
import { Level } from 'level';

class PersistentHybrid extends SRGWordHybrid {
  private db: Level;
  
  constructor(dbPath: string) {
    super();
    this.db = new Level(dbPath, { valueEncoding: 'json' });
  }
  
  async ingest(text: string): Promise<void> {
    super.ingest(text);
    
    // Persist incrementally
    await this.saveIncremental();
  }
  
  private async saveIncremental(): Promise<void> {
    const batch = this.db.batch();
    
    // Save corpus (append-only)
    batch.put('corpus:length', this.corpus.length);
    
    // Save new nodes
    for (const [word, node] of this.nodes) {
      batch.put(`node:${word}`, node);
    }
    
    // Save new edges
    for (const [key, edge] of this.edges) {
      batch.put(`edge:${key}`, edge);
    }
    
    await batch.write();
  }
  
  async load(): Promise<void> {
    // Load corpus
    const corpusLength = await this.db.get('corpus:length').catch(() => 0);
    
    // Load nodes
    for await (const [key, value] of this.db.iterator({ gte: 'node:', lte: 'node:~' })) {
      const word = key.toString().replace('node:', '');
      this.nodes.set(word, value);
    }
    
    // Load edges
    for await (const [key, value] of this.db.iterator({ gte: 'edge:', lte: 'edge:~' })) {
      this.edges.set(key.toString().replace('edge:', ''), value);
    }
    
    console.log(`Loaded ${this.nodes.size} nodes, ${this.edges.size} edges`);
  }
}
```

### REST API

```typescript
import express from 'express';

const app = express();
const hybrid = new SRGWordHybrid();

app.use(express.json());

// Ingest endpoint
app.post('/api/ingest', (req, res) => {
  const { text } = req.body;
  hybrid.ingest(text);
  res.json({ status: 'ok', stats: hybrid.getStats() });
});

// Query endpoint
app.post('/api/query', (req, res) => {
  const { query, options } = req.body;
  
  const result = hybrid.query(query, {
    window: options?.window || 20,
    maxDepth: options?.maxDepth || 3,
    useSynsets: options?.useSynsets !== false,
    useRelations: options?.useRelations !== false
  });
  
  if (result) {
    res.json({
      generated: result.generated,
      interference: {
        position: result.interferenceHit.position,
        score: result.interferenceHit.score
      },
      paths: result.paths.slice(0, 10).map(p => ({
        nodes: p.nodes,
        relations: p.relationChain,
        score: p.totalInterference
      })),
      profiles: Array.from(result.entityProfiles.entries()).map(([word, profile]) => ({
        word,
        relationCount: Object.values(profile).reduce((sum, arr) => sum + arr.length, 0)
      }))
    });
  } else {
    res.json({ error: 'No results found' });
  }
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  res.json(hybrid.getStats());
});

app.listen(3000, () => {
  console.log('SRG-WORD Hybrid API listening on port 3000');
});
```

---

## Performance Tuning

### Optimization Strategies

```typescript
class OptimizedHybrid extends SRGWordHybrid {
  
  // 1. Limit interference calculation to top-k positions
  private findInterferenceOptimized(
    wordPositions: Map<string, number[]>,
    window: number,
    topK: number = 100
  ): InterferenceHit[] {
    // Only check first K positions of anchor word
    const anchorWord = this.getSmallestPositionSet(wordPositions);
    const anchorPositions = wordPositions.get(anchorWord)!.slice(0, topK);
    
    // Continue with normal interference calculation
    // but with limited anchor set
    return super.findInterference(
      new Map([[anchorWord, anchorPositions], ...Array.from(wordPositions.entries()).filter(([w]) => w !== anchorWord)]),
      window
    );
  }
  
  // 2. Cache frequent queries
  private queryCache: Map<string, HybridQueryResult> = new Map();
  private cacheSize: number = 1000;
  
  query(prompt: string, options: any): HybridQueryResult | null {
    const cacheKey = `${prompt}:${JSON.stringify(options)}`;
    
    if (this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey)!;
    }
    
    const result = super.query(prompt, options);
    
    if (result) {
      this.queryCache.set(cacheKey, result);
      
      // Evict oldest if cache too large
      if (this.queryCache.size > this.cacheSize) {
        const firstKey = this.queryCache.keys().next().value;
        this.queryCache.delete(firstKey);
      }
    }
    
    return result;
  }
  
  // 3. Parallel path exploration
  private async traverseRelationalGraphParallel(
    startWords: string[],
    maxDepth: number
  ): Promise<TraversalPath[]> {
    const pathPromises = startWords.map(word => 
      this.traverseFromWord(word, maxDepth)
    );
    
    const pathArrays = await Promise.all(pathPromises);
    return pathArrays.flat();
  }
  
  // 4. Position index with binary search
  private positionIndex: Map<string, Int32Array> = new Map();
  
  ingest(text: string): void {
    super.ingest(text);
    
    // Convert position arrays to typed arrays for faster lookup
    for (const [word, node] of this.nodes) {
      this.positionIndex.set(word, new Int32Array(node.positions));
    }
  }
}
```

### Benchmarking

```typescript
class HybridBenchmark {
  private hybrid: SRGWordHybrid;
  
  async runBenchmarks(): Promise<void> {
    console.log('Running benchmarks...\n');
    
    // Ingest benchmark
    const ingestStart = performance.now();
    for (let i = 0; i < 10000; i++) {
      this.hybrid.ingest('test sentence number ' + i);
    }
    const ingestEnd = performance.now();
    const ingestTime = ingestEnd - ingestStart;
    const tokensPerSec = (10000 * 4) / (ingestTime / 1000);
    
    console.log(`Ingest: ${tokensPerSec.toFixed(0)} tokens/sec`);
    
    // Query benchmark
    const queries = [
      'test sentence',
      'number test',
      'sentence number test'
    ];
    
    let totalQueryTime = 0;
    for (const query of queries) {
      const queryStart = performance.now();
      this.hybrid.query(query, { maxDepth: 3 });
      const queryEnd = performance.now();
      totalQueryTime += queryEnd - queryStart;
    }
    
    console.log(`Average query time: ${(totalQueryTime / queries.length).toFixed(2)}ms`);
    
    // Memory usage
    const stats = this.hybrid.getStats();
    const estimatedMemory = stats.corpusSize * 2 + stats.nodes * 100 + stats.edges * 200;
    console.log(`Estimated memory: ${(estimatedMemory / 1024 / 1024).toFixed(2)}MB`);
  }
}
```

---

## Configuration Best Practices

### Small Dataset (< 10K tokens)
```typescript
{
  window: 15,
  maxDepth: 4,
  useSynsets: true,
  useRelations: true,
  generateLength: 50
}
```

### Medium Dataset (10K - 100K tokens)
```typescript
{
  window: 20,
  maxDepth: 3,
  useSynsets: true,
  useRelations: true,
  generateLength: 40
}
```

### Large Dataset (> 100K tokens)
```typescript
{
  window: 25,
  maxDepth: 2,
  useSynsets: false,  // Disable for speed
  useRelations: true,
  generateLength: 30
}
```

### Real-time Chat
```typescript
{
  window: 15,
  maxDepth: 2,
  useSynsets: true,
  useRelations: false,  // Disable for speed
  generateLength: 30
}
```

---

## Troubleshooting

### Problem: Queries too slow

**Solution:**
1. Reduce maxDepth (2-3 is usually sufficient)
2. Limit interference window (15-25 tokens)
3. Disable synset expansion for large datasets
4. Implement position caching
5. Use typed arrays for position indices

### Problem: Generated text not coherent

**Solution:**
1. Increase maxDepth for deeper reasoning
2. Enable relational filtering
3. Add more domain-specific synsets
4. Tune relation type weights
5. Use beat-frequency context for chat mode

### Problem: Missing expected relations

**Solution:**
1. Check relation extraction patterns
2. Verify text preprocessing (lowercase, punctuation)
3. Increase corpus size
4. Add manual relation assertions
5. Review synset definitions

---

**Integration complete!** You now have everything needed to deploy the SRG-WORD hybrid in production, integrate with existing systems, and optimize for your specific use case.
