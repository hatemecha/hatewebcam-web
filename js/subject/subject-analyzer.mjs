import { SubjectMotionAnalyzer } from './subject-motion.mjs';
import {
  normalizeMaskBuffer,
  smoothMaskTemporal,
  SubjectMask,
} from './subject-mask.mjs';
import { buildLocalMotionRegions } from './subject-local-motion.mjs';
import { SubjectAnalysisCache } from './subject-cache.mjs';

export const SUBJECT_ANALYSIS_STATUS = Object.freeze({
  idle: 'idle',
  preparing: 'preparing',
  analyzing: 'analyzing',
  detected: 'detected',
  lost: 'lost',
  ready: 'ready',
  paused: 'paused',
  error: 'error',
  simplified: 'simplified',
});

const WORKER_URL = new URL('./subject-worker.mjs', import.meta.url);

export class SubjectAnalyzer {
  constructor(options = {}) {
    this.motionAnalyzer = new SubjectMotionAnalyzer(options);
    this.cache = new SubjectAnalysisCache(options.cache || {});
    this.worker = null;
    this.ready = false;
    this.status = SUBJECT_ANALYSIS_STATUS.idle;
    this.statusMessage = '';
    this.lastFrame = null;
    this.lastMask = null;
    this.previousMask = null;
    this.lastInferenceTs = 0;
    this.lastTimestampMs = 0;
    this.inferenceIntervalMs = options.inferenceIntervalMs ?? 80;
    this.analysisScale = options.analysisScale ?? 0.5;
    this.maskWidth = options.maskWidth ?? 256;
    this._requestId = 0;
    this._busy = false;
    this._pendingBitmap = null;
    this._pendingMeta = null;
    this._loadPromise = null;
    this.segmentationSource = 'none';
    this.useSimplifiedMode = false;
    this.runtimeQuality = 1;
    this._analyzeErrors = 0;
  }

  getStatusLabel() {
    const cacheLabel = this.cache.getProgressLabel();
    if (cacheLabel) return cacheLabel;
    switch (this.status) {
      case SUBJECT_ANALYSIS_STATUS.preparing:
        return 'Preparando…';
      case SUBJECT_ANALYSIS_STATUS.analyzing:
        return 'Analizando sujeto…';
      case SUBJECT_ANALYSIS_STATUS.detected:
        return 'Sujeto detectado';
      case SUBJECT_ANALYSIS_STATUS.ready:
        return '✓ Sujeto analizado';
      case SUBJECT_ANALYSIS_STATUS.lost:
        return 'Sin sujeto';
      case SUBJECT_ANALYSIS_STATUS.simplified:
        return 'Segmentación no disponible; modo simplificado';
      case SUBJECT_ANALYSIS_STATUS.error:
        return this.statusMessage || 'No se pudo iniciar el análisis corporal.';
      default:
        return '';
    }
  }

  async ensureReady() {
    if (this.ready) return true;
    if (this._loadPromise) return this._loadPromise;
    this.status = SUBJECT_ANALYSIS_STATUS.preparing;
    this._loadPromise = this.#initWorker()
      .then(() => {
        this.ready = true;
        this.status = SUBJECT_ANALYSIS_STATUS.analyzing;
        return true;
      })
      .catch((error) => {
        console.error('SubjectAnalyzer init failed:', error);
        this.status = SUBJECT_ANALYSIS_STATUS.error;
        this.statusMessage =
          'No se pudo iniciar el análisis corporal. Probá nuevamente o desactivá FX de sujeto.';
        return false;
      })
      .finally(() => {
        this._loadPromise = null;
      });
    return this._loadPromise;
  }

  #initWorker() {
    return new Promise((resolve, reject) => {
      this.worker = new Worker(WORKER_URL, { type: 'module' });
      const onMessage = (event) => {
        const message = event.data || {};
        if (message.type === 'ready') {
          this.worker.removeEventListener('message', onMessage);
          resolve(true);
        } else if (message.type === 'error') {
          this.worker.removeEventListener('message', onMessage);
          reject(new Error(message.message || 'worker_init_failed'));
        }
      };
      this.worker.addEventListener('message', onMessage);
      this.worker.addEventListener('message', (event) =>
        this.#handleWorkerMessage(event.data),
      );
      this.worker.postMessage({
        type: 'init',
        maskWidth: Math.round(this.maskWidth * this.runtimeQuality),
      });
    });
  }

  setProfile(profile = {}) {
    if (profile.detectorIntervalMs === 0) {
      this.inferenceIntervalMs = 0;
    } else if (profile.quality === 'low') {
      this.inferenceIntervalMs = 120;
      this.analysisScale = 0.35;
      this.runtimeQuality = 0.55;
    } else if (profile.quality === 'fast') {
      this.inferenceIntervalMs = 80;
      this.analysisScale = 0.45;
      this.runtimeQuality = 0.72;
    } else {
      this.inferenceIntervalMs = 66;
      this.analysisScale = 0.55;
      this.runtimeQuality = 1;
    }
  }

  setRuntimeQuality(factor = 1) {
    this.runtimeQuality = Math.min(1, Math.max(0.35, factor));
    this.inferenceIntervalMs = Math.round(
      Math.max(40, this.inferenceIntervalMs / Math.max(0.5, factor)),
    );
  }

  reset(options = {}) {
    this.motionAnalyzer.reset();
    this.lastFrame = null;
    this.lastMask = null;
    this.previousMask = null;
    this.lastInferenceTs = 0;
    this.lastTimestampMs = 0;
    this._busy = false;
    this._pendingBitmap = null;
    this._pendingMeta = null;
    this._analyzeErrors = 0;
    this.worker?.postMessage({ type: 'reset' });
    if (options.hard) {
      this.worker?.postMessage({ type: 'dispose' });
      this.worker?.terminate?.();
      this.worker = null;
      this.ready = false;
      this.status = SUBJECT_ANALYSIS_STATUS.idle;
      this.cache.invalidate();
    }
  }

  dispose() {
    this.reset({ hard: true });
  }

  async analyze(source, timestampMs, renderProfile = null) {
    if (!source) return this.lastFrame;
    if (renderProfile) this.setProfile(renderProfile);

    const tsSec = (timestampMs || 0) / 1000;
    const cached = this.cache.getAt(tsSec);
    if (cached && this.cache.ready) {
      this.lastFrame = this.#finalizeFrame(cached, cached.mask || this.lastMask);
      this.status = SUBJECT_ANALYSIS_STATUS.ready;
      return this.lastFrame;
    }

    const now = performance.now();
    const shouldInfer =
      this.inferenceIntervalMs === 0 ||
      now - this.lastInferenceTs >= this.inferenceIntervalMs;

    if (!this.ready) {
      void this.ensureReady();
      return this.lastFrame;
    }

    if (!shouldInfer || this._busy) {
      return this.lastFrame;
    }

    try {
      const width = source.videoWidth || source.width || 640;
      const height = source.videoHeight || source.height || 480;
      const bitmap = await createImageBitmap(source, {
        resizeWidth: Math.max(
          1,
          Math.round(width * this.analysisScale * this.runtimeQuality),
        ),
        resizeHeight: Math.max(
          1,
          Math.round(height * this.analysisScale * this.runtimeQuality),
        ),
        resizeQuality: 'low',
      });
      this._pendingBitmap?.close?.();
      this._pendingBitmap = bitmap;
      this._pendingMeta = {
        id: ++this._requestId,
        timestampMs: Math.max(0, Math.round(timestampMs || 0)),
        width: bitmap.width,
        height: bitmap.height,
        sourceWidth: width,
        sourceHeight: height,
      };
      this._dispatchPending();
      this.lastInferenceTs = now;
    } catch (error) {
      console.error('Subject analyze enqueue failed:', error);
    }

    return this.lastFrame;
  }

  _dispatchPending() {
    if (!this.worker || !this._pendingBitmap || this._busy) return;
    this._busy = true;
    this.status = SUBJECT_ANALYSIS_STATUS.analyzing;
    const meta = this._pendingMeta;
    const bitmap = this._pendingBitmap;
    this._pendingBitmap = null;
    this._pendingMeta = null;
    this.worker.postMessage(
      {
        type: 'analyze',
        id: meta.id,
        timestampMs: meta.timestampMs,
        width: meta.width,
        height: meta.height,
        bitmap,
      },
      [bitmap],
    );
  }

  #handleWorkerMessage(message = {}) {
    if (message.type === 'result') {
      this._busy = false;
      this._analyzeErrors = 0;
      if (message.id !== this._requestId) {
        this._dispatchPending();
        return;
      }
      const frame = message.frame;
      let mask = null;
      if (message.maskBuffer && message.maskWidth && message.maskHeight) {
        const raw = new Uint8Array(message.maskBuffer);
        mask = normalizeMaskBuffer(raw, message.maskWidth, message.maskHeight);
        mask = smoothMaskTemporal(mask, this.previousMask, 0.58);
        this.previousMask = mask;
        this.segmentationSource = message.segmentationSource || 'unknown';
        this.useSimplifiedMode = false;
      } else if (frame?.boundingBox) {
        mask = bboxFallbackMask(frame.boundingBox, this.maskWidth);
        this.useSimplifiedMode = true;
        this.status = SUBJECT_ANALYSIS_STATUS.simplified;
      }

      this.lastMask = mask;
      this.lastFrame = frame
        ? this.#finalizeFrame(frame, mask)
        : this.lastFrame;
      this.status = frame
        ? this.useSimplifiedMode
          ? SUBJECT_ANALYSIS_STATUS.simplified
          : SUBJECT_ANALYSIS_STATUS.detected
        : SUBJECT_ANALYSIS_STATUS.lost;

      if (frame) {
        this.cache.addSample({
          timestamp: frame.timestamp,
          landmarks: frame.landmarks,
          center: frame.center,
          boundingBox: frame.boundingBox,
          motionEnergy: frame.motionEnergy,
          movementDirection: frame.movementDirection,
          jointVelocities: frame.jointVelocities,
          wristVelocities: frame.wristVelocities,
          headVelocity: frame.headVelocity,
          confidence: frame.confidence,
          regions: frame.regions,
        });
      }
      this._dispatchPending();
      return;
    }
    if (message.type === 'error') {
      this._busy = false;
      console.error('Subject worker error:', message.message);
      this._analyzeErrors += 1;
      if (
        this._analyzeErrors >= 4 ||
        message.message === 'worker_not_ready' ||
        message.message === 'worker_init_failed'
      ) {
        this.status = SUBJECT_ANALYSIS_STATUS.error;
        this.statusMessage = 'No se pudo analizar el sujeto en este frame.';
      } else if (this.lastFrame) {
        this.status = SUBJECT_ANALYSIS_STATUS.detected;
      } else {
        this.status = SUBJECT_ANALYSIS_STATUS.analyzing;
      }
      this._dispatchPending();
    }
  }

  #finalizeFrame(frame, mask) {
    const regions = buildLocalMotionRegions(frame);
    return {
      ...frame,
      mask: mask || null,
      regions,
      segmentationSource: this.segmentationSource,
      simplified: this.useSimplifiedMode,
    };
  }
}

function bboxFallbackMask(bbox, width = 256) {
  const height = Math.max(1, Math.round(width * 1.2));
  const data = new Uint8Array(width * height);
  const x0 = Math.floor(bbox.minX * width);
  const y0 = Math.floor(bbox.minY * height);
  const x1 = Math.ceil(bbox.maxX * width);
  const y1 = Math.ceil(bbox.maxY * height);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      data[y * width + x] = 255;
    }
  }
  return new SubjectMask(width, height, data);
}

export { SubjectAnalysisCache };
