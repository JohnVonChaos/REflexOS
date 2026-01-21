import { backgroundCognitionService } from './backgroundCognitionService';
import { memoryService } from './memoryService';
import { loggingService } from './loggingService';
import { getLatestLuescherProfile, shouldRefreshProfile } from './luescherService';
import { sessionService } from './sessionService';
import { runWebResearchCycle } from './backgroundCognitionService';

type OrchestratorOptions = { intervalMs?: number; idleMs?: number };

class BackgroundOrchestrator {
  private intervalId: any = null;
  private options: OrchestratorOptions;
  private running = false;
  private lastRunByStage: Map<string, number> = new Map();

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
      // Orchestrator notes:
      // - Scheduled per-stage background cycles respect a per-stage
      //   `backgroundRunMode` setting. Default is 'chained' which executes
      //   Subconscious -> Conscious -> Synthesis in order. If a stage sets
      //   `backgroundRunMode: 'independent'` the orchestrator will run only
      //   the synthesis cycle for that stage (useful for lightweight recurring
      //   maintenance tasks).

      // - Idle-mode cycles also run the chained cycle by default so that
      //   background cognition follows the same internal ordering as active
      //   pipeline executions.

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
      const lastUser = all.filter(a => a.role === 'user').sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
      const now = Date.now();
      const idle = !lastUser || (now - (lastUser.timestamp || 0) > (this.options.idleMs || 30000));

      // If not idle, still run per-workflow scheduled background cycles
      try {
        const session = await sessionService.loadSession();
        const workflow = session?.aiSettings?.workflow || [];
        for (const stage of workflow) {
          const minutes = stage.backgroundIntervalMinutes;
          if (!minutes || minutes <= 0) continue;
          const last = this.lastRunByStage.get(stage.id) || 0;
          const intervalMs = minutes * 60 * 1000;
          if (now - last >= intervalMs) {
            loggingService.log('INFO', `Orchestrator: running scheduled background cycle for stage ${stage.name}`, { stageId: stage.id, minutes });
            try {
              // Run chained subconscious -> conscious -> synthesis cycle for the scheduled stage
              const roleSetting = { enabled: true, provider: stage.provider as any, selectedModel: stage.selectedModel };
              const session = await sessionService.loadSession();
              const providers = session?.aiSettings?.providers;
              // Respect per-stage run mode: 'independent' runs only synthesis, otherwise run the chained cycle
              const runMode = (stage as any).backgroundRunMode || 'chained';
              if (runMode === 'independent') {
                await backgroundCognitionService.runSynthesisCycle(all, Math.floor(Date.now() / 1000));
              } else {
                await backgroundCognitionService.runChainedCycle(all, Math.floor(Date.now() / 1000), roleSetting as any, providers as any);
              }
            } catch (e) {
              loggingService.log('ERROR', `Scheduled background cycle for stage ${stage.id} failed`, { error: e });
            }
            this.lastRunByStage.set(stage.id, now);
          }
        }
      } catch (e) {
        loggingService.log('DEBUG', 'Failed to run per-workflow scheduled background cycles', { error: e });
      }

      // If idle, run the default randomized background cycle as before
      if (!idle) return;
      // Weighted selection: research (30%), synthesis (50%), reflection (20%)
      const r = Math.random();
      if (r < 0.3) {
        loggingService.log('INFO', 'Orchestrator: running web search cycle (research).');
        await backgroundCognitionService.runWebSearchCycle({ messages: all, projectFiles: [], contextFileNames: [], selfNarrative: '', rcb: undefined }, { enabled: true, provider: 'gemini', selectedModel: 'gemini-2.5-flash' }, ({} as any));
      } else if (r < 0.8) {
        loggingService.log('INFO', 'Orchestrator: running chained synthesis cycle.');
        await backgroundCognitionService.runChainedCycle(all, Math.floor(Date.now() / 1000));
      } else {
        loggingService.log('INFO', 'Orchestrator: running reflection cycle.');

        await backgroundCognitionService.runReflectionCycle(all, Math.floor(Date.now() / 1000));
      }

      // Run scheduled tasks
      await scheduler.tick();
    } catch (e) {
      loggingService.log('ERROR', 'Background orchestrator cycle failed', { error: e });
    }
  }
}


// Simple Scheduler Implementation
export interface Task {
  id: string;
  intervalMs: number;
  run: () => Promise<void>;
  lastRun?: number;
}

class Scheduler {
  private tasks: Task[] = [];

  register(task: Task) {
    this.tasks.push(task);
  }

  async tick() {
    const now = Date.now();
    for (const task of this.tasks) {
      if (!task.lastRun || now - task.lastRun >= task.intervalMs) {
        task.lastRun = now;
        try {
          await task.run();
        } catch (e) {
          console.error(`Task ${task.id} failed:`, e);
        }
      }
    }
  }
}

export const scheduler = new Scheduler();

// Register the web research task
scheduler.register({
  id: 'web_research',
  intervalMs: 5 * 60 * 1000, // Every 5 minutes
  run: async () => {
    console.log('[Background] Running web research cycle');

    // Research topics of interest
    const topics = [
      'AI consciousness emergence',
      'semantic reasoning graphs',
      'geometric interference patterns'
    ];

    const topic = topics[Math.floor(Math.random() * topics.length)];
    const content = await runWebResearchCycle(topic);

    console.log(`[Background] Researched "${topic}", found ${content.length} sources`);

    content.forEach((text, i) => {
      console.log(`[Research ${i + 1}] ${text.slice(0, 200)}...`);
    });
  }
});

export const backgroundOrchestrator = new BackgroundOrchestrator();

