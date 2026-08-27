import {
  FilesetResolver,
  PoseLandmarker,
  ImageSegmenter,
} from '@mediapipe/tasks-vision';
import { SubjectMotionAnalyzer } from './subject-motion.mjs';

import {
  MEDIAPIPE_POSE_LANDMARKER_MODEL,
  MEDIAPIPE_SELFIE_SEGMENTER_MODEL,
  MEDIAPIPE_TASKS_VISION_WASM_BASE,
} from './mediapipe-paths.mjs';

const WASM_BASE = MEDIAPIPE_TASKS_VISION_WASM_BASE;
const POSE_MODEL = MEDIAPIPE_POSE_LANDMARKER_MODEL;
const SEGMENTER_MODEL = MEDIAPIPE_SELFIE_SEGMENTER_MODEL;

let poseLandmarker = null;
let imageSegmenter = null;
let motionAnalyzer = new SubjectMotionAnalyzer();
let analysisCanvas = null;
let analysisCtx = null;
let maskTargetWidth = 256;
let busy = false;
let pending = null;
let lastTimestampMs = 0;

self.onmessage = async (event) => {
  const message = event.data || {};
  try {
    if (message.type === 'init') {
      await ensureModels(message.maskWidth || 256);
      self.postMessage({ type: 'ready', segmenter: !!imageSegmenter });
      return;
    }
    if (message.type === 'reset') {
      motionAnalyzer.reset();
      lastTimestampMs = 0;
      self.postMessage({ type: 'reset' });
      return;
    }
    if (message.type === 'analyze') {
      queueAnalyze(message);
      return;
    }
    if (message.type === 'dispose') {
      disposeModels();
      self.postMessage({ type: 'disposed' });
      return;
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: message.id,
      message: error?.message || 'worker_error',
    });
  }
};

async function ensureModels(width) {
  maskTargetWidth = width || 256;
  if (poseLandmarker) return;

  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'CPU' },
    runningMode: 'IMAGE',
    numPoses: 1,
    outputSegmentationMasks: true,
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });

  try {
    imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: SEGMENTER_MODEL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
  } catch (error) {
    console.warn('Subject worker: segmenter unavailable', error);
    imageSegmenter = null;
  }
}

function disposeModels() {
  poseLandmarker?.close?.();
  imageSegmenter?.close?.();
  poseLandmarker = null;
  imageSegmenter = null;
  motionAnalyzer.reset();
  analysisCanvas = null;
  analysisCtx = null;
  lastTimestampMs = 0;
}

function queueAnalyze(message) {
  pending = message;
  if (busy) return;
  void runPending();
}

async function runPending() {
  if (!pending) return;
  busy = true;
  const message = pending;
  pending = null;
  try {
    const result = await analyzeFrame(message);
    const transfers = [];
    if (result.maskBuffer) transfers.push(result.maskBuffer);
    self.postMessage({ type: 'result', ...result }, transfers);
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: message.id,
      message: error?.message || 'analyze_failed',
    });
  } finally {
    busy = false;
    if (pending) void runPending();
  }
}

async function analyzeFrame(message) {
  const { id, timestampMs, width, height, bitmap } = message;
  if (!poseLandmarker || !bitmap) {
    throw new Error('worker_not_ready');
  }

  const canvas = ensureCanvas(width, height);
  analysisCtx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const ts = Math.max(0, Math.round(timestampMs || 0));
  if (ts + 500 < lastTimestampMs) {
    motionAnalyzer.reset();
  }
  lastTimestampMs = ts;

  const poseResult = poseLandmarker.detect(canvas);
  const pose = poseResult?.landmarks?.[0] || null;
  const confidence = pose?.length
    ? pose.reduce(
        (sum, point) => sum + (point.visibility ?? point.presence ?? 0),
        0,
      ) / pose.length
    : 0;

  const landmarks = pose?.map((point) => ({
    x: point.x,
    y: point.y,
    z: point.z || 0,
    visibility: point.visibility ?? point.presence ?? 0,
  }));

  const frame = motionAnalyzer.analyze(landmarks || null, ts, confidence);

  let maskBuffer = null;
  let maskWidth = 0;
  let maskHeight = 0;
  let segmentationSource = 'none';

  const poseMask = poseResult?.segmentationMasks?.[0];
  if (poseMask) {
    const packed = packMaskFromMpMask(poseMask, maskTargetWidth);
    if (packed) {
      maskBuffer = packed.buffer;
      maskWidth = packed.width;
      maskHeight = packed.height;
      segmentationSource = 'pose';
    }
  }

  if (!maskBuffer && imageSegmenter) {
    try {
      const segResult = imageSegmenter.segment(canvas);
      const categoryMask = segResult?.categoryMask;
      if (categoryMask) {
        const packed = packMaskFromMpMask(categoryMask, maskTargetWidth);
        if (packed) {
          maskBuffer = packed.buffer;
          maskWidth = packed.width;
          maskHeight = packed.height;
          segmentationSource = 'segmenter';
        }
      }
    } catch (error) {
      console.warn('Subject worker: segment failed', error);
    }
  }

  return {
    id,
    timestampMs: ts,
    frame: frame
      ? {
          landmarks: frame.landmarks,
          boundingBox: frame.boundingBox,
          center: frame.center,
          motionEnergy: frame.motionEnergy,
          movementDirection: frame.movementDirection,
          bodyExpansion: frame.bodyExpansion,
          jointVelocities: frame.jointVelocities,
          headVelocity: frame.headVelocity,
          wristVelocities: frame.wristVelocities,
          timestamp: frame.timestamp,
          confidence: frame.confidence,
          held: frame.held,
        }
      : null,
    maskBuffer,
    maskWidth,
    maskHeight,
    segmentationSource,
    confidence,
  };
}

function ensureCanvas(width, height) {
  const scale = Math.min(1, maskTargetWidth / Math.max(width, 1));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  if (!analysisCanvas) {
    analysisCanvas = new OffscreenCanvas(w, h);
    analysisCtx = analysisCanvas.getContext('2d', {
      willReadFrequently: true,
    });
  }
  if (analysisCanvas.width !== w || analysisCanvas.height !== h) {
    analysisCanvas.width = w;
    analysisCanvas.height = h;
  }
  return analysisCanvas;
}

function packMaskFromMpMask(mask, targetWidth) {
  const srcW = mask?.width || 0;
  const srcH = mask?.height || 0;
  if (!srcW || !srcH) return null;

  let src = null;
  try {
    if (typeof mask.hasUint8Array === 'function' && mask.hasUint8Array()) {
      src = mask.getAsUint8Array();
    } else if (
      typeof mask.hasFloat32Array === 'function' &&
      mask.hasFloat32Array()
    ) {
      const floats = mask.getAsFloat32Array();
      src = new Uint8Array(floats.length);
      for (let i = 0; i < floats.length; i++) {
        src[i] = floats[i] > 0.5 ? 255 : 0;
      }
    }
  } finally {
    mask.close?.();
  }
  if (!src?.length) return null;

  const targetH = Math.max(1, Math.round((targetWidth * srcH) / srcW));
  const buffer = new Uint8Array(targetWidth * targetH);
  for (let y = 0; y < targetH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / targetH));
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / targetWidth));
      buffer[y * targetWidth + x] = src[sy * srcW + sx] > 0 ? 255 : 0;
    }
  }
  return { buffer: buffer.buffer, width: targetWidth, height: targetH };
}
