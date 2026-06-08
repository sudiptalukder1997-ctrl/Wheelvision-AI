import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getDetector, drawSkeleton } from '@/lib/poseDetector';
import { computeFeatures, detectSwing, classifyShot, finalConfidence, confidenceTier } from '@/lib/biomechanics';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Upload, X, Sparkles, Loader2 } from 'lucide-react';

const FRAME_STRIDE = 5; // sample 1 frame out of 5 (≈6fps from a 30fps video)
const HISTORY_SIZE = 12;
const COOLDOWN_FRAMES = 9; // frames at sampled rate

export default function VideoAnalyzer({ open, onClose, session, batterHand, onAnalysisComplete, personalThresholds }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0); // 0..100
  const [analyzing, setAnalyzing] = useState(false);
  const [detected, setDetected] = useState([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [aiCoaching, setAiCoaching] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);

  const reset = useCallback(() => {
    setFile(null); setProgress(0); setAnalyzing(false);
    setDetected([]); setStatusMsg(''); setAiCoaching(null);
  }, []);

  useEffect(() => { if (!open) reset(); }, [open, reset]);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) { toast.error('Max 200MB'); return; }
    setFile(f);
    setDetected([]); setProgress(0); setAiCoaching(null);
  };

  const startAnalysis = useCallback(async () => {
    if (!file) return;
    const video = videoRef.current;
    if (!video) return;
    setAnalyzing(true);
    setStatusMsg('Loading MoveNet Thunder…');
    let detector;
    try {
      detector = await getDetector('thunder');
    } catch (e) {
      toast.error('Could not load model'); setAnalyzing(false); return;
    }
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    await new Promise((res) => video.addEventListener('loadedmetadata', res, { once: true }));
    const duration = video.duration;
    const fps = 30; // assumed; we sample every FRAME_STRIDE
    const sampleDt = FRAME_STRIDE / fps;
    let history = [];
    let lastDetectIdx = -COOLDOWN_FRAMES;
    let frameIdx = 0;
    const found = [];

    setStatusMsg('Analysing video…');

    for (let t = 0; t <= duration; t += sampleDt) {
      video.currentTime = t;
      await new Promise((res) => {
        const onSeek = () => { video.removeEventListener('seeked', onSeek); res(); };
        video.addEventListener('seeked', onSeek);
      });
      let pose;
      try {
        const poses = await detector.estimatePoses(video, { maxPoses: 1, flipHorizontal: false });
        pose = poses?.[0];
      } catch (_e) { pose = null; }
      const canvas = canvasRef.current;
      if (canvas && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (pose?.keypoints) drawSkeleton(ctx, pose.keypoints, { color: '#22C55E' });
      }
      if (pose?.keypoints) {
        const features = computeFeatures(pose.keypoints, batterHand);
        history.push({ ...features, frameIdx, t });
        if (history.length > HISTORY_SIZE) history.shift();
        if (frameIdx - lastDetectIdx > COOLDOWN_FRAMES) {
          const swing = detectSwing(history, 3.5);
          if (swing) {
            const classified = classifyShot({
              wrist_angle: features.wrist_angle,
              elbow_angle: features.elbow_angle,
              body_lean: features.body_lean,
              velocity: swing.motion.wrist_velocity,
              upward: swing.motion.upward,
              personalThresholds,
            });
            const conf = finalConfidence(features.keypoint_confidence, classified.confidence, personalThresholds && Object.keys(personalThresholds).length ? 0.2 : 0);
            // capture freeze frame
            let freezeUrl = null;
            try {
              const fcanvas = document.createElement('canvas');
              fcanvas.width = (video.videoWidth || 640);
              fcanvas.height = (video.videoHeight || 360);
              const fctx = fcanvas.getContext('2d');
              fctx.drawImage(video, 0, 0, fcanvas.width, fcanvas.height);
              if (pose?.keypoints) drawSkeleton(fctx, pose.keypoints, { color: '#22C55E' });
              // angle overlay
              fctx.font = 'bold 18px "JetBrains Mono", monospace';
              fctx.fillStyle = '#22C55E';
              fctx.shadowColor = '#22C55E'; fctx.shadowBlur = 6;
              fctx.fillText(`${classified.shotType.toUpperCase()}  ·  ${conf}%`, 12, 24);
              fctx.fillStyle = '#fafafa';
              fctx.font = '14px "JetBrains Mono", monospace';
              fctx.fillText(`Wrist ${Math.round(features.wrist_angle)}°  Elbow ${Math.round(features.elbow_angle)}°  Lean ${Math.round(features.body_lean)}°`, 12, 44);
              freezeUrl = fcanvas.toDataURL('image/jpeg', 0.65);
            } catch (_e) { /* ignore */ }
            found.push({
              id: `vid-${frameIdx}`,
              t,
              ...classified,
              confidence: conf,
              features,
              freezeUrl,
              velocity: swing.motion.wrist_velocity,
            });
            lastDetectIdx = frameIdx;
            setStatusMsg(`Analysed ${formatTime(t)} of ${formatTime(duration)} — ${found.length} shots detected so far`);
            setDetected([...found]);
          }
        }
      }
      frameIdx++;
      setProgress(Math.min(100, (t / duration) * 100));
      // yield to UI
      if (frameIdx % 3 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    setStatusMsg(`Analysis complete · ${found.length} shots detected`);
    setProgress(100);
    setAnalyzing(false);
    URL.revokeObjectURL(url);

    // Persist shots + predictions
    if (session?.id && found.length > 0) {
      try {
        for (const p of found) {
          await api.post(`/sessions/${session.id}/shots`, {
            runs: p.runs,
            shot_type: p.shotType,
            x: 0.5, y: 0.5,
            angle: p.wagonAngle,
          });
          await api.post('/predictions/log', {
            session_id: session.id,
            biomech: {
              wrist_angle: p.features.wrist_angle,
              elbow_angle: p.features.elbow_angle,
              shoulder_rotation: p.features.shoulder_rotation,
              wrist_velocity: p.velocity,
              body_lean: p.features.body_lean,
              foot_position: p.footPosition || 'unknown',
            },
            predicted_direction: p.shotType,
            predicted_angle: p.wagonAngle,
            predicted_runs: p.runs,
            actual_direction: p.shotType,
            actual_angle: p.wagonAngle,
            actual_runs: p.runs,
            correct: true,
            confidence: p.confidence,
          });
        }
        onAnalysisComplete?.();
      } catch (e) {
        toast.error(e?.response?.data?.detail || 'Could not save shots');
      }
    }

    // Auto-trigger biomech coaching after video analysis
    if (session?.id && found.length >= 3) {
      setAiBusy(true);
      try {
        const r = await api.post(`/sessions/${session.id}/coaching/biomech`);
        setAiCoaching(r.data.coaching);
        toast.success('AI coaching analysis complete');
      } catch (e) {
        // tier could be free
        const detail = e?.response?.data?.detail;
        if (detail) toast.error(detail);
      } finally {
        setAiBusy(false);
      }
    }
  }, [file, batterHand, session, personalThresholds, onAnalysisComplete]);

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
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">DETECTED SHOTS · {detected.length}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {detected.map((d) => {
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
        )}

        {/* AI coaching report */}
        {(aiBusy || aiCoaching) && (
          <div className="broadcast-card p-3 sm:p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">AI COACHING REPORT</div>
              {aiBusy && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin ml-auto" />}
            </div>
            {aiCoaching ? (
              <div className="rounded bg-[#051A0C] border border-primary/20 p-3 text-sm leading-relaxed whitespace-pre-wrap font-mono text-foreground">
                {aiCoaching}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Generating biomechanical coaching report…</div>
            )}
          </div>
        )}
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
