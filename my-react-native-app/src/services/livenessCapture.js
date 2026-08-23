import { Config } from '../constants/Config';
import { analyzeFrame } from './faceDetection';

/**
 * Capture a short burst of low-quality frames while the user performs the
 * server-assigned liveness action, analyzing each frame as it's captured.
 * Shared by the face-enroll and face-login screens, which need identical
 * capture/pacing/error behavior.
 */
export const captureLivenessBurst = async (cameraRef) => {
  const { LIVENESS_FRAME_COUNT: frameCount, LIVENESS_FRAME_INTERVAL_MS: intervalMs } = Config.FACE_RECOGNITION;
  const frames = [];

  for (let i = 0; i < frameCount; i++) {
    const shotStart = Date.now();

    if (!cameraRef.current) {
      return { success: false, message: 'Camera is not ready. Please try again.' };
    }

    let photo;
    try {
      photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.15 });
    } catch {
      return { success: false, message: 'Could not capture frame from camera. Please hold steady.' };
    }

    if (!photo?.base64) {
      return { success: false, message: 'Could not capture frame from camera. Please hold steady.' };
    }

    const analysis = analyzeFrame(photo.base64);
    if (!analysis.success) {
      return { success: false, message: analysis.message };
    }

    frames.push(analysis);

    const elapsed = Date.now() - shotStart;
    const remaining = intervalMs - elapsed;
    if (remaining > 0 && i < frameCount - 1) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }

  return {
    success: true,
    descriptors: frames.map((f) => f.descriptor),
    lastDescriptor: frames[frames.length - 1].descriptor,
    frameSignals: frames.map((f) => ({
      eyeStripMean: f.eyeStripMean,
      gradientCentroidX: f.gradientCentroidX,
    })),
  };
};
