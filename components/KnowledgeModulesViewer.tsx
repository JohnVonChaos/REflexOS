import React, { useState, useRef } from 'react';
import type { KnowledgeModule } from '../types';
import { CloseIcon, UploadIcon, TrashIcon } from './icons';
import { ToggleSwitch } from './ToggleSwitch';
import { srgService } from '../services/srgService';

interface KnowledgeModulesViewerProps {
  isOpen: boolean;
  onClose: () => void;
  onModulesChange?: () => void;
}

export const KnowledgeModulesViewer: React.FC<KnowledgeModulesViewerProps> = ({
  isOpen,
  onClose,
  onModulesChange
}) => {
  const [modules, setModules] = useState<KnowledgeModule[]>(() => srgService.getKnowledgeModules());
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImportModule = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      console.log(`[KnowledgeModules] Importing ${file.name} (${text.length} chars)`);

      const title = prompt('Enter title for this knowledge module:', file.name.replace(/\.(txt|md|json)$/, ''));
      if (!title) {
        alert('Import cancelled - title is required');
        event.target.value = '';
        return;
      }

      const categoryInput = prompt(
        'Select category:\n' +
        '1 = Literature\n' +
        '2 = Technical\n' +
        '3 = Philosophy\n' +
        '4 = Psychology\n' +
        '5 = History\n' +
        '6 = Manual\n' +
        '7 = Other',
        '7'
      );

      const categoryMap: Record<string, KnowledgeModule['category']> = {
        '1': 'literature',
        '2': 'technical',
        '3': 'philosophy',
        '4': 'psychology',
        '5': 'history',
        '6': 'manual',
        '7': 'other'
      };

      const category = categoryMap[categoryInput || '7'] || 'other';

      srgService.ingestHybrid(text, {
        title,
        source: file.name,
        category
      });

      setModules(srgService.getKnowledgeModules());
      onModulesChange?.();

      const wordCount = text.split(/\s+/).length;
      alert(`Loaded "${title}" into knowledge base!\n${wordCount.toLocaleString()} words added to corpus.\nCategory: ${category}`);
    } catch (e: any) {
      console.error('[KnowledgeModules] Failed to import:', e);
      alert(`Failed to import module: ${e.message}`);
    }
    event.target.value = '';
  };

  const handleDeleteModule = (moduleId: string) => {
    // TODO: Implement module deletion in srgService
    alert('Module deletion not yet implemented. Use session export/import to manage modules for now.');
  };

  const handleToggleActive = (moduleId: string) => {
    // TODO: Implement active/inactive toggle in srgService
    alert('Module toggle not yet implemented. All loaded modules are currently active.');
  };

  const getCategoryColor = (category: KnowledgeModule['category']) => {
    const colors: Record<KnowledgeModule['category'], string> = {
      literature: 'text-purple-400',
      technical: 'text-blue-400',
      philosophy: 'text-amber-400',
      psychology: 'text-pink-400',
      history: 'text-green-400',
      manual: 'text-cyan-400',
      other: 'text-gray-400'
    };
    return colors[category] || colors.other;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-cyan-400">Knowledge Modules</h2>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.json"
              onChange={handleImportModule}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded-md text-sm font-semibold transition-colors"
            >
              <UploadIcon />
              Import Module
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded-md hover:bg-gray-800 transition-colors"
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {modules.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">No knowledge modules loaded</p>
              <p className="text-sm mt-2">Import a text file to get started</p>
            </div>
          ) : (
            modules.map((module) => (
              <div
                key={module.id}
                className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 hover:border-gray-600/50 transition-colors"
              >
                {/* Module Header */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-gray-200 truncate">
                      {module.title}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                      <span>{module.tokenCount.toLocaleString()} entries</span>
                      <span>•</span>
                      <span className={getCategoryColor(module.category)}>
                        {module.category}
                      </span>
                      <span>•</span>
                      <span className="text-green-400">Active</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteModule(module.id)}
                    className="p-2 text-gray-500 hover:text-red-500 rounded transition-colors"
                    title="Delete module"
                  >
                    <TrashIcon />
                  </button>
                </div>

                {/* Module Controls */}
                <div className="flex items-center gap-4 pt-3 border-t border-gray-700/50">
                  <div className="flex items-center gap-2">
                    <ToggleSwitch
                      checked={true}
                      onToggle={() => handleToggleActive(module.id)}
                      title="Toggle active/inactive"
                    />
                    <span className="text-sm text-gray-400">Active</span>
                  </div>

                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm text-gray-400 whitespace-nowrap">Weight: 1.00</span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      defaultValue="1.0"
                      className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      title="Adjust module weight (influence on queries)"
                      disabled
                    />
                  </div>
                </div>

                {/* Module Metadata */}
                <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-500">
                  <div>Source: {module.source}</div>
                  <div>Loaded: {new Date(module.loadedAt).toLocaleString()}</div>
                  <div>Corpus Range: {module.startPosition.toLocaleString()} - {module.endPosition.toLocaleString()}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Stats */}
        {modules.length > 0 && (
          <footer className="p-4 border-t border-gray-700 bg-gray-800/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">
                Total Modules: <span className="font-bold text-gray-200">{modules.length}</span>
              </span>
              <span className="text-gray-400">
                Total Tokens: <span className="font-bold text-gray-200">
                  {modules.reduce((sum, m) => sum + m.tokenCount, 0).toLocaleString()}
                </span>
              </span>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};
