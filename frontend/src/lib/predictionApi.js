import { api } from '@/lib/api';

// Log a shot to the session AND log the prediction record (for personal threshold training + AI accuracy).
// Used by LiveCamera and VideoAnalyzer.
export default async function logShotAndPrediction({ session, prediction, correct, override }) {
  const biomech = prediction?.features || {};
  const finalRuns = override?.runs ?? prediction.runs;
  const finalDir = override?.shotType ?? prediction.shotType;
  const finalAngle = override?.angle ?? prediction.wagonAngle;

  let shotDoc = null;
  if (session?.id) {
    const r = await api.post(`/sessions/${session.id}/shots`, {
      runs: finalRuns,
      shot_type: finalDir,
      x: 0.5,
      y: 0.5,
      angle: finalAngle,
    });
    shotDoc = r.data;
  }
  await api.post('/predictions/log', {
    session_id: session?.id,
    biomech: {
      wrist_angle: biomech.wrist_angle ?? 0,
      elbow_angle: biomech.elbow_angle ?? 0,
      shoulder_rotation: biomech.shoulder_rotation ?? 0,
      wrist_velocity: prediction.velocity ?? 0,
      body_lean: biomech.body_lean ?? 0,
      foot_position: prediction.footPosition || 'unknown',
    },
    predicted_direction: prediction.shotType,
    predicted_angle: prediction.wagonAngle,
    predicted_runs: prediction.runs,
    actual_direction: finalDir,
    actual_angle: finalAngle,
    actual_runs: finalRuns,
    correct,
    confidence: prediction.confidence,
  });
  return shotDoc;
}

// Log a rejected detection — the user said "this wasn't a real shot at all".
// Does NOT create a session shot, only a negative training sample.
export async function logRejectedPrediction({ session, prediction }) {
  const biomech = prediction?.features || {};
  await api.post('/predictions/log', {
    session_id: session?.id,
    biomech: {
      wrist_angle: biomech.wrist_angle ?? 0,
      elbow_angle: biomech.elbow_angle ?? 0,
      shoulder_rotation: biomech.shoulder_rotation ?? 0,
      wrist_velocity: prediction.velocity ?? 0,
      body_lean: biomech.body_lean ?? 0,
      foot_position: prediction.footPosition || 'unknown',
    },
    predicted_direction: prediction.shotType,
    predicted_angle: prediction.wagonAngle,
    predicted_runs: prediction.runs,
    actual_direction: null,
    actual_angle: null,
    actual_runs: null,
    correct: false,
    rejected: true,
    confidence: prediction.confidence,
  });
}
