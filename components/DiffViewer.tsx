import React from 'react';
import type { ProjectFile } from '../types';
import { CloseIcon } from './icons';

interface DiffViewerProps {
  file1: ProjectFile;
  file2: ProjectFile;
  onExit: () => void;
}

// Using a more robust LCS-based diff algorithm
const lcsDiff = (lines1: string[], lines2: string[]) => {
    const n = lines1.length;
    const m = lines2.length;
    // dp[i][j] will be the length of LCS of lines1[0..i-1] and lines2[0..j-1]
    const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (lines1[i - 1] === lines2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    const result = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
            // Common line
            result.push({
                line1: lines1[i - 1],
                line2: lines2[j - 1],
                lineNum1: i,
                lineNum2: j,
                status: 'common',
            });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            // Line added in file2
            result.push({
                line1: undefined,
                line2: lines2[j - 1],
                lineNum1: undefined,
                lineNum2: j,
                status: 'added',
            });
            j--;
        } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
            // Line removed from file1
            result.push({
                line1: lines1[i - 1],
                line2: undefined,
                lineNum1: i,
                lineNum2: undefined,
                status: 'removed',
            });
            i--;
        } else {
            break;
        }
    }

    // Since we backtracked, the result is in reverse order
    return result.reverse();
};


export const DiffViewer: React.FC<DiffViewerProps> = ({ file1, file2, onExit }) => {
    const lines1 = file1.content.split('\n');
    const lines2 = file2.content.split('\n');
    
    const diffResult = lcsDiff(lines1, lines2);

    const getBgColor = (status: string, side: 'left'|'right') => {
        if (status === 'modified') return 'bg-yellow-900/40';
        if (status === 'removed' && side === 'left') return 'bg-red-900/40';
        if (status === 'added' && side === 'right') return 'bg-green-900/40';
        return 'bg-transparent';
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-800 p-4">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <h2 className="text-xl font-bold">Comparing Files</h2>
                <button onClick={onExit} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors">
                    <CloseIcon /> Exit Comparison
                </button>
            </div>
            <div className="flex gap-4 flex-1 min-h-0">
                <div className="w-1/2 flex flex-col bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
                    <div className="bg-gray-800 p-2 border-b border-gray-700 font-semibold truncate" title={file1.name}>{file1.name}</div>
                    <div className="overflow-auto font-mono text-sm p-2">
                        {diffResult.map(({ line1, lineNum1, status }, index) => (
                           <div key={`left-${index}`} className={`flex ${getBgColor(status, 'left')}`}>
                                <span className="w-10 text-right pr-4 text-gray-500 select-none">{lineNum1 || ''}</span>
                                <pre className="flex-1 whitespace-pre-wrap min-h-[1.25rem]">{line1 ?? ''}</pre>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="w-1/2 flex flex-col bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
                     <div className="bg-gray-800 p-2 border-b border-gray-700 font-semibold truncate" title={file2.name}>{file2.name}</div>
                     <div className="overflow-auto font-mono text-sm p-2">
                        {diffResult.map(({ line2, lineNum2, status }, index) => (
                           <div key={`right-${index}`} className={`flex ${getBgColor(status, 'right')}`}>
                                <span className="w-10 text-right pr-4 text-gray-500 select-none">{lineNum2 || ''}</span>
                                <pre className="flex-1 whitespace-pre-wrap min-h-[1.25rem]">{line2 ?? ''}</pre>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};