

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { srgService } from '../services/srgService';
import { useSrgForceLayout, GraphNode, Link } from '../hooks/useSrgForceLayout';
import { CloseIcon, SearchIcon, ZoomInIcon, ZoomOutIcon, ResetIcon, SettingsIcon, PlayIcon, UploadIcon, BookIcon } from './icons';
import { ToggleSwitch } from './ToggleSwitch';
import { StatsWidget } from './StatsWidget';
import type { SRGSettings, TraversalAlgorithmType } from '../types';
import { useNodeLimiting } from '../hooks/useNodeLimiting';
import { usePhysicsFreeze } from '../hooks/usePhysicsFreeze';
import { EdgeFilteringService } from '../services/srgEdgeFiltering';
import type { TraversalPath } from '../services/srg-word-hybrid';

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

const MAX_INITIAL_NODES = 200; // Reduced from 500 for better performance

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
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    
    // traceInput is the uncontrolled typing state; committedQuery is the value used to run traces
    const [traceInput, setTraceInput] = useState('');
    const [committedQuery, setCommittedQuery] = useState('');
    const [liveTraceIds, setLiveTraceIds] = useState<string[]>([]);
    const [topPaths, setTopPaths] = useState<TraversalPath[]>([]);
    const [corpusStats, setCorpusStats] = useState(() => srgService.getCorpusStats());
    const textFileInputRef = useRef<HTMLInputElement>(null);

    // NEW: Edge filtering config state
    const [edgeConfig, setEdgeConfig] = useState(() => EdgeFilteringService.getDefaultConfig());

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
            alert(`Loaded "${title}" into knowledge base!\n${wordCount.toLocaleString()} words added to corpus.\nCategory: ${category}`);
        } catch (e: any) {
            console.error('[SRGExplorer] Failed to load text file:', e);
            alert(`Failed to load file: ${e.message}`);
        }
        event.target.value = '';
    };

    const activeHighlightSet = useMemo(() => {
        const set = new Set([...highlightNodeIds, ...liveTraceIds]);
        if (selectedNodeId) {
            set.add(selectedNodeId);
            // Add neighbors of selected node
            srgState.links.forEach(l => {
                if (l.source === selectedNodeId) set.add(l.target);
                if (l.target === selectedNodeId) set.add(l.source);
            });
        }
        return set;
    }, [highlightNodeIds, liveTraceIds, selectedNodeId, srgState.links]);

    const handleRunTrace = (useInput = true) => {
        const q = useInput ? traceInput.trim() : committedQuery.trim();
        if (!q) return;
        setSelectedNodeId(null); // Clear selected node on new trace
        // commit the query so all other hooks use the stable committed value
        setCommittedQuery(q);
        try {
            const result = srgService.trace(q, currentSettings.traversal);
            // Collect start words from trace result (ensure lowercased node ids are used)
            const ids: string[] = [];
            for (const key of Array.from(result.keys())) ids.push(key);
            result.forEach(pulses => pulses.forEach(p => ids.push(p.nodeId)));
            setLiveTraceIds(Array.from(new Set(ids)));
            
            // NEW: Capture top paths if using hybrid engine
            // Try hybrid query; if unavailable, synthesize "top paths" from trace pulses
            try {
                const hybridResult = srgService.queryHybrid(q);
                if (hybridResult && hybridResult.paths && hybridResult.paths.length > 0) {
                    setTopPaths(hybridResult.paths.slice(0, 5)); // Top 5 paths
                } else {
                    // Build synthetic traversal paths from the basic trace pulses
                    const synthetic: TraversalPath[] = [];
                    result.forEach((pulses, startWord) => {
                        pulses.forEach(p => {
                            // Find link(s) between startWord and pulse.nodeId
                            const relEdges: any[] = [];
                            srgState.links.forEach(l => {
                                if ((l.source === startWord && l.target === p.nodeId) || (l.target === startWord && l.source === p.nodeId)) {
                                    relEdges.push({ source: l.source, target: l.target, type: l.type, positions: [], interferenceAmplitude: 1, accessedAt: l.accessedAt || [], strength: l.strength || 1, modifiers: [] });
                                }
                            });
                            if (relEdges.length > 0) {
                                synthetic.push({ nodes: [startWord, p.nodeId], edges: relEdges, totalInterference: relEdges.reduce((s, e) => s + (e.interferenceAmplitude || 1), 0), relationChain: relEdges.map(e => e.type) });
                            }
                        });
                    });
                    setTopPaths(synthetic.slice(0, 10));
                }
            } catch (e) {
                console.warn('[SRG] Hybrid query not available:', e);
                setTopPaths([]);
            }
        } catch (e: any) {
            alert(`Trace Error: ${e.message}`);
        }
    };

    // Fit viewport to currently active/trace nodes (auto-zoom & center)
    const fitToActiveNodes = () => {
        if (!containerRef.current || !nodes || nodes.length === 0) return;

        const set = activeHighlightSet;
        if (!set || set.size === 0) return;

        // Build bounding box of nodes in set (fall back to visible filteredNodes)
        const selNodes = nodes.filter(n => set.has(n.id));
        const targetNodes = selNodes.length > 0 ? selNodes : nodes;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of targetNodes) {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x);
            maxY = Math.max(maxY, n.y);
        }

        // If degenerate (single point), center on it
        const rect = containerRef.current.getBoundingClientRect();
        const pad = Math.max(40, Math.min(rect.width, rect.height) * 0.08);
        const boxW = Math.max(1, maxX - minX);
        const boxH = Math.max(1, maxY - minY);

        const zoomForWidth = (rect.width - pad * 2) / boxW;
        const zoomForHeight = (rect.height - pad * 2) / boxH;
        let targetZoom = Math.min(zoomForWidth, zoomForHeight);
        // Clamp zoom to sensible range
        targetZoom = Math.max(0.1, Math.min(6, targetZoom));

        const boxCenterX = (minX + maxX) / 2;
        const boxCenterY = (minY + maxY) / 2;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const newPanX = centerX - boxCenterX * targetZoom;
        const newPanY = centerY - boxCenterY * targetZoom;

        setZoom(targetZoom);
        setPan({ x: newPanX, y: newPanY });
        window.dispatchEvent(new Event('srg:viewport-change'));
    };

    // NEW: Extract query words for activation calculation
    // Only derive activation query words from the committed query to avoid
    // recomputing/triggering expensive node filtering on every keystroke.
    const queryWords = useMemo(() => {
        if (!committedQuery) return [];
        return committedQuery.toLowerCase()
            .replace(/[.,'!?]/g, '')
            .split(/\s+/)
            .filter(Boolean);
    }, [committedQuery]);

    // NEW: Use node limiting hook
    const {
        limitedNodes: activatedNodes,
        config: nodeConfig,
        expandVisible,
        reduceVisible,
        resetVisible,
        setMinActivation
    } = useNodeLimiting(srgState.nodes, queryWords, topPaths, {
        maxInitialNodes: MAX_INITIAL_NODES,
        expansionStep: 100,
        minActivation: 0.0
    });

    // (moved) Physics freeze manager will be initialized after nodes are available

    // Use activated nodes from limiting hook (already filtered and ranked)
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
            return activatedNodes.filter(n => traceNodeIds.has(n.id));
        }

        // Otherwise use the limited/activated nodes
        return activatedNodes;
    }, [activatedNodes, srgState.links, activeHighlightSet]);

    const filteredLinks = useMemo(() => {
        const nodeIds = new Set(filteredNodes.map(n => n.id));
        const baseLinks = srgState.links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));
        
        // NEW: Apply intelligent edge filtering
        return EdgeFilteringService.filterAndStyleEdges(
            baseLinks,
            topPaths,
            edgeConfig
        );
    }, [srgState.links, filteredNodes, topPaths, edgeConfig]);

    const { nodes, links } = useSrgForceLayout(
        filteredNodes, 
        filteredLinks, 
        dimensions.width, 
        dimensions.height, 
        isOpen, 
        currentSettings.display
    );
    
    const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

    // Average velocity for UI indicator
    const avgVelocity = React.useMemo(() => {
        if (!nodes || nodes.length === 0) return 0;
        const total = nodes.reduce((sum, node) => {
            const vx = (node as any).vx || 0;
            const vy = (node as any).vy || 0;
            return sum + Math.sqrt(vx * vx + vy * vy);
        }, 0);
        return total / nodes.length;
    }, [nodes]);

    // Physics freeze manager (ensure we restart physics on node additions)
    const { restartPhysics } = usePhysicsFreeze(nodes as any, isOpen, undefined, {
        autoFreezeEnabled: true,
        stabilizationTimeout: 3000,
        velocityThreshold: 0.05,
        checkInterval: 100
    });

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
        // Use viewport center as pivot to avoid nodes drifting off-screen
        const zoomFactor = 1.1;
        const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;
        const newZoom = Math.max(0.1, Math.min(10, zoom * delta));

        const rect = containerRef.current!.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Compute pan so that viewport center remains the same world point
        const worldCenterX = (centerX - pan.x) / zoom;
        const worldCenterY = (centerY - pan.y) / zoom;

        const newPanX = centerX - worldCenterX * newZoom;
        const newPanY = centerY - worldCenterY * newZoom;

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
        // Notify viewport change so widgets can clamp
        window.dispatchEvent(new Event('srg:viewport-change'));
        // Ensure nodes remain visible after zoom
        ensureNodesVisible(newZoom, { x: newPanX, y: newPanY });
    };

    // Double-click to reset view to 100% centered
    const handleDoubleClick = () => {
        resetView();
    };

    // Keyboard shortcuts for zoom +/- and reset
    useEffect(() => {
        const onKey = (ev: KeyboardEvent) => {
            // Ignore if typing in inputs or textareas
            const active = document.activeElement as HTMLElement | null;
            if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

            if (ev.key === '+' || ev.key === '=') {
                // zoom in by 10%
                const target = Math.min(10, zoom * 1.1);
                applyZoomToCenter(target);
            } else if (ev.key === '-') {
                const target = Math.max(0.1, zoom / 1.1);
                applyZoomToCenter(target);
            } else if (ev.key.toLowerCase() === '0') {
                resetView();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [zoom, pan]);

    // Helper: apply zoom around viewport center
    const applyZoomToCenter = (newZoom: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const worldCenterX = (centerX - pan.x) / zoom;
        const worldCenterY = (centerY - pan.y) / zoom;

        const newPanX = centerX - worldCenterX * newZoom;
        const newPanY = centerY - worldCenterY * newZoom;

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
        window.dispatchEvent(new Event('srg:viewport-change'));
        ensureNodesVisible(newZoom, { x: newPanX, y: newPanY });
    };

    // Ensure nodes remain visible; if not, recenters to viewport center
    const ensureNodesVisible = (checkZoom: number, checkPan: { x: number; y: number }) => {
        if (!nodes || nodes.length === 0 || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const w = rect.width, h = rect.height;

        const anyVisible = nodes.some(n => {
            const sx = n.x * checkZoom + checkPan.x;
            const sy = n.y * checkZoom + checkPan.y;
            return sx >= 0 && sx <= w && sy >= 0 && sy <= h;
        });

        if (!anyVisible) {
            // Recenters view to node centroid
            const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
            const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;

            const centerX = w / 2;
            const centerY = h / 2;
            const newPanX = centerX - cx * checkZoom;
            const newPanY = centerY - cy * checkZoom;
            setPan({ x: newPanX, y: newPanY });
            window.dispatchEvent(new Event('srg:viewport-change'));
        }
    };

    // Auto-fit when active highlight set changes (allow layout to settle)
    useEffect(() => {
        if (!isOpen) return;
        if (activeHighlightSet.size === 0) return;
        // delay slightly to let layout positions update
        const t = setTimeout(() => fitToActiveNodes(), 120);
        return () => clearTimeout(t);
    }, [Array.from(activeHighlightSet).join(','), nodes.length, isOpen]);
    
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
        // Center nodes in viewport at 100% zoom
        setZoom(1);
        if (containerRef.current && nodes && nodes.length > 0) {
            const rect = containerRef.current.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
            const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
            setPan({ x: centerX - cx, y: centerY - cy });
            window.dispatchEvent(new Event('srg:viewport-change'));
        } else {
            setPan({ x: 0, y: 0 });
        }
        setLiveTraceIds([]);
        setTraceInput('');
        setCommittedQuery('');
    };

    if (!isOpen) return null;

    const getNodeColor = (node: GraphNode, isHighlighted: boolean) => {
        if (selectedNodeId === node.id) return '#00ffff'; // Neon cyan for selected
        if (isHighlighted) return 'rgba(255, 165, 0, 1)'; // orange-500

        if (node.primitiveType) {
            switch (node.primitiveType) {
                case 'EXISTENCE': return '#ff00ff'; // Magenta (is, be)
                case 'POSSESSION': return '#ffff00'; // Yellow (of, s)
                case 'CAUSATION': return '#ff4444'; // Red (because)
                case 'LOCATION': return '#44ff44'; // Green (in, at)
                case 'DIRECTION': return '#4444ff'; // Blue (to, toward)
                case 'NEGATION': return '#888888'; // Gray (not, no)
                default: return 'hsl(60, 80%, 60%)';
            }
        }

        if (currentSettings.display.colorScheme === 'layer') {
            const hue = (node.layer * 25) % 360;
            return `hsl(${hue}, 70%, 50%)`;
        }
        return 'hsl(210, 70%, 50%)';
    };

    const handleNodeClick = (nodeId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (selectedNodeId === nodeId) {
            setSelectedNodeId(null);
            setLiveTraceIds([]);
        } else {
            setSelectedNodeId(nodeId);
            setTraceInput(nodeId);
            // Run a mini-trace from this node to see its immediate context
            try {
                // High branching factor to show "all connections"
                const result = srgService.trace(nodeId, { 
                    ...currentSettings.traversal, 
                    maxDepth: 1, 
                    branchingFactor: 50,
                    weightThreshold: 0.01 
                });
                const ids: string[] = [nodeId];
                result.forEach(pulses => pulses.forEach(p => ids.push(p.nodeId)));
                setLiveTraceIds(ids);

                // Synthesize top paths from the immediate neighbors to make edges bold/highlighted
                const synthetic: TraversalPath[] = [];
                result.forEach((pulses, startWord) => {
                    pulses.forEach(p => {
                        const relEdges: any[] = [];
                        srgState.links.forEach(l => {
                            if ((l.source === startWord && l.target === p.nodeId) || (l.target === startWord && l.source === p.nodeId)) {
                                relEdges.push({ source: l.source, target: l.target, type: l.type, positions: [], interferenceAmplitude: 1, accessedAt: l.accessedAt || [], strength: l.strength || 1, modifiers: [] });
                            }
                        });
                        if (relEdges.length > 0) {
                            synthetic.push({ nodes: [startWord, p.nodeId], edges: relEdges, totalInterference: relEdges.reduce((s, e) => s + (e.interferenceAmplitude || 1), 0), relationChain: relEdges.map(e => e.type) });
                        }
                    });
                });
                if (synthetic.length > 0) setTopPaths(synthetic.slice(0, 10));
            } catch (err) {
                console.warn('[SRG] Click trace failed:', err);
            }
        }
        // Small kick to layout to settle around new focus
        restartPhysics();
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
                            <span className="text-gray-600">|</span>
                            <span className="font-mono">Zoom: {Math.round(zoom * 100)}%</span>
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
                            className="flex items-center gap-2 px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded-md text-xs font-semibold"
                            title="Load text file/book into corpus"
                        >
                            <UploadIcon />
                        </button>
                                            <StatsWidget showing={nodeConfig.showingCount} total={nodeConfig.totalCount} avgVelocity={avgVelocity} onExpand={() => { expandVisible(); restartPhysics(); }} onReduce={() => { reduceVisible(); restartPhysics(); }} />
                        <div className="relative flex items-center gap-2">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Enter trace query... (press Enter to run)"
                                    value={traceInput}
                                    onChange={e => setTraceInput(e.target.value)}
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
                        <div
                            className="configuration-panel"
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                width: '320px',
                                height: '100%',
                                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                borderRight: '1px solid rgba(148, 163, 184, 0.2)',
                                padding: '1rem',
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                zIndex: 20
                            }}
                        >
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
                                        <div className="flex flex-col gap-1">
                                            <label className="text-xs text-gray-400 flex justify-between">
                                                <span>Label Font Size</span>
                                                <span className="text-cyan-400">{currentSettings.display.labelFontSize || 14}px</span>
                                            </label>
                                            <input type="range" min="8" max="24" step="1" value={currentSettings.display.labelFontSize || 14} onChange={e => handleSettingsUpdate({ ...currentSettings, display: { ...currentSettings.display, labelFontSize: parseInt(e.target.value) } })} className="w-full" />
                                            <div className="flex items-center justify-between mt-1">
                                                <label className="text-xs text-gray-400">Zoom-independent labels</label>
                                                <ToggleSwitch checked={!!currentSettings.display.labelZoomIndependent} onToggle={() => handleSettingsUpdate({ ...currentSettings, display: { ...currentSettings.display, labelZoomIndependent: !currentSettings.display.labelZoomIndependent } })} />
                                            </div>
                                        </div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs text-gray-400">Color by Layer</label>
                                        <ToggleSwitch checked={currentSettings.display.colorScheme === 'layer'} onToggle={() => handleSettingsUpdate({ ...currentSettings, display: { ...currentSettings.display, colorScheme: currentSettings.display.colorScheme === 'layer' ? 'highlight' : 'layer' } })} />
                                    </div>
                                </div>
                            </div>

                            {/* NEW: Edge Filtering Controls */}
                            <div>
                                <h3 className="text-sm font-bold text-gray-300 mb-3 border-b border-gray-700 pb-1">Edge Filtering</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs text-gray-400">Show Syntactic Edges</label>
                                        <ToggleSwitch 
                                            checked={edgeConfig.showSyntactic} 
                                            onToggle={() => setEdgeConfig(prev => ({ ...prev, showSyntactic: !prev.showSyntactic }))} 
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs text-gray-400">Show Only Top Paths</label>
                                        <ToggleSwitch 
                                            checked={edgeConfig.showOnlyTopPaths} 
                                            onToggle={() => setEdgeConfig(prev => ({ ...prev, showOnlyTopPaths: !prev.showOnlyTopPaths }))} 
                                        />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs text-gray-400">Dim Background Edges</label>
                                        <ToggleSwitch
                                            checked={!!edgeConfig.dimBackgroundEdges}
                                            onToggle={() => setEdgeConfig(prev => ({ ...prev, dimBackgroundEdges: !prev.dimBackgroundEdges }))}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-400 flex justify-between">
                                            <span>Min Strength</span>
                                            <span className="text-cyan-400">{edgeConfig.minStrength}</span>
                                        </label>
                                        <input 
                                            type="range" 
                                            min="1" 
                                            max="20" 
                                            step="1" 
                                            value={edgeConfig.minStrength} 
                                            onChange={e => setEdgeConfig(prev => ({ ...prev, minStrength: parseInt(e.target.value) }))} 
                                            className="w-full accent-green-500" 
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-400 flex justify-between">
                                            <span>Min Interference</span>
                                            <span className="text-cyan-400">{edgeConfig.minInterference.toFixed(2)}</span>
                                        </label>
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="1" 
                                            step="0.05" 
                                            value={edgeConfig.minInterference} 
                                            onChange={e => setEdgeConfig(prev => ({ ...prev, minInterference: parseFloat(e.target.value) }))} 
                                            className="w-full accent-purple-500" 
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-400 flex justify-between">
                                            <span>Max Visible Edges</span>
                                            <span className="text-cyan-400">{edgeConfig.maxEdgesVisible}</span>
                                        </label>
                                        <input 
                                            type="range" 
                                            min="50" 
                                            max="1000" 
                                            step="50" 
                                            value={edgeConfig.maxEdgesVisible} 
                                            onChange={e => setEdgeConfig(prev => ({ ...prev, maxEdgesVisible: parseInt(e.target.value) }))} 
                                            className="w-full accent-orange-500" 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* subtle sticky scroll indicator */}
                            <div style={{
                                position: 'sticky',
                                bottom: 0,
                                height: '20px',
                                background: 'linear-gradient(to top, rgba(15, 23, 42, 1) 0%, rgba(15, 23, 42, 0) 100%)',
                                pointerEvents: 'none'
                            }} />

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
                        onDoubleClick={handleDoubleClick}
                    >
                        <svg width="100%" height="100%" className="absolute top-0 left-0">
                            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                                {/* Draw background edges first, then top/causal edges last so they render on top */}
                                {(() => {
                                    const bg = links.filter(l => !(l as any).inTopPaths && (l.zIndex ?? 0) < 1000);
                                    const top = links.filter(l => (l as any).inTopPaths || (l.zIndex ?? 0) >= 1000);

                                    const renderEdge = (link: any, i: number) => {
                                        const source = nodeMap.get(link.source);
                                        const target = nodeMap.get(link.target);
                                        if (!source || !target) return null;

                                        const isTop = !!link.inTopPaths || (link.zIndex ?? 0) >= 1000;
                                        const isHighlighted = activeHighlightSet.has(link.source) && activeHighlightSet.has(link.target);

                                        const color = link.color || getLinkColor(link.type, isHighlighted);
                                        const opacity = (typeof link.opacity === 'number') ? link.opacity : (isTop ? 0.95 : 0.06);
                                        const strokeWidth = (typeof link.width === 'number') ? (link.width / zoom) : (isTop ? 3.5 / zoom : 0.35 / zoom);

                                        return (
                                            <line
                                                key={`${link.source}-${link.target}-${i}`}
                                                x1={source.x} y1={source.y}
                                                x2={target.x} y2={target.y}
                                                stroke={color}
                                                strokeOpacity={opacity}
                                                strokeWidth={strokeWidth}
                                                strokeDasharray={link.dashArray}
                                                className={link.animated ? 'edge-animated' : ''}
                                            />
                                        );
                                    };

                                    return (
                                        <>
                                            {bg.map((l, i) => renderEdge(l, i))}
                                            {top.map((l, i) => renderEdge(l, i + bg.length))}
                                        </>
                                    );
                                })()}
                                {nodes.map(node => {
                                    const isHighlighted = activeHighlightSet.has(node.id);
                                    const isSelected = selectedNodeId === node.id;
                                    return (
                                        <g
                                            key={node.id}
                                            className="node-group"
                                            transform={`translate(${node.x}, ${node.y})`}
                                            onMouseEnter={() => !isPanning && setHoveredNode(node)}
                                            onMouseLeave={() => setHoveredNode(null)}
                                            onClick={(e) => handleNodeClick(node.id, e)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {isSelected && (
                                                <circle
                                                    r={12 / zoom}
                                                    fill="none"
                                                    stroke="#00ffff"
                                                    strokeWidth={2/zoom}
                                                    className="animate-pulse"
                                                />
                                            )}
                                            <circle
                                                r={(isSelected ? 8 : isHighlighted ? 6 : 4) / zoom}
                                                fill={getNodeColor(node, isHighlighted)}
                                                stroke={isSelected ? "#fff" : isHighlighted ? "#fff" : "none"}
                                                strokeWidth={(isSelected || isHighlighted) ? 1/zoom : 0}
                                            />
                                        </g>
                                    );
                                })}
                                {nodes.map(node => {
                                    const isHighlighted = activeHighlightSet.has(node.id);
                                    const baseSize = currentSettings.display.labelFontSize || 14;
                                    const size = currentSettings.display.labelZoomIndependent ? baseSize / zoom : baseSize;
                                    return (
                                        <text
                                            key={node.id + '-label'}
                                            x={node.x}
                                            y={node.y}
                                            dy={-(baseSize / 2) / zoom}
                                            fontSize={isHighlighted ? Math.max(size, baseSize * 1.1) : size}
                                            fill={isHighlighted ? "#fff" : "rgba(255, 255, 255, 0.85)"}
                                            fontWeight={isHighlighted ? "bold" : "normal"}
                                            textAnchor="middle"
                                            className="pointer-events-none"
                                        >
                                            {node.word}
                                        </text>
                                    );
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
                        <div className="absolute bottom-2 left-2 bg-gray-900/80 p-2.5 rounded-lg border border-gray-700 z-10 text-[10px] text-gray-300 backdrop-blur-sm max-h-48 overflow-y-auto">
                            <h4 className="font-bold mb-1 text-gray-100 uppercase tracking-wider">Topology Legend</h4>
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-4 h-0.5" style={{backgroundColor: getLinkColor('syntactic', false)}}></span>
                                    <span>Syntactic (Sequence)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-4 h-0.5" style={{backgroundColor: 'rgba(34, 197, 94, 0.6)'}}></span>
                                    <span>Semantic (Meaning)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-4 h-0.5" style={{backgroundColor: '#FFA500'}}></span>
                                    <span className="text-orange-400 font-bold">Causal Path (Trace)</span>
                                </div>
                                <div className="mt-1 pt-1 border-t border-gray-700 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{backgroundColor: '#ff00ff'}}></span>
                                        <span>Existence (is/be)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{backgroundColor: '#ffff00'}}></span>
                                        <span>Possession (of/s)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{backgroundColor: '#ff4444'}}></span>
                                        <span>Causation (because)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{backgroundColor: '#44ff44'}}></span>
                                        <span>Location (in/at)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full" style={{backgroundColor: '#4444ff'}}></span>
                                        <span>Direction (to/toward)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
