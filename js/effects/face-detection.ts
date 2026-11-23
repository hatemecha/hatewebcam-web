import { perfDev } from '../app/perf-dev.ts';
import type { RenderProfile } from '../app/render-engine.ts';
import {
  faceFlagsFromVisualMode,
  faceVisualModeFromFlags,
} from '../app/webcam-settings.ts';
import type {
  FaceLandmark,
  FaceMeshResults,
} from '../workers/face-mesh-protocol.ts';
import {
  createFaceMesh,
  isFaceMeshLoaded,
  prepareFaceMeshInput,
  type FaceFrameBuffer,
} from './face-mesh-client.ts';

type FaceMeasurement = ReturnType<FaceDetection['_measureFace']>;
type FaceRect = NonNullable<ReturnType<FaceDetection['_getFaceRect']>>;

interface TrackedFace extends FaceMeasurement {
  id: number;
  lastSeenTs: number;
  missedFrames: number;
}

type DetectorRenderProfile = Partial<RenderProfile> & { overlayOnly?: boolean };

/**
 * FaceDetection — MediaPipe Face Mesh-based face detection
 * Draws bounding boxes around detected faces, accounting for canvas transforms
 */
export class FaceDetection {
  faceMesh: ReturnType<typeof createFaceMesh> | null = null;
  ready = false;
  initError: unknown = null;
  _processing = false;
  _lastProcessTs = 0;
  _inferenceStartTs = 0;

  // Visualization
  boxColor = '#ff2222';
  boxThickness = 2;
  labelText = 'CARA';
  labelSize = 12;
  showLandmarks = false;
  maxFaces = 2;
  processIntervalMs = 30;
  boxSmoothing = 0.5;
  showBox = true;
  showBlur = false;
  pixelationCellSize = 14;
  censorPaddingPercent = 18;
  detectionHoldMs = 280;
  matchDistanceMultiplier = 1.9;
  sameFaceOverlapRatio = 0.62;
  sameFaceCenterRatio = 0.38;

  // Transform awareness — set by app.js
  flipH = false;
  flipV = false;
  rotationDeg = 0;

  // Latest results
  _faces: TrackedFace[] = [];
  _nextFaceId = 1;
  _pixelCanvas = document.createElement('canvas');
  _pixelCtx = this._pixelCanvas.getContext('2d', {
    willReadFrequently: true,
  });
  _analysisFrame: FaceFrameBuffer = { canvas: null, ctx: null };

  constructor() {
    this._initMediaPipe();
  }

  getName() {
    return 'Detector de Caras';
  }

  dispose() {
    const mesh = this.faceMesh;
    this.faceMesh = null;
    this.ready = false;
    this._processing = false;
    this._faces = [];
    if (!mesh || typeof mesh.close !== 'function') return;
    try {
      const closeResult = mesh.close();
      closeResult?.catch?.((error) => {
        console.warn('FaceDetection: no se pudo cerrar FaceMesh.', error);
      });
    } catch (error) {
      console.warn('FaceDetection: no se pudo cerrar FaceMesh.', error);
    }
  }

  getDetectionSummary() {
    if (this.initError) return { status: 'error', count: 0 };
    const now = performance.now();
    const count = this._faces.filter(
      (face) => now - (face.lastSeenTs || 0) <= this.detectionHoldMs,
    ).length;
    return { status: count > 0 ? 'detected' : 'searching', count };
  }

  getPrimaryFaceLandmarks(maxAgeMs = this.detectionHoldMs * 2) {
    const now = performance.now();
    const face = this._faces.find((candidate) => {
      if (!candidate || !candidate.landmarks) return false;
      return now - (candidate.lastSeenTs || 0) <= maxAgeMs;
    });
    return face ? face.landmarks : null;
  }

  _initMediaPipe() {
    try {
      if (!isFaceMeshLoaded()) {
        console.warn('MediaPipe FaceMesh not loaded.');
        return;
      }

      const mesh = createFaceMesh();
      this.faceMesh = mesh;

      this.faceMesh.setOptions({
        maxNumFaces: this.maxFaces,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      mesh.onResults((results) => {
        if (this.faceMesh === mesh) this._onResults(results);
      });

      mesh
        .initialize()
        .then(() => {
          if (this.faceMesh !== mesh) return;
          this.ready = true;
          this.initError = null;
        })
        .catch((e) => {
          if (this.faceMesh !== mesh) return;
          this.initError = e;
          console.error('FaceDetection init error:', e);
        });
    } catch (e) {
      this.initError = e;
      console.error('FaceDetection: cannot init', e);
    }
  }

  _onResults(results: FaceMeshResults) {
    this._processing = false;
    if (this._inferenceStartTs) {
      perfDev.record(
        'faceInferenceLatencyMs',
        performance.now() - this._inferenceStartTs,
      );
      this._inferenceStartTs = 0;
    }
    const now = performance.now();
    const previousFaces = this._faces.slice();
    const reusedFaceIds = new Set<number>();
    const nextFaces: TrackedFace[] = [];

    if (results.multiFaceLandmarks) {
      for (const landmarks of results.multiFaceLandmarks) {
        const detectedFace = this._measureFace(landmarks);
        const prevFace = this._findMatchingFace(
          detectedFace,
          previousFaces,
          reusedFaceIds,
        );
        if (prevFace) reusedFaceIds.add(prevFace.id);
        nextFaces.push(this._stabilizeFace(detectedFace, prevFace, now));
      }
    }

    for (const prevFace of previousFaces) {
      if (reusedFaceIds.has(prevFace.id)) continue;
      if (now - (prevFace.lastSeenTs || 0) > this.detectionHoldMs) continue;
      nextFaces.push({
        ...prevFace,
        lastSeenTs: prevFace.lastSeenTs || now,
        missedFrames: (prevFace.missedFrames || 0) + 1,
      });
    }

    const dedupedFaces = this._dedupeFaces(nextFaces);

    dedupedFaces.sort((a, b) => {
      const aMissed = a.missedFrames || 0;
      const bMissed = b.missedFrames || 0;
      if (aMissed !== bMissed) return aMissed - bMissed;
      return (a.centerX || 0) - (b.centerX || 0);
    });

    this._faces = dedupedFaces.slice(0, this.maxFaces);
  }

  /**
   * Transform normalized coordinates accounting for flips + rotation.
   */
  _mapPoint(normX: number, normY: number) {
    const x = this.flipH ? 1 - normX : normX;
    const y = this.flipV ? 1 - normY : normY;
    const rot = ((this.rotationDeg % 360) + 360) % 360;

    if (rot === 90) {
      return { x: 1 - y, y: x };
    }
    if (rot === 180) {
      return { x: 1 - x, y: 1 - y };
    }
    if (rot === 270) {
      return { x: y, y: 1 - x };
    }
    return { x, y };
  }

  _applyVisualMode(value: unknown) {
    const { showBox, showBlur } = faceFlagsFromVisualMode(value);
    this.showBox = showBox;
    this.showBlur = showBlur;
    this._ensureVisualEnabled();
  }

  _getVisualMode() {
    return faceVisualModeFromFlags(this.showBox, this.showBlur);
  }

  _ensureVisualEnabled() {
    if (!this.showBox && !this.showBlur) {
      this.showBox = true;
    }
  }

  _isBoxVisualMode() {
    return this.showBox;
  }

  _isPixelVisualMode() {
    return this.showBlur;
  }

  _measureFace(landmarks: FaceLandmark[]) {
    let minX = 1,
      maxX = 0,
      minY = 1,
      maxY = 0;
    for (const lm of landmarks) {
      if (lm.x < minX) minX = lm.x;
      if (lm.x > maxX) maxX = lm.x;
      if (lm.y < minY) minY = lm.y;
      if (lm.y > maxY) maxY = lm.y;
    }

    const width = Math.max(0.0001, maxX - minX);
    const height = Math.max(0.0001, maxY - minY);
    return {
      minX,
      maxX,
      minY,
      maxY,
      width,
      height,
      centerX: minX + width / 2,
      centerY: minY + height / 2,
      landmarks,
    };
  }

  _findMatchingFace(
    face: FaceMeasurement,
    previousFaces: TrackedFace[],
    reusedFaceIds: Set<number>,
  ) {
    let bestFace: TrackedFace | null = null;
    let bestDistance = Infinity;

    for (const prevFace of previousFaces) {
      if (!prevFace || reusedFaceIds.has(prevFace.id)) continue;

      const dx = (face.centerX || 0) - (prevFace.centerX || 0);
      const dy = (face.centerY || 0) - (prevFace.centerY || 0);
      const distance = Math.hypot(dx, dy);
      const faceSize = Math.max(
        face.width || 0,
        face.height || 0,
        prevFace.width || 0,
        prevFace.height || 0,
      );
      const maxDistance = Math.max(
        0.06,
        faceSize * this.matchDistanceMultiplier,
      );
      if (distance > maxDistance || distance >= bestDistance) continue;

      bestDistance = distance;
      bestFace = prevFace;
    }

    return bestFace;
  }

  _stabilizeFace(
    face: FaceMeasurement,
    prevFace: TrackedFace | null,
    now: number,
  ): TrackedFace {
    let stabilized = { ...face };

    if (prevFace) {
      const keep = this.boxSmoothing;
      const take = 1 - keep;
      stabilized = {
        ...face,
        minX: prevFace.minX * keep + face.minX * take,
        maxX: prevFace.maxX * keep + face.maxX * take,
        minY: prevFace.minY * keep + face.minY * take,
        maxY: prevFace.maxY * keep + face.maxY * take,
      };
      stabilized.width = Math.max(0.0001, stabilized.maxX - stabilized.minX);
      stabilized.height = Math.max(0.0001, stabilized.maxY - stabilized.minY);
      stabilized.centerX = stabilized.minX + stabilized.width / 2;
      stabilized.centerY = stabilized.minY + stabilized.height / 2;
    }

    return {
      ...stabilized,
      id: prevFace ? prevFace.id : this._nextFaceId++,
      lastSeenTs: now,
      missedFrames: 0,
    };
  }

  _getFaceArea(face: FaceMeasurement) {
    return Math.max(0, face.width || 0) * Math.max(0, face.height || 0);
  }

  _getFaceIntersection(faceA: FaceMeasurement, faceB: FaceMeasurement) {
    const minX = Math.max(faceA.minX || 0, faceB.minX || 0);
    const minY = Math.max(faceA.minY || 0, faceB.minY || 0);
    const maxX = Math.min(faceA.maxX || 0, faceB.maxX || 0);
    const maxY = Math.min(faceA.maxY || 0, faceB.maxY || 0);
    const width = Math.max(0, maxX - minX);
    const height = Math.max(0, maxY - minY);
    return width * height;
  }

  _isSameFaceCandidate(faceA: FaceMeasurement, faceB: FaceMeasurement) {
    const areaA = this._getFaceArea(faceA);
    const areaB = this._getFaceArea(faceB);
    if (areaA <= 0 || areaB <= 0) return false;

    const intersection = this._getFaceIntersection(faceA, faceB);
    if (intersection <= 0) return false;

    const smallerArea = Math.max(0.0001, Math.min(areaA, areaB));
    const overlapRatio = intersection / smallerArea;

    const dx = (faceA.centerX || 0) - (faceB.centerX || 0);
    const dy = (faceA.centerY || 0) - (faceB.centerY || 0);
    const centerDistance = Math.hypot(dx, dy);
    const maxSize = Math.max(
      faceA.width || 0,
      faceA.height || 0,
      faceB.width || 0,
      faceB.height || 0,
      0.0001,
    );
    const normalizedCenterDistance = centerDistance / maxSize;

    return (
      overlapRatio >= this.sameFaceOverlapRatio &&
      normalizedCenterDistance <= this.sameFaceCenterRatio
    );
  }

  _pickPreferredFace(faceA: TrackedFace, faceB: TrackedFace) {
    const missedA = faceA.missedFrames || 0;
    const missedB = faceB.missedFrames || 0;
    if (missedA !== missedB) return missedA < missedB ? faceA : faceB;

    const seenA = faceA.lastSeenTs || 0;
    const seenB = faceB.lastSeenTs || 0;
    if (seenA !== seenB) return seenA > seenB ? faceA : faceB;

    const areaA = this._getFaceArea(faceA);
    const areaB = this._getFaceArea(faceB);
    if (areaA !== areaB) return areaA >= areaB ? faceA : faceB;

    return (faceA.id || 0) <= (faceB.id || 0) ? faceA : faceB;
  }

  _dedupeFaces(faces: TrackedFace[]) {
    if (!Array.isArray(faces) || faces.length <= 1)
      return Array.isArray(faces) ? faces.slice() : [];

    const orderedFaces = faces.slice().sort((a, b) => {
      const preferred = this._pickPreferredFace(a, b);
      return preferred === a ? -1 : 1;
    });
    const uniqueFaces: TrackedFace[] = [];

    for (const face of orderedFaces) {
      const duplicateIndex = uniqueFaces.findIndex((candidate) =>
        this._isSameFaceCandidate(face, candidate),
      );
      if (duplicateIndex === -1) {
        uniqueFaces.push(face);
        continue;
      }

      uniqueFaces[duplicateIndex] = this._pickPreferredFace(
        uniqueFaces[duplicateIndex],
        face,
      );
    }

    return uniqueFaces;
  }

  _getFaceRect(
    face: FaceMeasurement,
    canvasWidth: number,
    canvasHeight: number,
    paddingPercent = this.censorPaddingPercent,
  ) {
    const p1 = this._mapPoint(face.minX, face.minY);
    const p2 = this._mapPoint(face.maxX, face.maxY);
    const x1 = p1.x * canvasWidth;
    const y1 = p1.y * canvasHeight;
    const x2 = p2.x * canvasWidth;
    const y2 = p2.y * canvasHeight;

    const fx = Math.max(0, Math.min(x1, x2));
    const fy = Math.max(0, Math.min(y1, y2));
    const fw = Math.abs(x2 - x1);
    const fh = Math.abs(y2 - y1);
    if (fw < 2 || fh < 2) return null;

    const padRatio = Math.max(0, paddingPercent) / 100;
    const padX = Math.round(fw * padRatio);
    const padY = Math.round(fh * padRatio * 1.12);
    const px = Math.max(0, fx - padX);
    const py = Math.max(0, fy - padY);
    const pw = Math.min(canvasWidth - px, fw + padX * 2);
    const ph = Math.min(canvasHeight - py, fh + padY * 2);

    if (pw < 2 || ph < 2) return null;
    return { x: px, y: py, width: pw, height: ph };
  }

  _pixelateRegion(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    rect: FaceRect | null,
  ) {
    if (!this._pixelCtx || !rect) return;

    const { x, y, width, height } = rect;
    const cellSize = Math.max(4, Math.round(this.pixelationCellSize || 14));
    const sampleWidth = Math.max(1, Math.round(width / cellSize));
    const sampleHeight = Math.max(1, Math.round(height / cellSize));

    if (
      this._pixelCanvas.width !== sampleWidth ||
      this._pixelCanvas.height !== sampleHeight
    ) {
      this._pixelCanvas.width = sampleWidth;
      this._pixelCanvas.height = sampleHeight;
    } else {
      this._pixelCtx.clearRect(0, 0, sampleWidth, sampleHeight);
    }

    this._pixelCtx.imageSmoothingEnabled = true;
    this._pixelCtx.drawImage(
      canvas,
      x,
      y,
      width,
      height,
      0,
      0,
      sampleWidth,
      sampleHeight,
    );

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this._pixelCanvas,
      0,
      0,
      sampleWidth,
      sampleHeight,
      x,
      y,
      width,
      height,
    );
    ctx.restore();
  }

  _drawFaceBox(ctx: CanvasRenderingContext2D, rect: FaceRect) {
    const { x, y, width, height } = rect;

    ctx.strokeStyle = this.boxColor;
    ctx.lineWidth = this.boxThickness;
    ctx.strokeRect(x, y, width, height);

    const label = this._normalizeLabel(this.labelText);
    const labelSize = this._normalizeLabelSize(this.labelSize);
    const padX = Math.max(4, Math.round(labelSize * 0.42));
    const labelHeight = Math.max(14, Math.round(labelSize * 1.45));
    ctx.font = `600 ${labelSize}px "Cascadia Mono", "Segoe UI Mono", "SFMono-Regular", Menlo, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    const tm = ctx.measureText(label);
    const labelW = tm.width + padX * 2;
    const labelY = Math.max(0, y - labelHeight - 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(x, labelY, labelW, labelHeight);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + padX, labelY + labelHeight / 2);
    ctx.textBaseline = 'alphabetic';
  }

  processFrame(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    renderProfile: DetectorRenderProfile | null = null,
  ) {
    if (
      this.ready &&
      this.faceMesh &&
      !this._processing &&
      video &&
      video.readyState >= 2
    ) {
      const now = performance.now();
      const processIntervalMs = Math.max(
        0,
        Math.round(
          renderProfile?.detectorIntervalMs ??
            renderProfile?.detectorInterval ??
            this.processIntervalMs,
        ),
      );
      if (
        processIntervalMs === 0 ||
        now - this._lastProcessTs >= processIntervalMs
      ) {
        this._lastProcessTs = now;
        this._processing = true;
        this._inferenceStartTs = perfDev.mark();
        perfDev.count('faceInferences');
        const maxEdge = renderProfile?.faceAnalysisMaxEdge || 640;
        const analysisFrame = prepareFaceMeshInput(video, this._analysisFrame, {
          maxEdge,
        });
        this.faceMesh.send({ image: analysisFrame || video }).catch(() => {
          this._processing = false;
        });
      }
    }

    const w = canvas.width;
    const h = canvas.height;
    const rectPadding = this._isPixelVisualMode()
      ? this.censorPaddingPercent
      : 8;

    for (const face of this._faces) {
      const rect = this._getFaceRect(face, w, h, rectPadding);
      if (!rect) continue;

      if (this._isPixelVisualMode() && !renderProfile?.overlayOnly) {
        this._pixelateRegion(ctx, canvas, rect);
      }

      if (this._isBoxVisualMode() || renderProfile?.overlayOnly) {
        this._drawFaceBox(ctx, rect);
      }

      // Optional landmarks
      if (this.showLandmarks && face.landmarks) {
        ctx.fillStyle = 'rgba(229,57,53,0.4)';
        for (const lm of face.landmarks) {
          const p = this._mapPoint(lm.x, lm.y);
          const lx = p.x * w;
          const ly = p.y * h;
          ctx.fillRect(Math.round(lx), Math.round(ly), 1, 1);
        }
      }
    }
  }

  getConfig() {
    return {
      boxColor: this.boxColor,
      boxThickness: this.boxThickness,
      labelText: this.labelText,
      labelSize: this.labelSize,
      showLandmarks: this.showLandmarks,
      maxFaces: this.maxFaces,
      processIntervalMs: this.processIntervalMs,
      boxSmoothing: this.boxSmoothing,
      rotationDeg: this.rotationDeg,
      showBox: this.showBox,
      showBlur: this.showBlur,
      visualMode: this._getVisualMode(),
      pixelationCellSize: this.pixelationCellSize,
      censorPaddingPercent: this.censorPaddingPercent,
      detectionHoldMs: this.detectionHoldMs,
      sameFaceOverlapRatio: this.sameFaceOverlapRatio,
      sameFaceCenterRatio: this.sameFaceCenterRatio,
    };
  }

  setConfig(config: Partial<FaceDetectionConfig>) {
    if (config.boxColor) this.boxColor = config.boxColor;
    if (config.boxThickness != null) this.boxThickness = config.boxThickness;
    if (config.labelText != null)
      this.labelText = this._normalizeLabel(config.labelText);
    if (config.labelSize != null)
      this.labelSize = this._normalizeLabelSize(config.labelSize);
    if (config.showLandmarks != null) this.showLandmarks = config.showLandmarks;
    if (config.maxFaces != null) {
      this.maxFaces = config.maxFaces;
      if (this.faceMesh)
        this.faceMesh.setOptions({ maxNumFaces: this.maxFaces });
    }
    if (config.processIntervalMs != null) {
      this.processIntervalMs = Math.max(
        16,
        Math.min(120, Math.round(config.processIntervalMs)),
      );
    }
    if (config.boxSmoothing != null) {
      this.boxSmoothing = Math.max(
        0,
        Math.min(0.95, Number(config.boxSmoothing)),
      );
    }
    if (config.rotationDeg != null) this.rotationDeg = config.rotationDeg;
    if (config.showBox != null) this.showBox = !!config.showBox;
    if (config.showBlur != null) this.showBlur = !!config.showBlur;
    if (config.visualMode != null) this._applyVisualMode(config.visualMode);
    this._ensureVisualEnabled();
    if (config.pixelationCellSize != null) {
      this.pixelationCellSize = Math.max(
        4,
        Math.min(48, Math.round(config.pixelationCellSize)),
      );
    }
    if (config.censorPaddingPercent != null) {
      this.censorPaddingPercent = Math.max(
        0,
        Math.min(48, Math.round(config.censorPaddingPercent)),
      );
    }
    if (config.detectionHoldMs != null) {
      this.detectionHoldMs = Math.max(
        80,
        Math.min(600, Math.round(config.detectionHoldMs)),
      );
    }
    if (config.sameFaceOverlapRatio != null) {
      this.sameFaceOverlapRatio = Math.max(
        0.2,
        Math.min(0.95, Number(config.sameFaceOverlapRatio)),
      );
    }
    if (config.sameFaceCenterRatio != null) {
      this.sameFaceCenterRatio = Math.max(
        0.08,
        Math.min(0.9, Number(config.sameFaceCenterRatio)),
      );
    }
  }

  _normalizeLabel(value: unknown) {
    const label = String(value || '').trim();
    if (!label) return 'CARA';
    return label.slice(0, 28);
  }

  _normalizeLabelSize(value: unknown) {
    const size = Math.round(Number(value) || 12);
    return Math.max(8, Math.min(32, size));
  }

  reset() {
    this._faces = [];
  }
}

export type FaceDetectionConfig = ReturnType<FaceDetection['getConfig']>;
