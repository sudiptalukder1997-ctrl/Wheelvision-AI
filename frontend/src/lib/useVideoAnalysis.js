import { useCallback, useRef, useState } from 'react';
import { getDetector, drawSkeleton } from '@/lib/poseDetector';
import { computeFeatures, detectSwing, classifyShot, finalConfidence } from '@/lib/biomechanics';

// Custom hook encapsulating video file -> frame-by-frame MoveNet pose analysis.
// Caller passes refs to a <video> and <canvas>. Returns analyze(file, options).
export default function useVideoAnalysis({ videoRef, canvasRef, batterHand, personalThresholds, cameraView = 'side' }) {
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [detected, setDetected] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const cancelRef = useRef(false);

  const reset = useCallback(() => {
    setProgress(0); setStatusMsg(''); setDetected([]); setAnalyzing(false);
    cancelRef.current = false;
  }, []);

  const captureFreezeFrame = useCallback((video, pose, classified, conf, features) => {
    try {
      const fcanvas = document.createElement('canvas');
      fcanvas.width = video.videoWidth || 640;
      fcanvas.height = video.videoHeight || 360;
      const fctx = fcanvas.getContext('2d');
      fctx.drawImage(video, 0, 0, fcanvas.width, fcanvas.height);
      if (pose?.keypoints) drawSkeleton(fctx, pose.keypoints, { color: '#22C55E' });
      fctx.font = 'bold 18px "JetBrains Mono", monospace';
      fctx.fillStyle = '#22C55E';
      fctx.shadowColor = '#22C55E'; fctx.shadowBlur = 6;
      fctx.fillText(`${classified.shotType.toUpperCase()}  ·  ${conf}%`, 12, 24);
      fctx.fillStyle = '#fafafa';
      fctx.font = '14px "JetBrains Mono", monospace';
      fctx.fillText(`Wrist ${Math.round(features.wrist_angle)}°  Elbow ${Math.round(features.elbow_angle)}°  Lean ${Math.round(features.body_lean)}°`, 12, 44);
      return fcanvas.toDataURL('image/jpeg', 0.65);
    } catch (err) {
      console.warn('freeze frame capture failed', err);
      return null;
    }
  }, []);

  const analyze = useCallback(async (file, { frameStride = 5, fps = 30, historySize = 12, cooldownFrames = 9 } = {}) => {
    const video = videoRef.current;
    if (!file || !video) return [];
    setAnalyzing(true);
    setStatusMsg('Loading MoveNet Thunder…');
    let detector;
    try {
      detector = await getDetector('thunder');
    } catch (err) {
      console.error('detector load failed', err);
      setAnalyzing(false);
      throw err;
    }

    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    await new Promise((res) => video.addEventListener('loadedmetadata', res, { once: true }));
    const duration = video.duration;
    const sampleDt = frameStride / fps;
    const history = [];
    let lastDetectIdx = -cooldownFrames;
    let frameIdx = 0;
    const found = [];

    setStatusMsg('Analysing video…');

    for (let t = 0; t <= duration; t += sampleDt) {
      if (cancelRef.current) break;
      video.currentTime = t;
      await new Promise((res) => {
        const onSeek = () => { video.removeEventListener('seeked', onSeek); res(); };
        video.addEventListener('seeked', onSeek);
      });
      let pose;
      try {
        const poses = await detector.estimatePoses(video, { maxPoses: 1, flipHorizontal: false });
        pose = poses?.[0];
      } catch (err) { pose = null; console.warn('video pose detect failed', err); }

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
        if (history.length > historySize) history.shift();
        if (frameIdx - lastDetectIdx > cooldownFrames) {
          const swing = detectSwing(history, 3.5);
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
            const freezeUrl = captureFreezeFrame(video, pose, classified, conf, features);
            found.push({
              id: `vid-${frameIdx}`,
              t, ...classified, confidence: conf, features, freezeUrl,
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
      if (frameIdx % 3 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    setStatusMsg(`Analysis complete · ${found.length} shots detected`);
    setProgress(100);
    setAnalyzing(false);
    URL.revokeObjectURL(url);
    return found;
  }, [videoRef, canvasRef, batterHand, personalThresholds, cameraView, captureFreezeFrame]);

  const cancel = useCallback(() => { cancelRef.current = true; }, []);

  return { analyze, cancel, reset, progress, statusMsg, detected, analyzing };
}

function formatTime(s) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
