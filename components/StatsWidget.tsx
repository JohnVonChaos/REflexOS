import React, { useEffect, useRef, useState } from 'react';

interface Props {
  showing: number;
  total: number;
  avgVelocity: number;
  onExpand: () => void;
  onReduce: () => void;
}

type WidgetState = 'arrows' | 'circle' | 'expanded';

const STORAGE_POS_KEY = 'srg-stats-widget-pos';
const STORAGE_STATE_KEY = 'srg-stats-widget-state';

export const StatsWidget: React.FC<Props> = ({ showing, total, avgVelocity, onExpand, onReduce }) => {
  const [state, setState] = useState<WidgetState>(() => (localStorage.getItem(STORAGE_STATE_KEY) as WidgetState) || 'arrows');
  const [posPct, setPosPct] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_POS_KEY) || 'null');
      if (raw && typeof raw.x === 'number' && typeof raw.y === 'number') return raw;
    } catch {}
    return { x: 0.9, y: 0.8 };
  });
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isExpanded, setIsExpanded] = useState(false);
  const draggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_STATE_KEY, state);
  }, [state]);

  useEffect(() => {
    localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(posPct));
  }, [posPct]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      dragMovedRef.current = true;
      setPos(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (dragMovedRef.current) {
        setPosPct({ x: pos.x / window.innerWidth, y: pos.y / window.innerHeight });
        dragMovedRef.current = false;
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
  }, [pos]);

  const onMouseDown = (e: React.MouseEvent) => {
    // Only drag if clicking the circle handle
    if (!(e.target as HTMLElement).closest('.drag-handle')) return;
    e.preventDefault();
    draggingRef.current = true;
    dragMovedRef.current = false;
  };

  useEffect(() => {
    const recompute = () => {
      const px = Math.round(posPct.x * window.innerWidth);
      const py = Math.round(posPct.y * window.innerHeight);
      setPos({ x: px, y: py });
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [posPct]);

  return (
    <div
      ref={wrapperRef}
      className="fixed z-[100] flex flex-col items-center select-none"
      style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
    >
      <div className="flex items-center gap-1.5 bg-gray-900/90 border border-cyan-500/40 rounded-full p-1 shadow-2xl backdrop-blur-md">
        {/* DRAG HANDLE (Circle) */}
        <div 
          onMouseDown={onMouseDown}
          className="drag-handle w-5 h-5 rounded-full bg-gray-700 hover:bg-cyan-600 cursor-move flex items-center justify-center transition-all border border-gray-600"
          title="Drag Controls"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
        </div>

        {/* ARROWS (Expand/Reduce Node Limit) */}
        <div className="flex flex-col -space-y-0.5">
          <button 
            onClick={onExpand}
            className="p-0.5 hover:text-cyan-400 text-gray-400 transition-colors"
            title="Expand Node Limit (+100)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <button 
            onClick={onReduce}
            className="p-0.5 hover:text-cyan-400 text-gray-400 transition-colors"
            title="Reduce Node Limit (-100)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        </div>

        {/* EXPAND BUTTON (Plus) */}
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${isExpanded ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
          title="Toggle Topology Metrics"
        >
          <span className="text-xs font-bold leading-none">{isExpanded ? '−' : '+'}</span>
        </button>
      </div>

      {/* METRICS (Visible only when expanded) */}
      {isExpanded && (
        <div className="mt-2 bg-gray-900/95 border border-cyan-500/30 rounded-lg p-3 shadow-2xl min-w-[150px] animate-in fade-in slide-in-from-top-2">
          <div className="space-y-2 text-[10px] font-mono whitespace-nowrap">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400 uppercase tracking-tighter">Topology Nodes</span>
              <span className="text-cyan-400 font-bold">{showing} / {total}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400 uppercase tracking-tighter">Edge Density</span>
              <span className="text-gray-200">{(total > 0 ? (showing/total * 100).toFixed(1) : 0)}%</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400 uppercase tracking-tighter">Avg Velocity</span>
              <span style={{ color: avgVelocity < 1 ? '#10B981' : avgVelocity < 3 ? '#F59E0B' : '#EF4444' }} className="font-bold">
                {avgVelocity.toFixed(2)}
              </span>
            </div>
            <div className="pt-2 border-t border-gray-800 flex items-center justify-center">
                <div className="flex items-center gap-1.5 opacity-80">
                    <span className={`w-1.5 h-1.5 rounded-full ${avgVelocity < 0.1 ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]' : 'bg-orange-500 animate-pulse'}`} />
                    <span className="text-[9px] text-gray-400 uppercase tracking-widest">{avgVelocity < 0.1 ? 'Stable' : 'Evolving'}</span>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
 
