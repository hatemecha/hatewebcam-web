import {
  FilesetResolver,
  PoseLandmarker,
  ImageSegmenter,
} from '@mediapipe/tasks-vision';
import { SubjectMotionAnalyzer } from './subject-motion.mjs';

let poseLandmarker = null;
let imageSegmenter = null;
let motionAnalyzer = new SubjectMotionAnalyzer();
let analysisCanvas = null;
let analysisCtx = null;
let maskTargetWidth = 256;
let busy = false;
let pending = null;
let lastTimestampMs = 0;
let assetUrls = null;
let segmenterLoadPromise = null;
let segmenterUnavailable = false;

self.onmessage = async (event) => {
  const message = event.data || {};
  try {
    if (message.type === 'init') {
      await ensureModels(message.assets, message.maskWidth || 256);
      self.postMessage({ type: 'ready', segmenter: !!imageSegmenter });
      return;
    }
    if (message.type === 'reset') {
      pending?.bitmap?.close?.();
      pending = null;
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
    if (message.type === 'init') disposeModels();
    message.bitmap?.close?.();
    self.postMessage({
      type: 'error',
      id: message.id,
      message: error?.message || 'worker_error',
    });
  }
};

async function ensureModels(assets, width) {
  maskTargetWidth = width || 256;
  if (poseLandmarker) return;
  const { wasmBaseUrl, poseModelUrl, segmenterModelUrl } = assets || {};
  if (!wasmBaseUrl || !poseModelUrl || !segmenterModelUrl) {
    throw new Error('subject_asset_urls_missing');
  }
  assetUrls = assets;

  const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl, true);
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: poseModelUrl, delegate: 'CPU' },
    runningMode: 'IMAGE',
    numPoses: 1,
    outputSegmentationMasks: true,
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });
}

async function ensureImageSegmenter() {
  if (imageSegmenter) return imageSegmenter;
  if (segmenterUnavailable || !assetUrls) return null;
  if (segmenterLoadPromise) return segmenterLoadPromise;
  segmenterLoadPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        assetUrls.wasmBaseUrl,
        true,
      );
      // The module loader is stateful. A distinct URL re-runs its factory for
      // the fallback task instead of reusing the consumed Pose module import.
      vision.wasmLoaderPath += '?subject-task=image-segmenter';
      imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: assetUrls.segmenterModelUrl,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      return imageSegmenter;
    } catch (error) {
      segmenterUnavailable = true;
      console.warn('Subject worker: segmenter unavailable', error);
      return null;
    } finally {
      segmenterLoadPromise = null;
    }
  })();
  return segmenterLoadPromise;
}

function disposeModels() {
  pending?.bitmap?.close?.();
  pending = null;
  busy = false;
  poseLandmarker?.close?.();
  imageSegmenter?.close?.();
  poseLandmarker = null;
  imageSegmenter = null;
  motionAnalyzer.reset();
  analysisCanvas = null;
  analysisCtx = null;
  lastTimestampMs = 0;
  assetUrls = null;
  segmenterLoadPromise = null;
  segmenterUnavailable = false;
}

function queueAnalyze(message) {
  pending?.bitmap?.close?.();
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
    bitmap?.close?.();
    throw new Error('worker_not_ready');
  }

  const canvas = ensureCanvas(width, height);
  try {
    analysisCtx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close?.();
  }

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

  try {
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
  } finally {
    poseResult?.close?.();
  }

  if (!maskBuffer && (imageSegmenter || !segmenterUnavailable)) {
    try {
      const segmenter = imageSegmenter || (await ensureImageSegmenter());
      const segResult = segmenter?.segment(canvas);
      try {
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
      } finally {
        segResult?.close?.();
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
