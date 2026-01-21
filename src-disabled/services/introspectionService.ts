import type { SrgJudgment, SrgView } from '../../types';

class IntrospectionService {
  private judgments: Array<{ judgment: SrgJudgment; view: SrgView; timestamp: number }> = [];

  logJudgment(judgment: SrgJudgment, view: SrgView) {
    this.judgments.push({ judgment, view, timestamp: Date.now() });
    // Keep memory bounded
    if (this.judgments.length > 500) this.judgments.shift();
  }

  listJudgments() {
    return [...this.judgments];
  }

  clear() {
    this.judgments = [];
  }
}

export const introspectionService = new IntrospectionService();
