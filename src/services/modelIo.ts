import type { SrgJudgment } from '../../types';

export function parseModelOutput(raw: string): { content: string; judgment: SrgJudgment | null } {
  const match = raw.match(/<SRG_JUDGMENT>([\s\S]*?)<\/SRG_JUDGMENT>/);
  const json = match ? match[1].trim() : '';
  if (!json) return { content: raw.trim(), judgment: null };
  try {
    const judgment = JSON.parse(json) as SrgJudgment;
    const content = raw.replace(match![0], '').trim();
    return { content, judgment };
  } catch (e) {
    console.warn('Failed to parse SRG_JUDGMENT JSON:', e, json);
    return { content: raw.replace(match![0], '').trim(), judgment: null };
  }
}
