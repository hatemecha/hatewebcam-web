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
    this._initCleanup = null;
    this._rejectInit = null;
    this._workerListeners = null;
    this._resultWaiters = new Map();
    this._generation = 0;
    this._disposed = false;
    this.assetUrls = options.assetUrls || null;
    this.segmentationSource = 'none';
    this.useSimplifiedMode = false;
    this.baseAnalysisScale = options.analysisScale ?? 0.5;
    this.baseInferenceIntervalMs = options.inferenceIntervalMs ?? 80;
    this.adaptiveQuality = 1;
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
    if (this._disposed) throw new Error('subject_analyzer_disposed');
    if (!this.assetUrls) throw new Error('subject_asset_urls_missing');
    this.status = SUBJECT_ANALYSIS_STATUS.preparing;
    this.statusMessage = '';
    const generation = this._generation;
    const loadPromise = this.#initWorker(generation)
      .then(() => {
        if (generation !== this._generation || this._disposed) {
          throw new Error('subject_analyzer_disposed');
        }
        this.ready = true;
        this.status = SUBJECT_ANALYSIS_STATUS.analyzing;
        return true;
      })
      .catch((error) => {
        if (generation === this._generation && !this._disposed) {
          this.#destroyWorker();
          this.status = SUBJECT_ANALYSIS_STATUS.error;
          this.statusMessage =
            'No se pudo iniciar el análisis corporal. Probá nuevamente o desactivá FX de sujeto.';
        }
        throw error;
      })
      .finally(() => {
        if (this._loadPromise === loadPromise) this._loadPromise = null;
      });
    this._loadPromise = loadPromise;
    return loadPromise;
  }

  #initWorker(generation) {
    return new Promise((resolve, reject) => {
      let worker;
      try {
        // Keep new URL inline so Vite bundles the module Worker in production.
        worker = new Worker(new URL('./subject-worker.mjs', import.meta.url), {
          type: 'module',
        });
      } catch (error) {
        reject(error);
        return;
      }
      this.worker = worker;
      let settled = false;
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
        if (this._initCleanup === cleanup) this._initCleanup = null;
        if (this._rejectInit === fail) this._rejectInit = null;
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (
          generation !== this._generation ||
          this.worker !== worker ||
          this._disposed
        ) {
          reject(new Error('subject_analyzer_disposed'));
          return;
        }
        this.#attachWorkerListeners(worker, generation);
        resolve(true);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const onMessage = (event) => {
        const message = event.data || {};
        if (message.type === 'ready') {
          succeed();
        } else if (message.type === 'error') {
          fail(new Error(message.message || 'worker_init_failed'));
        }
      };
      const onError = (event) => {
        event.preventDefault?.();
        fail(event.error || new Error(event.message || 'subject_worker_error'));
      };
      const onMessageError = () =>
        fail(new Error('subject_worker_message_error'));
      this._initCleanup = cleanup;
      this._rejectInit = fail;
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onMessageError);
      try {
        worker.postMessage({
          type: 'init',
          assets: this.assetUrls,
          maskWidth: Math.round(this.maskWidth * this.runtimeQuality),
        });
      } catch (error) {
        fail(error);
      }
    });
  }

  #attachWorkerListeners(worker, generation) {
    const onMessage = (event) => {
      if (generation !== this._generation || this.worker !== worker) return;
      this.#handleWorkerMessage(event.data);
    };
    const onError = (event) => {
      if (generation !== this._generation || this.worker !== worker) return;
      event.preventDefault?.();
      this.#handleWorkerFailure(
        event.error || new Error(event.message || 'subject_worker_error'),
      );
    };
    const onMessageError = () => {
      if (generation !== this._generation || this.worker !== worker) return;
      this.#handleWorkerFailure(new Error('subject_worker_message_error'));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.addEventListener('messageerror', onMessageError);
    this._workerListeners = { worker, onMessage, onError, onMessageError };
  }

  #handleWorkerFailure(error) {
    console.error('Subject worker error:', error);
    this.#destroyWorker();
    this.ready = false;
    this._busy = false;
    this._pendingBitmap?.close?.();
    this._pendingBitmap = null;
    this._pendingMeta = null;
    this.#rejectResultWaiters(error);
    this.status = SUBJECT_ANALYSIS_STATUS.error;
    this.statusMessage = 'El analizador de sujeto se detuvo. Probá nuevamente.';
  }

  #destroyWorker() {
    this._initCleanup?.();
    const listeners = this._workerListeners;
    if (listeners) {
      listeners.worker.removeEventListener('message', listeners.onMessage);
      listeners.worker.removeEventListener('error', listeners.onError);
      listeners.worker.removeEventListener(
        'messageerror',
        listeners.onMessageError,
      );
      this._workerListeners = null;
    }
    this.worker?.terminate?.();
    this.worker = null;
    this.ready = false;
  }

  setProfile(profile = {}) {
    if (profile.detectorIntervalMs === 0) {
      this.baseInferenceIntervalMs = 0;
    } else if (profile.quality === 'low') {
      this.baseInferenceIntervalMs = 120;
      this.baseAnalysisScale = 0.35;
    } else if (profile.quality === 'fast') {
      this.baseInferenceIntervalMs = 80;
      this.baseAnalysisScale = 0.45;
    } else {
      this.baseInferenceIntervalMs = 66;
      this.baseAnalysisScale = 0.55;
    }
    this.#recomputeRuntimeQuality();
  }

  setRuntimeQuality(factor = 1) {
    this.adaptiveQuality = Math.min(1, Math.max(0.35, factor));
    this.#recomputeRuntimeQuality();
  }

  #recomputeRuntimeQuality() {
    this.runtimeQuality = this.adaptiveQuality;
    this.analysisScale = this.baseAnalysisScale * this.adaptiveQuality;
    if (this.baseInferenceIntervalMs === 0) {
      this.inferenceIntervalMs = 0;
      return;
    }
    this.inferenceIntervalMs = Math.round(
      Math.max(
        40,
        this.baseInferenceIntervalMs / Math.max(0.5, this.adaptiveQuality),
      ),
    );
  }

  reset(options = {}) {
    this.motionAnalyzer.reset();
    this.lastFrame = null;
    this.lastMask = null;
    this.previousMask = null;
    this.lastInferenceTs = 0;
    this.lastTimestampMs = 0;
    this._requestId += 1;
    this._busy = false;
    this._pendingBitmap?.close?.();
    this._pendingBitmap = null;
    this._pendingMeta = null;
    this.#rejectResultWaiters(new Error('subject_analysis_reset'));
    this._analyzeErrors = 0;
    this.worker?.postMessage({ type: 'reset' });
    if (options.hard) {
      this._generation += 1;
      const rejectInit = this._rejectInit;
      this._loadPromise = null;
      rejectInit?.(new Error('subject_analyzer_reset'));
      this.#destroyWorker();
      this.status = SUBJECT_ANALYSIS_STATUS.idle;
      this.statusMessage = '';
      this.cache.invalidate();
    }
  }

  dispose() {
    this.reset({ hard: true });
    this._disposed = true;
  }

  async analyze(source, timestampMs, renderProfile = null) {
    if (!source) return this.lastFrame;
    if (renderProfile) this.setProfile(renderProfile);

    const tsSec = (timestampMs || 0) / 1000;
    const cached = this.cache.getAt(tsSec);
    // Cache holds pose/motion only. Never pair cached landmarks with a stale
    // lastMask from another timestamp; mask-dependent FX keep live segmentation.
    const cachedFrame =
      cached && this.cache.ready
        ? this.#finalizeFrame(cached, cached.mask || null)
        : null;

    const waitForResult = renderProfile?.detectorIntervalMs === 0;
    if (
      waitForResult &&
      this.lastFrame &&
      Math.abs((this.lastFrame.timestamp || 0) - (timestampMs || 0)) < 1
    ) {
      return this.lastFrame;
    }

    const now = performance.now();
    const shouldInfer =
      this.inferenceIntervalMs === 0 ||
      now - this.lastInferenceTs >= this.inferenceIntervalMs;

    if (!this.ready) {
      if (this.status !== SUBJECT_ANALYSIS_STATUS.error) {
        void this.ensureReady().catch(() => {});
      }
      if (cachedFrame) {
        this.lastFrame = cachedFrame;
        this.status = SUBJECT_ANALYSIS_STATUS.ready;
      }
      return this.lastFrame;
    }

    if (!shouldInfer || this._busy) {
      if (cachedFrame) {
        this.lastFrame = cachedFrame;
        this.status = SUBJECT_ANALYSIS_STATUS.ready;
      }
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
      const requestId = ++this._requestId;
      this._pendingMeta = {
        id: requestId,
        timestampMs: Math.max(0, Math.round(timestampMs || 0)),
        width: bitmap.width,
        height: bitmap.height,
        sourceWidth: width,
        sourceHeight: height,
      };
      const resultPromise = waitForResult
        ? this.#waitForResult(requestId)
        : null;
      this._dispatchPending();
      this.lastInferenceTs = now;
      if (resultPromise) return await resultPromise;
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
    try {
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
    } catch (error) {
      bitmap.close?.();
      this._busy = false;
      this.#handleWorkerFailure(error);
    }
  }

  #handleWorkerMessage(message = {}) {
    if (message.type === 'result') {
      this._busy = false;
      this._analyzeErrors = 0;
      if (message.id !== this._requestId) {
        this.#settleResultWaiter(
          message.id,
          new Error('subject_analysis_superseded'),
        );
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

      this.lastMask = frame ? mask : null;
      this.lastFrame = frame ? this.#finalizeFrame(frame, mask) : null;
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
      this.#settleResultWaiter(message.id, null, this.lastFrame);
      this._dispatchPending();
      return;
    }
    if (message.type === 'error') {
      this._busy = false;
      console.error('Subject worker error:', message.message);
      this.#settleResultWaiter(
        message.id,
        new Error(message.message || 'subject_worker_error'),
      );
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

  #waitForResult(requestId) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this._resultWaiters.delete(requestId);
        reject(new Error('subject_analysis_timeout'));
      }, 15_000);
      this._resultWaiters.set(requestId, { resolve, reject, timeoutId });
    });
  }

  #settleResultWaiter(requestId, error = null, value = null) {
    const waiter = this._resultWaiters.get(requestId);
    if (!waiter) return;
    clearTimeout(waiter.timeoutId);
    this._resultWaiters.delete(requestId);
    if (error) waiter.reject(error);
    else waiter.resolve(value);
  }

  #rejectResultWaiters(error) {
    for (const [requestId] of this._resultWaiters) {
      this.#settleResultWaiter(requestId, error);
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
