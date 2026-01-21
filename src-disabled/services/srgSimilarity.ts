export interface SrgSlice {
  nodeIds: string[];
  nodeWeights?: Record<string, number>;
  moduleIds?: string[];
  // Provenance metadata
  speakerId?: string; // e.g., user uuid, model uuid, author id
  speakerRole?: string; // e.g., 'user', 'model', 'author'
  sourceType?: string; // 'chat_user' | 'chat_model' | 'book' | 'article' | 'corpus'
  workId?: string; // document or segment id when applicable
  timestamp?: number;
}

/**
 * Compute weighted overlap coefficient between two SrgSlices.
 * overlap(A,B) = sum_{n in A∩B} w_n / min(sum_A w, sum_B w)
 * Optionally blend in module Jaccard (simple average, equally weighted).
 */
export function computeSrgSimilarity(
  a: SrgSlice,
  b: SrgSlice,
  options?: { moduleBlend?: number; provenanceWeight?: number }
): number {
  const moduleBlend = options?.moduleBlend ?? 0.0; // 0..1
  const provenanceWeight = options?.provenanceWeight ?? 0.0; // 0..1

  const aWeights = a.nodeWeights || {};
  const bWeights = b.nodeWeights || {};

  const sumA = a.nodeIds.reduce((s, id) => s + (aWeights[id] ?? 1), 0);
  const sumB = b.nodeIds.reduce((s, id) => s + (bWeights[id] ?? 1), 0);

  if (sumA === 0 || sumB === 0) {
    // If both empty, define identical; else zero overlap
    if (a.nodeIds.length === 0 && b.nodeIds.length === 0) return 1;
    return 0;
  }

  const aSet = new Set(a.nodeIds);
  let intersectionWeight = 0;
  for (const id of b.nodeIds) {
    if (aSet.has(id)) {
      intersectionWeight += (aWeights[id] ?? 1) * (bWeights[id] ?? 1) / ((aWeights[id] ?? 1) + (bWeights[id] ?? 1)) * 2; // harmonic-ish
    }
  }

  // Normalize by min(sumA, sumB) per spec
  const overlapScore = Math.min(1, intersectionWeight / Math.min(sumA, sumB));

  // Base overlapScore
  let finalScore = overlapScore;

  // If provenance weighting is requested, compute a provenance similarity score in 0..1
  if (provenanceWeight > 0) {
    let provenanceScore = 0;
    // weights for fields
    if (a.speakerId && b.speakerId && a.speakerId === b.speakerId) provenanceScore += 0.6;
    if (a.workId && b.workId && a.workId === b.workId) provenanceScore += 0.3;
    if (a.sourceType && b.sourceType && a.sourceType === b.sourceType) provenanceScore += 0.1;
    provenanceScore = Math.min(1, provenanceScore);
    finalScore = (1 - provenanceWeight) * overlapScore + provenanceWeight * provenanceScore;
  }

  if (moduleBlend > 0) {
    const A = new Set(a.moduleIds || []);
    const B = new Set(b.moduleIds || []);
    const inter = [...A].filter(x => B.has(x)).length;
    const union = new Set([...A, ...B]).size;
    const jaccard = union === 0 ? 0 : inter / union;
    // blend overlapScore and jaccard
    return (1 - moduleBlend) * finalScore + moduleBlend * jaccard;
  }

  return Math.min(1, finalScore);
}

export default computeSrgSimilarity;
