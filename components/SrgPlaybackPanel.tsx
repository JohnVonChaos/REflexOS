import React, { useEffect, useState } from 'react';
import { srgPlaybackService, DEFAULT_PLAYBACK_CONFIG } from '../src/services/srgPlayback';

export const SrgPlaybackPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [timeline, setTimeline] = useState(() => srgPlaybackService.getTimeline());
  const [cfg, setCfg] = useState(DEFAULT_PLAYBACK_CONFIG);
  const [provWeight, setProvWeight] = useState(srgPlaybackService.getProvenanceWeight());
  const [selectedTurn, setSelectedTurn] = useState<string | null>(timeline.length ? timeline[timeline.length - 1].turnId : null);
  const [preview, setPreview] = useState<string[]>([]);

  useEffect(() => {
    // naive polling to reflect playback changes; this is a lightweight dev panel
    const id = setInterval(() => setTimeline(srgPlaybackService.getTimeline()), 500);
    return () => clearInterval(id);
  }, []);

  const runPreview = () => {
    if (!selectedTurn) return;
    const t = srgPlaybackService.getTimeline();
    const tokens: Record<string, number> = {};
    for (const e of t) tokens[e.turnId] = (e.slice.nodeIds || []).length || 1;
    const w = srgPlaybackService.getPlaybackWindow(t, selectedTurn, cfg, tokens);
    setPreview(w.includedTurnIds);
  };

  const recompute = async () => {
    await srgPlaybackService.recomputeSimilarities(provWeight);
    setTimeline(srgPlaybackService.getTimeline());
    setPreview([]);
  };

  const clearTimeline = async () => {
    await srgPlaybackService.persistClear();
    setTimeline(srgPlaybackService.getTimeline());
    setPreview([]);
  };

  return (
    <div style={{ padding: 12, maxHeight: '80vh', overflow: 'auto', width: 520 }}>
      <h3>SRG Playback Panel</h3>
      <button onClick={() => onClose && onClose()}>Close</button>
      <div style={{ marginTop: 12 }}>
        <label>Similarity Threshold: </label>
        <input type="range" min={0} max={1} step={0.01} value={cfg.similarityThreshold} onChange={e => setCfg({ ...cfg, similarityThreshold: Number(e.target.value) })} /> {cfg.similarityThreshold}
      </div>
      <div>
        <label>Backtrack Threshold: </label>
        <input type="range" min={0} max={1} step={0.01} value={cfg.backtrackThreshold} onChange={e => setCfg({ ...cfg, backtrackThreshold: Number(e.target.value) })} /> {cfg.backtrackThreshold}
      </div>
      <div>
        <label>Max Backtrack Turns: </label>
        <input type="number" min={0} max={10} value={cfg.maxBacktrackTurns} onChange={e => setCfg({ ...cfg, maxBacktrackTurns: Number(e.target.value) })} />
      </div>
      <div style={{ marginTop: 12 }}>
        <h4>Timeline ({timeline.length})</h4>
        <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #ddd', padding: 6 }}>
          {timeline.map(e => (
            <div key={e.turnId} style={{ padding: 6, borderBottom: '1px solid #eee' }}>
              <div><strong>{e.turnId}</strong> — simToPrev: {(e.similarityToPrev ?? 0).toFixed(2)}</div>
              <div style={{ fontSize: 12 }}>
                {e.slice.speakerRole || e.slice.sourceType} {e.slice.speakerId ? `(${e.slice.speakerId})` : ''} • nodes: {(e.slice.nodeIds || []).slice(0,6).join(', ')}
              </div>
              <div><button onClick={() => setSelectedTurn(e.turnId)}>Select</button></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={runPreview}>Preview Window for selected turn</button>
        <button onClick={clearTimeline} style={{ marginLeft: 8 }}>Clear Timeline</button>
        <div style={{ marginTop: 8 }}>
          <label>Provenance Weight: </label>
          <input type="range" min={0} max={1} step={0.01} value={provWeight} onChange={e => setProvWeight(Number(e.target.value))} /> {provWeight}
          <button onClick={recompute} style={{ marginLeft: 8 }}>Recompute Similarities</button>
        </div>
        <div style={{ marginTop: 8 }}>{preview.length > 0 ? `Included: ${preview.join(', ')}` : 'No preview yet.'}</div>
      </div>
    </div>
  );
};

export default SrgPlaybackPanel;
