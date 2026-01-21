import React, { useEffect, useState } from 'react';
import workspace, { WorkspaceManager } from '../services/workspaceManager';
import type { StagingChange, StagingCommit } from '../types';
import computeLineDiff from '../utils/diff';

export const FileHud: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [recents, setRecents] = useState<Array<{ path: string; at: number }>>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [staged, setStaged] = useState<StagingChange[]>([]);
  const [commits, setCommits] = useState<StagingCommit[]>([]);
  const [selectedChange, setSelectedChange] = useState<StagingChange | null>(null);
  const [diffLines, setDiffLines] = useState<any[]>([]);
  const [commitMsg, setCommitMsg] = useState('');

  const refreshAll = async () => {
    setFiles(await workspace.fsList('reflex://', { limit: 50 }));
    setRecents(await workspace.fsRecent(20));
    setStaged(await (workspace.staging as any).diff());
    setCommits(await (workspace.staging as any).getCommits());
  };

  useEffect(() => { refreshAll(); }, []);

  const openFile = async (path: string) => {
    const { file } = await workspace.fsOpen(path);
    if (file) {
      alert(`Open ${path}\n\nPreview:\n${file.content.slice(0,200)}`);
    } else {
      alert('File not found');
    }
  };

  const openDiff = async (change: StagingChange) => {
    setSelectedChange(change);
    const before = String(change.before ?? '');
    const after = String(change.after ?? '');
    setDiffLines(computeLineDiff(before, after));
  };

  const discardChange = async (path: string) => {
    if (!confirm(`Discard staged change for ${path}?`)) return;
    await (workspace.staging as any).deleteFile(path);
    await refreshAll();
  };

  const handleCommit = async () => {
    if (!commitMsg) return alert('Please enter a commit message');
    await (workspace.staging as any).commit(commitMsg, 'user');
    setCommitMsg('');
    await refreshAll();
  };

  const handleDiscard = async () => {
    if (!confirm('Discard all staged changes?')) return;
    await (workspace.staging as any).discard();
    await refreshAll();
  };

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center p-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-70 w-full max-w-4xl bg-gray-800 rounded-lg border border-gray-700 shadow-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">File HUD</h3>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600">Close</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1 bg-gray-900 p-3 rounded"> 
            <h4 className="font-semibold mb-2">Recent Files</h4>
            <ul className="text-sm space-y-2 max-h-64 overflow-auto">
              {recents.map(r => (
                <li key={r.path} className="flex justify-between items-center">
                  <button className="text-left text-xs text-gray-200 truncate" onClick={() => openFile(r.path)} title={r.path}>{r.path}</button>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-1 bg-gray-900 p-3 rounded">
            <h4 className="font-semibold mb-2">Staged Changes</h4>
            <ul className="text-sm space-y-2 max-h-64 overflow-auto">
              {staged.length === 0 && <li className="text-xs text-gray-400">No staged changes</li>}
              {staged.map(s => (
                <li key={s.path} className="flex justify-between items-start">
                  <div>
                    <button onClick={() => openDiff(s)} className="text-xs text-gray-200 truncate text-left" title={s.path}>{s.path}</button>
                    <div className="text-xs text-gray-400">{s.type}</div>
                    {s.after && <div className="text-xs text-gray-300 max-h-16 overflow-auto truncate">{String(s.after).slice(0,200)}</div>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => discardChange(s.path)} className="px-2 py-1 bg-red-700 rounded text-xs">Discard</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <input className="w-full p-1 text-sm" placeholder="Commit message" value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} />
              <div className="mt-2 flex gap-2">
                <button onClick={handleCommit} className="px-2 py-1 bg-emerald-600 rounded text-sm">Commit</button>
                <button onClick={handleDiscard} className="px-2 py-1 bg-red-600 rounded text-sm">Discard</button>
              </div>
            </div>
          </div>

          <div className="col-span-1 bg-gray-900 p-3 rounded">
            <h4 className="font-semibold mb-2">Recent Commits</h4>
            <ul className="text-sm space-y-2 max-h-64 overflow-auto">
              {commits.length === 0 && <li className="text-xs text-gray-400">No commits yet</li>}
              {commits.map(c => (
                <li key={c.id} className="text-xs text-gray-200">
                  <div className="font-semibold">{c.message || '<no message>'}</div>
                  <div className="text-xs text-gray-400">{new Date(c.timestamp).toLocaleString()} · {c.author}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
    {/* Diff Modal */}
    {selectedChange && (
      <div className="fixed inset-0 z-70 flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedChange(null)} />
        <div className="relative z-80 w-full max-w-4xl bg-gray-800 rounded-lg border border-gray-700 shadow-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold">Diff: {selectedChange.path}</h4>
            <button onClick={() => setSelectedChange(null)} className="px-2 py-1 bg-gray-700 rounded">Close</button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs max-h-96 overflow-auto">
            <div className="bg-black/20 p-2 rounded">
              <div className="text-xs font-semibold mb-1">Before</div>
              <pre className="whitespace-pre-wrap">
                {diffLines.map((l, idx) => (
                  <div key={idx} className={`${l.type === 'removed' ? 'bg-red-900/50' : l.type === 'added' ? 'bg-green-900/20' : ''} p-1`}>{l.left}</div>
                ))}
              </pre>
            </div>
            <div className="bg-black/20 p-2 rounded">
              <div className="text-xs font-semibold mb-1">After</div>
              <pre className="whitespace-pre-wrap">
                {diffLines.map((l, idx) => (
                  <div key={idx} className={`${l.type === 'added' ? 'bg-green-900/50' : l.type === 'removed' ? 'bg-red-900/20' : ''} p-1`}>{l.right}</div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      </div>
    )}
  );
};

export default FileHud;
