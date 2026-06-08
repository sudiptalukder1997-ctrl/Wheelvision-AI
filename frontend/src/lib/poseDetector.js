// Lazy-loaded MoveNet pose detector. We default to Thunder (more accurate, slower)
// per user request. Lightning is available as a quality knob.

let detectorInstance = null;
let detectorPromise = null;
let loadedModel = null;
let cachedModules = null;

async function loadDeps() {
  if (cachedModules) return cachedModules;
  const [tf, poseDetection] = await Promise.all([
    import('@tensorflow/tfjs'),
    import('@tensorflow-models/pose-detection'),
  ]);
  // ensure WebGL backend (default in @tensorflow/tfjs)
  try { await tf.setBackend('webgl'); } catch (_) { /* fall back to cpu */ }
  await tf.ready();
  cachedModules = { tf, poseDetection };
  return cachedModules;
}

export async function getDetector(modelType = 'thunder') {
  if (detectorInstance && loadedModel === modelType) return detectorInstance;
  if (detectorPromise && loadedModel === modelType) return detectorPromise;
  loadedModel = modelType;
  detectorPromise = (async () => {
    const { poseDetection } = await loadDeps();
    const modelTypeMap = {
      thunder: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
      lightning: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    };
    const detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      { modelType: modelTypeMap[modelType] || modelTypeMap.thunder },
    );
    detectorInstance = detector;
    return detector;
  })();
  return detectorPromise;
}

export async function estimateOnSource(source, opts = {}) {
  const detector = await getDetector(opts.modelType || 'thunder');
  const poses = await detector.estimatePoses(source, { maxPoses: 1, flipHorizontal: !!opts.flipHorizontal });
  return poses?.[0] || null;
}

export function disposeDetector() {
  if (detectorInstance) {
    try { detectorInstance.dispose(); } catch (_) { /* ignore */ }
  }
  detectorInstance = null;
  detectorPromise = null;
  loadedModel = null;
}

// Pose keypoint connections for drawing skeleton overlay.
export const SKELETON_EDGES = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
];

// Tracked subset used for keypoint-confidence calculation
export const TRACKED_KEYPOINTS = [
  'nose',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_hip', 'right_hip',
];

// Draw skeleton onto a 2D canvas context
export function drawSkeleton(ctx, keypoints, opts = {}) {
  const {
    color = '#22C55E',
    pointRadius = 5,
    minScore = 0.3,
    lineWidth = 3,
    glow = true,
  } = opts;
  if (!ctx || !keypoints) return;
  const byName = {};
  keypoints.forEach((k) => { if (k?.name) byName[k.name] = k; });

  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
  }
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;

  SKELETON_EDGES.forEach(([a, b]) => {
    const ka = byName[a]; const kb = byName[b];
    if (!ka || !kb) return;
    if ((ka.score ?? 0) < minScore || (kb.score ?? 0) < minScore) return;
    ctx.beginPath();
    ctx.moveTo(ka.x, ka.y);
    ctx.lineTo(kb.x, kb.y);
    ctx.stroke();
  });
  keypoints.forEach((k) => {
    if (!k || (k.score ?? 0) < minScore) return;
    ctx.beginPath();
    ctx.arc(k.x, k.y, pointRadius, 0, Math.PI * 2);
    ctx.fill();
  });
  if (glow) ctx.shadowBlur = 0;
}

export function howManyKeypointsDetected(keypoints, minScore = 0.3) {
  if (!keypoints) return 0;
  return keypoints.filter((k) => (k.score ?? 0) >= minScore).length;
}
