import { get, set, del } from 'idb-keyval';
import type { GraphNode, GraphLink, GraphState, PulseResult, MemoryAtom } from '../types';

const DB_KEY = 'srg-graph-v1';

class GraphService {
  private graph: GraphState = { nodes: [], links: [] };
  private nodeIds: Set<string> = new Set();
  private linkSignatures: Set<string> = new Set();

  public isLoaded: Promise<void>;
  private resolveLoaded: () => void = () => {};

  constructor() {
    this.isLoaded = new Promise((resolve) => {
        this.resolveLoaded = resolve;
    });
    this.loadGraph();
  }

  private async loadGraph() {
    try {
      const storedGraph = await get<GraphState>(DB_KEY);
      if (storedGraph) {
        this.graph = storedGraph;
        this.nodeIds = new Set(this.graph.nodes.map(n => n.id));
        this.linkSignatures = new Set(this.graph.links.map(l => `${l.source}-${l.target}-${l.type}`));
        console.log(`SRG Graph loaded from IndexedDB with ${this.graph.nodes.length} nodes and ${this.graph.links.length} links.`);
      }
    } catch (error) {
      console.error('Failed to load SRG graph:', error);
    } finally {
        this.resolveLoaded();
    }
  }

  private async saveGraph() {
    try {
      await set(DB_KEY, this.graph);
    } catch (error) {
      console.error('Failed to save SRG graph:', error);
    }
  }

  public async clearGraph() {
      this.graph = { nodes: [], links: [] };
      this.nodeIds.clear();
      this.linkSignatures.clear();
      try {
          await del(DB_KEY);
          console.log("SRG Graph cleared.");
      } catch(e) {
          console.error("Failed to clear SRG graph from IndexedDB", e);
      }
  }

  public getGraphState(): GraphState {
    return this.graph;
  }

  public async loadGraphState(state: GraphState): Promise<void> {
    this.graph = state;
    this.nodeIds = new Set(this.graph.nodes.map(n => n.id));
    this.linkSignatures = new Set(this.graph.links.map(l => `${l.source}-${l.target}-${l.type}`));
    await this.saveGraph();
    console.log(`SRG Graph restored from session file with ${this.graph.nodes.length} nodes and ${this.graph.links.length} links.`);
  }

  public async rebuildGraphFromAtoms(atoms: MemoryAtom[]): Promise<void> {
    console.log(`Rebuilding SRG from ${atoms.length} memory atoms...`);
    this.clearGraph(); // Start fresh
    for (const atom of atoms) {
        if (atom.text) {
            this.processText(atom.text, false);
        }
        if (atom.backgroundInsight) {
            this.processText(atom.backgroundInsight.query, false);
            this.processText(atom.backgroundInsight.insight, false);
        }
    }
    await this.saveGraph();
    console.log(`SRG rebuild complete. ${this.graph.nodes.length} nodes, ${this.graph.links.length} links.`);
  }

  public processText(text: string, shouldSave: boolean = true): void {
    if (!text) return;
    const words = text
        .toLowerCase()
        .replace(/[.,'!?]/g, '')
        .split(/\s+/)
        .filter(Boolean);

    let previousWord: string | null = null;
    let changed = false;

    for (const word of words) {
        // Create new node if it doesn't exist
        if (!this.nodeIds.has(word)) {
            const newNode: GraphNode = {
                id: word,
                word: word,
                layer: word.length,
                createdAt: Date.now(),
            };
            this.graph.nodes.push(newNode);
            this.nodeIds.add(word);
            changed = true;
        }

        // Create syntactic link to previous word
        if (previousWord) {
            const linkSignature = `${previousWord}-${word}-syntactic`;
            if (!this.linkSignatures.has(linkSignature)) {
// FIX: Added missing 'accessedAt' and 'strength' properties to the new GraphLink object to align with the updated GraphLink type definition.
                const newLink: GraphLink = {
                    source: previousWord,
                    target: word,
                    type: 'syntactic',
                    createdAt: Date.now(),
                    accessedAt: [Date.now()],
                    strength: 1,
                };
                this.graph.links.push(newLink);
                this.linkSignatures.add(linkSignature);
                changed = true;
            }
        }
        previousWord = word;
    }

    if (changed && shouldSave) {
        this.saveGraph();
    }
  }

  public trace(query: string): Map<string, PulseResult[]> {
    const words = query.toLowerCase().replace(/[.,'!?]/g, '').split(/\s+/).filter(Boolean);
    const uniqueWords = [...new Set(words)].slice(0, 5); // Limit to 5 unique words to avoid overwhelming output
    const traceResults = new Map<string, PulseResult[]>();

    const adjacency = new Map<string, string[]>();
    this.graph.links.forEach(l => {
      if (!adjacency.has(l.source)) adjacency.set(l.source, []);
      adjacency.get(l.source)!.push(l.target);
      if (!adjacency.has(l.target)) adjacency.set(l.target, []);
      adjacency.get(l.target)!.push(l.source);
    });

    for (const startWord of uniqueWords) {
      const startNode = this.graph.nodes.find(n => n.word === startWord);
      if (!startNode) continue;

      const pathResults = new Map<string, PulseResult>();
      const q: [string, number][] = [[startNode.id, 0]];
      const visited = new Set<string>([startNode.id]);

      pathResults.set(startNode.id, { nodeId: startNode.id, word: startNode.word, level: 0 });

      let head = 0;
      while (head < q.length) {
        const [currNodeId, level] = q[head++]!;
        
        if (level >= 2) continue; // Limit trace depth to 2 levels (start word -> level 1 -> level 2)

        const neighbors = adjacency.get(currNodeId) || [];
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            const nodeData = this.graph.nodes.find(n => n.id === neighborId);
            if (nodeData) {
              pathResults.set(neighborId, { nodeId: neighborId, word: nodeData.word, level: level + 1 });
              q.push([neighborId, level + 1]);
            }
          }
        }
      }
      const sortedPath = Array.from(pathResults.values())
        .filter(p => p.level > 0) // Don't include the start word in its own trail
        .sort((a,b) => a.level - b.level);
        
      if (sortedPath.length > 0) {
        traceResults.set(startWord, sortedPath);
      }
    }
    
    return traceResults;
  }
}

export const graphService = new GraphService();
