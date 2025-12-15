import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { MemoryAtom } from '../types';
// FIX: Renamed `Node` to `GraphNode` to avoid collision with the global DOM `Node` type.
import { useForceLayout, GraphNode, Link, MIN_RADIUS, MAX_RADIUS } from '../hooks/useForceLayout';
import { CloseIcon, BrainIcon, BookIcon, LightbulbIcon, PlayIcon, PauseIcon, ZoomInIcon, ZoomOutIcon, ResetIcon } from './icons';

interface MemoryCrystalProps {
  atoms: MemoryAtom[];
  onExit: () => void;
}

const getNodeStyle = (type: MemoryAtom['type']) => {
    switch (type) {
        case 'conscious_thought': return { color: 'hsl(210, 80%, 60%)', icon: <LightbulbIcon /> };
        case 'subconscious_reflection': return { color: 'hsl(270, 70%, 65%)', icon: <BrainIcon /> };
        case 'axiom': return { color: 'hsl(140, 60%, 55%)', icon: <BookIcon /> };
        default: return { color: 'hsl(0, 0%, 80%)', icon: null };
    }
}

const PLAYBACK_SPEED_MS = 200; // Time between adding each atom in playback

export const MemoryCrystal: React.FC<MemoryCrystalProps> = ({ atoms: allMessages, onExit }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    // FIX: Use `GraphNode` type to avoid name collision.
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const [isReady, setIsReady] = useState(false);
    
    // Viewport State
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });

    const cognitiveAtoms = useMemo(() => 
        allMessages.flatMap(m => m.cognitiveTrace || []).filter(a => a.type !== 'user_message' && a.type !== 'model_response'),
        [allMessages]
    );

    // Playback State
    const [playbackIndex, setPlaybackIndex] = useState(cognitiveAtoms.length);
    const [isPlaying, setIsPlaying] = useState(false);
    const playbackIntervalRef = useRef<number | null>(null);
    
    // Sliced atoms for playback/timeline
    const visibleAtoms = cognitiveAtoms.slice(0, playbackIndex);
    const { nodes } = useForceLayout(visibleAtoms, dimensions.width, dimensions.height, isReady);
    // FIX: Use `GraphNode` type for the map.
    const nodeMap = new Map<string, GraphNode>(nodes.map(n => [n.uuid, n]));

    // Dimension setup
    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const newWidth = containerRef.current.clientWidth;
                const newHeight = containerRef.current.clientHeight;
                setDimensions({
                    width: newWidth,
                    height: newHeight,
                });
                // The simulation should only start when we have a canvas to draw on.
                if (newWidth > 0 && newHeight > 0) {
                    setIsReady(true);
                }
            }
        };
        updateDimensions();
        const resizeObserver = new ResizeObserver(updateDimensions);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }
        return () => resizeObserver.disconnect();
    }, []);

    // FIX: Add effect to synchronize playback index when atoms change (e.g., after importing state).
    useEffect(() => {
        setIsPlaying(false);
        setPlaybackIndex(cognitiveAtoms.length);
    }, [cognitiveAtoms]);

    // Playback loop
    useEffect(() => {
        if (isPlaying) {
            playbackIntervalRef.current = window.setInterval(() => {
                setPlaybackIndex(prevIndex => {
                    const nextIndex = prevIndex + 1;
                    // Loop back to the start when it finishes
                    return nextIndex > cognitiveAtoms.length ? 0 : nextIndex;
                });
            }, PLAYBACK_SPEED_MS);
        } else {
            if (playbackIntervalRef.current) {
                clearInterval(playbackIntervalRef.current);
            }
        }
        return () => {
            if (playbackIntervalRef.current) {
                clearInterval(playbackIntervalRef.current);
            }
        };
    }, [isPlaying, cognitiveAtoms.length]);

    // Viewport handlers
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const zoomFactor = 1.1;
        const newZoom = e.deltaY > 0 ? zoom / zoomFactor : zoom * zoomFactor;
        const clampedZoom = Math.max(0.1, Math.min(5, newZoom));
        
        const rect = containerRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Pan to zoom towards the cursor
        const newPanX = mouseX - (mouseX - pan.x) * (clampedZoom / zoom);
        const newPanY = mouseY - (mouseY - pan.y) * (clampedZoom / zoom);

        setZoom(clampedZoom);
        setPan({x: newPanX, y: newPanY});
    };
    
    const handleMouseDown = (e: React.MouseEvent) => {
        // Prevent panning when clicking on a node circle
        if (e.target instanceof SVGCircleElement) return;
        setIsPanning(true);
        panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    };
    
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        setPan({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y });
    };
    
    const handleMouseUpOrLeave = () => setIsPanning(false);

    const getRadius = (score: number | undefined) => {
        return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * (score ?? 0.5);
    };

    const handleResetToLive = () => {
        setIsPlaying(false);
        setPlaybackIndex(cognitiveAtoms.length);
    }
    
    const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsPlaying(false);
        setPlaybackIndex(parseInt(e.target.value, 10));
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-900 p-4 relative">
            <header className="flex justify-between items-center mb-4 flex-shrink-0 z-10">
                <h2 className="text-lg font-semibold">Memory Crystal</h2>
                <button onClick={onExit} title="Close Panel" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md">
                    <CloseIcon />
                </button>
            </header>
            <div 
                ref={containerRef} 
                className={`flex-1 min-h-0 bg-black rounded-lg relative overflow-hidden border border-gray-700/50 ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
            >
                <svg width={dimensions.width} height={dimensions.height} className="absolute top-0 left-0">
                    <defs>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                        {/* Render Nodes */}
                        {nodes.map(node => {
                            const { color } = getNodeStyle(node.type);
                            const radius = getRadius(node.activationScore);
                            return (
                                <g
                                    key={node.uuid}
                                    transform={`translate(${node.x}, ${node.y})`}
                                    onMouseEnter={() => !isPanning && setHoveredNode(node)}
                                    onMouseLeave={() => setHoveredNode(null)}
                                    className="cursor-pointer"
                                >
                                    <circle
                                        r={radius}
                                        fill={color}
                                        stroke="rgba(255, 255, 255, 0.5)"
                                        strokeWidth={1 / zoom}
                                        style={{ filter: 'url(#glow)', opacity: 0.8 }}
                                        className="transition-transform duration-200 ease-in-out hover:scale-110"
                                    />
                                </g>
                            );
                        })}
                    </g>
                </svg>

                {hoveredNode && (
                    <div 
                        className="absolute bg-gray-800 border border-gray-600 rounded-lg p-3 max-w-sm text-sm text-gray-300 z-20 pointer-events-none shadow-2xl"
                        style={{
                            left: hoveredNode.x * zoom + pan.x + 20,
                            top: hoveredNode.y * zoom + pan.y + 20,
                            transform: `translate(-${(hoveredNode.x * zoom + pan.x > dimensions.width - 300) ? '105%' : '0'}, -${(hoveredNode.y * zoom + pan.y > dimensions.height - 150) ? '105%' : '0'})`
                        }}
                    >
                        <p className="font-bold capitalize mb-1">{hoveredNode.type.replace(/_/g, ' ')}</p>
                        <p className="mb-2 line-clamp-3">{hoveredNode.text}</p>
                        <p className="text-xs text-cyan-400">Activation Score: {hoveredNode.activationScore?.toFixed(3)}</p>
                    </div>
                )}
            </div>
            
             {/* Legend */}
            <div className="absolute bottom-6 right-6 bg-gray-800/80 p-3 rounded-lg border border-gray-700 z-10 text-xs pointer-events-none">
                <h4 className="font-bold mb-2">Legend</h4>
                <div className="space-y-2">
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{backgroundColor: getNodeStyle('conscious_thought').color}}></span><span>Conscious Thought</span></div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{backgroundColor: getNodeStyle('subconscious_reflection').color}}></span><span>Subconscious Reflection</span></div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{backgroundColor: getNodeStyle('axiom').color}}></span><span>Axiom</span></div>
                </div>
                <div className="mt-2 text-gray-400">Size indicates activation score.</div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-6 left-6 bg-gray-800/80 p-3 rounded-lg border border-gray-700 z-10 space-y-3 w-72">
                 {/* Playback Controls */}
                <div>
                    <div className="flex justify-between items-center mb-1">
                         <label className="text-xs font-semibold text-gray-300">Timeline</label>
                         <span className="text-xs text-gray-400">{playbackIndex} / {cognitiveAtoms.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsPlaying(!isPlaying)} className="p-2 bg-gray-700 hover:bg-cyan-600 rounded-full text-white">
                            {isPlaying ? <PauseIcon /> : <PlayIcon />}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max={cognitiveAtoms.length}
                            value={playbackIndex}
                            onChange={handleTimelineChange}
                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                        />
                        <button onClick={handleResetToLive} title="Go to Live State" className="p-2 bg-gray-700 hover:bg-cyan-600 rounded-full text-white">
                            <ResetIcon />
                        </button>
                    </div>
                </div>
                {/* Zoom Controls */}
                <div>
                    <label className="text-xs font-semibold text-gray-300">Zoom</label>
                    <div className="flex items-center gap-2 mt-1">
                        <button onClick={() => setZoom(z => Math.max(0.1, z / 1.2))} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white"><ZoomOutIcon /></button>
                         <input
                            type="range"
                            min="0.1"
                            max="5"
                            step="0.01"
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                        />
                        <button onClick={() => setZoom(z => Math.min(5, z * 1.2))} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white"><ZoomInIcon /></button>
                    </div>
                </div>
            </div>

        </div>
    );
};
