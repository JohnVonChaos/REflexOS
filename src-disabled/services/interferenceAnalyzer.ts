import type { ModuleQueryResult, InterferencePattern, SRGModule, Pulse } from '../types';

/**
 * Calculate SHA-256 hash of data
 */
export async function calculateHash(data: string): Promise<string> {
  // Try Web Crypto (browser / modern env)
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any).crypto && (globalThis as any).crypto.subtle && typeof (globalThis as any).crypto.subtle.digest === 'function') {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await (globalThis as any).crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    // Fall through to Node crypto fallback
    // (some environments may throw when accessing crypto.subtle)
    // console.warn('Web Crypto digest failed, falling back to Node crypto', e);
  }

  // Node.js fallback: dynamic import to avoid bundler issues in browser
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(data).digest('hex');
  } catch (e) {
    // As a last resort, use a tiny JS implementation (not cryptographically strong but deterministic)
    // Simple JS SHA-256 polyfill would be heavy; instead, throw a helpful error
    throw new Error('No crypto.subtle available and Node crypto import failed; cannot calculate hash in this environment');
  }
}

/**
 * Calculate Hamming distance between two hex hash strings
 * Returns number of differing bits (0-256 for SHA-256)
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error('Hash lengths must match');
  }
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16);
    distance += xor.toString(2).split('1').length - 1;
  }
  return distance;
}

/** Convert hamming distance to similarity score (0.0 - 1.0) */
export function distanceToSimilarity(distance: number, maxDistance: number = 256): number {
  return 1 - (distance / maxDistance);
}

/** Classify relationship based on similarity */
export function classifyRelationship(
  similarity: number
): 'constructive' | 'destructive' | 'neutral' {
  if (similarity > 0.7) return 'constructive';
  if (similarity < 0.3) return 'destructive';
  return 'neutral';
}

/** Combine pulses from multiple modules with weighted averaging */
function aggregateWeightedPulses(results: ModuleQueryResult[]): Pulse[] {
  const nodeActivations = new Map<string, { totalActivation: number; totalWeight: number }>();

  for (const result of results) {
    for (const pulse of result.pulses) {
      const current = nodeActivations.get(pulse.nodeId) || { totalActivation: 0, totalWeight: 0 };
      nodeActivations.set(pulse.nodeId, {
        totalActivation: current.totalActivation + (pulse.activation * result.weight),
        totalWeight: current.totalWeight + result.weight
      });
    }
  }

  const aggregated = Array.from(nodeActivations.entries())
    .map(([nodeId, data]) => ({
      nodeId,
      activation: data.totalActivation / data.totalWeight,
      depth: 0,
      source: 'aggregated'
    }))
    .sort((a, b) => b.activation - a.activation);

  return aggregated;
}

/**
 * Analyze interference patterns between module query results
 */
export async function analyzeInterference(
  results: ModuleQueryResult[],
  modules: SRGModule[]
): Promise<InterferencePattern> {
  const moduleMap = new Map(modules.map(m => [m.id, m]));

  const pairwiseInterference: InterferencePattern['pairwiseInterference'] = [];

  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const distance = hammingDistance(results[i].responseHash, results[j].responseHash);
      const similarity = distanceToSimilarity(distance);
      pairwiseInterference.push({
        moduleA: results[i].moduleName,
        moduleB: results[j].moduleName,
        hammingDistance: distance,
        similarity,
        relationship: classifyRelationship(similarity)
      });
    }
  }

  const agreements = pairwiseInterference
    .filter(p => p.relationship === 'constructive')
    .map(p => ({ modules: [p.moduleA, p.moduleB], concept: 'aligned_reasoning', strength: p.similarity }));

  const conflicts = pairwiseInterference
    .filter(p => p.relationship === 'destructive')
    .map(p => ({ modules: [p.moduleA, p.moduleB], concept: 'divergent_reasoning', tension: 1 - p.similarity }));

  const averageSimilarity = pairwiseInterference.length > 0
    ? pairwiseInterference.reduce((sum, p) => sum + p.similarity, 0) / pairwiseInterference.length
    : 1.0;

  const dominantModule = results.reduce((max, r) => r.totalActivation > max.totalActivation ? r : max);

  const consensus = {
    reached: averageSimilarity > 0.6,
    dominantModule: dominantModule.moduleName,
    confidenceScore: averageSimilarity,
    averageSimilarity
  };

  const aggregatedPulses = aggregateWeightedPulses(results);

  const patternData = {
    modules: results.map(r => ({ id: r.moduleId, hash: r.responseHash })),
    pairwise: pairwiseInterference,
    consensus
  };
  let patternHash = '';
  try {
    patternHash = await calculateHash(JSON.stringify(patternData));
  } catch (e) {
    console.warn('Failed to compute pattern hash for interference analysis:', e);
    patternHash = '';
  }

  return {
    modules: results.map(r => ({ id: r.moduleId, name: r.moduleName, weight: r.weight, responseHash: r.responseHash })),
    pairwiseInterference,
    agreements,
    conflicts,
    consensus,
    aggregatedPulses,
    patternHash
  };
}

export default {
  calculateHash,
  hammingDistance,
  distanceToSimilarity,
  classifyRelationship,
  analyzeInterference
};
