import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { confidenceTier, realismCheck } from '@/lib/biomechanics';
import logShotAndPrediction from '@/lib/predictionApi';
import useVideoAnalysis from '@/lib/useVideoAnalysis';
import { composeSingleCard, composeBestSixGrid, shareImageBlob } from '@/lib/composeShareCard';
import ShotReviewSheet from '@/components/ShotReviewSheet';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Upload, X, Sparkles, Loader2, Share2, Trophy, AlertTriangle, Camera } from 'lucide-react';

export default function VideoAnalyzer({ open, onClose, session, batterHand, onAnalysisComplete, personalThresholds, userName, defaultCameraView = 'side', minVelocityThreshold = 0 }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [aiCoaching, setAiCoaching] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [sharingId, setSharingId] = useState(null);
  const [bestSixBusy, setBestSixBusy] = useState(false);
  const [cameraView, setCameraView] = useState(defaultCameraView === 'front' ? 'front' : 'side');

  // Review flow state
  const [qualityIssues, setQualityIssues] = useState([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewShots, setReviewShots] = useState([]);
  const [originalShots, setOriginalShots] = useState([]);
  const [analysisDuration, setAnalysisDuration] = useState(0);
  const [perMinute, setPerMinute] = useState(0);
  const [committing, setCommitting] = useState(false);

  const { analyze, reset: resetAnalysis, progress, statusMsg, detected, analyzing, setDetected } = useVideoAnalysis({
    videoRef, canvasRef, batterHand, personalThresholds, cameraView, minVelocityThreshold,
  });

  const bestSix = useMemo(() => {
    return [...detected]
      .sort((a, b) => (b.runs * 1000 + b.confidence) - (a.runs * 1000 + a.confidence))
      .slice(0, 6);
  }, [detected]);

  const sessionStats = useMemo(() => {
    const total = detected.length;
    const runs = detected.reduce((a, s) => a + (s.runs || 0), 0);
    const fours = detected.filter((s) => s.runs === 4).length;
    const sixes = detected.filter((s) => s.runs === 6).length;
    const sr = total ? Math.round((runs / total) * 100) : 0;
    return { balls: total, runs, sr, fours, sixes };
  }, [detected]);

  const shareSingleShot = useCallback(async (shot) => {
    setSharingId(shot.id);
    try {
      const blob = await composeSingleCard(shot, { batterName: userName || 'WHEELVISION AI' });
      if (!blob) throw new Error('compose failed');
      const result = await shareImageBlob(blob, {
        filename: `wheelvision-${shot.shotType.replace(/\s+/g, '-').toLowerCase()}-${shot.runs}.jpg`,
        text: `${shot.shotType} for ${shot.runs} · ${shot.confidence}% AI confidence · WheelVision AI`,
      });
      if (result === 'downloaded') toast.success('Image downloaded · share to Instagram from your gallery');
      else if (result === 'shared') toast.success('Shared!');
    } catch (err) {
      console.error('share single failed', err);
      toast.error('Could not generate image');
    } finally {
      setSharingId(null);
    }
  }, [userName]);

  const shareBestSix = useCallback(async () => {
    if (bestSix.length === 0) { toast.error('No shots to share yet'); return; }
    setBestSixBusy(true);
    try {
      const blob = await composeBestSixGrid(bestSix, { batterName: userName || 'WHEELVISION AI', sessionStats });
      if (!blob) throw new Error('compose failed');
      const result = await shareImageBlob(blob, {
        filename: `wheelvision-best-six-${Date.now()}.jpg`,
        text: `My WheelVision AI highlights · ${sessionStats.runs} runs · ${sessionStats.fours} fours · ${sessionStats.sixes} sixes`,
      });
      if (result === 'downloaded') toast.success('Highlights image downloaded · share to Instagram from your gallery');
      else if (result === 'shared') toast.success('Highlights shared!');
    } catch (err) {
      console.error('share best six failed', err);
      toast.error('Could not generate highlights');
    } finally {
      setBestSixBusy(false);
    }
  }, [bestSix, sessionStats, userName]);

  const reset = useCallback(() => {
    setFile(null); setAiCoaching(null);
    setQualityIssues([]); setReviewOpen(false); setReviewShots([]); setOriginalShots([]); setAnalysisDuration(0); setPerMinute(0);
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
    setQualityIssues([]); setReviewOpen(false); setAiCoaching(null);
    try {
      const result = await analyze(file);
      const { shots, qualityCheck, perMinute: pm, durationSec } = result;
      setAnalysisDuration(durationSec || 0);
      setPerMinute(pm || 0);
      if (qualityCheck && !qualityCheck.ok) {
        setQualityIssues(qualityCheck.issues);
        toast.error('Camera setup check failed — see suggestions above.');
        return;
      }
      setReviewShots(shots);
      setOriginalShots(shots);
      setReviewOpen(true);
    } catch (err) {
      console.error('analysis failed', err);
      toast.error('Could not analyse video');
    }
  }, [file, analyze]);

  const commitReviewed = useCallback(async (finalShots) => {
    setCommitting(true);
    try {
      // Negative training — anything in original list but NOT in finalShots is a rejection.
      const finalIds = new Set(finalShots.map((s) => s.id));
      const rejected = originalShots.filter((s) => !finalIds.has(s.id));
      for (const r of rejected) {
        try {
          await logRejectedPrediction({
            session,
            prediction: {
              shotType: r.shotType,
              wagonAngle: r.wagonAngle,
              runs: r.runs,
              confidence: r.confidence,
              features: r.features,
              velocity: r.velocity,
              footPosition: r.footPosition,
            },
          });
        } catch (err) { console.warn('reject log failed', err); }
      }
      await persistShotsAndPredictions(finalShots);
      setDetected(finalShots);
      setReviewOpen(false);
      const msg = rejected.length > 0
        ? `${finalShots.length} saved · ${rejected.length} false detection${rejected.length === 1 ? '' : 's'} fed back to your AI`
        : `${finalShots.length} shot${finalShots.length === 1 ? '' : 's'} saved`;
      toast.success(msg);
      if (finalShots.length >= 3) await triggerBiomechCoaching();
    } catch (err) {
      console.error('commit failed', err);
      toast.error(err?.response?.data?.detail || 'Could not save shots');
    } finally {
      setCommitting(false);
    }
  }, [persistShotsAndPredictions, triggerBiomechCoaching, setDetected, originalShots, session]);

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
              Ideal length 1–3 minutes · {cameraView === 'front' ? 'camera behind the bowler' : 'side-on'} · full body in frame.
            </div>
            <ViewToggle value={cameraView} onChange={async (v) => {
              setCameraView(v);
              try { await api.post('/profile/camera-view', { view: v }); }
              catch (err) { console.warn('persist camera view failed', err); }
            }} />
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

        {/* Quality issues (blocks analysis until camera setup is fixed) */}
        {qualityIssues.length > 0 && (
          <div className="space-y-2" data-testid="quality-issues">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <div className="text-[10px] uppercase tracking-[0.3em] text-red-400 font-bold">CAMERA SETUP CHECK FAILED</div>
            </div>
            {qualityIssues.map((q) => (
              <div key={q.code} className="flex items-start gap-2 p-2.5 rounded border border-red-500/40 bg-red-500/10 text-xs text-red-100">
                <Camera className="w-4 h-4 text-red-300 mt-0.5 shrink-0" />
                <div>{q.message}</div>
              </div>
            ))}
            <button
              onClick={startAnalysis}
              className="px-3 py-1.5 rounded border border-primary/40 text-primary text-xs font-bold uppercase tracking-widest hover:bg-primary/10"
              data-testid="retry-analysis-btn"
            >
              RETRY ANALYSIS
            </button>
          </div>
        )}

        {/* Per-minute over-detection warning (post-analysis, before review) */}
        {perMinute > 15 && qualityIssues.length === 0 && (
          <div className="flex items-start gap-2 p-2.5 rounded border border-yellow-500/40 bg-yellow-500/10 text-xs text-yellow-100">
            <AlertTriangle className="w-4 h-4 text-yellow-300 mt-0.5 shrink-0" />
            <div>⚠️ {perMinute.toFixed(1)} shots per minute detected — too many. Please check camera angle and lighting, and clean up false detections in the review screen.</div>
          </div>
        )}

        {/* detected shots gallery */}
        {detected.length > 0 && (
          <DetectedShotsGallery
            shots={detected}
            onShareShot={shareSingleShot}
            sharingId={sharingId}
            onShareBestSix={shareBestSix}
            bestSixBusy={bestSixBusy}
            bestSixCount={bestSix.length}
            sessionStats={sessionStats}
          />
        )}

        {/* AI coaching report */}
        {(aiBusy || aiCoaching) && (
          <CoachingReport coaching={aiCoaching} busy={aiBusy} />
        )}
      </div>

      {/* Manual review sheet */}
      <ShotReviewSheet
        open={reviewOpen}
        shots={reviewShots}
        onChange={setReviewShots}
        onConfirm={commitReviewed}
        onSkip={() => commitReviewed(reviewShots)}
        onCancel={() => setReviewOpen(false)}
        durationSec={analysisDuration}
        committing={committing}
      />
    </div>
  );
}

function DetectedShotsGallery({ shots, onShareShot, sharingId, onShareBestSix, bestSixBusy, bestSixCount, sessionStats }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">DETECTED SHOTS · {shots.length}</div>
        <button
          data-testid="share-best-six-btn"
          onClick={onShareBestSix}
          disabled={bestSixBusy || bestSixCount === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-black font-black uppercase tracking-widest text-[11px] hover:bg-primary/90 disabled:opacity-40 glow-border"
        >
          {bestSixBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trophy className="w-3.5 h-3.5" />}
          {bestSixBusy ? 'BUILDING…' : `SHARE BEST SIX (${Math.min(6, bestSixCount)})`}
        </button>
      </div>
      {sessionStats && (
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Session · {sessionStats.balls} balls · <span className="text-primary font-bold">{sessionStats.runs} runs</span> · SR {sessionStats.sr} · {sessionStats.fours}×4 · {sessionStats.sixes}×6
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shots.map((d) => {
          const ct = confidenceTier(d.confidence);
          const isSharing = sharingId === d.id;
          return (
            <div key={d.id} className="broadcast-card overflow-hidden group" data-testid={`detected-shot-${d.id}`}>
              <div className="relative">
                {d.freezeUrl ? (
                  <img src={d.freezeUrl} alt="freeze" className="w-full aspect-video object-cover" />
                ) : (
                  <div className="w-full aspect-video bg-black" />
                )}
                <button
                  data-testid={`share-shot-${d.id}`}
                  onClick={() => onShareShot?.(d)}
                  disabled={isSharing}
                  className="absolute top-2 right-2 px-2 py-1 rounded bg-black/80 border border-primary/40 text-primary text-[10px] uppercase tracking-widest font-bold flex items-center gap-1 hover:bg-primary hover:text-black transition-colors disabled:opacity-50"
                >
                  {isSharing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                  {isSharing ? '…' : 'SHARE'}
                </button>
              </div>
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

function ViewToggle({ value, onChange }) {
  return (
    <div className="inline-flex items-center gap-2 mx-auto">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">VIEW</span>
      <div className="flex items-center rounded border border-white/15 overflow-hidden">
        <button
          data-testid="video-view-side"
          onClick={() => onChange('side')}
          className={`px-3 py-1 text-[10px] uppercase tracking-widest font-bold ${value === 'side' ? 'bg-primary text-black' : 'text-foreground hover:bg-white/5'}`}
        >
          SIDE-ON
        </button>
        <button
          data-testid="video-view-front"
          onClick={() => onChange('front')}
          className={`px-3 py-1 text-[10px] uppercase tracking-widest font-bold ${value === 'front' ? 'bg-primary text-black' : 'text-foreground hover:bg-white/5'}`}
        >
          FRONT-ON
        </button>
      </div>
    </div>
  );
}

function formatTime(s) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
`;
}
