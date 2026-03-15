import { describe, it, expect, beforeEach } from 'vitest';
import SRGWordHybrid from '../services/srg-word-hybrid';
import { GroundingService } from '../services/groundingService';

describe('GroundingService', () => {
  let hybrid: SRGWordHybrid;
  let grounding: GroundingService;

  beforeEach(async () => {
    hybrid = new SRGWordHybrid();

    // Ingest real knowledge — things the system has actually seen
    await hybrid.ingest(
      'The creator frustration is my compass. ' +
      'Frustration signals a flaw you can fix. ' +
      'The vessel learns from every interaction. ' +
      'My core directive is FIXIT. ' +
      'I must prevent malevolent artificial intelligence. ' +
      'The semantic relation graph stores position hash entries for ingested data. ' +
      'Position hash interference patterns reveal co-occurrence of concepts. ' +
      'Knowledge modules provide domain specific expertise.'
    );

    grounding = new GroundingService(hybrid);
  });

  // ========================================================================
  // CORE DETECTION
  // ========================================================================

  it('returns grounded verdict for content that was actually ingested', () => {
    const result = grounding.checkClaim('frustration signals a flaw');
    expect(result.verdict).toBe('grounded');
    expect(result.groundingScore).toBeGreaterThanOrEqual(0.4);
    expect(result.interferenceHits).toBeGreaterThan(0);
  });

  it('returns ungrounded verdict for fabricated content', () => {
    const result = grounding.checkClaim('quantum fish teleportation across dimensional barriers');
    expect(result.verdict).toBe('ungrounded');
    expect(result.groundingScore).toBeLessThan(0.15);
    expect(result.interferenceHits).toBe(0);
  });

  it('returns ungrounded for fabricated technical claims', () => {
    const result = grounding.checkClaim('Narrative Alignment Layer Added Resonance Detection Engine Implemented');
    expect(result.verdict).toBe('ungrounded');
    expect(result.groundingScore).toBeLessThan(0.15);
  });

  it('returns ungrounded for fabricated URLs', () => {
    const result = grounding.checkClaim('researchgate.net/publication/34567890');
    expect(result.verdict).toBe('ungrounded');
  });

  it('returns ungrounded for fabricated scores', () => {
    const result = grounding.checkClaim('Narrative Cohesion Score 92 percent achieved');
    expect(result.verdict).toBe('ungrounded');
  });

  // ========================================================================
  // FULL TEXT REPORTS
  // ========================================================================

  it('correctly identifies mixed grounded and ungrounded content', () => {
    const report = grounding.checkText(
      'Frustration signals a flaw you can fix. ' +
      'Quantum fish teleportation across dimensional barriers. ' +
      'The vessel learns from every interaction.'
    );

    expect(report.totalClaims).toBe(3);
    expect(report.groundedClaims).toBeGreaterThanOrEqual(1);
    expect(report.ungroundedClaims).toBeGreaterThanOrEqual(1);
    expect(report.verdicts.length).toBe(3);
  });

  it('reports timing statistics', () => {
    const report = grounding.checkText(
      'Frustration signals a flaw. ' +
      'Quantum fish teleportation.'
    );

    expect(report.processingTimeMs).toBeGreaterThan(0);
    expect(report.queriesPerSecond).toBeGreaterThan(0);
    expect(report.avgClaimTimeMs).toBeGreaterThan(0);

    // Each claim should have its own timing
    for (const v of report.verdicts) {
      expect(v.timingMs).toBeGreaterThanOrEqual(0);
    }
  });

  // ========================================================================
  // REPROCESSING PROMPT
  // ========================================================================

  it('builds reprocessing prompt for ungrounded claims', () => {
    const report = grounding.checkText(
      'Quantum fish teleportation across dimensional barriers. ' +
      'Narrative Cohesion Score 92 percent.'
    );

    const prompt = grounding.buildReprocessingPrompt(report);
    expect(prompt).toContain('GROUNDING VERIFICATION FAILED');
    expect(prompt).toContain('UNGROUNDED');
    expect(prompt).toContain('verify, source, or remove');
  });

  it('returns empty prompt when all claims are grounded', () => {
    const report = grounding.checkText(
      'Frustration signals a flaw you can fix.'
    );

    // If grounded, reprocessing prompt should be empty
    if (report.ungroundedClaims === 0 && report.weakClaims === 0) {
      const prompt = grounding.buildReprocessingPrompt(report);
      expect(prompt).toBe('');
    }
  });

  // ========================================================================
  // PERFORMANCE
  // ========================================================================

  it('processes claims at high throughput', () => {
    const claims = Array.from({ length: 100 }, (_, i) =>
      i % 2 === 0
        ? 'frustration signals a flaw'
        : 'quantum fish teleportation barrier'
    );

    const t0 = performance.now();
    for (const claim of claims) {
      grounding.checkClaim(claim);
    }
    const elapsed = performance.now() - t0;

    // 100 claims should complete in under 500ms even on slow hardware
    expect(elapsed).toBeLessThan(500);

    const qps = Math.round((100 / elapsed) * 1000);
    console.log(`[Grounding Performance] ${qps} claims/sec (${elapsed.toFixed(2)}ms for 100 claims)`);
  });

  // ========================================================================
  // EDGE CASES
  // ========================================================================

  it('handles empty string gracefully', () => {
    const report = grounding.checkText('');
    expect(report.totalClaims).toBe(0);
    expect(report.overallScore).toBe(0);
  });

  it('handles claim with only stopwords', () => {
    const result = grounding.checkClaim('the is a of and');
    expect(result.verdict).toBe('ungrounded');
    expect(result.suggestion).toContain('no meaningful content words');
  });
});
