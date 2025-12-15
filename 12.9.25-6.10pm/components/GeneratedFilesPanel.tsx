import React from 'react';
import type { MemoryAtom } from '../types';
import { DownloadIcon, FileIcon } from './icons';

// Add this line to be able to use JSZip from window
declare const JSZip: any;

interface GeneratedFilesPanelProps {
  files: NonNullable<MemoryAtom['generatedFiles']>;
}

export const GeneratedFilesPanel: React.FC<GeneratedFilesPanelProps> = ({ files }) => {

  const handleDownloadSingle = (file: NonNullable<MemoryAtom['generatedFiles']>[0]) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const handleDownloadAll = async () => {
    if (files.length === 0) return;
    const zip = new JSZip();
    files.forEach(file => {
      zip.file(file.name, file.content);
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated_files.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
       {files.length > 0 && (
        <div className="flex-shrink-0 p-2 border-b border-gray-700/50 flex justify-between items-center">
            <h4 className="font-semibold text-xs text-gray-400">Files</h4>
            <button
                onClick={handleDownloadAll}
                className="flex items-center gap-1.5 px-2 py-1 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors text-xs"
            >
                <DownloadIcon /> Download All
            </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
      {files.length === 0 ? (
        <div className="text-center text-gray-500 p-4 h-full flex items-center justify-center">
          <p>Generated files from the chat will appear here.</p>
        </div>
      ) : (
        <ul className="space-y-1 p-1">
          {files.map((file, index) => (
            <li key={index} className="group flex items-center gap-3 p-2 rounded-md bg-gray-800/50">
              <FileIcon />
              <div className="flex-1 truncate">
                  <p className="text-gray-300 text-sm truncate" title={file.name}>{file.name}</p>
                  <p className="text-xs text-gray-500">{file.language}</p>
              </div>
              <button
                onClick={() => handleDownloadSingle(file)}
                className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-700 opacity-0 group-hover:opacity-100"
                aria-label={`Download ${file.name}`}
              >
                <DownloadIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
};