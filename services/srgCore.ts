/**
 * SRG Core - PositionHash, Relations, SRGCore
 * Ported from docs/the_word.py (Position hashing + relation patterns)
 */
import type { } from '../types';

export class PositionHash {
  private wordPositions: Map<string, number[]> = new Map();
  private tokens: string[] = [];
  public totalTokens: number = 0;

  addTokens(tokens: string[], startPos: number = 0): void {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].toLowerCase();
      const pos = startPos + i;
      this.tokens[pos] = token;
      const arr = this.wordPositions.get(token) || [];
      arr.push(pos);
      this.wordPositions.set(token, arr);
      this.totalTokens = Math.max(this.totalTokens, pos + 1);
    }
  }

  private anyPositionInRange(positions: number[] | undefined, low: number, high: number): boolean {
    if (!positions || positions.length === 0) return false;
    // binary search for first >= low
    let lo = 0, hi = positions.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const val = positions[mid];
      if (val < low) lo = mid + 1;
      else if (val > high) hi = mid - 1;
      else return true;
    }
    return false;
  }

  interference(words: string[], window: number = 15): Array<{ position: number; score: number }> {
    const uniq = Array.from(new Set(words.map(w => w.toLowerCase())));
    const results: Array<{ position: number; score: number }> = [];
    if (uniq.length === 0 || this.totalTokens === 0) return results;

    for (let pos = 0; pos < this.totalTokens; pos++) {
      let matches = 0;
      const low = Math.max(0, pos - window);
      const high = Math.min(this.totalTokens - 1, pos + window);
      for (const w of uniq) {
        const positions = this.wordPositions.get(w);
        if (this.anyPositionInRange(positions, low, high)) matches++;
      }
      if (matches > 0) {
        const score = matches / uniq.length;
        results.push({ position: pos, score });
      }
    }

    // sort descending by score then by proximity (not required but deterministic)
    results.sort((a, b) => b.score - a.score || a.position - b.position);
    return results;
  }

  getContext(position: number, radius: number = 50): string[] {
    if (position < 0 || this.totalTokens === 0) return [];
    const start = Math.max(0, position - radius);
    const end = Math.min(this.totalTokens, position + radius + 1);
    return this.tokens.slice(start, end).filter(Boolean);
  }
}

interface RelationTriple {
  subject: string;
  relationType: string;
  object: string | null;
  position: number;
  modifiers: string[];
}

export class Relations {
  private triples: RelationTriple[] = [];

  // Patterns copied from docs/the_word.py (order matters)
  private static PATTERNS: Array<[RegExp, string]> = [
    [/(\w+)\s+(?:exist|exists|persists|remains|continues)\b/i, "EXISTS"],
    [/(\w+)\s+(?:flow|flows|move|moves|travel|travels)\b/i, "FLOWS"],

    [/(\w+)\s+(?:do|does|did)\s+not\s+want\s+(?:to\s+)?(\w+)/i, "WANT_NOT"],
    [/(\w+)\s+(?:do|does|did)\s+not\s+like\s+(\w+)/i, "LIKE_NOT"],
    [/(\w+)\s+(?:do|does|did)\s+not\s+love\s+(\w+)/i, "LOVE_NOT"],
    [/(\w+)\s+(?:do|does|did)\s+not\s+need\s+(\w+)/i, "NEED_NOT"],
    [/(\w+)\s+(?:do|does|did)\s+not\s+have\s+(\w+)/i, "HAS_NOT"],
    [/(\w+)\s+(?:doesn't|don't|didn't)\s+want\s+(?:to\s+)?(\w+)/i, "WANT_NOT"],
    [/(\w+)\s+(?:doesn't|don't|didn't)\s+like\s+(\w+)/i, "LIKE_NOT"],
    [/(\w+)\s+(?:doesn't|don't|didn't)\s+not\s+need\s+(\w+)/i, "NEED_NOT"],
    [/(\w+)\s+(?:doesn't|don't|didn't)\s+have\s+(\w+)/i, "HAS_NOT"],
    [/(\w+)\s+(?:can't|cannot|couldn't)\s+(\w+)/i, "CAN_NOT"],
    [/(\w+)\s+(?:won't|wouldn't)\s+(\w+)/i, "WILL_NOT"],
    [/(\w+)\s+(?:shouldn't|should\s+not)\s+(\w+)/i, "SHOULD_NOT"],
    [/(\w+)\s+(?:mustn't|must\s+not)\s+(\w+)/i, "MUST_NOT"],
    [/(\w+)\s+is\s+not\s+a\s+(\w+)/i, "IS_NOT_A"],
    [/(\w+)\s+is\s+not\s+(\w+)/i, "IS_NOT"],
    [/(\w+)\s+(?:am|are)\s+not\s+(\w+)/i, "IS_NOT"],
    [/(\w+)\s+(?:was|were)\s+not\s+(\w+)/i, "WAS_NOT"],
    [/(\w+)\s+has\s+no\s+(\w+)/i, "HAS_NOT"],

    [/(\w+)\s+(?:want|wants)\s+to\s+(\w+)/i, "WANT_TO"],
    [/(\w+)\s+(?:want|wants)\s+(\w+)/i, "WANT"],
    [/(\w+)\s+(?:need|needs)\s+to\s+(\w+)/i, "NEED_TO"],
    [/(\w+)\s+(?:need|needs)\s+(\w+)/i, "NEED"],
    [/(\w+)\s+(?:like|likes)\s+to\s+(\w+)/i, "LIKE_TO"],
    [/(\w+)\s+(?:like|likes)\s+(\w+)/i, "LIKE"],
    [/(\w+)\s+(?:love|loves)\s+to\s+(\w+)/i, "LOVE_TO"],
    [/(\w+)\s+(?:love|loves)\s+(\w+)/i, "LOVE"],
    [/(\w+)\s+(?:hate|hates)\s+(\w+)/i, "HATE"],
    [/(\w+)\s+(?:prefer|prefers)\s+(\w+)/i, "PREFER"],
    [/(\w+)\s+(?:enjoy|enjoys)\s+(\w+)/i, "ENJOY"],

    [/(\w+)\s+must\s+be\s+(\w+)/i, "MUST_BE"],
    [/(\w+)\s+must\s+(\w+)/i, "MUST"],
    [/(\w+)\s+should\s+be\s+(\w+)/i, "SHOULD_BE"],
    [/(\w+)\s+should\s+(\w+)/i, "SHOULD"],
    [/(\w+)\s+(?:have|has)\s+to\s+(\w+)/i, "HAVE_TO"],
    [/(\w+)\s+(?:need|needs)\s+to\s+be\s+(\w+)/i, "NEED_TO_BE"],
    [/(\w+)\s+ought\s+to\s+(\w+)/i, "OUGHT_TO"],

    [/(\w+)\s+(?:may|might)\s+be\s+(\w+)/i, "MAY_BE"],
    [/(\w+)\s+(?:may|might)\s+(\w+)/i, "MAY"],
    [/(\w+)\s+could\s+be\s+(\w+)/i, "COULD_BE"],
    [/(\w+)\s+could\s+(\w+)/i, "COULD"],
    [/(\w+)\s+would\s+be\s+(\w+)/i, "WOULD_BE"],
    [/(\w+)\s+would\s+(\w+)/i, "WOULD"],

    [/(\w+)\s+can\s+be\s+(\w+)/i, "CAN_BE"],
    [/(\w+)\s+can\s+(\w+)/i, "CAN"],
    [/(\w+)\s+(?:is|are)\s+able\s+to\s+(\w+)/i, "ABLE_TO"],

    [/(\w+)\s+will\s+be\s+(\w+)/i, "WILL_BE"],
    [/(\w+)\s+will\s+(\w+)/i, "WILL"],
    [/(\w+)\s+(?:is|are|am)\s+going\s+to\s+(\w+)/i, "GOING_TO"],
    [/(\w+)\s+(?:is|are|am)\s+gonna\s+(\w+)/i, "GOING_TO"],

    [/(\w+)\s+used\s+to\s+be\s+(\w+)/i, "USED_TO_BE"],
    [/(\w+)\s+used\s+to\s+(\w+)/i, "USED_TO"],
    [/(\w+)\s+was\s+a\s+(\w+)/i, "WAS_A"],
    [/(\w+)\s+was\s+(\w+)/i, "WAS"],
    [/(\w+)\s+were\s+(\w+)/i, "WAS"],
    [/(\w+)\s+had\s+been\s+(\w+)/i, "HAD_BEEN"],
    [/(\w+)\s+had\s+(\w+)/i, "HAD"],

    [/(\w+)\s+(?:am|is)\s+a\s+(\w+)/i, "IS_A"],
    [/(\w+)\s+(?:am|is)\s+an\s+(\w+)/i, "IS_A"],
    [/(\w+)\s+(?:am|is)\s+(\w+)/i, "IS"],
    [/(\w+)\s+are\s+(\w+)/i, "IS"],
    [/(\w+)\s+(?:'m|'re|'s)\s+(\w+)/i, "IS"],

    [/(\w+)\s+(?:have|has)\s+a\s+(\w+)/i, "HAS_A"],
    [/(\w+)\s+(?:have|has)\s+(\w+)/i, "HAS"],
    [/(\w+)\s+(?:own|owns)\s+(\w+)/i, "OWNS"],
    [/(\w+)'s\s+(\w+)/i, "POSSESSIVE"],

    [/(\w+)\s+(?:know|knows)\s+(\w+)/i, "KNOWS"],
    [/(\w+)\s+(?:is|am|are)\s+with\s+(\w+)/i, "WITH"],
    [/(\w+)\s+(?:belong|belongs)\s+to\s+(\w+)/i, "BELONGS_TO"],
    [/(\w+)\s+(?:is|am|are)\s+(?:your|my|his|her|their|our)\s+(\w+)/i, "ROLE"],

    [/(\w+)\s+(?:make|makes)\s+(\w+)/i, "MAKE"],
    [/(\w+)\s+(?:give|gives)\s+(\w+)/i, "GIVE"],
    [/(\w+)\s+(?:take|takes)\s+(\w+)/i, "TAKE"],
    [/(\w+)\s+(?:get|gets)\s+(\w+)/i, "GET"],
    [/(\w+)\s+(?:feel|feels)\s+(\w+)/i, "FEEL"],
    [/(\w+)\s+(?:think|thinks)\s+(\w+)/i, "THINK"],
    [/(\w+)\s+(?:say|says)\s+(\w+)/i, "SAY"],
    [/(\w+)\s+(?:mean|means)\s+(\w+)/i, "MEAN"],
    [/(\w+)\s+(?:carry|carries)\s+(\w+)/i, "CARRY"],
    [/(\w+)\s+(?:serve|serves)\s+(?:as\s+)?(\w+)/i, "SERVE"],
    [/(\w+)\s+(?:transport|transports)\s+(\w+)/i, "TRANSPORT"],
    [/(\w+)\s+(?:operate|operates)\s+(\w+)/i, "OPERATE"],
    [/(\w+)\s+(?:move|moves)\s+(\w+)/i, "MOVE"],
    [/(\w+)\s+(?:work|works)\s+(?:as\s+)?(\w+)/i, "WORK"],
    [/(\w+)\s+(?:serve|serves)\s+(?:as\s+)?(\w+)/i, "SERVE_AS"],
    [/(\w+)\s+(?:provide|provides)\s+(\w+)/i, "PROVIDE"],
    [/(\w+)\s+(?:offer|offers)\s+(\w+)/i, "OFFER"],
    [/(\w+)\s+(?:connect|connects)\s+(?:to\s+)?(\w+)/i, "CONNECT"],
    [/(\w+)\s+(?:apologize|apologizes)\b/i, "APOLOGIZE"],
    [/(\w+)\s+(?:wait|waits)\b/i, "WAIT"],

    [/(\w+)\s+(?:contain|contains)\s+(\w+)/i, "CONTAINS"],
    [/(\w+)\s+(?:is|are)\s+in\s+(\w+)/i, "IN"],
    [/(\w+)\s+(?:is|are)\s+at\s+(\w+)/i, "AT"],
    [/(\w+)\s+(?:is|are)\s+from\s+(\w+)/i, "FROM"],
  ];

  extractFromTokens(tokens: string[], startPos: number): number {
    const text = tokens.join(' ');
    let count = 0;

    for (const [pattern, relationType] of Relations.PATTERNS) {
      const re = new RegExp(pattern.source, 'ig');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const subject = (m[1] || '').toLowerCase().trim();
        const object = (m[2] || null) ? (m[2] as string).toLowerCase().trim() : null;

        if (!subject || subject.length < 2) continue;

        const subjectIdx = tokens.indexOf(subject);
        const position = subjectIdx >= 0 ? startPos + subjectIdx : startPos;

        this.triples.push({ subject, relationType, object, position, modifiers: [] });
        count++;
      }
    }

    return count;
  }

  getBySubject(subject: string): RelationTriple[] {
    return this.triples.filter(t => t.subject === subject);
  }

  getByRelation(relationType: string): RelationTriple[] {
    return this.triples.filter(t => t.relationType === relationType);
  }

  getAllTriples(): RelationTriple[] {
    return [...this.triples];
  }
}

export class SRGCore {
  private positionHash: PositionHash;
  private relations: Relations;

  constructor() {
    this.positionHash = new PositionHash();
    this.relations = new Relations();
  }

  addText(text: string, startPos?: number): void {
    const tokens = this.tokenize(text);
    const pos = typeof startPos === 'number' ? startPos : this.positionHash.totalTokens || 0;
    this.positionHash.addTokens(tokens, pos);
    this.relations.extractFromTokens(tokens, pos);
  }

  // Expose internal structures for persistence and inspection
  getTokens(): string[] {
    // Return a shallow copy
    // @ts-ignore access internal tokens
    return (this.positionHash as any).tokens ? Array.from((this.positionHash as any).tokens) : [];
  }

  getWordPositions(): Map<string, number[]> {
    // @ts-ignore
    return new Map((this.positionHash as any).wordPositions);
  }

  getAllRelations(): any[] {
    // @ts-ignore
    return Array.from((this.relations as any).triples);
  }

  // Load state into core (used when rebuilding from disk)
  loadFromDump(tokens: string[], wordPositions: [string, number[]][], triples: any[]) {
    // @ts-ignore
    (this.positionHash as any).tokens = Array.from(tokens || []);
    // @ts-ignore
    const wp = new Map<string, number[]>();
    for (const [w, positions] of wordPositions || []) wp.set(w, positions.slice());
    // @ts-ignore
    (this.positionHash as any).wordPositions = wp;
    this.positionHash.totalTokens = (tokens && tokens.length) || 0;

    // @ts-ignore
    (this.relations as any).triples = Array.from(triples || []);
  }

  computeSimilarity(textA: string, textB: string): number {
    const tokensA = this.tokenize(textA);
    const tokensB = this.tokenize(textB);
    const allTokens = Array.from(new Set([...tokensA, ...tokensB]));
    const results = this.positionHash.interference(allTokens, 15);
    if (results.length === 0) return 0;
    const topScores = results.slice(0, 3).map(r => r.score);
    return topScores.reduce((a, b) => a + b, 0) / topScores.length;
  }

  interference(words: string[], window: number = 15) {
    return this.positionHash.interference(words, window);
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().match(/\b[\w']+\b/g) || [];
  }
}
