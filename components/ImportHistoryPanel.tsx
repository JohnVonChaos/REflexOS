import React from 'react';
import type { ProjectFile } from '../types';

interface ImportHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  importedFiles: ProjectFile[];
}

export const ImportHistoryPanel: React.FC<ImportHistoryPanelProps> = ({ isOpen, onClose, importedFiles }) => {
  if (!isOpen) return null;

  const files = importedFiles.slice().sort((a, b) => b.importedAt - a.importedAt);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-3/5 max-w-3xl bg-gray-800 p-6 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Import History</h2>
          <button onClick={onClose} className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600">Close</button>
        </div>
        {files.length === 0 ? (
          <p className="text-sm text-gray-400">No imports yet.</p>
        ) : (
          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {files.map(f => (
              <li key={f.id} className="flex items-center justify-between p-2 bg-gray-900 rounded">
                <div className="flex-1 text-sm text-gray-200 truncate">{f.name}</div>
                <div className="text-xs text-gray-400 ml-4">{new Date(f.importedAt).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ImportHistoryPanel;
