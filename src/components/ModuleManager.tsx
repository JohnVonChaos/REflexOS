import React from 'react';
import { CloseIcon, TrashIcon, UploadIcon } from './icons';
import { srgModuleService } from '../services/srgModuleService';
import type { SRGModule, AISettings } from '../types';

interface ModuleManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenImport: () => void;  // Opens import modal
  // Stage-aware props - when provided, edits will be applied to this stage's modules
  stageId?: string | null;
  settings?: AISettings;
  setSettings?: React.Dispatch<React.SetStateAction<AISettings>>;
}

export const ModuleManager: React.FC<ModuleManagerProps> = ({
  isOpen,
  onClose,
  onOpenImport,
  stageId,
  settings,
  setSettings
}) => {
  const [modules, setModules] = React.useState<SRGModule[]>([]);
  const [refreshKey, setRefreshKey] = React.useState(0);

  // When opened with a stage, ensure per-stage modules are initialized (migration)
  React.useEffect(() => {
    const installed = srgModuleService.listModules();
    setModules(installed);

    if (isOpen && stageId && settings && setSettings) {
      const stage = settings.workflow.find(s => s.id === stageId);
      if (stage && !stage.modules) {
        // Initialize with all installed modules enabled at weight 1.0
        const init = installed.map(m => ({ id: m.id, enabled: true, weight: 1.0 }));
        setSettings(prev => ({ ...prev, workflow: prev.workflow.map(st => st.id === stageId ? { ...st, modules: init } : st) }));
      }
    }
  }, [isOpen, refreshKey, stageId, settings, setSettings]);

  const handleToggle = async (moduleId: string) => {
    if (stageId && settings && setSettings) {
      setSettings(prev => ({
        ...prev,
        workflow: prev.workflow.map(s => {
          if (s.id !== stageId) return s;
          const modules = s.modules ? [...s.modules] : [];
          const idx = modules.findIndex(m => m.id === moduleId);
          if (idx === -1) {
            modules.push({ id: moduleId, enabled: true, weight: 1.0 });
          } else {
            modules[idx] = { ...modules[idx], enabled: !modules[idx].enabled };
          }
          return { ...s, modules };
        })
      }));
    } else {
      // Global toggle behavior (backwards-compatible)
      await srgModuleService.toggleModule(moduleId);
      setRefreshKey(k => k + 1);
    }
  };

  const handleWeightChange = async (moduleId: string, weight: number) => {
    if (stageId && settings && setSettings) {
      setSettings(prev => ({
        ...prev,
        workflow: prev.workflow.map(s => {
          if (s.id !== stageId) return s;
          const modules = s.modules ? s.modules.map(m => m.id === moduleId ? { ...m, weight } : m) : [{ id: moduleId, enabled: true, weight }];
          return { ...s, modules };
        })
      }));
    } else {
      await srgModuleService.updateModuleWeight(moduleId, weight);
      setRefreshKey(k => k + 1);
    }
  };

  const handleDelete = async (id: string) => {
    await srgModuleService.deleteModule(id);
    setRefreshKey(k => k + 1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-cyan-400">Knowledge Modules {stageId ? `— Stage: ${settings?.workflow.find(s => s.id === stageId)?.name || stageId}` : ''}</h2>
          <div className="flex gap-2">
            <button
              onClick={onOpenImport}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md flex items-center gap-2 text-sm"
            >
              <UploadIcon />
              Import Module
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Module List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {modules.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p>No modules loaded yet.</p>
              <p className="text-sm mt-2">Import chat history or books to create modules.</p>
            </div>
          ) : (
            modules.map(module => {
              const stage = stageId && settings ? settings.workflow.find(s => s.id === stageId) : undefined;
              const stageCfg = stage?.modules?.find(m => m.id === module.id);
              const isEnabled = stageId ? (stageCfg ? stageCfg.enabled : false) : module.isActive;
              const weight = stageId ? (stageCfg ? stageCfg.weight : 1.0) : module.weight;
              return (
              <div
                key={module.id}
                className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 space-y-3"
              >
                {/* Module Header */}
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{module.name}</h3>
                    <p className="text-sm text-gray-400 mt-1">{module.description}</p>
                    <div className="flex gap-2 mt-2 text-xs text-gray-500">
                      <span>{module.metadata.entryCount} entries</span>
                      <span>•</span>
                      <span>{module.metadata.expertise}</span>
                      <span>•</span>
                      <span className={module.isActive ? 'text-green-400' : 'text-red-400'}>
                        {module.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(module.id)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"
                    title="Delete module"
                  >
                    <TrashIcon />
                  </button>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-4">
                  {/* Active Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => handleToggle(module.id)}
                      className="form-checkbox bg-gray-700 border-gray-600 rounded"
                    />
                    <span className="text-sm text-gray-300">Active for stage</span>
                  </label>

                  {/* Weight Slider */}
                  <div className="flex-1 flex items-center gap-3">
                    <label className="text-sm text-gray-400 whitespace-nowrap">
                      Weight: {weight.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={weight}
                      onChange={(e) => handleWeightChange(module.id, parseFloat(e.target.value))}
                      className="flex-1 accent-cyan-500"
                      disabled={!isEnabled}
                    />
                  </div>
                </div>

                {/* Topics */}
                {module.metadata.topics.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {module.metadata.topics.map(topic => (
                      <span
                        key={topic}
                        className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ModuleManager;
