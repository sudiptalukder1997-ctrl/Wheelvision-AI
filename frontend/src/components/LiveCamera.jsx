import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getDetector, drawSkeleton, howManyKeypointsDetected } from '@/lib/poseDetector';
import { computeFeatures, detectSwing, classifyShot, finalConfidence } from '@/lib/biomechanics';
import logShotAndPrediction from '@/lib/predictionApi';
import useCameraStream from '@/lib/useCameraStream';
import { toast } from 'sonner';
import { Camera, X, Pause, Play, Activity } from 'lucide-react';
import ConfirmationCard from '@/components/ConfirmationCard';
import EditShotSheet from '@/components/EditShotSheet';
import CameraSetupGuide from '@/components/CameraSetupGuide';

const HISTORY_SIZE = 12;
const COOLDOWN_MS = 1500;

export default function LiveCamera({ open, onClose, session, batterHand, onShotLogged, personalThresholds, aiAccuracy, defaultCameraView = 'side' }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const stateRef = useRef({ running: false, history: [], lastDetectionAt: 0, lastPrediction: null });
  const rafRef = useRef(0);

  const [phase, setPhase] = useState('setup'); // setup | loading | running | paused
  const [status, setStatus] = useState('Loading MoveNet Thunder…');
  const [framing, setFraming] = useState({ ready: false, score: 0, count: 0 });
  const [pendingPrediction, setPendingPrediction] = useState(null);
  const [editing, setEditing] = useState(false);
  const [sensitivity, setSensitivity] = useState(4.0);
  const [cameraView, setCameraView] = useState(defaultCameraView === 'front' ? 'front' : 'side');

  const stopLoop = useCallback(() => {
    stateRef.current.running = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const { start: startStream, stop: stopStream } = useCameraStream({ videoRef });

  const stopCamera = useCallback(() => {
    stopLoop();
    stopStream();
  }, [stopLoop, stopStream]);

  const logPrediction = useCallback(async ({ correct, prediction, override }) => {
    try {
      const shot = await logShotAndPrediction({ session, prediction, correct, override });
      if (shot) onShotLogged?.(shot);
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Could not log shot';
      console.error('logPrediction failed', err);
      toast.error(msg);
    }
  }, [session, onShotLogged]);

  const handleConfirm = useCallback(async (mode) => {
    if (!pendingPrediction) return;
    const isAuto = mode === 'auto';
    const isManualConfirm = mode === 'manual';
    await logPrediction({ correct: isAuto || isManualConfirm, prediction: pendingPrediction });
    toast.success(`${pendingPrediction.shotType} · +${pendingPrediction.runs}${isAuto ? ' (auto)' : ''}`);
    setPendingPrediction(null);
  }, [pendingPrediction, logPrediction]);

  const handleEdit = useCallback(() => {
    setEditing(true);
  }, []);

  const handleEditSave = useCallback(async ({ runs, shotType, angle }) => {
    if (!pendingPrediction) return;
    await logPrediction({ correct: false, prediction: pendingPrediction, override: { runs, shotType, angle } });
    toast.success(`Corrected · ${shotType} · +${runs}`);
    setEditing(false);
    setPendingPrediction(null);
  }, [pendingPrediction, logPrediction]);

  // Detection loop
  const loop = useCallback(async () => {
    if (!stateRef.current.running) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    const detector = await getDetector('thunder');
    let pose;
    try {
      pose = await detector.estimatePoses(video, { maxPoses: 1, flipHorizontal: false });
    } catch (err) {
      pose = null;
      console.warn('pose detect failed', err);
    }
    const p = pose?.[0];

    // Draw video + skeleton overlay
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (p?.keypoints) {
      drawSkeleton(ctx, p.keypoints, { color: '#22C55E' });
    }

    // Framing guide check
    const count = p ? howManyKeypointsDetected(p.keypoints, 0.4) : 0;
    const allTracked = ['nose','left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist','left_hip','right_hip'];
    const found = p?.keypoints?.filter((k) => allTracked.includes(k.name) && (k.score ?? 0) >= 0.4).length || 0;
    const ready = found >= 8;
    setFraming({ ready, score: found / allTracked.length, count });

    if (p?.keypoints) {
      const features = computeFeatures(p.keypoints, batterHand);
      const frame = { ...features, ts: performance.now() };
      stateRef.current.history.push(frame);
      if (stateRef.current.history.length > HISTORY_SIZE) stateRef.current.history.shift();

      const now = Date.now();
      const cooldownOk = now - stateRef.current.lastDetectionAt > COOLDOWN_MS;
      if (cooldownOk && !pendingPrediction) {
        const swing = detectSwing(stateRef.current.history, sensitivity);
        if (swing) {
          const classified = classifyShot({
            wrist_angle: features.wrist_angle,
            elbow_angle: features.elbow_angle,
            body_lean: features.body_lean,
            velocity: swing.motion.wrist_velocity,
            upward: swing.motion.upward,
            trajectory: swing.motion.trajectory,
            personalThresholds,
            cameraView,
            batterHand,
          });
          const conf = finalConfidence(features.keypoint_confidence, classified.confidence, personalThresholds && Object.keys(personalThresholds).length ? 0.2 : 0);
          const prediction = {
            id: `live-${now}`,
            shotType: classified.shotType,
            runs: classified.runs,
            wagonAngle: classified.wagonAngle,
            confidence: conf,
            footPosition: classified.footPosition,
            velocity: swing.motion.wrist_velocity,
            features,
          };
          stateRef.current.lastDetectionAt = now;
          stateRef.current.lastPrediction = prediction;
          if (navigator.vibrate) try { navigator.vibrate(80); } catch (err) { console.warn('vibrate failed', err); }
          if (conf >= 90) {
            // auto confirm immediately, no card
            await logPrediction({ correct: true, prediction });
            toast.success(`${prediction.shotType} · +${prediction.runs} · ${conf}%`);
          } else {
            setPendingPrediction(prediction);
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [batterHand, pendingPrediction, sensitivity, personalThresholds, logPrediction]);

  const startCamera = useCallback(async () => {
    setStatus('Loading MoveNet Thunder…');
    setPhase('loading');
    try {
      await startStream();
      setPhase('running');
      setStatus('Live · MoveNet Thunder');
      stateRef.current.running = true;
      stateRef.current.history = [];
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error('camera/model load failed', err);
      const isPermission = err?.name === 'NotAllowedError' || err?.name === 'NotFoundError';
      setStatus(isPermission ? 'Camera permission denied' : 'Could not start camera');
      toast.error(isPermission ? 'Camera permission denied. Allow access in your browser.' : 'Could not load MoveNet Thunder');
      setPhase('setup');
    }
  }, [loop, startStream]);

  // cleanup on close
  useEffect(() => {
    if (!open) {
      stopCamera();
      setPhase('setup');
      setPendingPrediction(null);
    }
    return () => stopCamera();
  }, [open, stopCamera]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button onClick={onClose} data-testid="live-camera-close" className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold flex items-center gap-1.5">
              <Camera className="w-3 h-3" /> LIVE CAMERA
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{status}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {phase === 'running' && (
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-primary font-bold">
              <Activity className="w-3 h-3" /> AI {aiAccuracy ?? 0}%
            </div>
          )}
          {phase === 'running' ? (
            <button onClick={() => { stopLoop(); setPhase('paused'); }} className="p-2 rounded border border-white/10"><Pause className="w-4 h-4" /></button>
          ) : phase === 'paused' ? (
            <button onClick={() => { stateRef.current.running = true; rafRef.current = requestAnimationFrame(loop); setPhase('running'); }} className="p-2 rounded border border-primary text-primary"><Play className="w-4 h-4" /></button>
          ) : null}
        </div>
      </div>

      {/* body */}
      <div className="flex-1 relative overflow-hidden">
        {phase === 'setup' && (
          <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6 flex items-center justify-center">
            <div className="w-full max-w-xl">
              <CameraSetupGuide
                title="LIVE CAMERA SETUP"
                initialView={cameraView}
                onContinue={(chosenView) => { setCameraView(chosenView); startCamera(); }}
                onCancel={onClose}
              />
            </div>
          </div>
        )}
        {phase === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="font-display font-bold text-foreground glow-text animate-pulse">LOADING MOVENET THUNDER…</div>
              <div className="text-xs text-muted-foreground mt-1">First load may take ~15s</div>
            </div>
          </div>
        )}
        {(phase === 'running' || phase === 'paused') && (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-full h-full">
                <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ mixBlendMode: 'screen' }} />
                {/* ghost silhouette guide */}
                <svg viewBox="0 0 200 300" className="absolute left-1/2 -translate-x-1/2 top-[10%] h-[80%] pointer-events-none" preserveAspectRatio="xMidYMid meet" style={{ opacity: framing.ready ? 0 : 0.35, transition: 'opacity 250ms' }}>
                  <g stroke={framing.ready ? '#22C55E' : '#A1A1AA'} strokeWidth="2" fill="none" strokeDasharray="6 6">
                    <circle cx="100" cy="40" r="22" />
                    <path d="M100 62 L100 170" />
                    <path d="M100 90 L60 140 M100 90 L150 130" />
                    <path d="M100 170 L80 260 M100 170 L120 260" />
                  </g>
                </svg>
                {/* framing status */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded text-[10px] uppercase tracking-[0.25em] font-bold border"
                  style={{
                    color: framing.ready ? '#000' : '#fff',
                    background: framing.ready ? '#22C55E' : 'rgba(0,0,0,0.6)',
                    borderColor: framing.ready ? '#22C55E' : 'rgba(255,255,255,0.15)',
                  }}
                >
                  {framing.ready ? 'PERFECT POSITION — READY TO ANALYSE' : `FRAMING ${Math.round(framing.score * 100)}% · ${framing.count}/17 keypoints`}
                </div>
                {/* camera view indicator */}
                <div
                  data-testid="live-view-indicator"
                  className="absolute top-3 left-3 px-2 py-1 rounded bg-black/60 border border-primary/40 text-[10px] uppercase tracking-widest text-primary font-bold"
                >
                  VIEW · {cameraView === 'front' ? 'FRONT-ON' : 'SIDE-ON'}
                </div>
                {/* sensitivity slider */}
                <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-xs bg-black/60 rounded p-2 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">SENSITIVITY</div>
                    <div className="text-xs text-primary font-bold tabular-nums">{sensitivity.toFixed(1)}</div>
                  </div>
                  <input
                    data-testid="live-sensitivity-slider"
                    type="range"
                    min="1.5"
                    max="9"
                    step="0.1"
                    value={sensitivity}
                    onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmationCard prediction={pendingPrediction} onConfirm={handleConfirm} onEdit={handleEdit} />
      <EditShotSheet open={editing} prediction={pendingPrediction} onClose={() => setEditing(false)} onSave={handleEditSave} />
    </div>
  );
}
