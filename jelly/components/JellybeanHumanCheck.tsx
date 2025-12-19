import React, { useState, useEffect, useRef } from 'react';
import { 
  ColorId, 
  JellybeanHumanCheckProps, 
  TracePoint, 
  MotionStats, 
  PathData 
} from '../types';

// Visual configuration for colors - Lüscher Color Test standard colors
const COLOR_CONFIG: Record<ColorId, { bg: string; border: string; label: string; hex: string }> = {
  [ColorId.BLUE]:   { bg: 'bg-blue-900', border: 'border-blue-950', label: 'Blue', hex: '#1e3a8a' },
  [ColorId.GREEN]:  { bg: 'bg-teal-600', border: 'border-teal-800', label: 'Green', hex: '#0d9488' },
  [ColorId.RED]:    { bg: 'bg-orange-600', border: 'border-orange-700', label: 'Red', hex: '#ea580c' },
  [ColorId.YELLOW]: { bg: 'bg-yellow-400', border: 'border-yellow-500', label: 'Yellow', hex: '#fbbf24' },
  [ColorId.VIOLET]: { bg: 'bg-pink-600', border: 'border-pink-700', label: 'Violet', hex: '#db2777' },
  [ColorId.BROWN]:  { bg: 'bg-orange-700', border: 'border-orange-800', label: 'Brown', hex: '#c2410c' },
  [ColorId.BLACK]:  { bg: 'bg-slate-900', border: 'border-black', label: 'Black', hex: '#0f172a' },
  [ColorId.GREY]:   { bg: 'bg-slate-500', border: 'border-slate-600', label: 'Grey', hex: '#64748b' },
};

interface BeanState {
  id: ColorId;
  x: number;
  y: number;
  rotation: number;
  isPlaced: boolean;
  zIndex: number;
}

// SVG Component for the Marble (circular) shape with specular glint
const MarbleSVG = ({ color, className }: { color: string, className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} style={{ overflow: 'visible' }}>
    <defs>
      <radialGradient id={`rad-${color}`} cx="30%" cy="25%" r="80%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="40%" stopColor={color} stopOpacity="1" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.12" />
      </radialGradient>
      <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    {/* Main circular marble */}
    <circle cx="50" cy="50" r="40" fill={`url(#rad-${color})`} stroke="rgba(0,0,0,0.12)" strokeWidth="1" filter="url(#soft-glow)" />

    {/* Subtle glossy glint */}
    <ellipse cx="35" cy="35" rx="18" ry="10" transform="rotate(-25 35 35)" fill="white" opacity="0.45" />
    <circle cx="60" cy="28" r="4" fill="white" opacity="0.25" />

    {/* Tiny specular flare */}
    <path d="M68 62 Q70 58 74 57 Q70 60 68 62" fill="white" opacity="0.12" />
  </svg>
);

export const JellybeanHumanCheck: React.FC<JellybeanHumanCheckProps> = ({ onVerified, onCancel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const jarRef = useRef<HTMLDivElement>(null);
  
  // State
  const [beans, setBeans] = useState<BeanState[]>([]);
  const [sequence, setSequence] = useState<ColorId[]>([]);
  const [isFrozen, setIsFrozen] = useState(false);
  
  // Trace Data Refs
  const activeTraceRef = useRef<{ color: ColorId; points: TracePoint[]; startTime: number } | null>(null);
  const completedPathsRef = useRef<PathData[]>([]);
  const durationsRef = useRef<Record<string, number>>({});
  const errorsRef = useRef<Record<string, number>>({});
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const activeBeanIdRef = useRef<ColorId | null>(null);

  // Initialize randomized positions using Arc Layout (Equidistant from Jar)
  useEffect(() => {
    // Reset mutable refs
    completedPathsRef.current = [];
    durationsRef.current = {};
    errorsRef.current = {};
    Object.values(ColorId).forEach(c => {
      durationsRef.current[c] = 0;
      errorsRef.current[c] = 0;
    });

    const colors = Object.values(ColorId);
    // Random color distribution
    const shuffledColors = [...colors].sort(() => Math.random() - 0.5);
    
    // Arc Configuration
    // Center at Jar Position (50% x, 35% y)
    const centerX = 50;
    const centerY = 35;
    
    // Radius: Large enough to place beans in the bottom area (y ~80-85%)
    // To minimize skew, all beans must be the same distance from the target (Jar center).
    // Container aspect ratio is 4/3. We need to correct the X radius to maintain a visual circle.
    // If dy = 50% (from 35% to 85%), then RadiusY = 50.
    // RadiusX = RadiusY * (Height / Width) = 50 * (3/4) = 37.5
    const radiusY = 50;
    const radiusX = 37.5; 
    
    // Angles: Distribute along a semicircle arc below the jar.
    // 0 deg is Right, 90 deg is Down, 180 deg is Left.
    // We want to span from roughly 160 deg (Left-ish) to 20 deg (Right-ish).
    const startAngleDeg = 165;
    const endAngleDeg = 15;
    const totalBeans = 8;
    
    const newBeans: BeanState[] = shuffledColors.map((color, index) => {
        // Even distance distribution
        const t = index / (totalBeans - 1);
        const angleDeg = startAngleDeg - t * (startAngleDeg - endAngleDeg);
        const angleRad = (angleDeg * Math.PI) / 180;
        
        return {
          id: color,
          x: centerX + radiusX * Math.cos(angleRad),
          y: centerY + radiusY * Math.sin(angleRad),
          rotation: (Math.random() - 0.5) * 180, // Keep random rotation for organic look
          isPlaced: false,
          zIndex: 20
        };
    });
    
    setBeans(newBeans);
  }, []);

  // Completion Check
  useEffect(() => {
    if (sequence.length === 8 && !isFrozen) {
      setIsFrozen(true);
      
      const errorArray = Object.entries(errorsRef.current).map(([color, count]) => ({
        color: color as ColorId,
        dropsOutsideTarget: count as number
      }));

      const trace: MotionStats = {
        paths: completedPathsRef.current,
        durations: durationsRef.current as Record<ColorId, number>,
        errors: errorArray
      };

      setTimeout(() => {
        onVerified({ sequence, trace });
      }, 800);
    }
  }, [sequence, isFrozen, onVerified]);

  const handlePointerDown = (e: React.PointerEvent, bean: BeanState) => {
    if (bean.isPlaced || isFrozen) return;

    e.preventDefault(); 
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    (e.target as Element).setPointerCapture(e.pointerId);

    activeBeanIdRef.current = bean.id;
    
    const currentBeanXpx = (bean.x / 100) * rect.width;
    const currentBeanYpx = (bean.y / 100) * rect.height;

    dragOffsetRef.current = {
      x: e.clientX - rect.left - currentBeanXpx,
      y: e.clientY - rect.top - currentBeanYpx
    };

    activeTraceRef.current = {
      color: bean.id,
      points: [{ x: currentBeanXpx, y: currentBeanYpx, t: Date.now() }],
      startTime: Date.now()
    };

    setBeans(prev => prev.map(b => 
      b.id === bean.id 
      ? { ...b, zIndex: 100, rotation: 0 } // Pop to top and straighten
      : b
    ));
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeBeanIdRef.current || isFrozen) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const xPx = e.clientX - rect.left - dragOffsetRef.current.x;
    const yPx = e.clientY - rect.top - dragOffsetRef.current.y;

    if (activeTraceRef.current) {
      activeTraceRef.current.points.push({
        x: xPx,
        y: yPx,
        t: Date.now()
      });
    }

    const xPercent = (xPx / rect.width) * 100;
    const yPercent = (yPx / rect.height) * 100;

    setBeans(prev => prev.map(b => 
      b.id === activeBeanIdRef.current 
        ? { ...b, x: xPercent, y: yPercent } 
        : b
    ));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!activeBeanIdRef.current || isFrozen) return;

    const beanId = activeBeanIdRef.current;
    const container = containerRef.current;
    const jarEl = jarRef.current;
    
    (e.target as Element).releasePointerCapture(e.pointerId);

    if (container && jarEl && activeTraceRef.current) {
      const containerRect = container.getBoundingClientRect();
      const jarRect = jarEl.getBoundingClientRect();
      
      const dropX = e.clientX;
      const dropY = e.clientY;

      // Simple collision: Drop point is inside the jar's bounding box
      const isInsideJar = 
        dropX >= jarRect.left && 
        dropX <= jarRect.right && 
        dropY >= jarRect.top && 
        dropY <= jarRect.bottom;

      activeTraceRef.current.points.push({
        x: dropX - containerRect.left,
        y: dropY - containerRect.top,
        t: Date.now()
      });
      
      if (isInsideJar) {
        // Place in Jar
        // Logic: Calculate a random spot INSIDE the jar rect, then convert back to %
        const jarW = jarRect.width;
        const jarH = jarRect.height;
        
        // Random pile position: 20-80% width, 50-90% height of Jar
        // This ensures they look like they are sitting in the jar
        const randXInJar = (0.2 + Math.random() * 0.6) * jarW;
        const randYInJar = (0.5 + Math.random() * 0.4) * jarH;
        
        // Convert jar-relative px to container-relative px
        const finalPxX = (jarRect.left - containerRect.left) + randXInJar;
        const finalPxY = (jarRect.top - containerRect.top) + randYInJar;
        
        // Convert back to %
        const finalPctX = (finalPxX / containerRect.width) * 100;
        const finalPctY = (finalPxY / containerRect.height) * 100;

        const randomRotation = (Math.random() - 0.5) * 120;

        setBeans(prev => prev.map(b => 
          b.id === beanId 
            ? { 
                ...b, 
                x: finalPctX, 
                y: finalPctY, 
                isPlaced: true, 
                zIndex: 5, // Lower z-index so it sits 'inside' (behind front glass)
                rotation: randomRotation 
              } 
            : b
        ));

        setSequence(prev => [...prev, beanId]);

        completedPathsRef.current.push({
          color: beanId,
          points: activeTraceRef.current.points
        });
        
        durationsRef.current[beanId] = Date.now() - activeTraceRef.current.startTime;

      } else {
        // Bounce back to Arc on error
        errorsRef.current[beanId] = (errorsRef.current[beanId] || 0) + 1;

        // Configuration matching the spawn logic
        const centerX = 50;
        const centerY = 35;
        const radiusY = 50;
        const radiusX = 37.5; 
        
        // Pick a random angle within the spawn arc range
        const startAngleDeg = 165;
        const endAngleDeg = 15;
        const randomAngleDeg = startAngleDeg - Math.random() * (startAngleDeg - endAngleDeg);
        const angleRad = (randomAngleDeg * Math.PI) / 180;
        
        const returnX = centerX + radiusX * Math.cos(angleRad);
        const returnY = centerY + radiusY * Math.sin(angleRad);

        setBeans(prev => prev.map(b => 
          b.id === beanId 
            ? { 
                ...b, 
                x: returnX, 
                y: returnY, 
                zIndex: 20,
                rotation: (Math.random() - 0.5) * 180 
              } 
            : b
        ));
      }
    }

    activeBeanIdRef.current = null;
    activeTraceRef.current = null;
    dragOffsetRef.current = { x: 0, y: 0 };
  };

  return (
    <div role="dialog" aria-modal="true" className="flex flex-col items-center justify-center w-full max-w-2xl max-h-[80vh] bg-slate-800 rounded-xl shadow-2xl overflow-hidden border border-slate-700 select-none">
      
      {/* Header */}
      <div className="w-full p-4 bg-slate-900 border-b border-slate-700 flex justify-between items-center z-30">
        <div>
          <h2 className="text-purple-400 font-bold text-sm tracking-wider uppercase flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"/>
            Preference Verification
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Drag the marbles into the jar in the order you <span className="text-white font-medium">like them most</span>.
          </p>
        </div>
        {onCancel && (
          <button 
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Game Area */}
      <div 
        ref={containerRef}
        className="relative w-full max-h-[64vh] bg-slate-800 touch-none overflow-auto p-4"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Ambient background glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 opacity-50" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* --- JAR (Back Layer) --- */}
        <div 
          ref={jarRef}
          className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-64 border-4 border-slate-600/30 rounded-b-3xl rounded-t-lg bg-slate-900/40 backdrop-blur-sm z-0"
        />

        {/* --- PLACED BEANS LAYER --- */}
        {beans.filter(b => b.isPlaced).map((bean) => (
           <div
             key={bean.id}
             style={{
               position: 'absolute',
               left: `${bean.x}%`,
               top: `${bean.y}%`,
               width: '56px',
               height: '56px',
               zIndex: bean.zIndex,
               transform: `translate(-50%, -50%) rotate(${bean.rotation}deg)`,
               transition: 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
             }}
           >
             <MarbleSVG 
               color={COLOR_CONFIG[bean.id].hex} 
               className="w-full h-full drop-shadow-md"
             />
           </div>
        ))}

        {/* --- JAR (Front Glass / Reflection Layer) --- */}
        <div 
          className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-64 border-x-4 border-b-4 border-t-2 border-white/10 rounded-b-3xl rounded-t-lg pointer-events-none z-10"
        >
          {/* Shine effect */}
          <div className="absolute top-4 right-4 w-4 h-32 bg-gradient-to-b from-white/10 to-transparent rounded-full skew-x-6" />
          <div className="absolute bottom-4 left-4 w-32 h-12 bg-gradient-to-t from-white/5 to-transparent rounded-full -skew-x-12 opacity-50" />
          <div className="absolute top-0 w-full h-4 bg-black/20 rounded-[100%] blur-sm" /> {/* Shadow inside rim */}
        </div>

        {/* --- UNPLACED BEANS (Draggable) --- */}
        {beans.filter(b => !b.isPlaced).map((bean) => (
          <div
            key={bean.id}
            onPointerDown={(e) => handlePointerDown(e, bean)}
            style={{
              position: 'absolute',
              left: `${bean.x}%`,
              top: `${bean.y}%`,
              width: '56px', 
              height: '56px',
              zIndex: bean.zIndex,
              transform: `translate(-50%, -50%) rotate(${bean.rotation}deg) scale(${isFrozen ? 0.9 : 1})`,
              cursor: isFrozen ? 'default' : 'grab',
              touchAction: 'none'
            }}
            className="hover:scale-105 transition-transform"
          >
            <MarbleSVG 
              color={COLOR_CONFIG[bean.id].hex} 
              className={`w-full h-full drop-shadow-xl ${isFrozen ? 'opacity-50 grayscale' : ''}`}
            />
          </div>
        ))}
        
        {/* Success Overlay */}
        {isFrozen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-700">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 mb-6 animate-bounce shadow-lg shadow-green-500/20">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Sequence Captured</h3>
              <p className="text-slate-300 text-sm">Analysis complete.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
