import { describe, it, expect } from 'vitest';
import { computeLineDiff } from '../src/utils/diff';

describe('computeLineDiff', () => {
  it('shows additions and removals', () => {
    const a = 'line1\nline2\nline3';
    const b = 'line1\nline2-mod\nline3\nline4';
    const out = computeLineDiff(a, b);
    expect(out.some(l => l.type === 'added' && l.right === 'line4')).toBeTruthy();
    expect(out.some(l => l.type === 'removed' && l.left === 'line2')).toBeTruthy();
  });
});
