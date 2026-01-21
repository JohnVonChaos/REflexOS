export type ScheduledTaskId = 'reindex_srg' | 'check_todos' | 'refresh_hud' | string;

export interface ScheduledTask {
  id: ScheduledTaskId;
  intervalMs: number;
  lastRun: number;
  run: () => Promise<void>;
}

export class ReflexScheduler {
  private tasks: Map<ScheduledTaskId, ScheduledTask> = new Map();
  private timer: any = null;

  register(task: ScheduledTask) {
    this.tasks.set(task.id, task);
  }

  unregister(id: ScheduledTaskId) {
    this.tasks.delete(id);
  }

  tick() {
    const now = Date.now();
    for (const task of Array.from(this.tasks.values())) {
      if (now - task.lastRun >= task.intervalMs) {
        task.run().catch((e) => console.error('Scheduled task failed', task.id, e));
        task.lastRun = now;
      }
    }
  }

  start(intervalMs = 1000 * 10) { // default tick every 10s; real tasks run on their own intervals
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

export default ReflexScheduler;
