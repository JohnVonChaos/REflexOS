
import { get, set } from 'idb-keyval';
import type { GraphNode, GraphLink, GraphState, PulseResult, SRGTraversalConfig } from '../types';
import { srgDataset } from './srgDataset';

const DB_KEY = 'srg-graph-v7'; // Incremented version for new architecture
const ONE_MONTH_MS = 1000 * 60 * 60 * 24 * 30; 
const SAVE_DEBOUNCE_MS = 5000; 

class SRGService {
  private graph: GraphState = { nodes: [], links: [] };
  private nodeIds: Set<string> = new Set();
  private linkMap: Map<string, GraphLink> = new Map();
  private nodeMap: Map<string, GraphNode> = new Map();
  
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

    /**
     * Produce a compact view of the SRG for a single stage call. This returns an id,
     * a textual payload that can be embedded in a prompt, and a small summary trace.
     */
    public async getSrgView(opts: { stageId: string; taskType: string; textContext: string; priorJudgment?: any; activeModules?: any[] }) {
        const { stageId, taskType, textContext } = opts;
        // Use the trace function to get candidate nodes
        const traceMap = this.trace(textContext || '', undefined);
        // Build a simple payload: top words from the trace
        const words: string[] = [];
        for (const arr of traceMap.values()) {
            for (const p of arr) {
                if (words.length >= 40) break;
                if (!words.includes(p.word)) words.push(p.word);
            }
            if (words.length >= 40) break;
        }

        const payload = (words.join(' ') || String(textContext || '')).trim();
        const view = {
            id: `view-${Date.now()}`,
            stageId,
            taskType,
            payload,
            trace: Object.fromEntries(traceMap.entries()),
        } as any;

        return view;
    }

  public async reinforceLinksFromText(text: string): Promise<void> {
      await this.processTextForGraph(text, true);
  }

    /**
     * Lightweight hybrid ingestion shim for compatibility with other code paths.
     * In the full SRG implementation this would add tokens to the hybrid corpus;
     * here we fall back to reinforcing links so axioms still affect the graph.
     */
    public async ingestHybrid(text: string, _metadata?: any): Promise<void> {
        // Fallback to reinforcing graph links for now
        await this.reinforceLinksFromText(text);
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
      
      timeWeight = Math.min(timeWeight, 10); 
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
}

export const srgService = new SRGService();
