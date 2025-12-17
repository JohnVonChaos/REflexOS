

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { srgService } from '../services/srgService';
import { useSrgForceLayout, GraphNode, Link } from '../hooks/useSrgForceLayout';
import { CloseIcon, SearchIcon, ZoomInIcon, ZoomOutIcon, ResetIcon, SettingsIcon, PlayIcon, UploadIcon, BookIcon } from './icons';
import { ToggleSwitch } from './ToggleSwitch';
import type { SRGSettings, TraversalAlgorithmType } from '../types';

interface SRGExplorerProps {
  isOpen: boolean;
  onClose: () => void;
  highlightNodeIds?: string[];
  settings: SRGSettings;
  onSettingsChange: (newSettings: SRGSettings) => void;
}

const getLinkColor = (type: Link['type'], isHighlighted: boolean) => {
    if (isHighlighted) return 'rgba(255, 165, 0, 0.8)'; // orange-500
    switch(type) {
        case 'syntactic': return 'rgba(100, 116, 139, 0.3)'; // slate-500
        case 'semantic': return 'rgba(34, 197, 94, 0.4)'; // green-500
        default: return 'rgba(150, 150, 150, 0.3)';
    }
};

const MAX_INITIAL_NODES = 500;

export const SRGExplorer: React.FC<SRGExplorerProps> = ({ isOpen, onClose, highlightNodeIds = [], settings, onSettingsChange }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [srgState] = useState(() => srgService.getGraphState());
    
    // The settings from props are the source of truth, but we can have local state for when it's not provided.
    const [localSettings, setLocalSettings] = useState<SRGSettings>(settings);
    // Use the settings from props if available, otherwise fall back to local state.
    const currentSettings = settings || localSettings;

    const handleSettingsUpdate = (newSettings: SRGSettings) => {
        if (onSettingsChange) {
            onSettingsChange(newSettings);
        } else {
            setLocalSettings(newSettings);
        }
    };
    
    // When external settings change, update our local copy
    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);


    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    
    const [traceQuery, setTraceQuery] = useState('');
    const [liveTraceIds, setLiveTraceIds] = useState<string[]>([]);
    const [corpusStats, setCorpusStats] = useState(() => srgService.getCorpusStats());
    const textFileInputRef = useRef<HTMLInputElement>(null);

    const handleLoadTextFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            console.log(`[SRGExplorer] Loading ${file.name} into corpus (${text.length} chars)`);

            // Prompt for metadata
            const title = prompt('Enter title for this knowledge module:', file.name.replace(/\.(txt|md|json)$/, ''));
            if (!title) {
                alert('Load cancelled - title is required');
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

            const categoryMap: Record<string, any> = {
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

            setCorpusStats(srgService.getCorpusStats());
            const wordCount = text.split(/\s+/).length;
            alert(`Loaded "${title}" into knowledge base!\n\n${wordCount.toLocaleString()} words added to corpus.\nCategory: ${category}\n\nIMPORTANT: Corpus persists in session exports only.\nTo save permanently, export session before closing.`);
        } catch (e: any) {
            console.error('[SRGExplorer] Failed to load text file:', e);
            alert(`Failed to load file: ${e.message}`);
        }
        event.target.value = '';
    };

    const activeHighlightSet = useMemo(() => {
        const set = new Set([...highlightNodeIds, ...liveTraceIds]);
        return set;
    }, [highlightNodeIds, liveTraceIds]);

    const handleRunTrace = () => {
        if (!traceQuery) return;
        try {
            const result = srgService.trace(traceQuery, currentSettings.traversal);
            const ids: string[] = [traceQuery]; // Include the start word
            result.forEach(pulses => pulses.forEach(p => ids.push(p.nodeId)));
            setLiveTraceIds(Array.from(new Set(ids)));
        } catch (e: any) {
            alert(`Trace Error: ${e.message}`);
        }
    };

    const filteredNodes = useMemo(() => {
        // If there's an active trace, always show those nodes and their direct neighbors.
        if (activeHighlightSet.size > 0) {
            const traceNodeIds = new Set(activeHighlightSet);
            srgState.links.forEach(link => {
                if (activeHighlightSet.has(link.source) || activeHighlightSet.has(link.target)) {
                    traceNodeIds.add(link.source);
                    traceNodeIds.add(link.target);
                }
            });
            return srgState.nodes.filter(n => traceNodeIds.has(n.id));
        }

        // Default view: a random subset if the graph is too large
        if (srgState.nodes.length > MAX_INITIAL_NODES) {
            return [...srgState.nodes].sort(() => 0.5 - Math.random()).slice(0, MAX_INITIAL_NODES);
        }
        return srgState.nodes;
    }, [srgState.nodes, srgState.links, activeHighlightSet]);

    const filteredLinks = useMemo(() => {
        const nodeIds = new Set(filteredNodes.map(n => n.id));
        return srgState.links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));
    }, [srgState.links, filteredNodes]);

    const { nodes, links } = useSrgForceLayout(
        filteredNodes, 
        filteredLinks, 
        dimensions.width, 
        dimensions.height, 
        isOpen, 
        currentSettings.display
    );
    
    const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

    useEffect(() => {
        if (!isOpen) return;
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                });
            }
        };
        updateDimensions();
        const observer = new ResizeObserver(updateDimensions);
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [isOpen]);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const zoomFactor = 1.1;
        const newZoom = e.deltaY > 0 ? zoom / zoomFactor : zoom * zoomFactor;
        const clampedZoom = Math.max(0.1, Math.min(10, newZoom));
        
        const rect = containerRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const newPanX = mouseX - (mouseX - pan.x) * (clampedZoom / zoom);
        const newPanY = mouseY - (mouseY - pan.y) * (clampedZoom / zoom);

        setZoom(clampedZoom);
        setPan({x: newPanX, y: newPanY});
    };
    
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.target instanceof SVGElement && e.target.closest('.node-group')) return;
        setIsPanning(true);
        panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        setPan({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y });
    };
    
    const handleMouseUpOrLeave = () => setIsPanning(false);

    const resetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setLiveTraceIds([]);
        setTraceQuery('');
    };

    if (!isOpen) return null;

    const getNodeColor = (node: GraphNode, isHighlighted: boolean) => {
        if (isHighlighted) return 'rgba(255, 165, 0, 1)'; // orange-500
        if (node.primitiveType) return 'hsl(60, 80%, 60%)'; // Yellow for primitives
        if (currentSettings.display.colorScheme === 'layer') {
            const hue = (node.layer * 25) % 360;
            return `hsl(${hue}, 70%, 50%)`;
        }
        return 'hsl(210, 70%, 50%)';
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl w-full h-full flex flex-col relative overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <header className="flex-shrink-0 flex justify-between items-center p-3 border-b border-gray-700 bg-gray-900/80 z-10">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsConfigOpen(!isConfigOpen)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${isConfigOpen ? 'bg-cyan-700 text-white' : 'text-gray-300 hover:bg-gray-700 bg-gray-800 border border-gray-600'}`}
                            title="Toggle Config"
                        >
                            <SettingsIcon />
                            <span className="text-sm font-semibold">Configuration</span>
                        </button>
                        <h2 className="font-semibold text-lg">SRG Engine {activeHighlightSet.size > 0 && <span className="text-xs font-normal text-orange-400 ml-2">(Trace Active)</span>}</h2>
                        <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 px-3 py-1.5 rounded-md border border-gray-600">
                            <BookIcon />
                            <span className="font-mono">{corpusStats.totalTokens.toLocaleString()} tokens</span>
                            <span className="text-gray-600">|</span>
                            <span className="font-mono">{(corpusStats.estimatedBytes / 1024).toFixed(1)} KB</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <input
                            ref={textFileInputRef}
                            type="file"
                            accept=".txt,.md,.json"
                            onChange={handleLoadTextFile}
                            className="hidden"
                        />
                        <button
                            onClick={() => textFileInputRef.current?.click()}
                            className="flex items-center gap-2 px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-md text-sm font-semibold"
                            title="Load text file/book into corpus"
                        >
                            <UploadIcon />
                            <span>Load Book</span>
                        </button>
                        <div className="relative flex items-center gap-2">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Enter trace query..."
                                    value={traceQuery}
                                    onChange={e => setTraceQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleRunTrace()}
                                    className="bg-gray-700 border border-gray-600 rounded-md py-1.5 pl-8 pr-3 text-sm w-64 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                                />
                                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></div>
                            </div>
                            <button onClick={handleRunTrace} className="p-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md" title="Run Trace with Current Config">
                                <PlayIcon />
                            </button>
                        </div>
                         <div className="flex items-center gap-2">
                            <button onClick={() => setZoom(z => Math.min(10, z * 1.2))} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white"><ZoomInIcon /></button>
                            <button onClick={() => setZoom(z => Math.max(0.1, z / 1.2))} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white"><ZoomOutIcon /></button>
                            <button onClick={resetView} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white"><ResetIcon /></button>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700"><CloseIcon /></button>
                    </div>
                </header>

                {/* Main Canvas */}
                <div className="flex-1 flex relative">
                    {/* Config Sidebar */}
                    {isConfigOpen && (
                        <div className="w-96 bg-gray-900 border-r border-gray-700 flex flex-col overflow-y-auto p-4 space-y-6 z-20 shadow-2xl transition-all">
                            <div>
                                <h3 className="text-sm font-bold text-gray-300 mb-3 border-b border-gray-700 pb-1">Traversal Logic</h3>
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-400 font-semibold">Strategy</label>
                                        <select 
                                            value={currentSettings.traversal.algorithm} 
                                            onChange={e => handleSettingsUpdate({ ...currentSettings, traversal: { ...currentSettings.traversal, algorithm: e.target.value as TraversalAlgorithmType } })}
                                            className="bg-gray-800 border border-gray-600 rounded p-1 text-sm text-white"
                                        >
                                            <option value="bfs">Breadth-First (Layered)</option>
                                            <option value="dfs">Depth-First (Deep Dive)</option>
                                            <option value="weighted">Weighted Expansion</option>
                                            <option value="random-walk">Weighted Random Walk</option>
                                            <option value="attention">Attention-based (Hubs)</option>
                                            <option value="custom">Custom Script (JS)</option>
                                        </select>
                                    </div>

                                    {currentSettings.traversal.algorithm === 'custom' ? (
                                        <div className="flex flex-col gap-1 flex-1 h-full min-h-[300px]">
                                            <label className="text-xs text-cyan-400 font-mono flex justify-between items-center">
                                                <span>Traversal Function Body</span>
                                                <span className="text-[10px] opacity-70">JS/TS</span>
                                            </label>
                                            <textarea
                                                value={currentSettings.traversal.customScript}
                                                onChange={e => handleSettingsUpdate({ ...currentSettings, traversal: { ...currentSettings.traversal, customScript: e.target.value } })}
                                                className="flex-1 bg-black/50 border border-gray-700 rounded p-2 text-xs font-mono text-green-300 focus:ring-1 focus:ring-cyan-500 focus:outline-none resize-none leading-relaxed h-48"
                                                spellCheck={false}
                                                placeholder="// Enter JS code to return a numeric weight for 'link'"
                                            />
                                            <div className="text-[10px] text-gray-500 font-mono bg-gray-800 p-2 rounded">
                                                <strong>Params:</strong> link, depth, targetId<br/>
                                                <strong>Return:</strong> number (weight)
                                            </div>
                                            <button onClick={handleRunTrace} className="mt-2 w-full py-1 bg-green-800 hover:bg-green-700 text-green-100 text-xs rounded flex items-center justify-center gap-2">
                                                <PlayIcon /> Run Script
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs text-gray-400 flex justify-between"><span>Semantic Weight</span> <span className="text-cyan-400">{currentSettings.traversal.semanticWeight.toFixed(1)}x</span></label>
                                                <input type="range" min="0.1" max="5.0" step="0.1" value={currentSettings.traversal.semanticWeight} onChange={e => handleSettingsUpdate({ ...currentSettings, traversal: { ...currentSettings.traversal, semanticWeight: parseFloat(e.target.value) } })} className="w-full accent-green-500" title="Multiplier for synonym/meaning connections" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs text-gray-400 flex justify-between"><span>Syntactic Weight</span> <span className="text-cyan-400">{currentSettings.traversal.syntacticWeight.toFixed(1)}x</span></label>
                                                <input type="range" min="0.1" max="5.0" step="0.1" value={currentSettings.traversal.syntacticWeight} onChange={e => handleSettingsUpdate({ ...currentSettings, traversal: { ...currentSettings.traversal, syntacticWeight: parseFloat(e.target.value) } })} className="w-full accent-slate-500" title="Multiplier for sequential/grammar connections" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-xs text-gray-400 flex justify-between"><span>Link Threshold</span> <span className="text-cyan-400">{currentSettings.traversal.weightThreshold.toFixed(2)}</span></label>
                                                <input type="range" min="0.01" max="1.0" step="0.01" value={currentSettings.traversal.weightThreshold} onChange={e => handleSettingsUpdate({ ...currentSettings, traversal: { ...currentSettings.traversal, weightThreshold: parseFloat(e.target.value) } })} className="w-full accent-red-500" title="Minimum strength for a link to be traversed" />
                                            </div>
                                        </>
                                    )}

                                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-800">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-gray-400">Max Depth</label>
                                            <input type="number" min="1" max="5" value={currentSettings.traversal.maxDepth} onChange={e => handleSettingsUpdate({ ...currentSettings, traversal: { ...currentSettings.traversal, maxDepth: parseInt(e.target.value) } })} className="w-full bg-gray-800 border border-gray-600 rounded p-1 text-sm text-white" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-gray-400">Branch Factor</label>
                                            <input type="number" min="1" max="20" value={currentSettings.traversal.branchingFactor} onChange={e => handleSettingsUpdate({ ...currentSettings, traversal: { ...currentSettings.traversal, branchingFactor: parseInt(e.target.value) } })} className="w-full bg-gray-800 border border-gray-600 rounded p-1 text-sm text-white" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-gray-300 mb-3 border-b border-gray-700 pb-1">Display Physics</h3>
                                <div className="space-y-3">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-400">Node Repulsion: {currentSettings.display.repulsion}</label>
                                        <input type="range" min="5" max="200" step="5" value={currentSettings.display.repulsion} onChange={e => handleSettingsUpdate({ ...currentSettings, display: { ...currentSettings.display, repulsion: parseInt(e.target.value) } })} className="w-full" />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-400">Link Distance: {currentSettings.display.linkDistance}</label>
                                        <input type="range" min="20" max="300" step="10" value={currentSettings.display.linkDistance} onChange={e => handleSettingsUpdate({ ...currentSettings, display: { ...currentSettings.display, linkDistance: parseInt(e.target.value) } })} className="w-full" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs text-gray-400">Color by Layer</label>
                                        <ToggleSwitch checked={currentSettings.display.colorScheme === 'layer'} onToggle={() => handleSettingsUpdate({ ...currentSettings, display: { ...currentSettings.display, colorScheme: currentSettings.display.colorScheme === 'layer' ? 'highlight' : 'layer' } })} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div 
                        ref={containerRef} 
                        className={`flex-1 relative bg-black overflow-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
                        onWheel={handleWheel}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUpOrLeave}
                        onMouseLeave={handleMouseUpOrLeave}
                    >
                        <svg width="100%" height="100%" className="absolute top-0 left-0">
                            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                                {links.map((link, i) => {
                                    const source = nodeMap.get(link.source);
                                    const target = nodeMap.get(link.target);
                                    if (!source || !target) return null;
                                    
                                    const isHighlighted = activeHighlightSet.has(link.source) && activeHighlightSet.has(link.target);
                                    const strokeWidth = isHighlighted ? 2.0 / zoom : 0.5 / zoom;

                                    return (
                                        <line
                                            key={`${link.source}-${link.target}-${i}`}
                                            x1={source.x} y1={source.y}
                                            x2={target.x} y2={target.y}
                                            stroke={getLinkColor(link.type, isHighlighted)}
                                            strokeWidth={strokeWidth}
                                        />
                                    );
                                })}
                                {nodes.map(node => {
                                    const isHighlighted = activeHighlightSet.has(node.id);
                                    return (
                                        <g
                                            key={node.id}
                                            className="node-group"
                                            transform={`translate(${node.x}, ${node.y})`}
                                            onMouseEnter={() => !isPanning && setHoveredNode(node)}
                                            onMouseLeave={() => setHoveredNode(null)}
                                        >
                                            <circle
                                                r={(isHighlighted ? 6 : 4) / zoom}
                                                fill={getNodeColor(node, isHighlighted)}
                                                stroke={isHighlighted ? "#fff" : "none"}
                                                strokeWidth={isHighlighted ? 1/zoom : 0}
                                            />
                                        </g>
                                    );
                                })}
                                {nodes.map(node => {
                                    const isHighlighted = activeHighlightSet.has(node.id);
                                    if (zoom > 1.5 || isHighlighted) {
                                        return (
                                            <text
                                                key={node.id + '-label'}
                                                x={node.x}
                                                y={node.y}
                                                dy={-8 / zoom}
                                                fontSize={(isHighlighted ? 14 : 10) / zoom}
                                                fill={isHighlighted ? "#fff" : "rgba(255, 255, 255, 0.7)"}
                                                fontWeight={isHighlighted ? "bold" : "normal"}
                                                textAnchor="middle"
                                                className="pointer-events-none"
                                            >
                                                {node.word}
                                            </text>
                                        );
                                    }
                                    return null;
                                })}
                            </g>
                        </svg>

                        {hoveredNode && (
                            <div 
                                className="absolute bg-gray-900/80 border border-gray-600 rounded-lg p-2 text-sm text-gray-300 z-20 pointer-events-none shadow-lg"
                                style={{ left: hoveredNode.x * zoom + pan.x + 15, top: hoveredNode.y * zoom + pan.y + 15 }}
                            >
                                <p className="font-bold">{hoveredNode.word}</p>
                                {hoveredNode.primitiveType && <p className="text-xs text-yellow-400 font-bold">Primitive: {hoveredNode.primitiveType}</p>}
                                <p className="text-xs text-gray-400">Layer: {hoveredNode.layer}</p>
                                {activeHighlightSet.has(hoveredNode.id) && <p className="text-xs text-orange-400 font-bold">Part of Active Causal Trace</p>}
                            </div>
                        )}
                        <div className="absolute bottom-2 left-2 bg-gray-900/80 p-2 rounded-lg border border-gray-700 z-10 text-xs text-gray-300">
                            <h4 className="font-bold mb-1">Legend</h4>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="w-8 h-0.5" style={{backgroundColor: getLinkColor('syntactic', false)}}></span>
                                    <span>Syntactic</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-8 h-0.5" style={{backgroundColor: getLinkColor('semantic', false)}}></span>
                                    <span>Semantic</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-8 h-0.5" style={{backgroundColor: getLinkColor('semantic', true)}}></span>
                                    <span className="text-orange-400 font-bold">Causal Path</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
