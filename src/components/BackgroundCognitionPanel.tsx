import React, { useEffect, useState } from 'react';
import { CloseIcon, PlayIcon, BrainIcon, FileIcon } from './icons';
import workspace from '../services/workspaceManager';
import type { AISettings, WorkspaceActivity } from '../types';

interface BackgroundCognitionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AISettings;
  setSettings: React.Dispatch<React.SetStateAction<AISettings>>;
  isCognitionRunning: boolean;
  onRunCognitionNow: () => void;
}

export const BackgroundCognitionPanel: React.FC<BackgroundCognitionPanelProps> = ({
  isOpen, onClose, settings, setSettings, isCognitionRunning, onRunCognitionNow
}) => {
  const [recentActivity, setRecentActivity] = useState<WorkspaceActivity[]>([]);
  const [workspaceStats, setWorkspaceStats] = useState({ files: 0, staged: 0, commits: 0 });

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    const loadWorkspaceInfo = async () => {
      const files = await workspace.fsList('reflex://', { limit: 100 });
      const staged = await (workspace.staging as any).diff();
      const commits = await (workspace.staging as any).getCommits();
      const activity = await workspace.getRecentActivity(10);
      if (!mounted) return;
      setWorkspaceStats({ files: files.length, staged: staged.length, commits: commits.length });
      setRecentActivity(activity);
    };
    loadWorkspaceInfo();
    const interval = setInterval(loadWorkspaceInfo, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, [isOpen]);

  const handleIntervalChange = (minutes: number) => {
    setSettings(prev => ({ ...prev, backgroundCognitionRate: minutes * 60 * 1000 }));
  };

  const handleWorkspaceModeChange = (mode: 'observe' | 'write' | 'full') => {
    setSettings(prev => ({ ...prev, backgroundWorkspaceMode: mode }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="flex justify-between items-center p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <BrainIcon />
            <h2 className="font-semibold text-lg text-gray-200">Background Cognition & AI Workspace</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm font-semibold px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md">Close</button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Cognition Schedule</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-2">Run background cognition every:</label>
                <div className="flex items-center gap-3">
                  <input type="number" min={0} value={Math.round(settings.backgroundCognitionRate / 60000)} onChange={e => handleIntervalChange(Number(e.target.value))} className="w-24 bg-gray-800 border border-gray-600 rounded-md p-2 text-sm text-white" />
                  <span className="text-gray-400 text-sm">minutes (0 = off)</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-800 rounded-md">
                <div>
                  <span className="text-sm text-gray-300">Status:</span>
                  <span className={`ml-2 text-sm font-semibold ${isCognitionRunning ? 'text-green-400' : 'text-gray-500'}`}>{isCognitionRunning ? 'Running' : 'Idle'}</span>
                </div>
                <button onClick={onRunCognitionNow} disabled={isCognitionRunning} className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 text-white text-sm rounded-md">
                  <PlayIcon /> Run Now
                </button>
              </div>
            </div>
          </section>

          <section className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">AI Workspace Access (reflex://)</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-2">Workspace Mode:</label>
                <select value={settings.backgroundWorkspaceMode || 'observe'} onChange={(e) => handleWorkspaceModeChange(e.target.value as any)} className="w-full bg-gray-800 border border-gray-600 rounded-md p-2 text-sm text-white">
                  <option value="observe">Observe Only (Read files, no writes)</option>
                  <option value="write">Write & Stage (Save drafts, stage changes)</option>
                  <option value="full">Full Access (Write, stage, auto-commit)</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-800 p-3 rounded-md"><div className="text-2xl font-bold text-cyan-400">{workspaceStats.files}</div><div className="text-xs text-gray-400 mt-1">Files</div></div>
                <div className="bg-gray-800 p-3 rounded-md"><div className="text-2xl font-bold text-yellow-400">{workspaceStats.staged}</div><div className="text-xs text-gray-400 mt-1">Staged</div></div>
                <div className="bg-gray-800 p-3 rounded-md"><div className="text-2xl font-bold text-green-400">{workspaceStats.commits}</div><div className="text-xs text-gray-400 mt-1">Commits</div></div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-400 uppercase">What AI Does During Background Cycles:</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2"><span className="text-cyan-400">•</span><span className="text-gray-300">Research insights saved to <code className="text-cyan-400">reflex://notes/research_*.md</code></span></li>
                  <li className="flex items-start gap-2"><span className="text-cyan-400">•</span><span className="text-gray-300">Cognitive state tracked in <code className="text-cyan-400">reflex://system/cognitive_state.json</code></span></li>
                  <li className="flex items-start gap-2"><span className="text-cyan-400">•</span><span className="text-gray-300">Knowledge updates staged for review before commit</span></li>
                </ul>
              </div>
            </div>
          </section>

          <section className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Recent Workspace Activity</h3>
            {recentActivity.length === 0 ? (<p className="text-xs text-gray-500 italic text-center py-4">No recent activity</p>) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">{recentActivity.map((a, i) => (<li key={i} className="flex items-start gap-2 p-2 bg-gray-800 rounded text-xs"><FileIcon /><div className="flex-1"><div className="text-gray-300">{a.action}</div><div className="text-gray-500 text-xs mt-0.5">{a.path} • {new Date(a.timestamp).toLocaleString()}</div></div></li>))}</ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default BackgroundCognitionPanel;
