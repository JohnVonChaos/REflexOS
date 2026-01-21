import React, { useState } from 'react';
import type { ProjectFile } from '../types';
import { CloseIcon, UploadIcon } from './icons';

interface ImportHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  importedFiles?: ProjectFile[];
  onImported?: (count: number) => void;
}

export const ImportHistoryPanel: React.FC<ImportHistoryPanelProps> = ({ isOpen, onClose, importedFiles = [], onImported }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatus('Reading file...');

    try {
      const text = await file.text();
      setStatus('Detecting format...');
      const { parseImportFile, importEntries } = await import('../services/chatImportService');
      const parsed = await parseImportFile(text, file.name);

      if (parsed.sessionState) {
        setStatus('Importing session state...');
        // dynamic import of chat hook is not available here; dispatch event to app
        window.dispatchEvent(new CustomEvent('reflex:load-session', { detail: parsed.sessionState }));
        setStatus(`✓ Session imported (${parsed.sessionState.messages?.length || 0} messages)`);
        onImported?.(parsed.sessionState.messages?.length || 0);
      } else if (parsed.entries && parsed.entries.length > 0) {
        setStatus(`Importing ${parsed.entries.length} turns...`);
        const created = await importEntries(parsed.entries as any);
        setStatus(`✓ Successfully imported ${created.length} messages!`);
        onImported?.(created.length);
      } else {
        setStatus('Error: Could not parse file');
      }

      setTimeout(() => { onClose(); }, 1600);
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Import Chat History</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded"><CloseIcon /></button>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-400">Import conversations from ChatGPT, Claude, or other assistants.</p>

          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700/50">
            <div className="flex flex-col items-center">
              <UploadIcon />
              <p className="mt-2 text-sm text-gray-400">{isProcessing ? 'Processing...' : 'Click to select conversations.json or .txt'}</p>
            </div>
            <input type="file" accept=".json,.txt" onChange={handleFileSelect} disabled={isProcessing} className="hidden" />
          </label>

          {status && (
            <div className={`text-sm p-3 rounded ${status.startsWith('Error') ? 'bg-red-900/50 text-red-300' : status.startsWith('✓') ? 'bg-green-900/50 text-green-300' : 'bg-blue-900/50 text-blue-300'}`}>
              {status}
            </div>
          )}

          {importedFiles.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Imported Files</h3>
              <ul className="text-xs text-gray-300 space-y-1 mt-2">
                {importedFiles.map(f => (
                  <li key={f.id} className="truncate">{f.name} · {new Date(f.importedAt).toLocaleString()}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-gray-500 space-y-1">
            <p><strong>ChatGPT:</strong> Settings → Data Controls → Export</p>
            <p><strong>Claude:</strong> Settings → Export conversations</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportHistoryPanel;
