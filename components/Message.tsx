

import React, { useState, useEffect, Fragment } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MemoryAtom, ProjectFile } from '../types';
import { UserIcon, BotIcon, BrainIcon, BookIcon, CollapseIcon, ExpandIcon, IncludeInContextIcon, ExcludeFromContextIcon, LightbulbIcon, SettingsIcon, SpeakerIcon, SpeakerOffIcon, CopyIcon, CheckIcon, DownloadIcon, CloseIcon, FileIcon, NetworkIcon } from './icons';
import { CodeBlock } from './CodeBlock';
import { CognitiveTraceViewer } from './CognitiveTraceViewer';
import { speechService } from '../services/speechService';

// Add this line to be able to use JSZip from window
declare const JSZip: any;

// --- New ContextViewer Modal ---
const ContextViewer: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    atom: MemoryAtom;
    allMessages: MemoryAtom[];
    allFiles: ProjectFile[];
}> = ({ isOpen, onClose, atom, allMessages, allFiles }) => {
    if (!isOpen || !atom.contextSnapshot) return null;

    const files = allFiles.filter(f => atom.contextSnapshot?.files.includes(f.name));
    const messages = allMessages.filter(m => atom.contextSnapshot?.messages.includes(m.uuid));

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="font-semibold text-lg">Context for this Turn</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700"><CloseIcon /></button>
                </header>
                <div className="p-4 overflow-y-auto space-y-6">
                    <div>
                        <h3 className="font-semibold text-gray-300 mb-2">Files ({files.length})</h3>
                        <div className="space-y-1 bg-gray-900/50 p-2 rounded-md">
                            {files.map(file => (
                                <details key={file.name} className="bg-gray-800 p-2 rounded">
                                    <summary className="cursor-pointer text-sm font-medium">{file.name}</summary>
                                    <pre className="text-xs mt-2 p-2 bg-black/50 rounded overflow-auto max-h-40"><code>{file.content}</code></pre>
                                </details>
                            ))}
                        </div>
                    </div>
                     <div>
                        <h3 className="font-semibold text-gray-300 mb-2">Messages ({messages.length})</h3>
                        <ul className="space-y-2 bg-gray-900/50 p-2 rounded-md">
                            {messages.map(msg => (
                                <li key={msg.uuid} className="text-sm p-2 bg-gray-800 rounded">
                                    <p className="text-gray-400 italic">[{msg.role}] {msg.text}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AxiomDetailViewer: React.FC<{
    axiomId: string;
    relatedAtoms: MemoryAtom[];
    onClose: () => void;
}> = ({ axiomId, relatedAtoms, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="font-semibold text-lg">References for <code className="bg-gray-700 px-2 py-1 rounded-md text-cyan-400">{axiomId}</code></h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700"><CloseIcon /></button>
                </header>
                <div className="p-4 overflow-y-auto space-y-3">
                    {relatedAtoms.map(atom => (
                        <div key={atom.uuid} className="p-3 bg-gray-900/50 rounded-md">
                            <p className="text-xs text-gray-500 mb-1">{new Date(atom.timestamp).toLocaleString()}</p>
                            <p className="text-sm text-gray-300">{atom.text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

interface MessageProps {
  atom: MemoryAtom;
  allMessages: MemoryAtom[];
  allFiles: ProjectFile[];
  onToggleContext: (uuid: string) => void;
  onToggleCollapsed: (uuid: string) => void;
  onViewTrace: (traceIds: string[]) => void;
  onInterruptLayer?: () => void;
  debugMode?: boolean;
}

const getRoleStyles = (role: 'user' | 'model', type: MemoryAtom['type']) => {
  if (type === 'subconscious_reflection') return { bg: 'bg-purple-900/20', border: 'border-purple-700/50', icon: <BrainIcon /> };
  if (type === 'conscious_thought') return { bg: 'bg-blue-900/20', border: 'border-blue-700/50', icon: <LightbulbIcon /> };
  if (type === 'axiom') return { bg: 'bg-green-900/20', border: 'border-green-700/50', icon: <BookIcon /> };
  
  if (role === 'user') return { bg: 'bg-gray-800', border: 'border-gray-700', icon: <UserIcon /> };
  return { bg: 'bg-gray-900/50', border: 'border-gray-700/50', icon: <BotIcon /> };
};

const summarizeText = (text: string, startWords = 15, endWords = 10): string => {
    const words = text.split(/\s+/);
    if (words.length <= startWords + endWords) {
        return text;
    }
    const start = words.slice(0, startWords).join(' ');
    const end = words.slice(-endWords).join(' ');
    return `${start} ... ${end}`;
};

export const Message: React.FC<MessageProps> = ({ atom, allMessages, allFiles, onToggleContext, onToggleCollapsed, onViewTrace, onInterruptLayer, debugMode }) => {
  const { bg, border, icon } = getRoleStyles(atom.role, atom.type);
  const isCognitive = atom.type === 'subconscious_reflection' || atom.type === 'conscious_thought' || atom.type === 'axiom';
  const hasInternals = (atom.cognitiveTrace && atom.cognitiveTrace.length > 0) || atom.backgroundInsight;
  
  const [isTraceExpanded, setIsTraceExpanded] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isContextViewerOpen, setIsContextViewerOpen] = useState(false);
  const [viewedAxiomId, setViewedAxiomId] = useState<string | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
        setIsSpeaking(speechService.isSpeaking(atom.uuid));
    };
    speechService.addListener(handleUpdate);
    return () => speechService.removeListener(handleUpdate);
  }, [atom.uuid]);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(atom.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
  };

  const handleSpeakClick = () => {
    if (isSpeaking) {
        speechService.cancel();
    } else {
        let textToSpeak = `Final response. ${atom.text}`;
        
        if (isTraceExpanded) {
            const traceParts: string[] = [];
            if (atom.cognitiveTrace) {
                for (const trace of atom.cognitiveTrace) {
                    traceParts.push(`${trace.type.replace(/_/g, ' ')}. ${trace.text}`);
                }
            }
            if (atom.backgroundInsight) {
                traceParts.push(`Background Insight. I searched for: ${atom.backgroundInsight.query}. And found: ${atom.backgroundInsight.insight}`);
            }
            if (traceParts.length > 0) {
              textToSpeak += `\n\n Now reading internal thoughts.\n ${traceParts.join('.\n\n')}`;
            }
        }
        speechService.speak(textToSpeak, atom.uuid);
    }
  };
  
    const handleDownloadTurnFiles = async () => {
        const files = atom.generatedFiles;
        if (!files || files.length === 0) return;
        const zip = new JSZip();
        files.forEach(file => {
          zip.file(file.name, file.content);
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `turn_files_${atom.uuid}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleViewAxiom = (axiomId: string) => {
        setViewedAxiomId(axiomId);
    };

    const markdownComponents = {
        code({node, inline, className, children, ...props}: any) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
                <CodeBlock language={match[1]} code={String(children).replace(/\n$/, '')} />
            ) : (
                <code className={className} {...props}>
                {children}
                </code>
            );
        },
        p: (paragraph: { children?: React.ReactNode }) => {
            const { children } = paragraph;
            const newChildren = React.Children.toArray(children).flatMap((child, childIndex) => {
                if (typeof child === 'string') {
                    const axiomRegex = /(\b[\w.-]+\.axiom\b)/g;
                    if (!axiomRegex.test(child)) return child;

                    const parts = child.split(axiomRegex);
                    return parts.map((part, index) => {
                        if (index % 2 === 1) { // Is an axiom
                            return (
                                <button
                                    key={`${part}-${index}`}
                                    onClick={() => handleViewAxiom(part)}
                                    className="font-mono bg-green-900/50 text-green-300 px-1.5 py-0.5 rounded-md hover:bg-green-800 transition-colors border border-green-700/50"
                                >
                                    {part}
                                </button>
                            );
                        }
                        return part;
                    });
                }
                return child;
            });
            return <p>{newChildren}</p>;
        }
    };


  return (
    <>
    <div className={`flex items-start gap-4 p-4 rounded-lg border ${bg} ${border}`}>
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center mt-1">{icon}</div>
      <div className="flex-1 overflow-hidden">
        <div className="flex justify-between items-center mb-2">
            <div
                className="font-semibold text-sm capitalize text-gray-400"
                title={`Created: ${new Date(atom.timestamp).toLocaleString()}\nLast Activated: ${atom.lastActivatedAt ? new Date(atom.lastActivatedAt).toLocaleString() : 'N/A'}`}
            >
                {isCognitive ? atom.type.replace(/_/g, ' ') : atom.role}
                 {atom.type === 'axiom' && atom.axiomId && <code className="ml-2 text-xs bg-gray-700 px-2 py-1 rounded-md text-green-300">{atom.axiomId}</code>}
            </div>
            <div className="flex items-center gap-1">
                {atom.traceIds && atom.traceIds.length > 0 && (
                     <button
                        onClick={() => onViewTrace(atom.traceIds!)}
                        className="flex items-center gap-1.5 text-xs px-2 py-1 bg-orange-900/50 hover:bg-orange-800/70 border border-orange-700/50 text-orange-300 rounded-full transition-colors"
                        title="Visualize the causal path of thoughts for this response"
                    >
                        <NetworkIcon className="w-3 h-3" />
                        <span>View Causal Trace</span>
                    </button>
                )}
                 {atom.role === 'model' && (
                    <div className="flex items-center gap-1 bg-gray-800/50 rounded-md p-0.5">
                        {atom.contextSnapshot && (
                            <button onClick={() => setIsContextViewerOpen(true)} title="View Context" className="p-1.5 rounded-md text-gray-400 hover:text-cyan-400 hover:bg-gray-700/50 transition-colors">
                                <SettingsIcon />
                            </button>
                        )}
                        <button onClick={handleSpeakClick} title={isSpeaking ? "Stop speaking" : "Read response aloud"} className="p-1.5 rounded-md hover:bg-gray-700/50 transition-colors text-gray-400 hover:text-cyan-400">
                            {isSpeaking ? <SpeakerOffIcon /> : <SpeakerIcon />}
                        </button>
                        <button onClick={handleCopy} title="Copy response" className="p-1.5 rounded-md text-gray-400 hover:text-cyan-400 hover:bg-gray-700/50 transition-colors">
                            {copied ? <CheckIcon /> : <CopyIcon />}
                        </button>
                    </div>
                 )}
                 <div className="flex items-center gap-1 bg-gray-800/50 rounded-md p-0.5 ml-2">
                    <button onClick={() => onToggleContext(atom.uuid)} title={atom.isInContext ? "Exclude from context" : "Include in context"} className={`p-1.5 rounded-md transition-colors ${atom.isInContext ? 'text-cyan-400 hover:bg-gray-700/50' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/50'}`}>
                        {atom.isInContext ? <IncludeInContextIcon /> : <ExcludeFromContextIcon />}
                    </button>
                    <button onClick={() => onToggleCollapsed(atom.uuid)} title={atom.isCollapsed ? "Expand" : "Collapse"} className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors">
                        {atom.isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                    </button>
                 </div>
            </div>
        </div>

        {atom.isCollapsed ? (
             <p className="text-gray-400 italic text-sm pr-8">
                {summarizeText(atom.text)}
            </p>
        ) : (
            <div className="prose prose-sm prose-invert max-w-none text-gray-300">
                 <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {atom.text}
                 </ReactMarkdown>

                {atom.generatedFiles && atom.generatedFiles.length > 0 && (
                    <div className="mt-4 p-3 rounded-md bg-gray-800/50 border border-gray-700/50">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-semibold text-xs text-gray-400">Generated Files ({atom.generatedFiles.length}):</h4>
                             <button onClick={handleDownloadTurnFiles} className="flex items-center gap-1.5 text-xs px-2 py-1 bg-cyan-800 hover:bg-cyan-700 rounded transition-colors text-white">
                                <DownloadIcon /> Download All
                            </button>
                        </div>
                        <ul className="space-y-1">
                            {atom.generatedFiles.map((file, index) => (
                                <li key={index} className="flex items-center gap-2 text-sm text-gray-300">
                                    <FileIcon /> 
                                    <span className="truncate">{file.name}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                
                {hasInternals && (
                    <CognitiveTraceViewer
                        trace={atom.cognitiveTrace}
                        insight={atom.backgroundInsight}
                        isExpanded={isTraceExpanded}
                        setIsExpanded={setIsTraceExpanded}
                        debugMode={debugMode}
                        onInterruptLayer={onInterruptLayer}
                    />
                )}
            </div>
        )}
      </div>
    </div>
    <ContextViewer isOpen={isContextViewerOpen} onClose={() => setIsContextViewerOpen(false)} atom={atom} allMessages={allMessages} allFiles={allFiles} />
    {viewedAxiomId && (
        <AxiomDetailViewer 
            axiomId={viewedAxiomId}
            relatedAtoms={allMessages.filter(m => m.text.includes(viewedAxiomId) || m.axiomId === viewedAxiomId)}
            onClose={() => setViewedAxiomId(null)}
        />
    )}
    </>
  );
};
