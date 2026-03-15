
import { get, set } from 'idb-keyval';
import type { GraphNode, GraphLink, GraphState, PulseResult, SRGTraversalConfig, KnowledgeModule } from '../types';
import { srgDataset } from './srgDataset';
import SRGWordHybrid, { HybridQueryResult, EntityProfile } from './srg-word-hybrid';

const DB_KEY = 'srg-graph-v7'; // Incremented version for new architecture
const ONE_MONTH_MS = 1000 * 60 * 60 * 24 * 30; 
const SAVE_DEBOUNCE_MS = 5000; 

class SRGService {
  private graph: GraphState = { nodes: [], links: [] };
  private nodeIds: Set<string> = new Set();
  private linkMap: Map<string, GraphLink> = new Map();
  private nodeMap: Map<string, GraphNode> = new Map();
  private hybrid: SRGWordHybrid = new SRGWordHybrid();
  private knowledgeModules: KnowledgeModule[] = [];
  
  private saveTimeout: any = null;

  public isReady: Promise<void>;
  private resolveReady: () => void = () => {};

  constructor() {
    this.isReady = new Promise((resolve) => {
        this.resolveReady = resolve;
    });
  }

  async init(trainingData: string[], synonymData: string[][], onProgress: (message: string) => void) {
    onProgress('Checking SRG graph cache...');
    try {
      const storedGraph = await get<GraphState>(DB_KEY);
      if (storedGraph && storedGraph.nodes && storedGraph.nodes.length > 0) {
        console.log(`[SRG] Loaded ${storedGraph.nodes.length} nodes from IDB.`);
        this.graph = storedGraph;
        this.nodeIds = new Set(this.graph.nodes.map(n => n.id));
        this.knowledgeModules = storedGraph.knowledgeModules || [];
        onProgress(`Restored ${this.graph.nodes.length} nodes from memory crystal.`);
      } else {
        console.log('[SRG] No valid cache found. Building from scratch.');
        
        // 1. Initialize Semantic Core from primitives
        onProgress('Initializing Semantic Core...');
        const semanticPrimitives = srgDataset.getSemanticPrimitives();
        for (const [functionClass, words] of Object.entries(semanticPrimitives)) {
            // All words in this class are synonyms
            await this.processSynonymsForGraph(words, false);
            // Mark them as primitive nodes
            for (const word of words) {
                this.markAsPrimitive(word, functionClass);
            }
        }
        onProgress('Semantic Core built.');
        
        // 2. Weave connections from training data
        onProgress('Weaving training data connections...');
        let processedTurns = 0;
        for (const turn of trainingData) {
            await this.processTextForGraph(turn, false);
            this.hybrid.ingest(turn);
            processedTurns++;
            if (processedTurns % 200 === 0) {
              onProgress(`Weaving connections... ${processedTurns}/${trainingData.length}`);
              await new Promise(r => setTimeout(r, 0)); 
            }
        }

        // 3. Reinforce with general synonym groups
        onProgress('Reinforcing synonym pathways...');
        let processedSynonyms = 0;
        for(const group of synonymData) {
            await this.processSynonymsForGraph(group, false);
            this.hybrid.addSynonyms(group);
             processedSynonyms++;
            if (processedSynonyms % 200 === 0) {
               await new Promise(r => setTimeout(r, 0));
            }
        }
        
        onProgress('Persisting graph structure...');
        await this.saveGraphImmediate();
      }
      
      this.linkMap = new Map(this.graph.links.map(l => {
          const signature = l.type === 'semantic' 
              ? [l.source, l.target].sort().join('-') + `-${l.type}`
              : `${l.source}-${l.target}-${l.type}`;
          return [signature, l];
      }));
      this.nodeMap = new Map(this.graph.nodes.map(n => [n.id, n]));
      
    } catch (error: any) {
      console.error('Failed to initialize SRG service:', error);
      throw new Error(`SRG Init failed: ${error.message}`);
    } finally {
        this.resolveReady();
    }
  }

  public markAsPrimitive(word: string, functionClass: string) {
    const node = this.nodeMap.get(word.toLowerCase());
    if (node) {
        node.primitiveType = functionClass;
    }
  }

  private triggerSave() {
      if (this.saveTimeout) return;
      this.saveTimeout = setTimeout(() => {
          this.saveGraphImmediate();
          this.saveTimeout = null;
      }, SAVE_DEBOUNCE_MS);
  }

  private async saveGraphImmediate() {
    try {
      this.graph.knowledgeModules = this.knowledgeModules;
      await set(DB_KEY, this.graph);
    } catch (error) {
      console.error('[SRG] Failed to save graph:', error);
    }
  }

  private async processTextForGraph(text: string, shouldSave: boolean = true): Promise<boolean> {
    if (!text) return false;
    const words = text
        .toLowerCase()
        .replace(/[.,'!?]/g, '')
        .split(/\s+/)
        .filter(Boolean);

    let previousWord: string | null = null;
    let changed = false;

    for (const word of words) {
      if (word.length > 25) continue; 
      
      if (!this.nodeIds.has(word)) {
          const newNode: GraphNode = { id: word, word: word, layer: word.length, createdAt: Date.now() };
          this.graph.nodes.push(newNode);
          this.nodeIds.add(word);
          this.nodeMap.set(word, newNode); // Keep nodeMap in sync
          changed = true;
      }

      if (previousWord) {
          const linkSignature = `${previousWord}-${word}-syntactic`;
          const existingLink = this.linkMap.get(linkSignature);
          const now = Date.now();

          if (existingLink) {
              existingLink.accessedAt.push(now);
              const cutoff = now - ONE_MONTH_MS;
              if (existingLink.accessedAt[0] < cutoff) {
                   existingLink.accessedAt = existingLink.accessedAt.filter(ts => ts > cutoff);
              }
              existingLink.strength = existingLink.accessedAt.length;
          } else {
              const newLink: GraphLink = { 
                  source: previousWord, 
                  target: word, 
                  type: 'syntactic', 
                  createdAt: now,
                  accessedAt: [now],
                  strength: 1
              };
              this.graph.links.push(newLink);
              this.linkMap.set(linkSignature, newLink);
              changed = true;
          }
      }
      previousWord = word;
    }
    
    if (changed && shouldSave) {
        this.triggerSave();
    }
    return changed;
  }

  private async processSynonymsForGraph(group: string[], shouldSave: boolean = true): Promise<boolean> {
      const validWords = group.map(w => w.toLowerCase()).filter(w => w.length <= 25);
      if (validWords.length < 2) return false;

      let changed = false;
      for (const word of validWords) {
          if (!this.nodeIds.has(word)) {
              const newNode: GraphNode = { id: word, word: word, layer: word.length, createdAt: Date.now() };
              this.graph.nodes.push(newNode);
              this.nodeIds.add(word);
              this.nodeMap.set(word, newNode); // Keep nodeMap in sync
              changed = true;
          }
      }

      for (let i = 0; i < validWords.length; i++) {
          for (let j = i + 1; j < validWords.length; j++) {
              const word1 = validWords[i];
              const word2 = validWords[j];
              const signature = [word1, word2].sort().join('-') + '-semantic';
              const existingLink = this.linkMap.get(signature);
              const now = Date.now();

              if (existingLink) {
                  existingLink.accessedAt.push(now);
                  if (existingLink.accessedAt.length > 100 && existingLink.accessedAt[0] < Date.now() - ONE_MONTH_MS) {
                      const cutoff = Date.now() - ONE_MONTH_MS;
                      existingLink.accessedAt = existingLink.accessedAt.filter(ts => ts > cutoff);
                  }
                  existingLink.strength = existingLink.accessedAt.length;
              } else {
                  const newLink: GraphLink = { 
                      source: word1, 
                      target: word2, 
                      type: 'semantic', 
                      createdAt: now,
                      accessedAt: [now],
                      strength: 1
                  };
                  this.graph.links.push(newLink);
                  this.linkMap.set(signature, newLink);
                  changed = true;
              }
          }
      }
      if (changed && shouldSave) {
          this.triggerSave();
      }
      return changed;
  }

  public getGraphState(): GraphState {
    return this.graph;
  }

  public async reinforceLinksFromText(text: string): Promise<void> {
      await this.processTextForGraph(text, true);
  }

  private calculateEffectiveWeight(link: GraphLink, config: SRGTraversalConfig, now: number, customScorer?: (link: GraphLink, depth: number, targetId: string) => number, depth: number = 0): number {
      if (config.algorithm === 'custom' && customScorer) {
          try {
              return customScorer(link, depth, link.target);
          } catch (e) {
              console.error("Custom script error", e);
              return 0; 
          }
      }

      const recentAccesses = link.accessedAt.slice(-5);
      const HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
      const decayConstant = Math.log(2) / HALF_LIFE_MS;
      
      let timeWeight = 0;
      for (const timestamp of recentAccesses) {
          const age = now - timestamp;
          if (age < 0) continue;
          timeWeight += Math.exp(-decayConstant * age);
      }
      
      // Ensure a minimum base weight so structural links don't vanish completely due to age
      timeWeight = Math.max(0.2, Math.min(timeWeight, 10)); 
      
      const typeMultiplier = link.type === 'semantic' ? config.semanticWeight : config.syntacticWeight;

      // New: Boost paths involving primitive nodes
      let primitiveBoost = 1.0;
      const sourceNode = this.nodeMap.get(link.source);
      const targetNode = this.nodeMap.get(link.target);
      if (sourceNode?.primitiveType || targetNode?.primitiveType) {
          primitiveBoost = 2.0; // Give a 2x boost if connected to a primitive
      }

      return (timeWeight * typeMultiplier) * primitiveBoost;
  }

  private compileCustomScorer(script: string): (link: GraphLink, depth: number, targetId: string) => number {
        try {
            return new Function('link', 'depth', 'targetId', script) as (link: GraphLink, depth: number, targetId: string) => number;
        } catch (e) {
            console.error("Failed to compile custom SRG script:", e);
            return () => 0; 
        }
  }

  private weightedSample(items: {id: string, weight: number}[], n: number): {id: string, weight: number}[] {
      if (items.length === 0) return [];
      const result = [];
      const pool = [...items];
      
      for (let i = 0; i < n && pool.length > 0; i++) {
          const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
          let r = Math.random() * totalWeight;
          for (let j = 0; j < pool.length; j++) {
              r -= pool[j].weight;
              if (r <= 0) {
                  result.push(pool[j]);
                  pool.splice(j, 1);
                  break;
              }
          }
      }
      return result;
  }

  public trace(query: string, config?: SRGTraversalConfig): Map<string, PulseResult[]> {
    const { algorithm, maxDepth, branchingFactor, weightThreshold, semanticWeight, syntacticWeight, customScript } = config || {
        algorithm: 'bfs', maxDepth: 2, branchingFactor: 5, weightThreshold: 0.05,
        semanticWeight: 1.5, syntacticWeight: 1.0, customScript: 'return link.strength;' 
    };

    const effectiveConfig = { algorithm, maxDepth, branchingFactor, weightThreshold, semanticWeight, syntacticWeight, customScript };
    const words = [...new Set(query.toLowerCase().replace(/[.,'!?]/g, '').split(/\s+/).filter(Boolean))];
    const traceResults = new Map<string, PulseResult[]>();
    const now = Date.now();

    let customScorer: ((link: GraphLink, depth: number, targetId: string) => number) | undefined;
    if (algorithm === 'custom' && customScript) {
        customScorer = this.compileCustomScorer(customScript);
    }

    const weightedAdjacency = new Map<string, {id: string, link: GraphLink}[]>();
    for(const link of this.graph.links) {
        if (!weightedAdjacency.has(link.source)) weightedAdjacency.set(link.source, []);
        weightedAdjacency.get(link.source)!.push({ id: link.target, link });

        if (!weightedAdjacency.has(link.target)) weightedAdjacency.set(link.target, []);
        weightedAdjacency.get(link.target)!.push({ id: link.source, link });
    }

    for (const startWord of words) {
        const startNode = this.nodeMap.get(startWord);
        if (!startNode) continue;

        const targetWords = new Set(words.filter(w => w !== startWord));
        const isExpansionMode = targetWords.size === 0;

        const q: {id: string, depth: number}[] = [{id: startNode.id, depth: 0}];
        const predecessors = new Map<string, string | null>([[startNode.id, null]]);
        const visited = new Set<string>([startNode.id]);
        const pathsFound = new Map<string, string[]>();
        
        let steps = 0;
        const MAX_STEPS = 3000;
        let foundTargets = 0;

        while (q.length > 0 && steps < MAX_STEPS && (isExpansionMode ? q[0].depth < maxDepth : foundTargets < targetWords.size)) {
            let current: {id: string, depth: number};
            
            if (algorithm === 'dfs') {
                current = q.pop()!;
            } else {
                current = q.shift()!;
            }
            
            const { id: currentNodeId, depth } = current;
            steps++;

            if (depth >= maxDepth) continue;

            if (!isExpansionMode && targetWords.has(currentNodeId)) {
                foundTargets++;
                const path: string[] = [];
                let currPathNode: string | null = currentNodeId;
                while (currPathNode) {
                    path.unshift(currPathNode);
                    currPathNode = predecessors.get(currPathNode) || null;
                }
                pathsFound.set(currentNodeId, path);
            }
            
            const rawNeighbors = weightedAdjacency.get(currentNodeId) || [];
            
            let scoredNeighbors = rawNeighbors.map(n => {
                let weight = this.calculateEffectiveWeight(n.link, effectiveConfig, now, customScorer, depth);
                if (algorithm === 'attention') {
                    const degree = weightedAdjacency.get(n.id)?.length || 1;
                    weight = weight * (1 + Math.log(degree));
                }
                return { ...n, weight };
            });

            scoredNeighbors = scoredNeighbors.filter(n => n.weight >= weightThreshold);

            let branch: {id: string, weight: number}[];
            
            if (algorithm === 'random-walk') {
                branch = this.weightedSample(scoredNeighbors, branchingFactor);
            } else {
                scoredNeighbors.sort((a, b) => b.weight - a.weight);
                branch = scoredNeighbors.slice(0, branchingFactor);
            }

            if (algorithm === 'dfs') {
                branch.reverse(); 
            }

            for (const neighbor of branch) {
                if (!visited.has(neighbor.id)) {
                    visited.add(neighbor.id);
                    predecessors.set(neighbor.id, currentNodeId);
                    q.push({ id: neighbor.id, depth: depth + 1 });
                }
            }
        }

        if (isExpansionMode) {
             const results: PulseResult[] = [{ nodeId: startNode.id, word: startNode.word, level: 0 }];
             visited.forEach(nid => {
                 if (nid === startNode.id) return;
                 const n = this.nodeMap.get(nid);
                 if (n) {
                    let curr: string | null = nid;
                    let level = 0;
                    while(curr && (curr = predecessors.get(curr) || null)) level++;
                    results.push({ nodeId: n.id, word: n.word, level });
                 }
             });
             traceResults.set(startWord, results);
        } else {
            const corePathNodeIds = new Set<string>();
            for (const path of pathsFound.values()) {
                path.forEach(nodeId => corePathNodeIds.add(nodeId));
            }
            
            if (corePathNodeIds.size > 0) {
                const finalResults: PulseResult[] = [];
                corePathNodeIds.forEach(nid => {
                    const n = this.nodeMap.get(nid);
                    if(n) finalResults.push({ nodeId: n.id, word: n.word, level: 1 });
                });
                traceResults.set(startWord, finalResults);
            }
        }
    }
    return traceResults;
  }

  /**
   * Hybrid Query: Combines SRG-WORD interference detection with relational graph traversal
   */
  public queryHybrid(
    prompt: string,
    options: {
      window?: number;
      maxDepth?: number;
      useSynsets?: boolean;
      useRelations?: boolean;
      generateLength?: number;
    } = {}
  ): HybridQueryResult | null {
    return this.hybrid.query(prompt, options);
  }

  /**
   * Get hybrid system statistics
   */
  public getHybridStats() {
    return this.hybrid.getStats();
  }

  /**
   * Get corpus statistics (formatted for UI display)
   */
  public getCorpusStats() {
    const hybridStats = this.hybrid.getStats();
    return {
      totalTokens: hybridStats.corpusSize,
      estimatedBytes: hybridStats.corpusSize * 5, // Rough estimate: avg 5 bytes per token
      nodes: hybridStats.nodes,
      edges: hybridStats.edges,
      synsetGroups: hybridStats.synsetGroups,
      uniqueWords: hybridStats.nodes
    };
  }

  /**
   * Get a manifest of the loaded corpus for planner awareness.
   */
  public getCorpusManifest(): string {
    const stats = this.getCorpusStats();
    if (stats.totalTokens === 0) return '';
    return `[CORPUS MANIFEST] ${stats.totalTokens} tokens indexed, ${stats.uniqueWords} unique words, ${stats.edges} relations, ${stats.synsetGroups} synset groups.`;
  }

  /**
   * Add hybrid synonym group
   */
  public addHybridSynonyms(words: string[]): void {
    this.hybrid.addSynonyms(words);
  }

  /**
   * Suppress positions in hybrid system (for negation/correction handling)
   */
  public suppressHybridPositions(positions: number[]): void {
    this.hybrid.suppressPositions(positions);
  }

  /**
   * Ingest text into the hybrid system for learning
   */
  public async ingestHybrid(
    text: string,
    moduleMetadata?: { title: string; source: string; category: KnowledgeModule['category'] }
  ): Promise<void> {
    const startPosition = this.hybrid.getStats().corpusSize;
    await this.hybrid.ingest(text);
    
    if (moduleMetadata) {
      const tokenCount = text.split(/\s+/).length;
      const module: KnowledgeModule = {
        id: `km-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: moduleMetadata.title,
        source: moduleMetadata.source,
        category: moduleMetadata.category,
        tokenCount,
        loadedAt: Date.now(),
        startPosition,
        endPosition: this.hybrid.getStats().corpusSize
      };
      this.knowledgeModules.push(module);
    }
    
    // Always trigger save to persist ingested text to IDB
    this.triggerSave();
  }

  /**
   * Restore hybrid corpus from persisted storage (called after init on app startup)
   */
  public async restoreHybridCorpus(): Promise<void> {
    try {
      const hybridStats = this.hybrid.getStats();
      console.log('[SRG] Hybrid corpus restored:', { 
        corpusSize: hybridStats.corpusSize,
        nodes: hybridStats.nodes,
        modules: this.knowledgeModules.length
      });
    } catch (err) {
      console.error('[SRG] Failed to restore hybrid corpus:', err);
    }
  }

  /**
   * Get all loaded knowledge modules
   */
  public getKnowledgeModules(): KnowledgeModule[] {
    return [...this.knowledgeModules];
  }

    /**
     * Export the full SRG state for session export. Includes graph nodes/links,
     * hybrid corpus tokens, and knowledge module metadata.
     */
    public exportState() {
        return {
            nodes: this.graph.nodes,
            links: this.graph.links,
            hybridCorpus: this.hybrid.getCorpusTokens(),
            knowledgeModules: [...this.knowledgeModules]
        } as any;
    }

    /**
     * Import a serialized GraphState. Replaces current graph (nodes/links)
     * and, if present, imports the hybrid corpus asynchronously.
     */
    public async importState(state: { nodes?: GraphNode[]; links?: GraphLink[]; hybridCorpus?: string[]; knowledgeModules?: KnowledgeModule[] } | null | undefined): Promise<void> {
        if (!state) return;

        if (state.nodes) {
            this.graph.nodes = state.nodes.map(n => ({ ...n }));
            this.nodeIds = new Set(this.graph.nodes.map(n => n.id));
            this.nodeMap = new Map(this.graph.nodes.map(n => [n.id, n]));
        }

        if (state.links) {
            this.graph.links = state.links.map(l => ({ ...l }));
            this.linkMap = new Map(this.graph.links.map(l => {
                const signature = l.type === 'semantic' ? [l.source, l.target].sort().join('-') + `-${l.type}` : `${l.source}-${l.target}-${l.type}`;
                return [signature, l];
            }));
        }

        if (state.knowledgeModules) {
            this.knowledgeModules = state.knowledgeModules.map(m => ({ ...m }));
        }

        // Persist the updated graph metadata right away
        this.triggerSave();

        // Import hybrid corpus if provided (may be large)
        if (state.hybridCorpus && Array.isArray(state.hybridCorpus)) {
            try {
                await this.hybrid.importCorpus(state.hybridCorpus);
            } catch (e) {
                console.warn('[SRG] Failed to import hybrid corpus', e);
            }
        }
    }

  /**
   * Delete a knowledge module (metadata only - corpus remains)
   */
  public deleteKnowledgeModule(moduleId: string): boolean {
    const index = this.knowledgeModules.findIndex(m => m.id === moduleId);
    if (index === -1) return false;
    
    this.knowledgeModules.splice(index, 1);
    this.triggerSave();
    return true;
  }}

export const srgService = new SRGService();
