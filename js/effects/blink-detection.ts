import { perfDev } from '../app/perf-dev.ts';
import type { RenderProfile } from '../app/render-engine.ts';
import type {
  FaceLandmark,
  FaceMeshResults,
} from '../workers/face-mesh-protocol.ts';
import type { FaceDetection } from './face-detection.ts';
import {
  createFaceMesh,
  isFaceMeshLoaded,
  prepareFaceMeshInput,
  type FaceFrameBuffer,
} from './face-mesh-client.ts';

type LandmarkSource = Pick<FaceDetection, 'getPrimaryFaceLandmarks'>;
type BlinkCallback = (eye: 'left' | 'right' | 'both' | 'none') => void;

/**
 * BlinkDetection — MediaPipe Face Mesh blink detection
 * Port of the Python BlinkDetection effect
 */
export class BlinkDetection {
  // MediaPipe Face Mesh
  faceMesh: ReturnType<typeof createFaceMesh> | null = null;
  ready = false;
  initError: unknown = null;
  initPromise: Promise<void> | null = null;
  landmarkSource: LandmarkSource | null;

  // EAR landmark indices (same as Python version)
  LEFT_EYE_EAR = [33, 133, 159, 145];
  RIGHT_EYE_EAR = [362, 263, 386, 374];

  // State
  eyeArThreshold = 0.22;
  leftBlinkDetected = false;
  rightBlinkDetected = false;
  showDebug = true;
  feedbackColor = '#ff2222';
  processIntervalMs = 30;
  minClosedFrames = 1;
  _earSmoothing = 0.35;

  // Callback
  blinkCallback: BlinkCallback | null = null;

  // Latest landmarks for overlay drawing
  _latestLandmarks: FaceLandmark[] | null = null;
  _faceMeshProcessing = false;
  _lastProcessTs = 0;
  _leftEarSmooth = 1;
  _rightEarSmooth = 1;
  _leftClosedFrames = 0;
  _rightClosedFrames = 0;
  _lastBlinkTs = 0;
  _analysisFrame: FaceFrameBuffer = { canvas: null, ctx: null };

  constructor(options: { landmarkSource?: LandmarkSource | null } = {}) {
    this.landmarkSource = options.landmarkSource || null;

    if (this.landmarkSource) {
      this.ready = true;
    } else {
      this._initMediaPipe();
    }
  }

  getName() {
    return 'Detección de Pestañeos';
  }

  dispose() {
    this._disposeOwnFaceMesh();
    this.landmarkSource = null;
    this.blinkCallback = null;
    this.ready = false;
    this.reset();
  }

  getDetectionSummary(): {
    status: 'error' | 'detected' | 'active';
    detected: boolean;
  } {
    if (this.initError) return { status: 'error', detected: false };
    const detected = performance.now() - this._lastBlinkTs < 900;
    return { status: detected ? 'detected' : 'active', detected };
  }

  _initMediaPipe() {
    try {
      if (!isFaceMeshLoaded()) {
        console.warn(
          'MediaPipe FaceMesh not loaded. Blink detection disabled.',
        );
        return;
      }

      const mesh = createFaceMesh();
      this.faceMesh = mesh;

      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      mesh.onResults((results) => {
        if (this.faceMesh === mesh) this._onFaceMeshResults(results);
      });

      // Send a dummy frame to initialize
      this.initPromise = mesh
        .initialize()
        .then(() => {
          if (this.faceMesh !== mesh) return;
          this.ready = true;
          this.initError = null;
        })
        .catch((e) => {
          if (this.faceMesh !== mesh) return;
          this.initError = e;
          console.error('FaceMesh init error:', e);
        });
    } catch (e) {
      this.initError = e;
      console.error('Cannot initialize FaceMesh:', e);
    }
  }

  _onFaceMeshResults(results: FaceMeshResults) {
    this._faceMeshProcessing = false;

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      this._latestLandmarks = landmarks;

      // Calculate EAR
      const leftEar = this._calculateEar(this.LEFT_EYE_EAR, landmarks);
      const rightEar = this._calculateEar(this.RIGHT_EYE_EAR, landmarks);

      // Smooth EAR and require consecutive frames to reduce false positives.
      const keep = this._earSmoothing;
      const take = 1 - keep;
      this._leftEarSmooth = this._leftEarSmooth * keep + leftEar * take;
      this._rightEarSmooth = this._rightEarSmooth * keep + rightEar * take;

      this._leftClosedFrames =
        this._leftEarSmooth < this.eyeArThreshold
          ? this._leftClosedFrames + 1
          : 0;
      this._rightClosedFrames =
        this._rightEarSmooth < this.eyeArThreshold
          ? this._rightClosedFrames + 1
          : 0;

      this.leftBlinkDetected = this._leftClosedFrames >= this.minClosedFrames;
      this.rightBlinkDetected = this._rightClosedFrames >= this.minClosedFrames;
      if (this.leftBlinkDetected || this.rightBlinkDetected) {
        this._lastBlinkTs = performance.now();
      }

      // Fire callback
      if (this.blinkCallback) {
        if (this.leftBlinkDetected && this.rightBlinkDetected) {
          this.blinkCallback('both');
        } else if (this.leftBlinkDetected) {
          this.blinkCallback('left');
        } else if (this.rightBlinkDetected) {
          this.blinkCallback('right');
        } else {
          this.blinkCallback('none');
        }
      }
    } else {
      this._latestLandmarks = null;
      this.leftBlinkDetected = false;
      this.rightBlinkDetected = false;
      this._leftClosedFrames = 0;
      this._rightClosedFrames = 0;
      if (this.blinkCallback) this.blinkCallback('none');
    }
  }

  _calculateEar(
    eyeIndices: readonly number[],
    landmarks: readonly FaceLandmark[],
  ) {
    const points = eyeIndices.map((i) => landmarks[i]);
    if (points.length < 4 || points.some((point) => !point)) return 1.0;

    // Vertical distance
    const A = Math.sqrt(
      Math.pow(points[2].x - points[3].x, 2) +
        Math.pow(points[2].y - points[3].y, 2),
    );
    // Horizontal distance
    const B = Math.sqrt(
      Math.pow(points[0].x - points[1].x, 2) +
        Math.pow(points[0].y - points[1].y, 2),
    );

    if (B === 0) return 0;
    return A / B;
  }

  _disposeOwnFaceMesh() {
    if (!this.faceMesh) return;
    const mesh = this.faceMesh;
    this.faceMesh = null;
    this._faceMeshProcessing = false;
    try {
      if (typeof mesh.close === 'function') {
        const closeResult = mesh.close();
        if (closeResult && typeof closeResult.catch === 'function') {
          closeResult.catch((e) => {
            console.warn(
              'BlinkDetection: could not close own FaceMesh instance.',
              e,
            );
          });
        }
      }
    } catch (e) {
      console.warn('BlinkDetection: could not close own FaceMesh instance.', e);
    }
  }

  setLandmarkSource(source: LandmarkSource | null) {
    this.landmarkSource = source || null;
    if (this.landmarkSource) {
      this._disposeOwnFaceMesh();
      this.ready = true;
      return;
    }

    if (!this.faceMesh && isFaceMeshLoaded()) {
      this.ready = false;
      this._initMediaPipe();
    }
  }

  _processExternalLandmarks(
    renderProfile: Partial<RenderProfile> | null = null,
  ) {
    const profileInterval = Math.max(
      0,
      Math.round(
        renderProfile?.detectorIntervalMs ??
          renderProfile?.detectorInterval ??
          this.processIntervalMs,
      ),
    );
    // Face Mesh can take longer than one preview tick, especially while
    // recording. Keep a generous landmark window so blink EAR does not reset
    // every time the shared detector is still in flight.
    const maxAgeMs = Math.max(
      this.processIntervalMs * 8,
      profileInterval * 6,
      500,
    );
    const landmarks =
      this.landmarkSource &&
      typeof this.landmarkSource.getPrimaryFaceLandmarks === 'function'
        ? this.landmarkSource.getPrimaryFaceLandmarks(maxAgeMs)
        : null;
    if (!landmarks) {
      // Do not clear closed-frame counters on transient gaps.
      return;
    }
    this._onFaceMeshResults({
      multiFaceLandmarks: [landmarks],
    });
  }

  /**
   * Process frame — sends to MediaPipe for async processing
   * Drawing is done from cached results
   */
  processFrame(
    _ctx: CanvasRenderingContext2D,
    _canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    renderProfile: Partial<RenderProfile> | null = null,
  ) {
    const processIntervalMs = Math.max(
      0,
      Math.round(
        renderProfile?.detectorIntervalMs ??
          renderProfile?.detectorInterval ??
          this.processIntervalMs,
      ),
    );
    if (this.landmarkSource) {
      const now = performance.now();
      if (
        processIntervalMs !== 0 &&
        now - this._lastProcessTs < processIntervalMs
      )
        return;
      this._lastProcessTs = now;
      this._processExternalLandmarks(renderProfile);
      return;
    }

    // Send frame to MediaPipe (throttled)
    if (
      this.ready &&
      this.faceMesh &&
      !this._faceMeshProcessing &&
      video &&
      video.readyState >= 2
    ) {
      const now = performance.now();
      if (
        processIntervalMs !== 0 &&
        now - this._lastProcessTs < processIntervalMs
      )
        return;
      this._lastProcessTs = now;
      this._faceMeshProcessing = true;
      // Only reachable when there is no shared `landmarkSource` (Face
      // detector off) - counts here should stay at 0 whenever Face + Blink
      // are both active, confirming the shared-inference path is used.
      perfDev.count('blinkOwnFaceMeshInferences');
      const maxEdge = renderProfile?.faceAnalysisMaxEdge || 640;
      const analysisFrame = prepareFaceMeshInput(video, this._analysisFrame, {
        maxEdge,
      });
      this.faceMesh.send({ image: analysisFrame || video }).catch(() => {
        this._faceMeshProcessing = false;
      });
    }
  }

  setBlinkCallback(callback: BlinkCallback | null) {
    this.blinkCallback = callback;
  }

  setFeedbackColor(hexColor: string) {
    this.feedbackColor = hexColor;
  }

  getConfig() {
    return {
      eyeArThreshold: this.eyeArThreshold,
      showDebug: this.showDebug,
      processIntervalMs: this.processIntervalMs,
      minClosedFrames: this.minClosedFrames,
      earSmoothing: this._earSmoothing,
    };
  }

  setConfig(config: Partial<BlinkDetectionConfig>) {
    if (config.eyeArThreshold != null)
      this.eyeArThreshold = config.eyeArThreshold;
    if (config.showDebug != null) this.showDebug = config.showDebug;
    if (config.processIntervalMs != null) {
      this.processIntervalMs = Math.max(
        16,
        Math.min(120, Math.round(config.processIntervalMs)),
      );
    }
    if (config.minClosedFrames != null) {
      this.minClosedFrames = Math.max(
        1,
        Math.min(5, Math.round(config.minClosedFrames)),
      );
    }
    if (config.earSmoothing != null) {
      this._earSmoothing = Math.max(
        0,
        Math.min(0.95, Number(config.earSmoothing)),
      );
    }
  }

  reset() {
    this.leftBlinkDetected = false;
    this.rightBlinkDetected = false;
    this._latestLandmarks = null;
    this._leftClosedFrames = 0;
    this._rightClosedFrames = 0;
    this._leftEarSmooth = 1;
    this._rightEarSmooth = 1;
    this._lastBlinkTs = 0;
  }
}

export type BlinkDetectionConfig = ReturnType<BlinkDetection['getConfig']>;
