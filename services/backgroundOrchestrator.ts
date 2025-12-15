import { backgroundCognitionService } from './backgroundCognitionService';
import { memoryService } from './memoryService';
import { loggingService } from './loggingService';
import { getLatestLuescherProfile, shouldRefreshProfile } from './luescherService';

type OrchestratorOptions = { intervalMs?: number; idleMs?: number };

class BackgroundOrchestrator {
  private intervalId: any = null;
  private options: OrchestratorOptions;
  private running = false;

  constructor(opts?: OrchestratorOptions) {
    this.options = { intervalMs: 5000, idleMs: 30000, ...(opts || {}) };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(() => this.cycle(), this.options.intervalMs);
    loggingService.log('INFO', 'Background orchestrator started.');
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.running = false;
    loggingService.log('INFO', 'Background orchestrator stopped.');
  }

  async cycle() {
    try {
      // Check Lüscher profile freshness and emit refresh-needed event if appropriate
      try {
        const profile = await getLatestLuescherProfile();
        if (shouldRefreshProfile(profile)) {
          const detail = { lastProfileAge: profile ? Date.now() - profile.timestamp : null };
          const evt = (typeof (globalThis as any).CustomEvent === 'function') ? new (globalThis as any).CustomEvent('luscher:refresh-needed', { detail }) : { type: 'luscher:refresh-needed', detail };
          if (typeof (globalThis as any).dispatchEvent === 'function') {
            (globalThis as any).dispatchEvent(evt);
          } else {
            loggingService.log('INFO', 'Lüscher refresh needed (no global dispatch available)', detail);
          }
        }
      } catch (e) {
        loggingService.log('DEBUG', 'Lüscher refresh check failed', { error: e });
      }

      const all = await memoryService.getAll();
      const lastUser = all.filter(a => a.role === 'user').sort((a,b) => (b.timestamp||0) - (a.timestamp||0))[0];
      const now = Date.now();
      const idle = !lastUser || (now - (lastUser.timestamp || 0) > (this.options.idleMs || 30000));

      if (!idle) return;

      // Weighted selection: research (30%), synthesis (50%), reflection (20%)
      const r = Math.random();
      if (r < 0.3) {
        loggingService.log('INFO', 'Orchestrator: running web search cycle (research).');
        await backgroundCognitionService.runWebSearchCycle({ messages: all, projectFiles: [], contextFileNames: [], selfNarrative: '', rcb: undefined }, { enabled: true, provider: 'gemini', selectedModel: 'gemini-2.5-flash' }, ({} as any));
      } else if (r < 0.8) {
        loggingService.log('INFO', 'Orchestrator: running synthesis cycle.');
        await backgroundCognitionService.runSynthesisCycle(all, Math.floor(Date.now()/1000));
      } else {
        loggingService.log('INFO', 'Orchestrator: running reflection cycle.');
        await backgroundCognitionService.runReflectionCycle(all, Math.floor(Date.now()/1000));
      }
    } catch (e) {
      loggingService.log('ERROR', 'Background orchestrator cycle failed', { error: e });
    }
  }
}

export const backgroundOrchestrator = new BackgroundOrchestrator();
