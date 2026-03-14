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
  private isProcessing = false;
  private lastRunByStage: Map<string, number> = new Map();
  private lastSubconsciousRun = 0;

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
    this.isProcessing = false;
    loggingService.log('INFO', 'Background orchestrator stopped.');
  }

  async cycle() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Check Lüscher profile freshness
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

      const session = await sessionService.loadSession();
      const workflow = session?.aiSettings?.workflow || [];
      const backgroundWorkflow = session?.aiSettings?.backgroundWorkflow || [];
      const providers = session?.aiSettings?.providers || ({} as any);

      // 1. Run per-workflow scheduled background cycles (even if not idle)
      try {
        for (const stage of workflow) {
          if (!stage.enabled) continue;
          const minutes = stage.backgroundIntervalMinutes;
          if (!minutes || minutes <= 0) continue;
          const last = this.lastRunByStage.get(stage.id) || 0;
          const intervalMs = minutes * 60 * 1000;
          if (now - last >= intervalMs) {
            loggingService.log('INFO', `Orchestrator: running scheduled background cycle for stage ${stage.name}`, { stageId: stage.id, minutes });
            try {
              const roleSetting = { enabled: true, provider: stage.provider as any, selectedModel: stage.selectedModel };
              const runMode = (stage as any).backgroundRunMode || 'chained';
              if (runMode === 'independent') {
                await backgroundCognitionService.runSynthesisCycle(all, Math.floor(Date.now() / 1000));
              } else {
                await backgroundCognitionService.runChainedCycle(all, Math.floor(Date.now() / 1000), roleSetting as any, providers);
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

      // 2. If idle, continuously run Background Cognition Dual Process (if configured) OR legacy cycles
      if (idle) {
        const enabledBgStages = backgroundWorkflow.filter(s => s.enabled);
        
        // Prevent spanning idle loops too rapidly; limit general idle cycles to once every 15s
        if (now - this.lastSubconsciousRun >= 15000) {
            this.lastSubconsciousRun = now;
            
            if (enabledBgStages.length > 0) {
              loggingService.log('INFO', 'Orchestrator: Running Dual Process idle loop.');
              const context = { messages: all, projectFiles: [], contextFileNames: [], selfNarrative: '', rcb: undefined };
              await backgroundCognitionService.runDualProcessCycle(context, providers, enabledBgStages);
            } else {
              // Legacy Randomized Cycles (Fallback if no background stages are defined)
              const r = Math.random();
              if (r < 0.3) {
                loggingService.log('INFO', 'Orchestrator: running web search cycle (research).');
                const insight = await backgroundCognitionService.runWebSearchCycle({ messages: all, projectFiles: [], contextFileNames: [], selfNarrative: '', rcb: undefined }, { enabled: true, provider: 'gemini', selectedModel: 'gemini-2.5-flash' }, providers, []);
                if (insight && insight.insight) {
                    await memoryService.createAtom({ type: 'steward_note', text: insight.insight, role: 'model', isInContext: false });
                }
              } else if (r < 0.8) {
                loggingService.log('INFO', 'Orchestrator: running chained synthesis cycle.');
                await backgroundCognitionService.runChainedCycle(all, Math.floor(Date.now() / 1000));
              } else {
                loggingService.log('INFO', 'Orchestrator: running reflection cycle.');
                await backgroundCognitionService.runReflectionCycle(all, Math.floor(Date.now() / 1000));
              }
            }
        }
      }

      // Run scheduled tasks (like the distinct web_research scheduler)
      await scheduler.tick();
    } catch (e) {
      loggingService.log('ERROR', 'Background orchestrator cycle failed', { error: e });
    } finally {
      this.isProcessing = false;
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
  private isTicking = false;

  register(task: Task) {
    this.tasks.push(task);
  }

  async tick() {
    if (this.isTicking) return;
    this.isTicking = true;
    try {
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
    } finally {
        this.isTicking = false;
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

