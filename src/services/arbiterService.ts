// DEPRECATED: The Arbiter service is no longer used.
// Axioms are now generated organically by the synthesis layer and parsed in the useChat hook.
// This file is kept to prevent breaking imports in older session states but its functions are inert.

import type { MemoryAtom, RoleSetting, AISettings } from '../types';
import { loggingService } from './loggingService';

class ArbiterService {
  async runSynthesisCycle(history: MemoryAtom[], roleSetting: RoleSetting, providers: AISettings['providers']): Promise<string | null> {
    loggingService.log('WARN', 'ArbiterService.runSynthesisCycle called, but it is deprecated. No axioms will be generated.');
    return null;
  }
}

export const arbiterService = new ArbiterService();
