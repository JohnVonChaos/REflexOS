import React, { useState } from 'react';
import { CloseIcon, UploadIcon } from './icons';
import { srgModuleService } from '../services/srgModuleService';
import { parseImportFile } from '../services/chatImportService';

interface ImportModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;  // Refresh module list
}

export const ImportModuleModal: React.FC<ImportModuleModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  
  // Form fields
  const [moduleName, setModuleName] = useState('');
  const [description, setDescription] = useState('');
  const [expertise, setExpertise] = useState('');
  const [topics, setTopics] = useState('');
  const [weight, setWeight] = useState(1.0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!moduleName.trim()) {
      setStatus('Please enter a module name first');
      e.target.value = '';
      return;
    }

    setIsProcessing(true);
    setStatus('Reading file...');

    try {
        const text = await file.text();
        const result = await parseImportFile(text, file.name);

        // For raw text files, prefer treating the whole file as a single training document
        const ext = (file.name || '').split('.').pop()?.toLowerCase();
        let entries = result.entries;
        if (ext === 'txt') {
          // Use whole file as single user entry (mirrors the_word.train -> ingest_file behavior)
          entries = [{ source: file.name, role: 'user', text, timestamp: Date.now() }];
        }

        if (!entries || entries.length === 0) {
          throw new Error('No valid entries found in file');
        }

        // Ensure timestamps are numbers to satisfy srgModuleService typings
        const normalizedEntries = entries.map((en: any) => ({
          ...en,
          timestamp: typeof en.timestamp === 'string' ? Number(en.timestamp) || Date.now() : (typeof en.timestamp === 'number' ? en.timestamp : Date.now())
        }));

        setStatus(`Importing ${normalizedEntries.length} entries...`);

        const module = await srgModuleService.importModule(normalizedEntries, {
        name: moduleName,
        description: description || 'Imported knowledge module',
        weight,
        expertise: expertise || 'general',
        topics: topics.split(',').map(t => t.trim()).filter(Boolean),
        source: 'manual'
      });
        setStatus(`✓ Module "${module.name}" created with ${entries.length} entries!`);
      
      setTimeout(() => {
        onSuccess();
        onClose();
        // Reset form
        setModuleName('');
        setDescription('');
        setExpertise('');
        setTopics('');
        setWeight(1.0);
        setStatus('');
      }, 2000);

    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-cyan-400">Import Knowledge Module</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded">
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-4">
          {/* Module Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">
              Module Name *
            </label>
            <input
              type="text"
              value={moduleName}
              onChange={(e) => setModuleName(e.target.value)}
              placeholder="e.g., Art of War Strategy"
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white"
              disabled={isProcessing}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this module teach?"
              rows={2}
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white resize-none"
              disabled={isProcessing}
            />
          </div>

          {/* Expertise & Topics */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-1">
                Expertise
              </label>
              <input
                type="text"
                value={expertise}
                onChange={(e) => setExpertise(e.target.value)}
                placeholder="e.g., strategy"
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white text-sm"
                disabled={isProcessing}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-1">
                Weight
              </label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(parseFloat(e.target.value))}
                className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white text-sm"
                disabled={isProcessing}
              />
            </div>
          </div>

          {/* Topics */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">
              Topics (comma-separated)
            </label>
            <input
              type="text"
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              placeholder="strategy, warfare, philosophy"
              className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white text-sm"
              disabled={isProcessing}
            />
          </div>

          {/* File Upload */}
          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700/50">
            <div className="flex flex-col items-center">
              <UploadIcon />
              <p className="mt-2 text-sm text-gray-400">
                {isProcessing ? 'Processing...' : 'Click to select file'}
              </p>
            </div>
            <input
              type="file"
              accept=".json,.txt"
              onChange={handleFileSelect}
              disabled={isProcessing}
              className="hidden"
            />
          </label>

          {/* Status */}
          {status && (
            <div className={`text-sm p-3 rounded ${
              status.startsWith('Error') 
                ? 'bg-red-900/50 text-red-300' 
                : status.startsWith('✓')
                ? 'bg-green-900/50 text-green-300'
                : 'bg-blue-900/50 text-blue-300'
            }`}>
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportModuleModal;
