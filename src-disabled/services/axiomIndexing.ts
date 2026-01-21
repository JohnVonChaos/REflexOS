import { srgService } from './srgService';
import { loggingService } from './loggingService';
import type { MemoryAtom } from '../types';

/**
 * Index newly created axioms into the SRG so they can be recalled later.
 * - Reinforces SRG links from the axiom text
 * - Ingests the axiom into the hybrid corpus for interference-based recall
 */
export const indexAxiomsToSRG = async (axiomAtoms: MemoryAtom[]) => {
  if (!axiomAtoms || axiomAtoms.length === 0) return;

  for (const axiom of axiomAtoms) {
    try {
      // Reinforce word-level links in the SRG graph
      await srgService.reinforceLinksFromText(axiom.text);

      // Also ingest into the hybrid corpus (metadata helps identify source)
      await srgService.ingestHybrid(axiom.text, {
        title: `axiom_${axiom.axiomId || axiom.uuid}`,
        source: 'axiom',
        category: 'axiom'
      });

      loggingService.log('INFO', 'Axiom indexed to SRG', { id: axiom.axiomId || axiom.uuid });
    } catch (e: any) {
      loggingService.log('ERROR', 'Failed to index axiom to SRG', { id: axiom.axiomId || axiom.uuid, error: e?.toString ? e.toString() : e });
    }
  }
};

export default indexAxiomsToSRG;
