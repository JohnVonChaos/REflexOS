import React, { useState } from 'react';
import { JellybeanHumanCheck } from './components/JellybeanHumanCheck';
import { VerificationPayload } from './types';

const App: React.FC = () => {
  const [result, setResult] = useState<VerificationPayload | null>(null);
  const [showCheck, setShowCheck] = useState(true);

  const handleVerified = (payload: VerificationPayload) => {
    console.log('Verification Complete:', payload);
    setResult(payload);
    // Keep it visible for a moment in the component's internal state, then hide or show data
    setTimeout(() => {
        setShowCheck(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans text-slate-200">
      
      {showCheck ? (
        <div className="animate-in fade-in zoom-in duration-300 w-full max-w-2xl">
          <JellybeanHumanCheck 
            onVerified={handleVerified}
            onCancel={() => alert("Cancelled")}
          />
        </div>
      ) : (
        <div className="w-full max-w-2xl space-y-6">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 shadow-xl">
            <h1 className="text-2xl font-bold text-green-400 mb-4">Verification Successful</h1>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-sm uppercase tracking-wider text-slate-500 mb-2">Sequence</h3>
                <div className="flex flex-wrap gap-2">
                  {result?.sequence.map((color, i) => (
                    <span key={i} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 font-mono">
                      {i + 1}. {color}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm uppercase tracking-wider text-slate-500 mb-2">Timing (ms)</h3>
                <div className="grid grid-cols-4 gap-2">
                   {result && Object.entries(result.trace.durations).map(([color, time]) => (
                     <div key={color} className="flex justify-between bg-slate-800 p-2 rounded text-xs">
                        <span className="text-slate-400">{color.substring(0,3)}</span>
                        <span className="font-mono">{time}ms</span>
                     </div>
                   ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm uppercase tracking-wider text-slate-500 mb-2">Errors (Drops outside)</h3>
                 <div className="flex gap-4">
                    {result?.trace.errors.filter(e => e.dropsOutsideTarget > 0).length === 0 ? (
                        <span className="text-slate-500 italic text-sm">No errors committed.</span>
                    ) : (
                        result?.trace.errors.map(e => (
                             e.dropsOutsideTarget > 0 && (
                                <span key={e.color} className="text-red-400 text-xs">
                                    {e.color}: {e.dropsOutsideTarget}
                                </span>
                             )
                        ))
                    )}
                 </div>
              </div>
              
              <div>
                  <h3 className="text-sm uppercase tracking-wider text-slate-500 mb-2">Path Data Sample (Blue)</h3>
                  <div className="h-32 bg-black rounded p-2 overflow-y-auto font-mono text-[10px] text-green-500/80 leading-tight">
                    {JSON.stringify(result?.trace.paths.find(p => p.color === 'BLUE')?.points.slice(0, 5), null, 2)}
                    {((result?.trace.paths.find(p => p.color === 'BLUE')?.points.length || 0) > 5) && '\n...'}
                  </div>
              </div>
            </div>

            <button 
                onClick={() => { setShowCheck(true); setResult(null); }}
                className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors"
            >
                Reset Verification
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;