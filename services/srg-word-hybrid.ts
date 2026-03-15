/**
 * SRG-WORD HYBRID — FIXED SYNTHESIS PIPELINE
 * ============================================
 * Position-hash interference patterns + Graph traversal + Relational predicates
 *
 * CHANGES FROM ORIGINAL:
 * 1. generateFromPosition() replaced with synthesizeFromTriples() as primary output
 * 2. Added coherence scoring (port of Rust word_engine.rs:1400-1486)
 * 3. Added subject aggregation + predicate phrase building (port of dada_engine.rs:1354-1466)
 * 4. Added function word / content word distinction
 * 5. Fixed punctuation handling in ingest() — no longer strips sentence boundaries
 * 6. Multi-word phrase capture in relation extraction
 * 7. Greedy set-cover triple selection (port of word_engine.rs:1076-1106)
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type RelationType =
  | 'IS' | 'IS_A' | 'IS_NOT' | 'IS_NOT_A'
  | 'WAS' | 'WAS_A' | 'WAS_NOT' | 'WILL_BE' | 'WILL' | 'WILL_NOT'
  | 'USED_TO' | 'USED_TO_BE' | 'HAD_BEEN' | 'GOING_TO'
  | 'HAS' | 'HAS_A' | 'HAS_NOT' | 'HAD' | 'OWNS' | 'POSSESSIVE'
  | 'CAN' | 'CAN_BE' | 'CAN_NOT' | 'ABLE_TO'
  | 'MUST' | 'MUST_BE' | 'MUST_NOT' | 'SHOULD' | 'SHOULD_BE' | 'SHOULD_NOT'
  | 'HAVE_TO' | 'NEED_TO' | 'NEED_TO_BE' | 'OUGHT_TO'
  | 'MAY' | 'MAY_BE' | 'MIGHT' | 'COULD' | 'COULD_BE' | 'WOULD' | 'WOULD_BE'
  | 'WANT' | 'WANT_TO' | 'WANT_NOT' | 'NEED' | 'NEED_NOT'
  | 'LIKE' | 'LIKE_TO' | 'LIKE_NOT' | 'LOVE' | 'LOVE_TO' | 'LOVE_NOT'
  | 'HATE' | 'PREFER' | 'ENJOY'
  | 'KNOWS' | 'WITH' | 'BELONGS_TO' | 'ROLE'
  | 'MAKE' | 'GIVE' | 'TAKE' | 'GET' | 'FEEL' | 'THINK' | 'SAY' | 'MEAN'
  | 'CONTAINS' | 'IN' | 'AT' | 'FROM'
  | 'NEGATES' | 'CORRECTS'
  | 'syntactic' | 'semantic';

export interface PositionNode {
  word: string;
  positions: number[];
  layer: number;
  primitiveType?: string;
  interferenceStrength: Map<string, number>;
}

export interface RelationalEdge {
  source: string;
  target: string;
  type: RelationType;
  positions: number[];
  interferenceAmplitude: number;
  accessedAt: number[];
  strength: number;
  modifiers?: string[];
}

export interface InterferenceHit {
  position: number;
  score: number;
  words: string[];
  distances: Map<string, number>;
}

export interface TraversalPath {
  nodes: string[];
  edges: RelationalEdge[];
  totalInterference: number;
  relationChain: RelationType[];
}

export interface EntityProfile {
  word: string;
  identity: RelationalEdge[];
  was: RelationalEdge[];
  has: RelationalEdge[];
  wants: RelationalEdge[];
  can: RelationalEdge[];
  must: RelationalEdge[];
  might: RelationalEdge[];
  will: RelationalEdge[];
  relationships: RelationalEdge[];
  actions: RelationalEdge[];
  location: RelationalEdge[];
}

/** A scored candidate triple for synthesis. */
interface CandidateTriple {
  subject: string;
  relation: string;
  object: string;
  weight: number;
  source: 'relation_index' | 'interference' | 'positional';
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
// CONSTANTS — Function words vs content words
// ============================================================================

/**
 * Function words: structural glue that drives relation extraction
 * but should NOT participate in content matching or interference scoring.
 * Port of word_engine.rs function_words + operators sets.
 */
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'of', 'in', 'on', 'to', 'for', 'and', 'or', 'but', 'it', 'with',
  'as', 'by', 'at', 'from', 'into', 'through', 'about', 'between',
  'what', 'who', 'where', 'when', 'how', 'why', 'which',
  'do', 'does', 'did', 'if', 'then', 'so', 'than', 'too', 'very',
  'just', 'also', 'not', 'no', 'yes', 'up', 'out', 'off',
  'all', 'each', 'every', 'any', 'some', 'many', 'much', 'few',
  'more', 'most', 'other', 'such', 'only', 'own', 'same',
  'there', 'here', 'now', 'still', 'already', 'even',
]);

/** Operators: words that serve as relation pivots (verbs, modals, copulas). */
const OPERATORS = new Set([
  'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had',
  'does', 'do', 'did',
  'can', 'could', 'will', 'would', 'shall', 'should',
  'may', 'might', 'must',
  'want', 'wants', 'need', 'needs', 'like', 'likes', 'love', 'loves',
]);

/** Combined set for quick "is this a content word?" checks. */
const NON_CONTENT = new Set([...FUNCTION_WORDS, ...OPERATORS]);

// ============================================================================
// POSITION HASH CALCULATION (from THE WORD)
// ============================================================================

export class PositionHasher {
  static hash(word: string): number {
    let hash = 0;
    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
    for (let i = 0; i < word.length; i++) {
      hash += word.charCodeAt(i) * primes[i % primes.length];
    }
    return hash;
  }

  static calculateInterference(pos1: number, pos2: number, window: number = 20): number {
    const distance = Math.abs(pos1 - pos2);
    if (distance > window) return 0;
    const phase = (Math.PI * distance) / window;
    return (Math.cos(phase) + 1) / 2;
  }

  static findInterference(
    wordPositions: Map<string, number[]>,
    window: number = 20
  ): InterferenceHit[] {
    if (wordPositions.size === 0) return [];

    // Use word with fewest positions as anchor
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

    // Build Sets for O(1) lookup instead of Array.includes O(n)
    const positionSets = new Map<string, Set<number>>();
    for (const word of otherWords) {
      positionSets.set(word, new Set(wordPositions.get(word)!));
    }

    for (const pos of anchorPositions) {
      let allMatch = true;
      const distances = new Map<string, number>();
      distances.set(anchorWord, 0);

      for (const word of otherWords) {
        const posSet = positionSets.get(word)!;
        let found = false;
        let minDistance = Infinity;

        for (let offset = 0; offset <= window; offset++) {
          if (posSet.has(pos + offset)) {
            found = true;
            minDistance = Math.min(minDistance, offset);
            break; // First match is good enough for positive direction
          }
          if (offset > 0 && posSet.has(pos - offset)) {
            found = true;
            minDistance = Math.min(minDistance, offset);
            break;
          }
        }

        if (!found) { allMatch = false; break; }
        distances.set(word, minDistance);
      }

      if (allMatch) {
        const totalDistance = Array.from(distances.values()).reduce((a, b) => a + b, 0);
        const score = 1.0 / (1.0 + totalDistance / wordPositions.size);
        hits.push({ position: pos, score, words: Array.from(wordPositions.keys()), distances });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return hits;
  }
}

// ============================================================================
// SYNSET SYSTEM
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
    if (!this.wordToSynset.has(word)) return new Set([word]);
    const synsetId = this.wordToSynset.get(word)!;
    return new Set(this.synsetToWords.get(synsetId) || [word]);
  }

  expandWords(words: string[]): Set<string> {
    const expanded = new Set<string>();
    for (const word of words) {
      for (const syn of this.getSynonyms(word.toLowerCase())) {
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
  private corpus: string[] = [];
  /**
   * Parallel array: the raw token (with punctuation) for each corpus position.
   * corpus[] holds the lowercased/cleaned version for matching;
   * corpusRaw[] holds the original for sentence-boundary detection.
   */
  private corpusRaw: string[] = [];
  private synsets: Synsets = new Synsets();
  private negations: Array<{source: number, target: number}> = [];
  private suppressedPositions: Set<number> = new Set();

  // ── Subject / Object index for O(1) triple lookup ──
  // Maps a word → list of edge keys where that word is the source or target.
  private subjectIndex: Map<string, string[]> = new Map();
  private objectIndex: Map<string, string[]> = new Map();

  // =========================================================================
  // INGESTION
  // =========================================================================

  /**
   * Ingest text into the hybrid system.
   *
   * FIX: No longer strips punctuation before tokenizing. Punctuation is stored
   * in corpusRaw[] for sentence-boundary detection and stripped only for the
   * clean token used in matching.
   */
  async ingest(text: string): Promise<void> {
    // Split on whitespace, preserving punctuation in raw tokens
    const rawTokens = text.split(/\s+/).filter(t => t.length > 0);
    const startPos = this.corpus.length;

    for (let i = 0; i < rawTokens.length; i++) {
      const raw = rawTokens[i];
      // Clean version: lowercase, strip trailing/leading punctuation
      const clean = raw.toLowerCase().replace(/^[.,!?;:"'()\-]+|[.,!?;:"'()\-]+$/g, '');
      this.corpusRaw.push(raw.toLowerCase());
      this.corpus.push(clean);

      if (clean.length === 0) continue;

      const position = startPos + i;
      if (!this.nodes.has(clean)) {
        this.nodes.set(clean, {
          word: clean,
          positions: [],
          layer: clean.length,
          interferenceStrength: new Map()
        });
      }
      this.nodes.get(clean)!.positions.push(position);
    }

    // Extract relations with multi-word phrase support
    if (rawTokens.length < 10000) {
      this.extractRelations(
        rawTokens.map(t => t.toLowerCase().replace(/^[.,!?;:"'()\-]+|[.,!?;:"'()\-]+$/g, '')),
        startPos
      );
    }

    // Build syntactic edges
    for (let i = 0; i < rawTokens.length - 1; i++) {
      const w1 = this.corpus[startPos + i];
      const w2 = this.corpus[startPos + i + 1];
      if (w1 && w2) this.addEdge(w1, w2, 'syntactic', startPos + i);
    }

    await this.updateInterferenceStrengths(
      rawTokens.map(t => t.toLowerCase().replace(/^[.,!?;:"'()\-]+|[.,!?;:"'()\-]+$/g, '')),
      startPos
    );
  }

  /**
   * Extract relational predicates from text.
   *
   * FIX: Captures multi-word phrases for subjects and objects
   * (up to 4 words for subject, up to 6 for object) instead of single \w+.
   */
  private extractRelations(tokens: string[], startPos: number): void {
    const text = tokens.join(' ');

    // Multi-word capture patterns: (.+?) is non-greedy multi-word
    // We use word-boundary anchored patterns to prevent runaway matches
    const patterns: Array<{regex: RegExp, type: RelationType}> = [
      // Identity — "X is a Y", "X is Y", "X are Y"
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:am|is)\s+not\s+(?:a\s+)?((?:\w+\s+){0,5}\w+)/g, type: 'IS_NOT' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:am|is)\s+a\s+((?:\w+\s+){0,5}\w+)/g, type: 'IS_A' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:am|is)\s+((?:\w+\s+){0,5}\w+)/g, type: 'IS' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+are\s+((?:\w+\s+){0,5}\w+)/g, type: 'IS' },

      // Temporal — "X was Y", "X will be Y"
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+was\s+(?:a\s+)?((?:\w+\s+){0,5}\w+)/g, type: 'WAS' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+will\s+be\s+((?:\w+\s+){0,5}\w+)/g, type: 'WILL_BE' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+will\s+((?:\w+\s+){0,5}\w+)/g, type: 'WILL' },

      // Possession — "X has Y", "X has a Y"
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+does\s+not\s+have\s+((?:\w+\s+){0,5}\w+)/g, type: 'HAS_NOT' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:have|has)\s+a\s+((?:\w+\s+){0,5}\w+)/g, type: 'HAS_A' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:have|has)\s+((?:\w+\s+){0,5}\w+)/g, type: 'HAS' },

      // Desire — "X wants to Y", "X wants Y", "X likes Y"
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:want|wants)\s+to\s+((?:\w+\s+){0,5}\w+)/g, type: 'WANT_TO' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:want|wants)\s+((?:\w+\s+){0,5}\w+)/g, type: 'WANT' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:need|needs)\s+to\s+((?:\w+\s+){0,5}\w+)/g, type: 'NEED_TO' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:need|needs)\s+((?:\w+\s+){0,5}\w+)/g, type: 'NEED' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:like|likes)\s+to\s+((?:\w+\s+){0,5}\w+)/g, type: 'LIKE_TO' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:like|likes)\s+((?:\w+\s+){0,5}\w+)/g, type: 'LIKE' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:love|loves)\s+to\s+((?:\w+\s+){0,5}\w+)/g, type: 'LOVE_TO' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:love|loves)\s+((?:\w+\s+){0,5}\w+)/g, type: 'LOVE' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:hate|hates)\s+((?:\w+\s+){0,5}\w+)/g, type: 'HATE' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:prefer|prefers)\s+((?:\w+\s+){0,5}\w+)/g, type: 'PREFER' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:enjoy|enjoys)\s+((?:\w+\s+){0,5}\w+)/g, type: 'ENJOY' },

      // Capability
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+cannot\s+((?:\w+\s+){0,5}\w+)/g, type: 'CAN_NOT' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+can\s+((?:\w+\s+){0,5}\w+)/g, type: 'CAN' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:is|are)\s+able\s+to\s+((?:\w+\s+){0,5}\w+)/g, type: 'ABLE_TO' },

      // Obligation
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+must\s+not\s+((?:\w+\s+){0,5}\w+)/g, type: 'MUST_NOT' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+must\s+((?:\w+\s+){0,5}\w+)/g, type: 'MUST' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+should\s+not\s+((?:\w+\s+){0,5}\w+)/g, type: 'SHOULD_NOT' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+should\s+((?:\w+\s+){0,5}\w+)/g, type: 'SHOULD' },

      // Possibility
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:may|might)\s+((?:\w+\s+){0,5}\w+)/g, type: 'MIGHT' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+could\s+((?:\w+\s+){0,5}\w+)/g, type: 'COULD' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+would\s+((?:\w+\s+){0,5}\w+)/g, type: 'WOULD' },

      // Actions
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:make|makes)\s+((?:\w+\s+){0,5}\w+)/g, type: 'MAKE' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:give|gives)\s+((?:\w+\s+){0,5}\w+)/g, type: 'GIVE' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:think|thinks)\s+((?:\w+\s+){0,5}\w+)/g, type: 'THINK' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:feel|feels)\s+((?:\w+\s+){0,5}\w+)/g, type: 'FEEL' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:know|knows)\s+((?:\w+\s+){0,5}\w+)/g, type: 'KNOWS' },

      // Spatial
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:is|are)\s+in\s+((?:\w+\s+){0,5}\w+)/g, type: 'IN' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:is|are)\s+at\s+((?:\w+\s+){0,5}\w+)/g, type: 'AT' },
      { regex: /\b((?:\w+\s+){0,3}\w+)\s+(?:is|are)\s+from\s+((?:\w+\s+){0,5}\w+)/g, type: 'FROM' },
    ];

    for (const {regex, type} of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const rawSubject = match[1].trim();
        const rawObject = match[2].trim();

        // Strip leading determiners/function words from subject and object
        const subject = this.stripLeadingFunctionWords(rawSubject);
        const object = this.stripLeadingFunctionWords(rawObject);

        if (!subject || !object) continue;

        const matchStart = match.index;
        const approxTokenPos = text.substring(0, matchStart).split(/\s+/).length;
        const position = startPos + approxTokenPos;

        this.addEdge(subject, object, type, position);
      }
    }
  }

  /**
   * Strip leading function words/determiners from a phrase.
   * "the big dog" → "big dog", "a software engineer" → "software engineer"
   */
  private stripLeadingFunctionWords(phrase: string): string {
    const words = phrase.split(/\s+/);
    let start = 0;
    while (start < words.length && (FUNCTION_WORDS.has(words[start]) || words[start].length <= 1)) {
      start++;
    }
    return words.slice(start).join(' ');
  }

  /**
   * Add or update an edge in the graph.
   * FIX: Also maintains subject/object indexes for O(1) lookup.
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

      if (edge.positions.length >= 2) {
        edge.interferenceAmplitude = this.calculateAverageInterference(edge.positions);
      }
    } else {
      const sourceNode = this.nodes.get(source);
      const targetNode = this.nodes.get(target);

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
        source, target, type,
        positions: [position],
        interferenceAmplitude: amplitude,
        accessedAt: [Date.now()],
        strength: 1,
        modifiers
      });

      // Index by source and target for fast lookup
      if (!this.subjectIndex.has(source)) this.subjectIndex.set(source, []);
      this.subjectIndex.get(source)!.push(edgeKey);

      if (!this.objectIndex.has(target)) this.objectIndex.set(target, []);
      this.objectIndex.get(target)!.push(edgeKey);
    }
  }

  private calculateAverageInterference(positions: number[]): number {
    if (positions.length < 2) return 0;
    let total = 0;
    let count = 0;
    for (let i = 0; i < positions.length - 1; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        total += PositionHasher.calculateInterference(positions[i], positions[j]);
        count++;
      }
    }
    return count > 0 ? total / count : 0;
  }

  private async updateInterferenceStrengths(tokens: string[], startPos: number): Promise<void> {
    const window = 20;
    const yieldEvery = 5000;
    let iterations = 0;
    for (let i = 0; i < tokens.length; i++) {
      const word1 = tokens[i];
      if (!word1 || !this.nodes.has(word1)) continue;
      const pos1 = startPos + i;
      for (let j = i + 1; j < Math.min(tokens.length, i + window); j++) {
        const word2 = tokens[j];
        if (!word2 || !this.nodes.has(word2)) continue;
        const pos2 = startPos + j;
        const amplitude = PositionHasher.calculateInterference(pos1, pos2, window);
        const node1 = this.nodes.get(word1)!;
        const node2 = this.nodes.get(word2)!;
        node1.interferenceStrength.set(word2, (node1.interferenceStrength.get(word2) || 0) + amplitude);
        node2.interferenceStrength.set(word1, (node2.interferenceStrength.get(word1) || 0) + amplitude);
        iterations++;
        if (iterations % yieldEvery === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    }
  }

  // =========================================================================
  // QUERY PIPELINE — Complete rewrite
  // =========================================================================

  /**
   * Query the hybrid system.
   *
   * REWRITTEN: Uses triple synthesis instead of corpus slicing.
   *
   * Pipeline (port of Rust word_engine.rs:869-1166):
   *   1. Extract content words (strip function words)
   *   2. Expand via synsets
   *   3. Build semantic cluster (content words + synonyms + 1-hop neighbors)
   *   4. Gather candidate triples from relation index + interference + positional
   *   5. Score each candidate by coherence (how many query words it covers)
   *   6. Filter low-coherence noise
   *   7. Greedy set-cover selection
   *   8. Synthesize from selected triples
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

    // ── 1. Parse + extract content words ──
    const allWords = prompt.toLowerCase()
      .replace(/[.,!?;:]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 0);

    if (allWords.length === 0) return null;

    const contentWords = allWords.filter(w => !NON_CONTENT.has(w) && w.length > 1);
    // If everything was a function word, fall back to all words
    const effectiveContent = contentWords.length > 0 ? contentWords : allWords;

    // ── 2. Expand via synsets ──
    const expandedWords = useSynsets
      ? Array.from(this.synsets.expandWords(effectiveContent))
      : [...effectiveContent];

    // Build trace
    const trace = allWords.map(word => ({
      word,
      positions: this.nodes.get(word)?.positions.length || 0,
      synonyms: Array.from(this.synsets.getSynonyms(word)),
      expanded: useSynsets && this.synsets.getSynonyms(word).size > 1
    }));

    // ── 3. Build semantic cluster ──
    const semanticCluster = this.buildSemanticCluster(expandedWords);

    // ── 4. Find interference point (still used for scoring + fallback) ──
    const wordPositions = new Map<string, number[]>();
    for (const word of expandedWords) {
      const node = this.nodes.get(word);
      if (node) {
        const validPositions = node.positions.filter(p => !this.suppressedPositions.has(p));
        if (validPositions.length > 0) {
          wordPositions.set(word, validPositions);
        }
      }
    }

    const hits = PositionHasher.findInterference(wordPositions, window);
    // We need at least some position data, but can still synthesize without interference
    const bestHit: InterferenceHit = hits.length > 0
      ? hits[0]
      : { position: 0, score: 0, words: expandedWords, distances: new Map() };

    // ── 5. Gather candidate triples from all sources ──
    const pool = this.gatherCandidateTriples(expandedWords, bestHit, window);

    // ── 6. Score by coherence ──
    for (const candidate of pool) {
      candidate.weight *= this.coherenceScore(candidate, effectiveContent, semanticCluster);
    }

    // ── 7. Filter low-coherence noise ──
    const filtered = pool.filter(c => c.weight > 0.1);

    // ── 8. Greedy set-cover selection ──
    const selectedTriples = this.greedySelectTriples(filtered, effectiveContent);

    // ── 9. Build relational paths and entity profiles ──
    let paths: TraversalPath[] = [];
    let entityProfiles = new Map<string, EntityProfile>();
    if (useRelations) {
      paths = this.traverseRelationalGraph(expandedWords, maxDepth);
      for (const word of expandedWords) {
        const profile = this.buildEntityProfile(word);
        if (profile) entityProfiles.set(word, profile);
      }
    }

    // ── 10. Synthesize ──
    let generated: string;
    if (selectedTriples.length > 0) {
      generated = this.synthesizeFromTriples(selectedTriples, effectiveContent);
    } else if (hits.length > 0) {
      // Fallback: extract sentence from corpus around interference point
      generated = this.extractSentenceAtPosition(bestHit.position, generateLength);
    } else {
      generated = 'I need more information about that.';
    }

    return {
      generated,
      interferenceHit: bestHit,
      paths,
      entityProfiles,
      trace
    };
  }

  // =========================================================================
  // CANDIDATE GATHERING (port of word_engine.rs:926-1013)
  // =========================================================================

  /**
   * Gather candidate triples from three sources:
   *   1. Relation index (direct subject/object match) — weight 1.0
   *   2. Interference window (triples near the interference point) — weight 0.5
   *   3. Positional/carousel (scan for operator pivots near query positions) — weight 0.7
   */
  private gatherCandidateTriples(
    queryWords: string[],
    interferenceHit: InterferenceHit,
    window: number
  ): CandidateTriple[] {
    const pool: CandidateTriple[] = [];
    const seenKeys = new Set<string>();

    const addCandidate = (edge: RelationalEdge, weight: number, source: CandidateTriple['source']) => {
      // Skip syntactic/semantic edges — they're structural, not relational
      if (edge.type === 'syntactic' || edge.type === 'semantic') return;
      const key = `${edge.source}|${edge.type}|${edge.target}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      pool.push({
        subject: edge.source,
        relation: edge.type,
        object: edge.target,
        weight: weight * edge.strength,
        source
      });
    };

    // ── Stage 1: Relation index (O(1) lookup) ──
    for (const word of queryWords) {
      const subjectEdges = this.subjectIndex.get(word) || [];
      for (const edgeKey of subjectEdges) {
        const edge = this.edges.get(edgeKey);
        if (edge) addCandidate(edge, 1.0, 'relation_index');
      }
      const objectEdges = this.objectIndex.get(word) || [];
      for (const edgeKey of objectEdges) {
        const edge = this.edges.get(edgeKey);
        if (edge) addCandidate(edge, 1.0, 'relation_index');
      }
    }

    // ── Stage 2: Interference window ──
    if (interferenceHit.score > 0) {
      const lo = Math.max(0, interferenceHit.position - window);
      const hi = Math.min(this.corpus.length, interferenceHit.position + window);
      const windowTokens = new Set<string>();
      for (let i = lo; i < hi; i++) {
        const tok = this.corpus[i];
        if (tok && !NON_CONTENT.has(tok)) windowTokens.add(tok);
      }
      for (const tok of windowTokens) {
        const subjectEdges = this.subjectIndex.get(tok) || [];
        for (const edgeKey of subjectEdges) {
          const edge = this.edges.get(edgeKey);
          if (edge) addCandidate(edge, 0.5, 'interference');
        }
      }
    }

    // ── Stage 3: Positional pivot scan (port of carousel_lookup) ──
    for (const word of queryWords) {
      const node = this.nodes.get(word);
      if (!node) continue;
      // Check up to 10 positions per word
      for (const pos of node.positions.slice(0, 10)) {
        const scanStart = Math.max(0, pos - 3);
        const scanEnd = Math.min(this.corpus.length, pos + 4);
        for (let pivot = scanStart; pivot < scanEnd; pivot++) {
          const pivotToken = this.corpus[pivot];
          if (!OPERATORS.has(pivotToken)) continue;

          // Subject: content words before the operator
          const subjStart = Math.max(0, pivot - 3);
          const subjPhrase = this.extractPhrase(subjStart, pivot);

          // Object: content words after the operator
          const objEnd = Math.min(this.corpus.length, pivot + 4);
          const objPhrase = this.extractPhrase(pivot + 1, objEnd);

          if (subjPhrase && objPhrase) {
            const key = `${subjPhrase}|${pivotToken}|${objPhrase}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              pool.push({
                subject: subjPhrase,
                relation: this.operatorToRelation(pivotToken),
                object: objPhrase,
                weight: 0.7,
                source: 'positional'
              });
            }
          }
        }
      }
    }

    return pool;
  }

  /** Extract content words from a token range, skipping function words. */
  private extractPhrase(start: number, end: number): string {
    if (start >= end || start >= this.corpus.length) return '';
    const bound = Math.min(end, this.corpus.length);
    return this.corpus.slice(start, bound)
      .filter(t => !FUNCTION_WORDS.has(t) && t.length > 0)
      .join(' ');
  }

  /** Map an operator token to a RelationType string. */
  private operatorToRelation(op: string): string {
    const map: Record<string, string> = {
      'is': 'IS', 'are': 'IS', 'am': 'IS', 'was': 'WAS', 'were': 'WAS',
      'has': 'HAS', 'have': 'HAS', 'had': 'HAD',
      'can': 'CAN', 'could': 'COULD', 'will': 'WILL', 'would': 'WOULD',
      'should': 'SHOULD', 'must': 'MUST', 'may': 'MAY', 'might': 'MIGHT',
      'want': 'WANT', 'wants': 'WANT', 'need': 'NEED', 'needs': 'NEED',
      'like': 'LIKE', 'likes': 'LIKE', 'love': 'LOVE', 'loves': 'LOVE',
    };
    return map[op] || op.toUpperCase();
  }

  // =========================================================================
  // SEMANTIC CLUSTER (port of word_engine.rs:1351-1392)
  // =========================================================================

  /**
   * Build a semantic cluster: expanded words + synonyms + 1-hop neighbors.
   * Used by coherence scoring to accept triples that are transitively related.
   */
  private buildSemanticCluster(words: string[]): Set<string> {
    const cluster = new Set<string>();

    // Direct words
    for (const w of words) cluster.add(w.toLowerCase());

    // Synset synonyms
    for (const w of words) {
      for (const syn of this.synsets.getSynonyms(w)) {
        cluster.add(syn);
      }
    }

    // 1-hop relational neighbors
    for (const w of words) {
      const edgeKeys = this.subjectIndex.get(w) || [];
      for (const key of edgeKeys.slice(0, 5)) {
        const edge = this.edges.get(key);
        if (edge && edge.type !== 'syntactic') {
          cluster.add(edge.target.toLowerCase());
        }
      }
    }

    return cluster;
  }

  // =========================================================================
  // COHERENCE SCORING (port of word_engine.rs:1400-1486)
  // =========================================================================

  /**
   * Score how many distinct query content words this triple supports.
   *
   * Returns 0.0 (no overlap) to 1.0+ (strong overlap).
   * For queries with 3+ content words, requires ≥2 distinct hits.
   */
  private coherenceScore(
    triple: CandidateTriple,
    contentWords: string[],
    cluster: Set<string>
  ): number {
    // Tokenize the triple
    const tripleTokens = new Set<string>();
    for (const part of [triple.subject, triple.relation, triple.object]) {
      for (const w of part.toLowerCase().split(/[\s_]+/)) {
        if (w.length > 0) tripleTokens.add(w);
      }
    }

    // Count raw cluster hits
    let rawHits = 0;
    for (const tok of tripleTokens) {
      if (cluster.has(tok)) rawHits++;
    }

    // Count distinct seed words supported
    let distinctSupported = 0;
    for (const seed of contentWords) {
      const seedLower = seed.toLowerCase();
      const seedNorm = this.normalizeStem(seedLower);

      // Direct match
      if (tripleTokens.has(seedLower) ||
          Array.from(tripleTokens).some(t => this.normalizeStem(t) === seedNorm)) {
        distinctSupported++;
        continue;
      }

      // Synset match
      const syns = this.synsets.getSynonyms(seedLower);
      if (Array.from(syns).some(s => {
        const sLower = s.toLowerCase();
        return tripleTokens.has(sLower) ||
               Array.from(tripleTokens).some(t => this.normalizeStem(t) === this.normalizeStem(sLower));
      })) {
        distinctSupported++;
      }
    }

    if (distinctSupported === 0) {
      // Allow a small fallback score if triple overlaps the broader cluster
      if (rawHits >= 1) {
        return (Math.sqrt(rawHits) / 2) * 0.35;
      }
      return 0.0;
    }

    // For 3+ word queries, require at least 2 distinct seed hits
    const minRequired = contentWords.length > 2 ? 2 : 1;
    if (distinctSupported < minRequired) return 0.0;

    const distinctFraction = distinctSupported / Math.max(contentWords.length, 1);
    const richness = Math.sqrt(rawHits) / 2;
    return distinctFraction * (0.2 + 0.8 * richness);
  }

  /**
   * Crude stem normalization: strip common suffixes.
   * Port of the inline closure in word_engine.rs:1416-1428.
   */
  private normalizeStem(word: string): string {
    let s = word.toLowerCase();
    for (const suf of ['ing', 'ed', 'es', 's']) {
      if (s.endsWith(suf) && s.length > suf.length + 1) {
        s = s.slice(0, s.length - suf.length);
        break; // Only strip one suffix
      }
    }
    // Drop terminal 'e' (emerge ↔ emerged)
    if (s.endsWith('e') && s.length > 2) {
      s = s.slice(0, s.length - 1);
    }
    return s;
  }

  // =========================================================================
  // GREEDY SET-COVER SELECTION (port of word_engine.rs:1076-1106)
  // =========================================================================

  /**
   * Greedily select triples that collectively cover the most query content words.
   * Stops when ≥60% of content words are covered or 15 triples are selected.
   */
  private greedySelectTriples(
    pool: CandidateTriple[],
    contentWords: string[]
  ): CandidateTriple[] {
    // Sort by weight descending
    const sorted = [...pool].sort((a, b) => b.weight - a.weight);

    const seedSet = new Set(contentWords.map(w => w.toLowerCase()));
    const requiredCoverage = seedSet.size <= 2 ? 1 : Math.ceil(seedSet.size * 0.6);

    const covered = new Set<string>();
    const selected: CandidateTriple[] = [];

    for (const triple of sorted) {
      // Tokenize the triple
      const tripleTokens = new Set<string>();
      for (const part of [triple.subject, triple.relation, triple.object]) {
        for (const w of part.toLowerCase().split(/[\s_]+/)) {
          if (w.length > 0) tripleTokens.add(w);
        }
      }

      // Check what new seed words this triple covers
      const newlyCovered: string[] = [];
      for (const seed of seedSet) {
        if (!covered.has(seed) && tripleTokens.has(seed)) {
          newlyCovered.push(seed);
        }
      }

      if (newlyCovered.length > 0) {
        selected.push(triple);
        for (const n of newlyCovered) covered.add(n);
      }

      if (covered.size >= requiredCoverage || selected.length >= 15) break;
    }

    // Fallback: if greedy found nothing, take top 3 by weight
    if (selected.length === 0) {
      return sorted.slice(0, 3);
    }

    return selected;
  }

  // =========================================================================
  // SYNTHESIS — Triples to Sentences (port of dada_engine.rs:1354-1466)
  // =========================================================================

  /**
   * Synthesize coherent natural language from selected triples.
   *
   * Algorithm (from Rust DadaEngine::synthesize):
   *   1. Aggregate: group all predicates by subject
   *   2. Build predicate phrases: "IS" + "dog" → "is a dog"
   *   3. Collapse: remove redundant substring predicates
   *   4. Join: oxford comma within subject, period between subjects
   *   5. Capitalize + punctuate
   */
  private synthesizeFromTriples(
    triples: CandidateTriple[],
    _queryWords: string[]
  ): string {
    // ── Phase 1: Aggregate by subject ──
    // subject → { relation → [objects] }
    const knowledgeGraph = new Map<string, Map<string, string[]>>();
    const seenFacts = new Set<string>();

    for (const triple of triples.slice(0, 10)) {
      const subj = triple.subject.toLowerCase();
      const rel = triple.relation.toUpperCase();
      const obj = triple.object;

      if (!subj || !obj) continue;

      const factKey = `${subj}:${rel}:${obj}`;
      if (seenFacts.has(factKey)) continue;
      seenFacts.add(factKey);

      if (!knowledgeGraph.has(subj)) knowledgeGraph.set(subj, new Map());
      const predicates = knowledgeGraph.get(subj)!;
      if (!predicates.has(rel)) predicates.set(rel, []);
      predicates.get(rel)!.push(obj);
    }

    if (knowledgeGraph.size === 0) {
      return 'I need more information about that.';
    }

    // ── Phase 2: Build sentences per subject ──
    const sentences: string[] = [];

    for (const [subject, predicates] of knowledgeGraph) {
      const isComplements: string[] = [];
      const areComplements: string[] = [];
      const otherPhrases: string[] = [];

      for (const [relation, objects] of predicates) {
        for (const obj of objects) {
          const pred = this.buildPredicatePhrase(relation, obj);
          const predLower = pred.toLowerCase();

          if (predLower.startsWith('is ')) {
            isComplements.push(pred.slice(3));
          } else if (predLower.startsWith('are ')) {
            areComplements.push(pred.slice(4));
          } else {
            otherPhrases.push(pred);
          }
        }
      }

      // Collapse redundant predicates
      const collapsedIs = this.collapsePredicates(isComplements);
      const collapsedAre = this.collapsePredicates(areComplements);
      const collapsedOther = this.collapsePredicates(otherPhrases);

      // Assemble sentence parts
      const parts: string[] = [];
      if (collapsedIs.length > 0) {
        parts.push(`is ${this.oxfordJoin(collapsedIs)}`);
      }
      if (collapsedAre.length > 0) {
        parts.push(`are ${this.oxfordJoin(collapsedAre)}`);
      }
      for (const phrase of collapsedOther) {
        parts.push(phrase);
      }

      if (parts.length === 0) continue;

      const fullPredicate = parts.join(' and ');
      const subjCapitalized = this.capitalizeFirst(subject);
      sentences.push(`${subjCapitalized} ${fullPredicate}.`);
    }

    if (sentences.length === 0) {
      return 'I need more information about that.';
    }

    return sentences.join(' ');
  }

  /**
   * Build a predicate phrase from a relation + object.
   * Port of dada_engine.rs:1486-1508.
   *
   * Examples:
   *   ("IS", "dog")       → "is a dog"
   *   ("IS", "animals")   → "is animals"  (plural, no article)
   *   ("CAN", "run")      → "can run"
   *   ("WANT_TO", "eat")  → "wants to eat"
   *   ("HAS_A", "tail")   → "has a tail"
   */
  private buildPredicatePhrase(relation: string, object: string): string {
    const relLower = relation.toLowerCase().replace(/_/g, ' ');

    // Copula relations: add article heuristically
    if (relLower === 'is' || relLower === 'is a' || relLower === 'are') {
      const objLower = object.toLowerCase();
      // Already has article?
      if (objLower.startsWith('a ') || objLower.startsWith('an ') || objLower.startsWith('the ')) {
        return `${relLower === 'is a' ? 'is' : relLower} ${object}`;
      }
      // Heuristic: add "a" unless plural (ends in 's') or starts with uppercase (proper noun)
      const needsArticle = !objLower.endsWith('s') &&
                           object.charAt(0) === object.charAt(0).toLowerCase();
      if (needsArticle) {
        const article = /^[aeiou]/i.test(object) ? 'an' : 'a';
        return `is ${article} ${object}`;
      }
      return `${relLower === 'is a' ? 'is' : relLower} ${object}`;
    }

    // HAS_A: already implies article
    if (relLower === 'has a' || relLower === 'has not') {
      return `${relLower} ${object}`;
    }

    // Map relation names to human-readable verbs
    const verbMap: Record<string, string> = {
      'is': 'is', 'is not': 'is not', 'is not a': 'is not a',
      'was': 'was', 'was a': 'was a', 'was not': 'was not',
      'will be': 'will be', 'will': 'will', 'will not': 'will not',
      'has': 'has', 'has a': 'has a', 'has not': 'does not have',
      'had': 'had', 'owns': 'owns',
      'can': 'can', 'can be': 'can be', 'can not': 'cannot',
      'able to': 'is able to',
      'must': 'must', 'must be': 'must be', 'must not': 'must not',
      'should': 'should', 'should be': 'should be', 'should not': 'should not',
      'have to': 'has to', 'need to': 'needs to', 'need to be': 'needs to be',
      'ought to': 'ought to',
      'may': 'may', 'may be': 'may be', 'might': 'might',
      'could': 'could', 'could be': 'could be',
      'would': 'would', 'would be': 'would be',
      'want': 'wants', 'want to': 'wants to', 'want not': 'does not want',
      'need': 'needs', 'need not': 'does not need',
      'like': 'likes', 'like to': 'likes to', 'like not': 'does not like',
      'love': 'loves', 'love to': 'loves to', 'love not': 'does not love',
      'hate': 'hates', 'prefer': 'prefers', 'enjoy': 'enjoys',
      'knows': 'knows', 'with': 'is with', 'belongs to': 'belongs to',
      'make': 'makes', 'give': 'gives', 'take': 'takes',
      'get': 'gets', 'feel': 'feels', 'think': 'thinks',
      'say': 'says', 'mean': 'means',
      'contains': 'contains', 'in': 'is in', 'at': 'is at', 'from': 'is from',
      'used to': 'used to', 'used to be': 'used to be',
      'had been': 'had been', 'going to': 'is going to',
    };

    const verb = verbMap[relLower] || relLower;
    return `${verb} ${object}`;
  }

  /**
   * Collapse redundant predicates: remove phrases that are substrings of longer ones.
   * Port of dada_engine.rs:1512-1537.
   *
   * ["a greeting", "a greeting used to start"] → ["a greeting used to start"]
   */
  private collapsePredicates(phrases: string[]): string[] {
    if (phrases.length <= 1) return phrases;

    // Sort by length descending (keep longest/most detailed)
    const sorted = [...phrases].sort((a, b) => b.length - a.length);
    const kept: string[] = [];

    for (const phrase of sorted) {
      const pLower = phrase.toLowerCase();
      const isSubstring = kept.some(k => k.toLowerCase().includes(pLower));
      if (!isSubstring) {
        kept.push(phrase);
      }
    }

    return kept;
  }

  /**
   * Oxford comma join.
   * Port of dada_engine.rs:1540-1552.
   *
   * ["a"]           → "a"
   * ["a", "b"]      → "a and b"
   * ["a", "b", "c"] → "a, b, and c"
   */
  private oxfordJoin(items: string[]): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    const last = items[items.length - 1];
    const rest = items.slice(0, -1);
    return `${rest.join(', ')}, and ${last}`;
  }

  /** Capitalize the first character of a string. */
  private capitalizeFirst(text: string): string {
    if (text.length === 0) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Fallback: extract a sentence from the corpus at a given position.
   * Only used when no triples are available at all.
   * FIX: Uses corpusRaw for sentence boundary detection.
   */
  private extractSentenceAtPosition(position: number, maxLength: number): string {
    // Scan backwards to find sentence start
    let startPos = Math.max(0, position);
    const sentenceEnders = new Set(['.', '?', '!']);

    for (let i = position; i >= Math.max(0, position - 30); i--) {
      const raw = this.corpusRaw[i];
      if (raw && sentenceEnders.has(raw.charAt(raw.length - 1))) {
        startPos = i + 1;
        break;
      }
    }

    // Scan forwards to find sentence end
    let endPos = Math.min(this.corpus.length, startPos + maxLength);
    for (let i = startPos; i < endPos; i++) {
      const raw = this.corpusRaw[i];
      if (raw && sentenceEnders.has(raw.charAt(raw.length - 1))) {
        endPos = i + 1;
        break;
      }
    }

    const tokens = this.corpus.slice(startPos, endPos);
    if (tokens.length === 0) return 'I need more information about that.';

    // Capitalize and punctuate
    const text = tokens.join(' ');
    return this.finalizeSentence(text);
  }

  /**
   * Final sentence cleanup: capitalize first letter, ensure terminal punctuation.
   * Port of word_engine.rs:1184-1200.
   */
  private finalizeSentence(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length === 0) return trimmed;
    let out = this.capitalizeFirst(trimmed);
    const last = out.charAt(out.length - 1);
    if (last !== '.' && last !== '!' && last !== '?') {
      out += '.';
    }
    return out;
  }

  // =========================================================================
  // GRAPH TRAVERSAL (unchanged from original)
  // =========================================================================

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

        for (const [, edge] of this.edges) {
          if (edge.source === current.word && !visited.has(edge.target)) {
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

    paths.sort((a, b) => b.totalInterference - a.totalInterference);
    return paths.slice(0, 20);
  }

  // =========================================================================
  // ENTITY PROFILES (unchanged from original)
  // =========================================================================

  private buildEntityProfile(word: string): EntityProfile | null {
    if (!this.nodes.has(word)) return null;
    const profile: EntityProfile = {
      word, identity: [], was: [], has: [], wants: [], can: [],
      must: [], might: [], will: [], relationships: [], actions: [], location: []
    };
    for (const edge of this.edges.values()) {
      if (edge.source !== word && edge.target !== word) continue;
      const category = this.categorizeRelation(edge.type);
      if (category && (profile as any)[category]) {
        (profile as any)[category].push(edge);
      }
    }
    return profile;
  }

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

  // =========================================================================
  // REVERSE INTERFERENCE (unchanged from original)
  // =========================================================================

  reverseInterfere(targetCode: string): { query: string; confidence: number } {
    const tokens = this.tokenize(targetCode);
    const positions: Map<string, number[]> = new Map();
    for (const token of tokens) {
      const node = this.nodes.get(token);
      if (node) positions.set(token, [...node.positions]);
    }
    if (positions.size === 0) return { query: '', confidence: 0 };

    const centroid = this.computeCentroid(positions);
    const candidates = this.findWordsNearPosition(centroid, 20);

    let bestQuery = '';
    let bestScore = 0;

    for (const candidateWord of candidates) {
      const result = this.query(candidateWord, {
        window: 20, maxDepth: 2, useRelations: false
      });
      if (result && this.overlapsWith(result, targetCode)) {
        const score = result.interferenceHit.score;
        if (score > bestScore) {
          bestScore = score;
          bestQuery = candidateWord;
        }
      }
    }

    return { query: bestQuery, confidence: bestScore };
  }

  private tokenize(code: string): string[] {
    return code.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 1);
  }

  private computeCentroid(positions: Map<string, number[]>): number {
    let total = 0, count = 0;
    for (const posArray of positions.values()) {
      for (const pos of posArray) { total += pos; count++; }
    }
    return count > 0 ? Math.round(total / count) : 0;
  }

  private findWordsNearPosition(position: number, window: number = 20): string[] {
    const candidates = new Set<string>();
    for (const [word, node] of this.nodes.entries()) {
      for (const nodePos of node.positions) {
        if (Math.abs(nodePos - position) <= window) {
          candidates.add(word);
          for (const syn of this.synsets.getSynonyms(word)) candidates.add(syn);
          break;
        }
      }
    }
    return Array.from(candidates);
  }

  private overlapsWith(result: HybridQueryResult, targetCode: string): boolean {
    const targetTokens = this.tokenize(targetCode);
    const generatedTokens = this.tokenize(result.generated);
    return targetTokens.some(token => generatedTokens.includes(token));
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  addSynonyms(words: string[]): void {
    this.synsets.addGroup(words);
  }

  suppressPositions(positions: number[]): void {
    for (const pos of positions) this.suppressedPositions.add(pos);
  }

  getStats() {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      corpusSize: this.corpus.length,
      suppressedPositions: this.suppressedPositions.size,
      synsetGroups: (this.synsets as any).synsetToWords.size
    };
  }

  getCorpusTokens(): string[] {
    return [...this.corpus];
  }

  async importCorpus(tokens: string[]): Promise<void> {
    this.nodes = new Map();
    this.edges = new Map();
    this.corpus = [];
    this.corpusRaw = [];
    this.synsets = new Synsets();
    this.suppressedPositions = new Set();
    this.subjectIndex = new Map();
    this.objectIndex = new Map();
    if (!tokens || tokens.length === 0) return;
    await this.ingest(tokens.join(' '));
  }
}

export default SRGWordHybrid;