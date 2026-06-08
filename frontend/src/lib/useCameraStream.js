import { useCallback, useEffect, useRef } from 'react';
import { getDetector } from '@/lib/poseDetector';

// Manages getUserMedia camera stream and tears it down on unmount.
// Caller passes a videoRef pointing at a <video> element.
export default function useCameraStream({ videoRef, autoStart = false, facingMode = 'environment' } = {}) {
  const streamRef = useRef(null);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    // Pre-warm the pose detector while we ask for camera permission.
    try {
      await getDetector('thunder');
    } catch (err) {
      console.warn('pose model load failed', err);
      throw err;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    streamRef.current = stream;
    const v = videoRef?.current;
    if (v) {
      v.srcObject = stream;
      try { await v.play(); } catch (err) { console.warn('video play failed', err); }
    }
    return stream;
  }, [facingMode, videoRef]);

  useEffect(() => {
    if (autoStart) {
      start().catch((err) => console.warn('camera autoStart failed', err));
    }
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { start, stop, streamRef };
}
