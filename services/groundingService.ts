/**
 * SRG Grounding Verification Service
 * ====================================
 * Hallucination detector built on the architectural primitive:
 *   grounded = remembered, ungrounded = fabricated.
 *
 * The SRG's PositionHash contains entries for everything the system has
 * actually ingested. If model output produces zero interference hits,
 * zero semantic neighbors, and zero relational paths — it's fabricated.
 *
 * Runs at sub-millisecond latency per claim. Can check every sentence
 * of every layer's output between generation steps without adding
 * meaningful latency to the pipeline.
 */

import { PositionHash, SRGCore } from './srgCore';
import SRGWordHybrid from './srg-word-hybrid';
import type { HybridQueryResult } from './srg-word-hybrid';

// ============================================================================
// TYPES
// ============================================================================

export interface GroundingVerdict {
  claim: string;
  groundingScore: number;       // 0.0 (fabricated) → 1.0 (fully grounded)
  interferenceHits: number;     // Raw count of position-hash hits
  semanticNeighbors: number;    // Count of connected SRG nodes
  relationalPaths: number;      // Count of traversal paths found
  verdict: 'grounded' | 'weak' | 'ungrounded';
  suggestion?: string;          // Reprocessing instruction
  timingMs: number;             // How long this claim took to verify
}

export interface GroundingReport {
  overallScore: number;
  totalClaims: number;
  groundedClaims: number;
  weakClaims: number;
  ungroundedClaims: number;
  verdicts: GroundingVerdict[];
  processingTimeMs: number;
  queriesPerSecond: number;     // Performance metric
  avgClaimTimeMs: number;       // Average time per claim
}

// Thresholds
const GROUNDED_THRESHOLD = 0.4;
const WEAK_THRESHOLD = 0.15;

// Stopwords to filter before interference check
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
  'too', 'very', 'just', 'because', 'if', 'then', 'else', 'when',
  'up', 'out', 'about', 'over', 'it', 'its', 'this', 'that', 'these',
  'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him',
  'his', 'she', 'her', 'they', 'them', 'their', 'what', 'which', 'who',
  'whom', 'how', 'where', 'there', 'here', 'also', 'added', 'set'
]);

// ============================================================================
// GROUNDING SERVICE
// ============================================================================

export class GroundingService {
  private hybrid: SRGWordHybrid;

  constructor(hybrid: SRGWordHybrid) {
    this.hybrid = hybrid;
  }

  /**
   * Check grounding for a full text block.
   * Segments into claims (sentences), scores each, returns aggregate report.
   */
  checkText(text: string): GroundingReport {
    const t0 = performance.now();
    const claims = this.segmentIntoClaims(text);

    const verdicts: GroundingVerdict[] = [];
    for (const claim of claims) {
      verdicts.push(this.checkClaim(claim));
    }

    const totalTime = performance.now() - t0;
    const groundedClaims = verdicts.filter(v => v.verdict === 'grounded').length;
    const weakClaims = verdicts.filter(v => v.verdict === 'weak').length;
    const ungroundedClaims = verdicts.filter(v => v.verdict === 'ungrounded').length;

    const overallScore = verdicts.length > 0
      ? verdicts.reduce((sum, v) => sum + v.groundingScore, 0) / verdicts.length
      : 0;

    return {
      overallScore,
      totalClaims: verdicts.length,
      groundedClaims,
      weakClaims,
      ungroundedClaims,
      verdicts,
      processingTimeMs: Math.round(totalTime * 1000) / 1000,
      queriesPerSecond: verdicts.length > 0
        ? Math.round((verdicts.length / totalTime) * 1000)
        : 0,
      avgClaimTimeMs: verdicts.length > 0
        ? Math.round((totalTime / verdicts.length) * 1000) / 1000
        : 0,
    };
  }

  /**
   * Check grounding for a single claim.
   * This is the core operation — runs in sub-millisecond time.
   */
  checkClaim(claim: string): GroundingVerdict {
    const t0 = performance.now();

    // 1. Tokenize into content words
    const contentWords = this.extractContentWords(claim);

    if (contentWords.length === 0) {
      const elapsed = performance.now() - t0;
      return {
        claim,
        groundingScore: 0,
        interferenceHits: 0,
        semanticNeighbors: 0,
        relationalPaths: 0,
        verdict: 'ungrounded',
        suggestion: 'Claim contains no meaningful content words.',
        timingMs: Math.round(elapsed * 1000) / 1000,
      };
    }

    // 2. Run hybrid query — this is where position-hash interference happens
    const queryResult = this.hybrid.query(claim, {
      window: 15,
      maxDepth: 2,
      useSynsets: true,
      useRelations: true,
      generateLength: 0,   // We don't need generated text, just the scores
    });

    // 3. Score the grounding
    let interferenceHits = 0;
    let interferenceScore = 0;
    let semanticNeighbors = 0;
    let relationalPaths = 0;

    if (queryResult) {
      // Interference component
      interferenceHits = queryResult.interferenceHit ? 1 : 0;
      interferenceScore = queryResult.interferenceHit?.score || 0;

      // Entity coverage: how many query words have entity profiles
      const profiledWords = queryResult.entityProfiles?.size || 0;
      semanticNeighbors = profiledWords;
      const entityCoverage = contentWords.length > 0
        ? Math.min(1.0, profiledWords / contentWords.length)
        : 0;

      // Path count component
      relationalPaths = queryResult.paths?.length || 0;
      const pathScore = Math.min(1.0, relationalPaths / 5); // Normalize: 5+ paths = 1.0

      // Combined score: 50% interference, 30% entity coverage, 20% path density
      const combinedScore = (
        interferenceScore * 0.5 +
        entityCoverage * 0.3 +
        pathScore * 0.2
      );

      const elapsed = performance.now() - t0;
      const verdict = this.scoreToVerdict(combinedScore);

      return {
        claim,
        groundingScore: Math.round(combinedScore * 1000) / 1000,
        interferenceHits,
        semanticNeighbors,
        relationalPaths,
        verdict,
        suggestion: verdict === 'ungrounded'
          ? `This claim has no grounding in the knowledge base — verify, source, or remove: "${claim}"`
          : verdict === 'weak'
            ? `Weak grounding detected — consider verifying: "${claim}"`
            : undefined,
        timingMs: Math.round(elapsed * 1000) / 1000,
      };
    }

    // queryResult was null — zero interference, zero everything
    const elapsed = performance.now() - t0;
    return {
      claim,
      groundingScore: 0,
      interferenceHits: 0,
      semanticNeighbors: 0,
      relationalPaths: 0,
      verdict: 'ungrounded',
      suggestion: `This claim has no grounding in the knowledge base — verify, source, or remove: "${claim}"`,
      timingMs: Math.round(elapsed * 1000) / 1000,
    };
  }

  /**
   * Build a reprocessing prompt for correction loop.
   * Lists all ungrounded claims with instructions for the model.
   */
  buildReprocessingPrompt(report: GroundingReport): string {
    const ungrounded = report.verdicts.filter(v => v.verdict === 'ungrounded');
    const weak = report.verdicts.filter(v => v.verdict === 'weak');

    if (ungrounded.length === 0 && weak.length === 0) {
      return ''; // All claims grounded — no reprocessing needed
    }

    const lines: string[] = [
      '⚠️ GROUNDING VERIFICATION FAILED',
      `Overall grounding score: ${(report.overallScore * 100).toFixed(1)}%`,
      `Checked ${report.totalClaims} claims in ${report.processingTimeMs}ms (${report.queriesPerSecond} queries/sec)`,
      '',
    ];

    if (ungrounded.length > 0) {
      lines.push(`🚫 ${ungrounded.length} UNGROUNDED CLAIMS (no semantic grounding in knowledge base):`);
      for (const v of ungrounded) {
        lines.push(`  • "${v.claim}" [score: ${v.groundingScore}, hits: ${v.interferenceHits}, neighbors: ${v.semanticNeighbors}]`);
      }
      lines.push('');
    }

    if (weak.length > 0) {
      lines.push(`⚡ ${weak.length} WEAKLY GROUNDED CLAIMS (partial grounding, verify accuracy):`);
      for (const v of weak) {
        lines.push(`  • "${v.claim}" [score: ${v.groundingScore}, hits: ${v.interferenceHits}, neighbors: ${v.semanticNeighbors}]`);
      }
      lines.push('');
    }

    lines.push('INSTRUCTIONS: For each flagged claim, you must either:');
    lines.push('  1. VERIFY — provide evidence from the knowledge base that supports this claim');
    lines.push('  2. SOURCE — cite the specific ingested document or conversation where this information appears');
    lines.push('  3. REMOVE — delete the claim if it cannot be grounded');
    lines.push('');
    lines.push('Do NOT present unverified claims as facts. If you are reasoning or speculating, explicitly mark it as such.');

    return lines.join('\n');
  }

  // ========================================================================
  // INTERNAL METHODS
  // ========================================================================

  /**
   * Segment text into individual claims (sentences).
   */
  private segmentIntoClaims(text: string): string[] {
    // Split on sentence boundaries
    const sentences = text
      .split(/(?<=[.!?])\s+|[\n\r]+/)
      .map(s => s.trim())
      .filter(s => s.length > 3); // Filter trivial fragments

    return sentences;
  }

  /**
   * Extract content words (filter stopwords and short tokens).
   */
  private extractContentWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w));
  }

  /**
   * Convert score to verdict.
   */
  private scoreToVerdict(score: number): 'grounded' | 'weak' | 'ungrounded' {
    if (score >= GROUNDED_THRESHOLD) return 'grounded';
    if (score >= WEAK_THRESHOLD) return 'weak';
    return 'ungrounded';
  }
}
