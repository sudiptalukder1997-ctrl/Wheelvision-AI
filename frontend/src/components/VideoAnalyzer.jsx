import React, { useEffect, useRef, useState, useCallback } from 'react';
import { confidenceTier } from '@/lib/biomechanics';
import logShotAndPrediction from '@/lib/predictionApi';
import useVideoAnalysis from '@/lib/useVideoAnalysis';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Upload, X, Sparkles, Loader2 } from 'lucide-react';

export default function VideoAnalyzer({ open, onClose, session, batterHand, onAnalysisComplete, personalThresholds }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [aiCoaching, setAiCoaching] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);

  const { analyze, reset: resetAnalysis, progress, statusMsg, detected, analyzing } = useVideoAnalysis({
    videoRef, canvasRef, batterHand, personalThresholds,
  });

  const reset = useCallback(() => {
    setFile(null); setAiCoaching(null);
    resetAnalysis();
  }, [resetAnalysis]);

  useEffect(() => { if (!open) reset(); }, [open, reset]);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) { toast.error('Max 200MB'); return; }
    setFile(f);
    setAiCoaching(null);
    resetAnalysis();
  };

  const persistShotsAndPredictions = useCallback(async (found) => {
    if (!session?.id || found.length === 0) return;
    try {
      for (const p of found) {
        await logShotAndPrediction({
          session,
          prediction: {
            shotType: p.shotType,
            wagonAngle: p.wagonAngle,
            runs: p.runs,
            confidence: p.confidence,
            features: p.features,
            velocity: p.velocity,
            footPosition: p.footPosition,
          },
          correct: true,
        });
      }
      onAnalysisComplete?.();
    } catch (err) {
      console.error('persist shots failed', err);
      toast.error(err?.response?.data?.detail || 'Could not save shots');
    }
  }, [session, onAnalysisComplete]);

  const triggerBiomechCoaching = useCallback(async () => {
    if (!session?.id) return;
    setAiBusy(true);
    try {
      const r = await api.post(`/sessions/${session.id}/coaching/biomech`);
      setAiCoaching(r.data.coaching);
      toast.success('AI coaching analysis complete');
    } catch (err) {
      const detail = err?.response?.data?.detail;
      console.warn('biomech coaching skipped', err);
      if (detail) toast.error(detail);
    } finally {
      setAiBusy(false);
    }
  }, [session]);

  const startAnalysis = useCallback(async () => {
    if (!file) return;
    try {
      const found = await analyze(file);
      await persistShotsAndPredictions(found);
      if (found.length >= 3) await triggerBiomechCoaching();
    } catch (err) {
      console.error('analysis failed', err);
      toast.error('Could not analyse video');
    }
  }, [file, analyze, persistShotsAndPredictions, triggerBiomechCoaching]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black overflow-y-auto">
      <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-4">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onClose} data-testid="video-analyzer-close" className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">VIDEO ANALYSER · MOVENET THUNDER</div>
              <div className="font-display font-black text-2xl tracking-tighter">AUTO SHOT DETECTION</div>
            </div>
          </div>
        </div>

        {/* upload */}
        {!file ? (
          <div className="broadcast-card p-6 text-center space-y-3">
            <Upload className="w-10 h-10 text-primary mx-auto" />
            <div className="font-display font-bold text-xl tracking-tight">Upload a batting clip</div>
            <div className="text-xs text-muted-foreground max-w-sm mx-auto">
              Ideal length 1–3 minutes · side-on view · full body in frame.
            </div>
            <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFile} className="hidden" data-testid="video-file-input" />
            <button
              data-testid="select-video-btn"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded bg-primary text-black font-black uppercase tracking-widest text-xs hover:bg-primary/90"
            >
              <Upload className="w-3.5 h-3.5" /> SELECT VIDEO
            </button>
          </div>
        ) : (
          <div className="broadcast-card p-3 sm:p-4 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2 relative bg-black aspect-video rounded border border-white/10 overflow-hidden">
                <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain" playsInline />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
              </div>
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">FILE</div>
                <div className="text-xs text-foreground break-all">{file.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{Math.round(file.size / 1024 / 1024)}MB</div>
                <div className="pt-2">
                  <button
                    data-testid="start-analysis-btn"
                    onClick={startAnalysis}
                    disabled={analyzing}
                    className="w-full py-2.5 rounded bg-primary text-black font-black uppercase tracking-widest text-xs hover:bg-primary/90 disabled:opacity-50"
                  >
                    {analyzing ? 'ANALYSING…' : 'START ANALYSIS'}
                  </button>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">PROGRESS</div>
                  <div className="h-2 rounded bg-white/10 overflow-hidden mt-1">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">{statusMsg || '—'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* detected shots gallery */}
        {detected.length > 0 && (
          <DetectedShotsGallery shots={detected} />
        )}

        {/* AI coaching report */}
        {(aiBusy || aiCoaching) && (
          <CoachingReport coaching={aiCoaching} busy={aiBusy} />
        )}
      </div>
    </div>
  );
}

function DetectedShotsGallery({ shots }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">DETECTED SHOTS · {shots.length}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shots.map((d) => {
          const ct = confidenceTier(d.confidence);
          return (
            <div key={d.id} className="broadcast-card overflow-hidden" data-testid={`detected-shot-${d.id}`}>
              {d.freezeUrl ? (
                <img src={d.freezeUrl} alt="freeze" className="w-full aspect-video object-cover" />
              ) : (
                <div className="w-full aspect-video bg-black" />
              )}
              <div className="p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: ct.color }}>{ct.label}</div>
                  <div className="text-xs font-black tabular-nums" style={{ color: ct.color }}>{d.confidence}%</div>
                </div>
                <div className="font-display font-bold text-sm tracking-tight">{d.shotType} · <span className="text-primary">+{d.runs}</span></div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  t={formatTime(d.t)} · wrist {Math.round(d.features.wrist_angle)}° · elbow {Math.round(d.features.elbow_angle)}° · lean {Math.round(d.features.body_lean)}°
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoachingReport({ coaching, busy }) {
  return (
    <div className="broadcast-card p-3 sm:p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">AI COACHING REPORT</div>
        {busy && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin ml-auto" />}
      </div>
      {coaching ? (
        <div className="rounded bg-[#051A0C] border border-primary/20 p-3 text-sm leading-relaxed whitespace-pre-wrap font-mono text-foreground">
          {coaching}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Generating biomechanical coaching report…</div>
      )}
    </div>
  );
}

function formatTime(s) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
