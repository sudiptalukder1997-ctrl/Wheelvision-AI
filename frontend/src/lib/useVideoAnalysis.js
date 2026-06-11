import { useCallback, useRef, useState } from 'react';
import { getDetector, drawSkeleton, TRACKED_KEYPOINTS } from '@/lib/poseDetector';
import { computeFeatures, detectSwing, classifyShot, finalConfidence } from '@/lib/biomechanics';

// Strict, realistic video shot detection hook.
// Returns analyze(file, opts) -> { shots, qualityCheck, perMinute, durationSec }.
// IMPORTANT: this hook NO LONGER auto-persists shots. The caller must commit
// them after the manual review screen.
export default function useVideoAnalysis({ videoRef, canvasRef, batterHand, personalThresholds, cameraView = 'side', minVelocityThreshold = 0 }) {
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

  // Scan first 5 seconds of the video and check camera setup quality.
  // Returns { ok, issues: [{code, message}], avgScore, suggestedView, fullBody }.
  const runQualityCheck = useCallback(async (video, detector) => {
    const duration = video.duration || 0;
    const scanEnd = Math.min(5, duration);
    const sampleEvery = 0.5;
    let frames = 0;
    let totalScore = 0;
    let humanFrames = 0;
    let ankleFrames = 0;
    let frontOnFrames = 0;
    let sideOnFrames = 0;

    for (let t = 0; t <= scanEnd; t += sampleEvery) {
      video.currentTime = t;
      await new Promise((res) => {
        const onSeek = () => { video.removeEventListener('seeked', onSeek); res(); };
        video.addEventListener('seeked', onSeek);
      });
      let pose;
      try {
        const poses = await detector.estimatePoses(video, { maxPoses: 1, flipHorizontal: false });
        pose = poses?.[0];
      } catch (err) { pose = null; console.warn('quality check pose detect failed', err); }
      frames++;
      if (!pose?.keypoints) continue;
      const byName = {};
      pose.keypoints.forEach((k) => { byName[k.name] = k; });
      const trackedScores = TRACKED_KEYPOINTS.map((n) => byName[n]?.score ?? 0);
      const avg = trackedScores.reduce((a, b) => a + b, 0) / trackedScores.length;
      totalScore += avg;
      if (avg > 0.3) humanFrames++;
      const lAnkle = byName['left_ankle'], rAnkle = byName['right_ankle'];
      if ((lAnkle?.score ?? 0) > 0.3 || (rAnkle?.score ?? 0) > 0.3) ankleFrames++;
      // Side-on vs front-on heuristic: shoulder line width
      const ls = byName['left_shoulder']; const rs = byName['right_shoulder'];
      if (ls && rs && (ls.score ?? 0) > 0.4 && (rs.score ?? 0) > 0.4) {
        const dx = Math.abs(ls.x - rs.x);
        const dy = Math.abs(ls.y - rs.y) + 1;
        const ratio = dx / dy;
        // front-on: shoulders far apart horizontally → high ratio
        // side-on: shoulders almost stacked → low ratio
        if (ratio > 2.5) frontOnFrames++;
        else if (ratio < 1.2) sideOnFrames++;
      }
    }

    const avgScore = frames ? totalScore / frames : 0;
    const issues = [];
    const humanDetected = humanFrames >= Math.max(2, frames / 2);
    if (!humanDetected) {
      issues.push({ code: 'no_human', message: 'No batter detected in the first 5 seconds. Make sure the batter is fully visible and well lit.' });
    }
    const fullBody = ankleFrames >= Math.max(1, frames / 3);
    if (humanDetected && !fullBody) {
      issues.push({ code: 'no_full_body', message: 'Full body not visible — keep the camera further back so you can see head-to-toe.' });
    }
    const lightingPoor = humanDetected && avgScore < 0.4;
    if (lightingPoor) {
      issues.push({ code: 'lighting', message: 'Pose confidence is low — likely due to poor lighting or blurry video. Try filming with better light.' });
    }
    // Orientation mismatch warning
    const suggestedView = sideOnFrames > frontOnFrames ? 'side' : (frontOnFrames > sideOnFrames ? 'front' : null);
    if (cameraView === 'side' && frontOnFrames > sideOnFrames * 2 && frontOnFrames > 1) {
      issues.push({ code: 'orientation_front', message: 'Camera appears to be facing the batter head-on — for best results position the camera side-on to the batter (or switch to Front-On view).' });
    }
    if (cameraView === 'front' && sideOnFrames > frontOnFrames * 2 && sideOnFrames > 1) {
      issues.push({ code: 'orientation_side', message: 'Camera appears to be side-on but you picked Front-On view. Switch to Side-On for accurate biomechanics.' });
    }
    return { ok: issues.length === 0, issues, avgScore, suggestedView, fullBody, humanDetected };
  }, [cameraView]);

  const analyze = useCallback(async (file, { frameStride = 5, fps = 30, historySize = 20, edgeBufferSec = 2, minGapSec = 3, velocityThreshold = 12.0 } = {}) => {
    // Personalise the velocity threshold using the user's learned floor from rejected detections.
    const effectiveThreshold = Math.max(velocityThreshold, minVelocityThreshold || 0);
    const video = videoRef.current;
    if (!file || !video) return { shots: [], qualityCheck: null, perMinute: 0, durationSec: 0 };
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

    // ---- Quality precheck ----
    setStatusMsg('Checking camera setup…');
    const qualityCheck = await runQualityCheck(video, detector);
    if (!qualityCheck.ok) {
      setAnalyzing(false);
      URL.revokeObjectURL(url);
      setStatusMsg('Camera setup check failed.');
      return { shots: [], qualityCheck, perMinute: 0, durationSec: duration };
    }

    // ---- Main analysis loop ----
    const sampleDt = frameStride / fps;
    const history = [];
    const found = [];
    let lastDetectT = -Infinity;
    let frameIdx = 0;

    setStatusMsg('Analysing video…');

    const startT = edgeBufferSec;
    const endT = Math.max(startT, duration - edgeBufferSec);

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

      // edge buffer: skip first/last 2 seconds for detection
      const insideWindow = t >= startT && t <= endT;
      if (insideWindow && pose?.keypoints) {
        const features = computeFeatures(pose.keypoints, batterHand);
        history.push({ ...features, frameIdx, t });
        if (history.length > historySize) history.shift();
        // min 3-second gap between detected shots
        if (t - lastDetectT >= minGapSec) {
          const swing = detectSwing(history, effectiveThreshold);
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
              id: `vid-${frameIdx}-${Math.round(t * 1000)}`,
              t, ...classified, confidence: conf, features, freezeUrl,
              velocity: swing.motion.wrist_velocity,
              both_wrist_peaks: swing.both_wrist_peaks,
              angle_change: swing.angle_change,
            });
            lastDetectT = t;
            setStatusMsg(`Analysed ${formatTime(t)} of ${formatTime(duration)} — ${found.length} shots detected so far`);
            setDetected([...found]);
          }
        }
      }
      frameIdx++;
      setProgress(Math.min(100, (t / duration) * 100));
      if (frameIdx % 3 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    const perMinute = duration > 0 ? (found.length / (duration / 60)) : 0;
    setStatusMsg(`Analysis complete · ${found.length} shots detected${perMinute > 15 ? ' · over-detection warning' : ''}`);
    setProgress(100);
    setAnalyzing(false);
    URL.revokeObjectURL(url);
    return { shots: found, qualityCheck, perMinute, durationSec: duration };
  }, [videoRef, canvasRef, batterHand, personalThresholds, cameraView, minVelocityThreshold, captureFreezeFrame, runQualityCheck]);

  const cancel = useCallback(() => { cancelRef.current = true; }, []);

  return { analyze, cancel, reset, progress, statusMsg, detected, analyzing, setDetected };
}

function formatTime(s) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
