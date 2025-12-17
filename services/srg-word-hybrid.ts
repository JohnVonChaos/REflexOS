/**
 * SRG-WORD HYBRID
 * ===============
 * Position-hash interference patterns + Graph traversal + Relational predicates
 * 
 * ARCHITECTURE:
 * 1. Each word gets position-hash coordinates (THE WORD)
 * 2. Graph nodes are anchored at positions in corpus space
 * 3. Edge weights calculated via interference amplitude between positions
 * 4. Relational predicates become typed edges (IS, HAS, WANTS, etc.)
 * 5. Graph traversal guided by interference patterns + semantic relations
 * 
 * DEPTH PRIORITY: Maximum relational coherence through multi-hop traversal
 * BULK PRIORITY: Every co-occurrence strengthens interference patterns
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type RelationType = 
  // Identity
  | 'IS' | 'IS_A' | 'IS_NOT' | 'IS_NOT_A'
  // Temporal
  | 'WAS' | 'WAS_A' | 'WAS_NOT' | 'WILL_BE' | 'WILL' | 'WILL_NOT'
  | 'USED_TO' | 'USED_TO_BE' | 'HAD_BEEN' | 'GOING_TO'
  // Possession
  | 'HAS' | 'HAS_A' | 'HAS_NOT' | 'HAD' | 'OWNS' | 'POSSESSIVE'
  // Capability
  | 'CAN' | 'CAN_BE' | 'CAN_NOT' | 'ABLE_TO'
  // Obligation
  | 'MUST' | 'MUST_BE' | 'MUST_NOT' | 'SHOULD' | 'SHOULD_BE' | 'SHOULD_NOT'
  | 'HAVE_TO' | 'NEED_TO' | 'NEED_TO_BE' | 'OUGHT_TO'
  // Possibility
  | 'MAY' | 'MAY_BE' | 'MIGHT' | 'COULD' | 'COULD_BE' | 'WOULD' | 'WOULD_BE'
  // Desire
  | 'WANT' | 'WANT_TO' | 'WANT_NOT' | 'NEED' | 'NEED_NOT'
  | 'LIKE' | 'LIKE_TO' | 'LIKE_NOT' | 'LOVE' | 'LOVE_TO' | 'LOVE_NOT'
  | 'HATE' | 'PREFER' | 'ENJOY'
  // Relationships
  | 'KNOWS' | 'WITH' | 'BELONGS_TO' | 'ROLE'
  // Actions
  | 'MAKE' | 'GIVE' | 'TAKE' | 'GET' | 'FEEL' | 'THINK' | 'SAY' | 'MEAN'
  // Spatial
  | 'CONTAINS' | 'IN' | 'AT' | 'FROM'
  // Meta-structural
  | 'NEGATES' | 'CORRECTS'
  // SRG traditional
  | 'syntactic' | 'semantic';

export interface PositionNode {
  word: string;
  positions: number[];      // All corpus positions where this word appears
  layer: number;            // Word length (THE WORD's layer concept)
  primitiveType?: string;   // If this is a semantic primitive
  interferenceStrength: Map<string, number>; // word -> interference amplitude
}

export interface RelationalEdge {
  source: string;
  target: string;
  type: RelationType;
  positions: number[];      // Corpus positions where this relation was observed
  interferenceAmplitude: number; // Wave amplitude between these positions
  accessedAt: number[];     // Timestamps (SRG's temporal tracking)
  strength: number;         // Combined score
  modifiers?: string[];     // Prepositional modifiers (IN:system, WITH:consciousness)
}

export interface InterferenceHit {
  position: number;
  score: number;
  words: string[];
  distances: Map<string, number>; // word -> distance from position
}

export interface TraversalPath {
  nodes: string[];
  edges: RelationalEdge[];
  totalInterference: number;
  relationChain: RelationType[];
}

export interface EntityProfile {
  word: string;
  identity: RelationalEdge[];      // IS, IS_A, IS_NOT
  was: RelationalEdge[];           // WAS, USED_TO, HAD_BEEN
  has: RelationalEdge[];           // HAS, OWNS, POSSESSIVE
  wants: RelationalEdge[];         // WANT, LIKE, LOVE, NEED, PREFER, ENJOY
  can: RelationalEdge[];           // CAN, ABLE_TO
  must: RelationalEdge[];          // MUST, SHOULD, HAVE_TO, OUGHT_TO
  might: RelationalEdge[];         // MAY, MIGHT, COULD, WOULD
  will: RelationalEdge[];          // WILL, GOING_TO
  relationships: RelationalEdge[]; // KNOWS, WITH, BELONGS_TO, ROLE, LOVE (person)
  actions: RelationalEdge[];       // MAKE, GIVE, TAKE, GET, FEEL, THINK
  location: RelationalEdge[];      // IN, AT, FROM
}

export interface HybridQueryResult {
  generated: string;
  interferenceHit: InterferenceHit;
  paths: TraversalPath[];
  entityProfiles: Map<string, EntityProfile>;
  trace: {
    word: string;
    positions: number;
    synonyms: string[];
    expanded: boolean;
  }[];
}

// ============================================================================
// POSITION HASH CALCULATION (from THE WORD)
// ============================================================================

export class PositionHasher {
  /**
   * Calculate position hash for a word.
   * In THE WORD, positions ARE the embeddings - deterministic addressing.
   */
  static hash(word: string): number {
    // Simple hash: sum of character codes * prime multipliers
    let hash = 0;
    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
    for (let i = 0; i < word.length; i++) {
      const char = word.charCodeAt(i);
      const prime = primes[i % primes.length];
      hash += char * prime;
    }
    return hash;
  }

  /**
   * Calculate interference amplitude between two positions.
   * Closer positions = constructive interference (high amplitude)
   * Distant positions = destructive interference (low amplitude)
   */
  static calculateInterference(pos1: number, pos2: number, window: number = 20): number {
    const distance = Math.abs(pos1 - pos2);
    if (distance > window) return 0;
    
    // Wave interference: amplitude decays with distance
    // Using cosine similarity in position space
    const phase = (Math.PI * distance) / window;
    const amplitude = Math.cos(phase);
    
    // Normalize to 0-1 range
    return (amplitude + 1) / 2;
  }

  /**
   * Find interference points where multiple words co-occur within window.
   * This is THE WORD's core mechanism - position-based pattern matching.
   */
  static findInterference(
    wordPositions: Map<string, number[]>,
    window: number = 20
  ): InterferenceHit[] {
    if (wordPositions.size === 0) return [];
    
    // Get anchor word (smallest position set)
    let anchorWord = '';
    let minSize = Infinity;
    for (const [word, positions] of wordPositions) {
      if (positions.length < minSize) {
        minSize = positions.length;
        anchorWord = word;
      }
    }
    
    const anchorPositions = wordPositions.get(anchorWord)!;
    const otherWords = Array.from(wordPositions.keys()).filter(w => w !== anchorWord);
    
    const hits: InterferenceHit[] = [];
    
    for (const pos of anchorPositions) {
      let allMatch = true;
      const distances = new Map<string, number>();
      distances.set(anchorWord, 0);
      
      for (const word of otherWords) {
        const positions = wordPositions.get(word)!;
        let found = false;
        let minDistance = Infinity;
        
        for (let offset = -window; offset <= window; offset++) {
          if (positions.includes(pos + offset)) {
            found = true;
            minDistance = Math.min(minDistance, Math.abs(offset));
          }
        }
        
        if (!found) {
          allMatch = false;
          break;
        }
        distances.set(word, minDistance);
      }
      
      if (allMatch) {
        // Score based on total distance (closer = better)
        const totalDistance = Array.from(distances.values()).reduce((a, b) => a + b, 0);
        const score = 1.0 / (1.0 + totalDistance / wordPositions.size);
        
        hits.push({
          position: pos,
          score,
          words: Array.from(wordPositions.keys()),
          distances
        });
      }
    }
    
    // Sort by score (best first)
    hits.sort((a, b) => b.score - a.score);
    return hits;
  }
}

// ============================================================================
// SYNSET SYSTEM (from THE WORD)
// ============================================================================

export class Synsets {
  private wordToSynset: Map<string, number> = new Map();
  private synsetToWords: Map<number, Set<string>> = new Map();
  private nextId: number = 0;

  addGroup(words: string[]): void {
    const cleanWords = words.map(w => w.toLowerCase().trim()).filter(w => w.length > 0);
    if (cleanWords.length < 2) return;

    const synsetId = this.nextId++;
    
    for (const word of cleanWords) {
      if (!this.wordToSynset.has(word)) {
        this.wordToSynset.set(word, synsetId);
        if (!this.synsetToWords.has(synsetId)) {
          this.synsetToWords.set(synsetId, new Set());
        }
        this.synsetToWords.get(synsetId)!.add(word);
      }
    }
  }

  getSynonyms(word: string): Set<string> {
    word = word.toLowerCase();
    if (!this.wordToSynset.has(word)) {
      return new Set([word]);
    }
    const synsetId = this.wordToSynset.get(word)!;
    return new Set(this.synsetToWords.get(synsetId) || [word]);
  }

  expandWords(words: string[]): Set<string> {
    const expanded = new Set<string>();
    for (const word of words) {
      const synonyms = this.getSynonyms(word.toLowerCase());
      for (const syn of synonyms) {
        expanded.add(syn);
      }
    }
    return expanded;
  }
}

// ============================================================================
// HYBRID GRAPH ENGINE
// ============================================================================

export class SRGWordHybrid {
  private nodes: Map<string, PositionNode> = new Map();
  private edges: Map<string, RelationalEdge> = new Map();
  private corpus: string[] = [];  // Token sequence
  private synsets: Synsets = new Synsets();
  
  // Meta-relational tracking
  private negations: Array<{source: number, target: number}> = [];
  private suppressedPositions: Set<number> = new Set();

  /**
   * Ingest text into the hybrid system.
   * Builds both position index AND relational graph.
   * Made async to prevent UI blocking on large texts.
   */
  async ingest(text: string): Promise<void> {
    const tokens = text.toLowerCase()
      .replace(/[.,!?;:]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 0);

    const startPos = this.corpus.length;
    // Don't use spread operator with large arrays - causes stack overflow
    for (const token of tokens) {
      this.corpus.push(token);
    }

    // Index positions for each word
    for (let i = 0; i < tokens.length; i++) {
      const word = tokens[i];
      const position = startPos + i;

      if (!this.nodes.has(word)) {
        this.nodes.set(word, {
          word,
          positions: [],
          layer: word.length,
          interferenceStrength: new Map()
        });
      }

      this.nodes.get(word)!.positions.push(position);
    }

    // Extract relations and build edges (skip for very large texts to prevent freezing)
    if (tokens.length < 10000) {
      this.extractRelations(tokens, startPos);
    } else {
      console.log(`[Hybrid] Skipping relation extraction for large text (${tokens.length} tokens)`);
    }

    // Build syntactic edges (sequential)
    for (let i = 0; i < tokens.length - 1; i++) {
      const word1 = tokens[i];
      const word2 = tokens[i + 1];
      const pos1 = startPos + i;
      const pos2 = startPos + i + 1;

      this.addEdge(word1, word2, 'syntactic', pos1);
    }

    // Calculate interference strengths between co-occurring words
    await this.updateInterferenceStrengths(tokens, startPos);
  }

  /**
   * Extract relational predicates from text.
   * Port of THE WORD's Relations extraction.
   */
  private extractRelations(tokens: string[], startPos: number): void {
    const text = tokens.join(' ');
    
    // Relation patterns (subset of THE WORD's full pattern set)
    const patterns: Array<{regex: RegExp, type: RelationType}> = [
      // Identity
      { regex: /(\w+)\s+(?:am|is)\s+a\s+(\w+)/g, type: 'IS_A' },
      { regex: /(\w+)\s+(?:am|is)\s+(\w+)/g, type: 'IS' },
      { regex: /(\w+)\s+are\s+(\w+)/g, type: 'IS' },
      
      // Possession
      { regex: /(\w+)\s+(?:have|has)\s+a\s+(\w+)/g, type: 'HAS_A' },
      { regex: /(\w+)\s+(?:have|has)\s+(\w+)/g, type: 'HAS' },
      
      // Desire
      { regex: /(\w+)\s+(?:want|wants)\s+to\s+(\w+)/g, type: 'WANT_TO' },
      { regex: /(\w+)\s+(?:want|wants)\s+(\w+)/g, type: 'WANT' },
      { regex: /(\w+)\s+(?:like|likes)\s+(\w+)/g, type: 'LIKE' },
      { regex: /(\w+)\s+(?:love|loves)\s+(\w+)/g, type: 'LOVE' },
      
      // Capability
      { regex: /(\w+)\s+can\s+(\w+)/g, type: 'CAN' },
      { regex: /(\w+)\s+(?:is|are)\s+able\s+to\s+(\w+)/g, type: 'ABLE_TO' },
      
      // Obligation
      { regex: /(\w+)\s+must\s+(\w+)/g, type: 'MUST' },
      { regex: /(\w+)\s+should\s+(\w+)/g, type: 'SHOULD' },
      
      // Negations
      { regex: /(\w+)\s+is\s+not\s+(\w+)/g, type: 'IS_NOT' },
      { regex: /(\w+)\s+does\s+not\s+have\s+(\w+)/g, type: 'HAS_NOT' },
      { regex: /(\w+)\s+cannot\s+(\w+)/g, type: 'CAN_NOT' },
    ];
    
    for (const {regex, type} of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const subject = match[1];
        const object = match[2];
        
        // Find approximate position in token sequence
        const matchStart = match.index;
        const approxTokenPos = text.substring(0, matchStart).split(/\s+/).length;
        const position = startPos + approxTokenPos;
        
        this.addEdge(subject, object, type, position);
      }
    }
  }

  /**
   * Add or update an edge in the graph.
   */
  private addEdge(
    source: string,
    target: string,
    type: RelationType,
    position: number,
    modifiers?: string[]
  ): void {
    const edgeKey = `${source}-${target}-${type}`;
    
    if (this.edges.has(edgeKey)) {
      const edge = this.edges.get(edgeKey)!;
      edge.positions.push(position);
      edge.accessedAt.push(Date.now());
      edge.strength = edge.positions.length;
      
      // Recalculate interference amplitude
      if (edge.positions.length >= 2) {
        const avgAmplitude = this.calculateAverageInterference(edge.positions);
        edge.interferenceAmplitude = avgAmplitude;
      }
    } else {
      const sourceNode = this.nodes.get(source);
      const targetNode = this.nodes.get(target);
      
      // Calculate initial interference amplitude
      let amplitude = 0;
      if (sourceNode && targetNode && 
          sourceNode.positions.length > 0 && 
          targetNode.positions.length > 0) {
        amplitude = PositionHasher.calculateInterference(
          sourceNode.positions[0],
          targetNode.positions[0]
        );
      }
      
      this.edges.set(edgeKey, {
        source,
        target,
        type,
        positions: [position],
        interferenceAmplitude: amplitude,
        accessedAt: [Date.now()],
        strength: 1,
        modifiers
      });
    }
  }

  /**
   * Calculate average interference amplitude across multiple position pairs.
   */
  private calculateAverageInterference(positions: number[]): number {
    if (positions.length < 2) return 0;
    
    let totalAmplitude = 0;
    let count = 0;
    
    for (let i = 0; i < positions.length - 1; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        totalAmplitude += PositionHasher.calculateInterference(positions[i], positions[j]);
        count++;
      }
    }
    
    return count > 0 ? totalAmplitude / count : 0;
  }

  /**
   * Update interference strengths between words based on co-occurrence.
   * Async with periodic yields to prevent UI blocking on large texts.
   */
  private async updateInterferenceStrengths(tokens: string[], startPos: number): Promise<void> {
    const window = 20;
    const yieldEvery = 5000; // Yield to browser every 5000 iterations
    let iterations = 0;

    for (let i = 0; i < tokens.length; i++) {
      const word1 = tokens[i];
      const pos1 = startPos + i;

      for (let j = i + 1; j < Math.min(tokens.length, i + window); j++) {
        const word2 = tokens[j];
        const pos2 = startPos + j;

        const amplitude = PositionHasher.calculateInterference(pos1, pos2, window);

        const node1 = this.nodes.get(word1)!;
        const node2 = this.nodes.get(word2)!;

        // Update bidirectional interference
        const current1 = node1.interferenceStrength.get(word2) || 0;
        node1.interferenceStrength.set(word2, current1 + amplitude);

        const current2 = node2.interferenceStrength.get(word1) || 0;
        node2.interferenceStrength.set(word1, current2 + amplitude);

        // Yield to browser periodically to prevent freezing
        iterations++;
        if (iterations % yieldEvery === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    }
  }

  /**
   * Query the hybrid system.
   * Combines interference detection with graph traversal.
   */
  query(
    prompt: string,
    options: {
      window?: number;
      maxDepth?: number;
      useSynsets?: boolean;
      useRelations?: boolean;
      generateLength?: number;
    } = {}
  ): HybridQueryResult | null {
    const {
      window = 20,
      maxDepth = 3,
      useSynsets = true,
      useRelations = true,
      generateLength = 40
    } = options;

    // Parse query
    const words = prompt.toLowerCase()
      .replace(/[.,!?;:]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 0);
    
    if (words.length === 0) return null;

    // Expand via synsets if enabled
    const queryWords = useSynsets ? Array.from(this.synsets.expandWords(words)) : words;

    // Build trace
    const trace = words.map(word => ({
      word,
      positions: this.nodes.get(word)?.positions.length || 0,
      synonyms: Array.from(this.synsets.getSynonyms(word)),
      expanded: useSynsets && this.synsets.getSynonyms(word).size > 1
    }));

    // Find interference points
    const wordPositions = new Map<string, number[]>();
    for (const word of queryWords) {
      const node = this.nodes.get(word);
      if (node) {
        // Filter out suppressed positions
        const validPositions = node.positions.filter(p => !this.suppressedPositions.has(p));
        if (validPositions.length > 0) {
          wordPositions.set(word, validPositions);
        }
      }
    }

    const hits = PositionHasher.findInterference(wordPositions, window);
    if (hits.length === 0) return null;

    const bestHit = hits[0];

    // Traverse graph from query words if relations enabled
    let paths: TraversalPath[] = [];
    let entityProfiles = new Map<string, EntityProfile>();

    if (useRelations) {
      paths = this.traverseRelationalGraph(queryWords, maxDepth);
      
      // Build entity profiles for query words
      for (const word of queryWords) {
        const profile = this.buildEntityProfile(word);
        if (profile) {
          entityProfiles.set(word, profile);
        }
      }
    }

    // Generate from interference point
    const generated = this.generateFromPosition(bestHit.position, generateLength, paths);

    return {
      generated,
      interferenceHit: bestHit,
      paths,
      entityProfiles,
      trace
    };
  }

  /**
   * Traverse the relational graph from query words.
   * Returns paths through the graph weighted by interference + relation strength.
   */
  private traverseRelationalGraph(startWords: string[], maxDepth: number): TraversalPath[] {
    const paths: TraversalPath[] = [];
    const visited = new Set<string>();

    for (const startWord of startWords) {
      if (!this.nodes.has(startWord)) continue;

      const queue: Array<{
        word: string;
        depth: number;
        path: string[];
        edges: RelationalEdge[];
        interference: number;
      }> = [{
        word: startWord,
        depth: 0,
        path: [startWord],
        edges: [],
        interference: 0
      }];

      while (queue.length > 0) {
        const current = queue.shift()!;
        
        if (current.depth >= maxDepth) {
          // Record this path
          if (current.edges.length > 0) {
            paths.push({
              nodes: current.path,
              edges: current.edges,
              totalInterference: current.interference,
              relationChain: current.edges.map(e => e.type)
            });
          }
          continue;
        }

        // Find outgoing edges
        for (const [edgeKey, edge] of this.edges) {
          if (edge.source === current.word && !visited.has(edge.target)) {
            // Calculate combined score: interference + temporal decay + relation strength
            const now = Date.now();
            const recency = edge.accessedAt.length > 0 
              ? Math.exp(-(now - edge.accessedAt[edge.accessedAt.length - 1]) / (7 * 24 * 60 * 60 * 1000))
              : 0.5;
            
            const combinedScore = (
              edge.interferenceAmplitude * 0.4 +
              recency * 0.3 +
              (edge.strength / 10) * 0.3
            );

            queue.push({
              word: edge.target,
              depth: current.depth + 1,
              path: [...current.path, edge.target],
              edges: [...current.edges, edge],
              interference: current.interference + combinedScore
            });
          }
        }

        visited.add(current.word);
      }
    }

    // Sort paths by total interference (best first)
    paths.sort((a, b) => b.totalInterference - a.totalInterference);
    
    return paths.slice(0, 20); // Top 20 paths
  }

  /**
   * Build entity profile (THE WORD's concierge notes).
   */
  private buildEntityProfile(word: string): EntityProfile | null {
    if (!this.nodes.has(word)) return null;

    const profile: EntityProfile = {
      word,
      identity: [],
      was: [],
      has: [],
      wants: [],
      can: [],
      must: [],
      might: [],
      will: [],
      relationships: [],
      actions: [],
      location: []
    };

    // Categorize edges involving this word
    for (const edge of this.edges.values()) {
      if (edge.source !== word && edge.target !== word) continue;

      const category = this.categorizeRelation(edge.type);
      if (category && (profile as any)[category]) {
        (profile as any)[category].push(edge);
      }
    }

    return profile;
  }

  /**
   * Categorize relation type into entity profile category.
   */
  private categorizeRelation(type: RelationType): keyof EntityProfile | null {
    const map: Partial<Record<RelationType, keyof EntityProfile>> = {
      'IS': 'identity', 'IS_A': 'identity', 'IS_NOT': 'identity', 'IS_NOT_A': 'identity',
      'WAS': 'was', 'WAS_A': 'was', 'WAS_NOT': 'was', 'USED_TO': 'was',
      'HAS': 'has', 'HAS_A': 'has', 'HAS_NOT': 'has', 'OWNS': 'has',
      'WANT': 'wants', 'WANT_TO': 'wants', 'LIKE': 'wants', 'LOVE': 'wants',
      'CAN': 'can', 'CAN_BE': 'can', 'ABLE_TO': 'can',
      'MUST': 'must', 'SHOULD': 'must', 'HAVE_TO': 'must',
      'MAY': 'might', 'MIGHT': 'might', 'COULD': 'might',
      'WILL': 'will', 'WILL_BE': 'will', 'GOING_TO': 'will',
      'KNOWS': 'relationships', 'WITH': 'relationships',
      'MAKE': 'actions', 'GIVE': 'actions', 'TAKE': 'actions',
      'IN': 'location', 'AT': 'location', 'FROM': 'location'
    };
    
    return map[type] || null;
  }

  /**
   * Generate text from a position using relational paths as constraints.
   */
  private generateFromPosition(
    position: number,
    length: number,
    paths: TraversalPath[]
  ): string {
    // Find sentence boundary before position
    let startPos = position;
    const sentenceMarkers = new Set(['.', '?', '!']);
    
    for (let i = Math.max(0, position - 20); i < position; i++) {
      if (sentenceMarkers.has(this.corpus[i])) {
        startPos = i + 1;
        break;
      }
    }

    // Generate from sentence start
    const endPos = Math.min(this.corpus.length, startPos + length);
    let tokens = this.corpus.slice(startPos, endPos);

    // If we have relational paths, use them to guide generation
    if (paths.length > 0) {
      // Collect valid words from paths
      const validWords = new Set<string>();
      for (const path of paths) {
        for (const word of path.nodes) {
          validWords.add(word);
        }
      }

      // Filter tokens to prioritize words in relational paths
      // But keep structural words always
      const structuralWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
        'and', 'or', 'but', 'not', 'so', 'if', 'then'
      ]);

      tokens = tokens.filter(token => 
        structuralWords.has(token) || validWords.has(token)
      );

      // If filtering removed too many tokens, fall back to unfiltered
      if (tokens.length < 5) {
        tokens = this.corpus.slice(startPos, endPos);
      }
    }

    return tokens.join(' ');
  }

  /**
   * Add synonym group.
   */
  addSynonyms(words: string[]): void {
    this.synsets.addGroup(words);
  }

  /**
   * Suppress positions (for negation handling).
   */
  suppressPositions(positions: number[]): void {
    for (const pos of positions) {
      this.suppressedPositions.add(pos);
    }
  }

  /**
   * REVERSE INTERFERENCE: Given target code, infer the query that would generate it
   * This enables self-supervised learning and bidirectional code understanding
   * 
   * THEORY: Wave interference is bidirectional
   * - Forward: Query → interference pattern → code output
   * - Backward: Code → inverse interference → what query WOULD produce this
   */
  reverseInterfere(targetCode: string): { query: string; confidence: number } {
    // 1. Parse code into semantic tokens
    const tokens = this.tokenize(targetCode);
    
    // 2. Get corpus positions for each token
    const positions: Map<string, number[]> = new Map();
    for (const token of tokens) {
      const node = this.nodes.get(token);
      if (node) {
        positions.set(token, [...node.positions]); // Copy to avoid mutation
      }
    }
    
    if (positions.size === 0) {
      return { query: '', confidence: 0 };
    }
    
    // 3. Find semantic neighborhood (centroid of positions)
    const centroid = this.computeCentroid(positions);
    
    // 4. Find query words that would activate this region
    const candidates = this.findWordsNearPosition(centroid, 20);
    
    // 5. Score each candidate by interference strength
    let bestQuery = "";
    let bestScore = 0;
    
    for (const candidateWord of candidates) {
      const interferenceResult = this.query(candidateWord, { 
        window: 20,
        maxDepth: 2,
        useRelations: false 
      });
      
      if (interferenceResult && this.overlapsWith(interferenceResult, targetCode)) {
        const score = interferenceResult.interferenceHit.score;
        if (score > bestScore) {
          bestScore = score;
          bestQuery = candidateWord;
        }
      }
    }
    
    return { query: bestQuery, confidence: bestScore };
  }

  /**
   * Tokenize code into semantic tokens
   */
  private tokenize(code: string): string[] {
    return code
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter(token => token.length > 1); // Filter out single characters
  }

  /**
   * Compute centroid of position clusters
   */
  private computeCentroid(positions: Map<string, number[]>): number {
    let total = 0;
    let count = 0;
    
    for (const posArray of positions.values()) {
      for (const pos of posArray) {
        total += pos;
        count++;
      }
    }
    
    return count > 0 ? Math.round(total / count) : 0;
  }

  /**
   * Find words near a position using position hash proximity
   */
  private findWordsNearPosition(position: number, window: number = 20): string[] {
    const candidates = new Set<string>();
    
    // Check all nodes for proximity to the centroid
    for (const [word, node] of this.nodes.entries()) {
      for (const nodePos of node.positions) {
        if (Math.abs(nodePos - position) <= window) {
          candidates.add(word);
          // Also add synonyms for semantic expansion
          const synonyms = this.synsets.getSynonyms(word);
          for (const syn of synonyms) {
            candidates.add(syn);
          }
          break; // Found a match, no need to check other positions for this word
        }
      }
    }
    
    return Array.from(candidates);
  }

  /**
   * Check if interference result overlaps with target code
   */
  private overlapsWith(result: HybridQueryResult, targetCode: string): boolean {
    const targetTokens = this.tokenize(targetCode);
    const generatedTokens = this.tokenize(result.generated);
    
    // Calculate overlap ratio
    const overlapCount = targetTokens.filter(token => 
      generatedTokens.includes(token)
    ).length;
    
    return overlapCount > 0;
  }

  /**
   * Get statistics.
   */
  getStats() {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      corpusSize: this.corpus.length,
      suppressedPositions: this.suppressedPositions.size,
      synsetGroups: this.synsets['synsetToWords'].size
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default SRGWordHybrid;
