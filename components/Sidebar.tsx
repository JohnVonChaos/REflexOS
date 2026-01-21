import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ProjectFile, MemoryAtom, GeneratedFile, BackgroundInsight } from '../types';
import { FileIcon, UploadIcon, DownloadIcon, CompareIcon, TrashIcon, BookIcon, ExpandIcon, CollapseIcon, SaveIcon, CrystalIcon, GlobeIcon, SpeakerIcon, FolderIcon, FolderOpenIcon, DocumentTextIcon, NetworkIcon, HistoryIcon, ScalesIcon } from './icons';
import { ToggleSwitch } from './ToggleSwitch';
import { speechService } from '../services/speechService';
import { InsightDisplay } from './InsightDisplay';

interface SidebarProps {
    projectFiles: ProjectFile[];
    generatedFiles: GeneratedFile[];
    selfNarrative: string;
    insights: (MemoryAtom & { backgroundInsight: BackgroundInsight })[];
    axioms: MemoryAtom[];
    onImportFiles: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onImportState: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onExportAll: () => void;
    onExportState: () => void;
    onCompareFiles: (files: ProjectFile[]) => void;
    onDeleteFiles: (files: ProjectFile[]) => void;
    onToggleFileContext: (fileId: string) => void;
    isFileInContext: (fileId: string) => boolean;
    onShowCrystal: () => void;
    isCrystalPanelVisible: boolean;
    onShowAxioms: () => void;
    onShowInsights: () => void;
    onShowLogs: () => void;
    onShowSrgExplorer: () => void;
    onShowFileHud?: () => void;
    onShowBackgroundCognition?: () => void;
    onShowKnowledgeModules: () => void;
    onShowImportHistory?: () => void;
    onToggleMessageContext: (uuid: string) => void;
    onToggleGeneratedFileContext: (fileName: string) => void;
    isGeneratedFileInContext: (fileName: string) => boolean;
}

interface FileTree {
    [key: string]: FileTree | ProjectFile[];
}

const buildFileTree = (files: ProjectFile[]): FileTree => {
    const tree: FileTree = {};
    files.forEach(file => {
        const parts = file.name.split('/');
        let currentLevel: any = tree;
        parts.forEach((part, index) => {
            if (index === parts.length - 1) { // It's a file
                if (!currentLevel._files) currentLevel._files = [];
                currentLevel._files.push(file);
            } else { // It's a directory
                if (!currentLevel[part]) currentLevel[part] = {};
                currentLevel = currentLevel[part];
            }
        });
    });
    return tree;
};

const FileTreeItem: React.FC<{
    name: string;
    item: FileTree | ProjectFile[];
    level: number;
    selectedFileIds: string[];
    handleFileSelectChange: (fileId: string, checked: boolean) => void;
    isFileInContext: (fileId: string) => boolean;
    onToggleFileContext: (fileId: string) => void;
    onDeleteFile: (file: ProjectFile) => void;
}> = ({ name, item, level, onDeleteFile, ...props }) => {
    const [isCollapsed, setIsCollapsed] = useState(true);

    if (Array.isArray(item)) { // Base case: list of files
        return (
            <ul className="space-y-1">
                {item.sort((a, b) => a.name.localeCompare(b.name)).map((file) => (
                    <li key={file.id} className="group flex items-center gap-2 p-1.5 rounded-md hover:bg-gray-800" style={{ paddingLeft: `${level * 12 + 12}px` }}>
                        <input type="checkbox" className="form-checkbox bg-gray-700 border-gray-600 rounded" checked={props.selectedFileIds.includes(file.id)} onChange={(e) => props.handleFileSelectChange(file.id, e.target.checked)} />
                        <FileIcon />
                        <span className="flex-1 text-sm text-gray-300 truncate" title={`${file.name}\nImported: ${new Date(file.importedAt).toLocaleString()}`}>{file.name.split('/').pop()}</span>
                        <div className="flex items-center gap-1">
                            <ToggleSwitch checked={props.isFileInContext(file.id)} onToggle={() => props.onToggleFileContext(file.id)} title="Include in context" />
                            <button
                                onClick={(e) => { e.stopPropagation(); onDeleteFile(file); }}
                                className="p-1 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete this file"
                            >
                                <TrashIcon />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        );
    }

    // Recursive case: directory
    const files = (item._files as ProjectFile[]) || [];
    const subdirectories = Object.keys(item).filter(key => key !== '_files');

    return (
        <div>
            <div
                className="group flex items-center gap-2 p-1.5 rounded-md hover:bg-gray-800 cursor-pointer"
                style={{ paddingLeft: `${level * 12 + 6}px` }}
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                {isCollapsed ? <FolderIcon /> : <FolderOpenIcon />}
                <span className="flex-1 text-sm font-semibold text-gray-400 truncate">{name}</span>
            </div>
            {!isCollapsed && (
                <div>
                    {subdirectories.sort().map(key => (
                        <FileTreeItem key={key} name={key} item={item[key] as FileTree} level={level + 1} onDeleteFile={onDeleteFile} {...props} />
                    ))}
                    {files.length > 0 && <FileTreeItem name="_files" item={files} level={level + 1} onDeleteFile={onDeleteFile} {...props} />}
                </div>
            )}
        </div>
    );
};


const CollapsibleSection: React.FC<{ title: string, count?: number, children: React.ReactNode, actions?: React.ReactNode }> = ({ title, count, children, actions }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    return (
        <div className="border-b border-gray-700/50">
            <div className="w-full flex justify-between items-center p-2 text-sm font-semibold text-gray-300 hover:bg-gray-800 group">
                <button onClick={() => setIsCollapsed(!isCollapsed)} className="flex items-center gap-2 flex-1">
                    <span>{title} {count !== undefined && `(${count})`}</span>
                </button>
                <div className="flex items-center gap-1">
                    {actions && <div className="flex items-center">{actions}</div>}
                    <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1 rounded hover:bg-gray-700">
                        {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                    </button>
                </div>
            </div>
            {!isCollapsed && <div className="p-1">{children}</div>}
        </div>
    );
}

export const Sidebar: React.FC<SidebarProps> = ({
    projectFiles,
    generatedFiles,
    selfNarrative,
    insights,
    axioms,
    onImportFiles,
    onImportState,
    onExportAll,
    onExportState,
    onCompareFiles,
    onDeleteFiles,
    onToggleFileContext,
    isFileInContext,
    onShowCrystal,
    isCrystalPanelVisible,
    onShowAxioms,
    onShowInsights,
    onShowLogs,
    onShowSrgExplorer,
    onShowKnowledgeModules,
    onShowImportHistory,
    onToggleMessageContext,
    onToggleGeneratedFileContext,
    isGeneratedFileInContext,
    onShowBackgroundCognition,
}) => {
    const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
    const projectFileInputRef = useRef<HTMLInputElement>(null);
    const stateFileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelectChange = (fileId: string, checked: boolean) => {
        setSelectedFileIds(prev =>
            checked ? [...prev, fileId] : prev.filter(id => id !== fileId)
        );
    };

    const handleCompareClick = () => {
        const filesToCompare = projectFiles.filter(f => selectedFileIds.includes(f.id));
        onCompareFiles(filesToCompare);
    };

    const handleDeleteSelected = () => {
        if (selectedFileIds.length === 0) return;
        // Removed confirm dialog due to sandboxing issues. Deletion is now immediate.
        const filesToDelete = projectFiles.filter(f => selectedFileIds.includes(f.id));
        onDeleteFiles(filesToDelete);
        setSelectedFileIds([]);
    }

    const handleDeleteSingle = (file: ProjectFile) => {
        // Removed confirm dialog due to sandboxing issues. Deletion is now immediate.
        onDeleteFiles([file]);
    }

    const handleDownloadSingle = (file: GeneratedFile) => {
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

    const handleSpeakNarrative = (e?: React.MouseEvent) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation(); // Prevent collapsing the section
        if (selfNarrative) {
            speechService.speak(selfNarrative, 'core-narrative');
        }
    };

    const fileTree = buildFileTree(projectFiles);
    const treeRoots = Object.keys(fileTree).filter(k => k !== '_files').sort();
    const rootFiles = (fileTree._files as ProjectFile[]) || [];


    return (
        <aside className="w-96 bg-gray-900/70 border-r border-gray-700/50 flex flex-col">
            <header className="p-3 border-b border-gray-700/50 flex justify-between items-center">
                <h1 className="text-lg font-bold">Reflex Engine</h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onShowKnowledgeModules}
                        title="Knowledge Modules"
                        className="p-2 rounded-md text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors"
                    >
                        <BookIcon />
                    </button>
                    <button
                        onClick={onShowSrgExplorer}
                        title="Show SRG Explorer"
                        className="p-2 rounded-md text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors"
                    >
                        <NetworkIcon />
                    </button>
                    {onShowImportHistory && (
                        <button
                            onClick={onShowImportHistory}
                            title="Calibration"
                            aria-label="Calibration"
                            className="p-2 rounded-md text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors"
                        >
                            <ScalesIcon />
                        </button>
                    )}
                    <button
                        onClick={onShowLogs}
                        title="Show Logs"
                        className="p-2 rounded-md text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors"
                    >
                        <DocumentTextIcon />
                    </button>
                    <button
                        onClick={onShowBackgroundCognition}
                        title="Background Systems"
                        className="p-2 rounded-md text-gray-400 hover:text-cyan-400 hover:bg-gray-800 transition-colors"
                    >
                        <GlobeIcon />
                    </button>
                    <button
                        onClick={onShowCrystal}
                        title={isCrystalPanelVisible ? "Hide Memory Crystal" : "Show Memory Crystal"}
                        className={`p-2 rounded-md transition-colors ${isCrystalPanelVisible ? 'bg-cyan-900/50 text-cyan-400' : 'text-gray-400 hover:text-cyan-400 hover:bg-gray-800'}`}
                    >
                        <CrystalIcon />
                    </button>
                </div>
            </header>

            {/* --- Hidden File Inputs --- */}
            <input type="file" multiple ref={projectFileInputRef} onChange={onImportFiles} className="hidden" />
            <input type="file" accept=".json" ref={stateFileInputRef} onChange={onImportState} className="hidden" />

            {/* --- Import / Export Bar --- */}
            <div className="p-2 border-b border-gray-700/50 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => projectFileInputRef.current?.click()} title="Import project files" className="w-full flex items-center justify-center gap-2 p-2 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"><UploadIcon /> Import Files</button>
                    <button onClick={() => stateFileInputRef.current?.click()} title="Import session state from a .json file" className="w-full flex items-center justify-center gap-2 p-2 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"><UploadIcon /> Import State</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={onExportAll} title="Export all generated files as a .zip" disabled={generatedFiles.length === 0} className="w-full flex items-center justify-center gap-2 p-2 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><DownloadIcon /> Export Generated</button>
                    <button onClick={onExportState} title="Export current session to a .json file" className="w-full flex items-center justify-center gap-2 p-2 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"><SaveIcon /> Export State</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <CollapsibleSection
                    title="Core Narrative"
                    actions={
                        <button onClick={(e) => { e.stopPropagation(); handleSpeakNarrative(); }} title="Read narrative aloud" className="p-1 rounded-full text-gray-400 hover:text-cyan-400 hover:bg-gray-700/50">
                            <SpeakerIcon />
                        </button>
                    }
                >
                    <div className="p-2 space-y-2">
                        <div className="text-xs text-gray-300 p-2 bg-gray-800/50 rounded max-h-48 overflow-y-auto prose prose-xs prose-invert">
                            {selfNarrative ? (
                                <ReactMarkdown>{selfNarrative}</ReactMarkdown>
                            ) : (
                                <p className="text-gray-500 italic">No narrative woven yet. New axioms will be synthesized into a story here.</p>
                            )}
                        </div>
                    </div>
                </CollapsibleSection>

                <div className="border-b border-gray-700/50 p-2">
                    <h3 className="p-1 text-sm font-semibold text-gray-300">Cognitive Artifacts</h3>
                    <div className="space-y-2 p-1">
                        <button onClick={onShowAxioms} className="w-full flex items-center justify-center gap-2 p-2 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
                            <BookIcon /> View Axioms ({axioms.length})
                        </button>
                        <button onClick={onShowInsights} className="w-full flex items-center justify-center gap-2 p-2 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
                            <GlobeIcon /> View Insights ({insights.length})
                        </button>
                    </div>
                </div>

                <CollapsibleSection title="Project Files" count={projectFiles.length}>
                    {projectFiles.length === 0 ? (
                        <p className="text-xs text-gray-500 italic text-center p-4">No project files loaded. Use 'Import Files' to add some.</p>
                    ) : (
                        <div className="space-y-1">
                            {treeRoots.map(key => (
                                <FileTreeItem
                                    key={key}
                                    name={key}
                                    item={fileTree[key] as FileTree}
                                    level={0}
                                    selectedFileIds={selectedFileIds}
                                    handleFileSelectChange={handleFileSelectChange}
                                    isFileInContext={isFileInContext}
                                    onToggleFileContext={onToggleFileContext}
                                    onDeleteFile={handleDeleteSingle}
                                />
                            ))}
                            {rootFiles.length > 0 && (
                                <FileTreeItem
                                    name="_files"
                                    item={rootFiles}
                                    level={0}
                                    selectedFileIds={selectedFileIds}
                                    handleFileSelectChange={handleFileSelectChange}
                                    isFileInContext={isFileInContext}
                                    onToggleFileContext={onToggleFileContext}
                                    onDeleteFile={handleDeleteSingle}
                                />
                            )}
                        </div>
                    )}
                    {selectedFileIds.length > 0 && (
                        <div className="p-1 mt-2 flex justify-end gap-2 border-t border-gray-700/50 pt-2">
                            <button onClick={handleDeleteSelected} className="flex items-center gap-1 text-xs px-2 py-1 bg-red-800 hover:bg-red-700 rounded transition-colors">
                                <TrashIcon /> Delete ({selectedFileIds.length})
                            </button>
                            <button onClick={handleCompareClick} disabled={selectedFileIds.length !== 2} className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-800 hover:bg-blue-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <CompareIcon /> Compare
                            </button>
                        </div>
                    )}
                </CollapsibleSection>

                <CollapsibleSection title="Generated Files" count={generatedFiles.length}>
                    {generatedFiles.length === 0 ? (
                        <p className="text-xs text-gray-500 italic text-center p-4">No files generated yet.</p>
                    ) : (
                        <ul className="space-y-1">
                            {generatedFiles.map((file, index) => (
                                <li key={`${file.name}-${index}`} className="group flex items-center gap-3 p-1.5 rounded-md hover:bg-gray-800">
                                    <FileIcon />
                                    <span className="flex-1 text-sm text-gray-300 truncate" title={`${file.name}\nCreated: ${new Date(file.createdAt).toLocaleString()}`}>{file.name}</span>
                                    <div className="flex items-center gap-2">
                                        <ToggleSwitch checked={isGeneratedFileInContext(file.name)} onToggle={() => onToggleGeneratedFileContext(file.name)} title="Include in context" />
                                        <button onClick={() => handleDownloadSingle(file)} className="text-gray-400 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <DownloadIcon />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </CollapsibleSection>
            </div>
        </aside>
    );
};