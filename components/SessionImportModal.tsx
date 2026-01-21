import React, { useState } from 'react';
import { CloseIcon } from './icons';

export interface ImportOptions {
  workflow: boolean;
  aiSettings: boolean;
  messages: boolean;
  contextItems: boolean;
  preferences: boolean;
}

export type ImportMode = 'replace' | 'merge';

export interface ImportModeSettings {
  workflow: ImportMode;
  aiSettings: ImportMode;
  messages: ImportMode;
  contextItems: ImportMode;
  preferences: ImportMode;
}

const SessionImportModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onImport: (options: ImportOptions, modes: ImportModeSettings) => Promise<void>;
  isLoading?: boolean;
}> = ({ isOpen, onClose, onImport, isLoading = false }) => {
  const [options, setOptions] = useState<ImportOptions>({
    workflow: true,
    aiSettings: true,
    messages: true,
    contextItems: true,
    preferences: true,
  });

  const [modes, setModes] = useState<ImportModeSettings>({
    workflow: 'replace',
    aiSettings: 'replace',
    messages: 'merge',
    contextItems: 'merge',
    preferences: 'replace',
  });

  if (!isOpen) return null;

  const handleToggleOption = (key: keyof ImportOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSetMode = (key: keyof ImportModeSettings, mode: ImportMode) => {
    setModes(prev => ({ ...prev, [key]: mode }));
  };

  const handleImportAll = async () => {
    try {
      await onImport(options, modes);
      onClose();
    } catch (e) {
      console.error('Import failed:', e);
    }
  };

  const handleSelectAll = () => {
    setOptions({
      workflow: true,
      aiSettings: true,
      messages: true,
      contextItems: true,
      preferences: true,
    });
  };

  const handleSelectNone = () => {
    setOptions({
      workflow: false,
      aiSettings: false,
      messages: false,
      contextItems: false,
      preferences: false,
    });
  };

  const selectedCount = Object.values(options).filter(Boolean).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Import Session Configuration</h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-white/70 hover:text-white disabled:opacity-50 transition"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Description */}
          <p className="text-sm text-slate-300 mb-6">
            Select which aspects of the workspace to import. You can choose to replace your current settings or merge with existing data.
          </p>

          {/* Quick Actions */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={handleSelectAll}
              disabled={isLoading}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition"
            >
              Select All
            </button>
            <button
              onClick={handleSelectNone}
              disabled={isLoading}
              className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded transition"
            >
              Select None
            </button>
            <span className="text-xs text-slate-400 ml-auto flex items-center">
              {selectedCount} selected
            </span>
          </div>

          {/* Import Options */}
          <div className="space-y-4">
            {/* Workflow */}
            <ImportOptionRow
              title="Workflow Configuration"
              description="Cognitive workflow stages and execution order"
              checked={options.workflow}
              mode={modes.workflow}
              onToggle={() => handleToggleOption('workflow')}
              onModeChange={(mode) => handleSetMode('workflow', mode)}
              disabled={isLoading}
            />

            {/* AI Settings */}
            <ImportOptionRow
              title="AI Provider Settings"
              description="API keys, model identifiers, provider configurations"
              checked={options.aiSettings}
              mode={modes.aiSettings}
              onToggle={() => handleToggleOption('aiSettings')}
              onModeChange={(mode) => handleSetMode('aiSettings', mode)}
              disabled={isLoading}
            />

            {/* Messages */}
            <ImportOptionRow
              title="Message History"
              description="All conversation messages and memory atoms"
              checked={options.messages}
              mode={modes.messages}
              onToggle={() => handleToggleOption('messages')}
              onModeChange={(mode) => handleSetMode('messages', mode)}
              disabled={isLoading}
              defaultMode="merge"
            />

            {/* Context Items */}
            <ImportOptionRow
              title="Context Items"
              description="Archived context, axioms, and stored memories"
              checked={options.contextItems}
              mode={modes.contextItems}
              onToggle={() => handleToggleOption('contextItems')}
              onModeChange={(mode) => handleSetMode('contextItems', mode)}
              disabled={isLoading}
              defaultMode="merge"
            />

            {/* Preferences */}
            <ImportOptionRow
              title="User Preferences"
              description="Core narrative, RCB state, and other preferences"
              checked={options.preferences}
              mode={modes.preferences}
              onToggle={() => handleToggleOption('preferences')}
              onModeChange={(mode) => handleSetMode('preferences', mode)}
              disabled={isLoading}
            />
          </div>

          {/* Mode Legend */}
          <div className="bg-slate-800/50 rounded p-3 mt-6 text-xs text-slate-400 space-y-1">
            <div><span className="text-blue-400">●</span> Replace: Clear current data before importing</div>
            <div><span className="text-green-400">●</span> Merge: Add imported data to existing (messages/contexts default to merge)</div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 bg-slate-800/50 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={handleImportAll}
            disabled={isLoading || selectedCount === 0}
            className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium transition"
          >
            {isLoading ? 'Importing...' : `Import Selected (${selectedCount})`}
          </button>
        </div>
      </div>
    </div>
  );
};

const ImportOptionRow: React.FC<{
  title: string;
  description: string;
  checked: boolean;
  mode: 'replace' | 'merge';
  onToggle: () => void;
  onModeChange: (mode: 'replace' | 'merge') => void;
  disabled?: boolean;
  defaultMode?: 'replace' | 'merge';
}> = ({ title, description, checked, mode, onToggle, onModeChange, disabled = false, defaultMode }) => {
  return (
    <div className="border border-slate-700 rounded-lg p-4 space-y-3">
      {/* Checkbox and Title */}
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
          className="mt-1 w-4 h-4 rounded accent-purple-500 cursor-pointer disabled:opacity-50"
        />
        <div className="flex-1">
          <h3 className="font-medium text-white text-sm">{title}</h3>
          <p className="text-xs text-slate-400 mt-1">{description}</p>
        </div>
      </div>

      {/* Mode Selection */}
      {checked && (
        <div className="ml-7 flex items-center gap-3 text-xs">
          <span className="text-slate-400">Import mode:</span>
          <button
            onClick={() => onModeChange('replace')}
            disabled={disabled}
            className={`px-2 py-1 rounded transition ${
              mode === 'replace'
                ? 'bg-red-600/50 text-red-200 border border-red-400'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50'
            }`}
          >
            Replace
          </button>
          <button
            onClick={() => onModeChange('merge')}
            disabled={disabled}
            className={`px-2 py-1 rounded transition ${
              mode === 'merge'
                ? 'bg-green-600/50 text-green-200 border border-green-400'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50'
            }`}
          >
            Merge
          </button>
        </div>
      )}
    </div>
  );
};

export default SessionImportModal;
