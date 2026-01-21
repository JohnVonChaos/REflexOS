// Simple line-based LCS diff to produce a side-by-side diff view
export type DiffLine = { left?: string; right?: string; type: 'context' | 'added' | 'removed' };

export function computeLineDiff(a: string, b: string): DiffLine[] {
  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);

  const n = aLines.length;
  const m = bLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && aLines[i] === bLines[j]) {
      out.push({ left: aLines[i], right: bLines[j], type: 'context' });
      i++; j++;
    } else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) {
      // added in b
      out.push({ left: '', right: bLines[j], type: 'added' });
      j++;
    } else if (i < n && (j === m || dp[i][j + 1] < dp[i + 1][j])) {
      // removed from a
      out.push({ left: aLines[i], right: '', type: 'removed' });
      i++;
    }
  }

  return out;
}

export default computeLineDiff;
