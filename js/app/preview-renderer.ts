import { getVideoPlayableEnd } from './video-editor/playable-end.ts';
import { updatePreviewMetrics } from '../../src/lib/preview/metrics-state.ts';
import { WebGLFilterRenderer } from './webgl-filter-renderer.ts';
import { getVideoDrawMetrics as calculateVideoDrawMetrics } from '../subject/subject-frame-map.ts';
import { perfDev } from './perf-dev.ts';

import type { PreviewQualityPreset } from '../preview-metrics.ts';
import type { VideoEditorSession } from './video-editor/session.ts';
import type { Detectors } from './detectors.ts';
import type { WebcamCamera } from './webcam-camera.ts';
import type { WebcamCapture } from './webcam-capture.ts';
import type { BufferMode, RenderEngine } from './render-engine.ts';
import {
  PREVIEW_MIN_HEIGHT,
  PREVIEW_MIN_WIDTH,
  type ImageSettings,
} from './constants.ts';

interface PreviewRenderHost {
  videoEl: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  previewWrapper: HTMLElement | null;
  imageSettings: ImageSettings;
  sourceMode: 'camera' | 'video';
  rotation: number;
  flipV: boolean;
  isRunning: boolean;
  isPageVisible: boolean;
  renderEngine: RenderEngine;
  capture: Pick<
    WebcamCapture,
    'recording' | 'renderSourceFrameBuffer' | 'blitProcessedFrameToPreview'
  >;
  camera: Pick<WebcamCamera, 'handlePreviewFpsSample'>;
  editor: Pick<
    VideoEditorSession,
    'timeline' | 'exportSession' | 'transport' | 'visualFx' | 'timelineEffects'
  > | null;
  detectors: Pick<
    Detectors,
    'manager' | 'blob' | 'face' | 'blink' | 'updateInfo'
  >;
  getEffectiveFlipH(): boolean;
  isMobileViewport(): boolean;
  getCurrentPreviewQualityPreset(): PreviewQualityPreset;
  updateVisualFxLab?(): void;
}

interface WebGLDrawMetrics {
  effectiveRotation: number;
  drawWidth: number;
  drawHeight: number;
  sx: number;
  sy: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export class PreviewRenderer {
  private animFrameId: number | null = null;
  private animFrameType: '' | 'video' | 'animation' = '';
  private frameCount = 0;
  private lastFpsTime = performance.now();
  private previewScale = 1;
  private webglFilterFailed = false;
  private webglFilterRenderer: WebGLFilterRenderer | null = null;
  private _webglAppliedAdvancedLook = false;
  private effectsOnlyAnalysisCanvas: HTMLCanvasElement | null = null;
  private effectsOnlyAnalysisCtx: CanvasRenderingContext2D | null = null;
  private readonly nextFrame = () => this.renderLoop();

  constructor(private readonly host: PreviewRenderHost) {}

  get hasPendingFrame(): boolean {
    return this.animFrameId !== null;
  }

  resetCadence(): void {
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
  }

  dispose(): void {
    this.cancelRenderLoop();
    this.webglFilterRenderer?.dispose();
    this.webglFilterRenderer = null;
    this.effectsOnlyAnalysisCanvas = null;
    this.effectsOnlyAnalysisCtx = null;
  }

  getSourceFrameDimensions() {
    return {
      sourceWidth: Math.max(
        1,
        this.host.videoEl.videoWidth || this.host.canvas.width || 1,
      ),
      sourceHeight: Math.max(
        1,
        this.host.videoEl.videoHeight || this.host.canvas.height || 1,
      ),
    };
  }

  normalizeRotationDegrees(deg: number) {
    const normalized = (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
    return normalized;
  }

  getMobileAutoRotationDegrees(sourceWidth: number, sourceHeight: number) {
    const shouldAutoRotate =
      this.host.isMobileViewport() && sourceWidth > sourceHeight;
    return shouldAutoRotate ? 90 : 0;
  }

  getEffectiveRotationDegrees(sourceWidth: number, sourceHeight: number) {
    if (this.host.sourceMode === 'camera' && this.host.isMobileViewport()) {
      return this.normalizeRotationDegrees(
        this.getMobileAutoRotationDegrees(sourceWidth, sourceHeight),
      );
    }
    return this.normalizeRotationDegrees(this.host.rotation);
  }

  getEffectiveFrameDimensions(sourceWidth: number, sourceHeight: number) {
    const effectiveRotation = this.getEffectiveRotationDegrees(
      sourceWidth,
      sourceHeight,
    );
    const rotated = effectiveRotation === 90 || effectiveRotation === 270;
    return {
      width: rotated ? sourceHeight : sourceWidth,
      height: rotated ? sourceWidth : sourceHeight,
      effectiveRotation,
    };
  }

  getPreviewFrameDimensions(sourceWidth: number, sourceHeight: number) {
    const { width: effectiveWidth, height: effectiveHeight } =
      this.getEffectiveFrameDimensions(sourceWidth, sourceHeight);
    const previewPreset = this.host.getCurrentPreviewQualityPreset();
    const sourcePixels = Math.max(1, effectiveWidth * effectiveHeight);
    const pixelScale =
      sourcePixels > previewPreset.maxPixels
        ? Math.sqrt(previewPreset.maxPixels / sourcePixels)
        : 1;
    const baseScale = Math.min(1, pixelScale, previewPreset.maxScale);

    const aspect = Math.max(0.0001, effectiveWidth / effectiveHeight);
    let width = Math.max(1, Math.round(effectiveWidth * baseScale));
    let height = Math.max(1, Math.round(effectiveHeight * baseScale));

    if (width < PREVIEW_MIN_WIDTH) {
      width = PREVIEW_MIN_WIDTH;
      height = Math.max(1, Math.round(width / aspect));
    }
    if (height < PREVIEW_MIN_HEIGHT) {
      height = PREVIEW_MIN_HEIGHT;
      width = Math.max(1, Math.round(height * aspect));
    }

    return { width, height, scale: width / Math.max(1, effectiveWidth) };
  }

  buildResolutionLabel(
    sourceWidth: number,
    sourceHeight: number,
    previewWidth: number,
    previewHeight: number,
  ) {
    const previewLabel = this.host.getCurrentPreviewQualityPreset().label;
    if (sourceWidth === previewWidth && sourceHeight === previewHeight) {
      return `${sourceWidth}×${sourceHeight} · Vista previa ${previewLabel}`;
    }
    return `${sourceWidth}×${sourceHeight} · Vista previa ${previewLabel} ${previewWidth}×${previewHeight}`;
  }

  getDesiredPreviewCanvasMetrics(sourceWidth: number, sourceHeight: number) {
    if (this.host.isMobileViewport()) {
      const wrapperWidth = Math.round(
        (this.host.previewWrapper && this.host.previewWrapper.clientWidth) ||
          window.innerWidth ||
          sourceWidth,
      );
      const wrapperHeight = Math.round(
        (this.host.previewWrapper && this.host.previewWrapper.clientHeight) ||
          window.innerHeight ||
          sourceHeight,
      );
      return {
        width: Math.max(PREVIEW_MIN_WIDTH, wrapperWidth),
        height: Math.max(PREVIEW_MIN_HEIGHT, wrapperHeight),
        scale: wrapperWidth / Math.max(1, sourceWidth),
      };
    }
    return this.getPreviewFrameDimensions(sourceWidth, sourceHeight);
  }

  clearPreviewCanvas() {
    if (!this.host.ctx || !this.host.canvas) return;
    const width = Math.max(1, this.host.canvas.width || 1);
    const height = Math.max(1, this.host.canvas.height || 1);
    this.host.ctx.fillStyle = '#000';
    this.host.ctx.fillRect(0, 0, width, height);
  }

  syncPreviewCanvasMetrics(
    sourceWidth: number,
    sourceHeight: number,
    forceLabel = false,
  ) {
    const { width, height, scale } = this.getDesiredPreviewCanvasMetrics(
      sourceWidth,
      sourceHeight,
    );
    const resized =
      this.host.canvas.width !== width || this.host.canvas.height !== height;
    if (resized) {
      this.host.canvas.width = width;
      this.host.canvas.height = height;
    }
    if (forceLabel || resized || this.previewScale !== scale) {
      updatePreviewMetrics({
        resolution: this.buildResolutionLabel(
          sourceWidth,
          sourceHeight,
          width,
          height,
        ),
      });
    }
    this.previewScale = scale;
    return { width, height, scale };
  }

  requestPreviewRefresh(forceLabel = false) {
    if (!this.host.isRunning || this.host.videoEl.readyState < 2) return;
    const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
    this.syncPreviewCanvasMetrics(sourceWidth, sourceHeight, forceLabel);
  }

  scheduleRenderLoop() {
    if (
      this.animFrameId !== null ||
      this.host.editor?.exportSession.active ||
      !this.host.isPageVisible
    )
      return;
    const useVideoFrame =
      typeof this.host.videoEl.requestVideoFrameCallback === 'function' &&
      !(this.host.sourceMode === 'video' && this.host.videoEl.paused);
    this.animFrameType = useVideoFrame ? 'video' : 'animation';
    this.animFrameId = useVideoFrame
      ? this.host.videoEl.requestVideoFrameCallback(this.nextFrame)
      : requestAnimationFrame(this.nextFrame);
  }

  cancelRenderLoop() {
    if (this.animFrameId == null) return;
    if (
      this.animFrameType !== 'animation' &&
      typeof this.host.videoEl.cancelVideoFrameCallback === 'function'
    ) {
      this.host.videoEl.cancelVideoFrameCallback(this.animFrameId);
    } else {
      cancelAnimationFrame(this.animFrameId);
    }
    this.animFrameId = null;
    this.animFrameType = '';
  }

  refreshPausedVideoPreview() {
    if (
      this.host.sourceMode !== 'video' ||
      !this.host.videoEl?.paused ||
      this.host.editor?.exportSession.active
    )
      return;
    this.cancelRenderLoop();
    this.scheduleRenderLoop();
  }

  private renderLoop() {
    this.animFrameId = null;
    this.animFrameType = '';
    if (
      !this.host.isRunning ||
      !this.host.isPageVisible ||
      this.host.editor?.exportSession.active
    )
      return;

    try {
      if (this.host.videoEl.readyState >= 2) {
        if (this.host.sourceMode === 'video' && this.host.editor) {
          this.host.editor.timelineEffects?.syncLook();
          void this.host.editor.timelineEffects?.syncDetectors();
          const { duration, trimEnd } = this.host.editor.timeline;
          const playableEnd = getVideoPlayableEnd(duration, trimEnd);
          if (
            !this.host.videoEl.paused &&
            this.host.videoEl.currentTime >= playableEnd
          ) {
            this.host.videoEl.pause();
            this.host.videoEl.currentTime = playableEnd;
          }
        }
        const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
        this.syncPreviewCanvasMetrics(
          sourceWidth,
          sourceHeight,
          this.frameCount % 30 === 0,
        );

        const frameStart = perfDev.mark();
        try {
          if (this.host.capture?.recording) {
            this.host.capture.renderSourceFrameBuffer(true);
            this.host.capture.blitProcessedFrameToPreview();
          } else {
            this.renderProcessedFrame(
              this.host.canvas,
              this.host.ctx,
              'preview',
            );
          }
        } catch (renderErr) {
          console.error('Render frame fallback error:', renderErr);
          this.drawBaseFrame(this.host.ctx, this.host.canvas, 'preview');
        }
        perfDev.record('frameRenderMs', performance.now() - frameStart);

        // FPS
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsTime >= 1000) {
          updatePreviewMetrics({ fps: `${this.frameCount} FPS` });
          perfDev.gauge('previewFps', this.frameCount);
          this.host.camera?.handlePreviewFpsSample(this.frameCount);
          this.frameCount = 0;
          this.lastFpsTime = now;
        }
        this.host.detectors?.updateInfo();
        this.host.editor?.transport?.update();
        this.host.updateVisualFxLab?.();
        if (this.host.sourceMode === 'video')
          this.host.editor?.visualFx?.updatePosition();
      }
    } catch (err) {
      console.error('Render loop error:', err);
    }

    if (this.host.sourceMode === 'video' && this.host.videoEl.paused) return;
    this.scheduleRenderLoop();
  }

  isNeutralLookProcessing() {
    const settings = this.host.imageSettings;
    return (
      !settings.blackAndWhite &&
      settings.exposure === 0 &&
      settings.contrast === 100 &&
      settings.saturation === 100 &&
      !this.needsAdvancedPixelAdjustments()
    );
  }

  getBaseFilterValues() {
    const exposureBoost = clamp(
      100 + this.host.imageSettings.exposure * 0.8,
      35,
      200,
    );
    const contrast = clamp(this.host.imageSettings.contrast, 50, 180);
    const saturation = this.host.imageSettings.blackAndWhite
      ? 0
      : clamp(this.host.imageSettings.saturation, 0, 200);
    const grayscale = this.host.imageSettings.blackAndWhite ? 100 : 0;
    return {
      brightness: exposureBoost / 100,
      contrast: contrast / 100,
      saturation: saturation / 100,
      grayscale: grayscale / 100,
      exposureBoost,
      contrastPercent: contrast,
      saturationPercent: saturation,
      grayscalePercent: grayscale,
    };
  }

  getLookFilterValues() {
    const base = this.getBaseFilterValues();
    const sharpness = clamp(this.host.imageSettings.sharpness, 0, 100) / 100;
    return {
      brightness: base.brightness,
      contrast: base.contrast,
      saturation: base.saturation,
      grayscale: base.grayscale,
      shadows: this.host.imageSettings.shadows / 100,
      highlights: this.host.imageSettings.highlights / 100,
      detail: this.host.imageSettings.detail / 100,
      temperature: this.host.imageSettings.blackAndWhite
        ? 0
        : this.host.imageSettings.temperature / 100,
      // Matches applySharpenFilter strength when sharpness >= 8.
      sharpen: this.host.imageSettings.sharpness >= 8 ? sharpness * 1.2 : 0,
    };
  }

  buildCanvasFilter() {
    if (this.isNeutralLookProcessing()) return 'none';
    const values = this.getBaseFilterValues();

    const filters = [];
    if (values.exposureBoost !== 100)
      filters.push(`brightness(${values.exposureBoost}%)`);
    if (values.contrastPercent !== 100)
      filters.push(`contrast(${values.contrastPercent}%)`);
    if (values.grayscalePercent === 100) {
      filters.push('grayscale(100%)');
    } else if (values.saturationPercent !== 100) {
      filters.push(`saturate(${values.saturationPercent}%)`);
    }
    return filters.join(' ') || 'none';
  }

  needsAdvancedPixelAdjustments() {
    const temperature = this.host.imageSettings.blackAndWhite
      ? 0
      : this.host.imageSettings.temperature;
    return (
      this.host.imageSettings.shadows !== 0 ||
      this.host.imageSettings.highlights !== 0 ||
      this.host.imageSettings.detail !== 0 ||
      temperature !== 0 ||
      this.host.imageSettings.sharpness !== 0
    );
  }

  ensurePostFxBuffer(mode: BufferMode, w: number, h: number, scale: number) {
    return this.host.renderEngine.ensurePostFxBuffer(mode, w, h, scale);
  }

  ensureWebGLFilterRenderer() {
    if (this.webglFilterFailed) return null;
    if (!this.webglFilterRenderer) {
      try {
        this.webglFilterRenderer = new WebGLFilterRenderer();
      } catch {
        this.webglFilterFailed = true;
        return null;
      }
    }
    return this.webglFilterRenderer;
  }

  tryDrawBaseFrameWithWebGL(
    targetCtx: CanvasRenderingContext2D,
    targetCanvas: HTMLCanvasElement,
    mode: BufferMode,
    drawMetrics: WebGLDrawMetrics,
  ) {
    // Export keeps the CPU look path for exact offline quality. Preview,
    // recording and capture use GPU so advanced tone/sharpen do not stall
    // MediaRecorder.
    if (mode === 'export' || this.isNeutralLookProcessing()) return false;
    const renderer = this.ensureWebGLFilterRenderer();
    if (!renderer) return false;
    try {
      // The shader fills its whole canvas with the video, so it has to run at
      // the size of the rect that gets drawn afterwards. Rendering at canvas
      // size stretched the frame whenever the aspect differed (letterbox and
      // any rotation) because the result was then redrawn at drawWidth/Height.
      const glWidth = Math.max(1, Math.round(drawMetrics.drawWidth));
      const glHeight = Math.max(1, Math.round(drawMetrics.drawHeight));
      const filteredCanvas = renderer.render(
        this.host.videoEl,
        glWidth,
        glHeight,
        this.getLookFilterValues(),
      );
      targetCtx.save();
      targetCtx.filter = 'none';
      targetCtx.translate(targetCanvas.width / 2, targetCanvas.height / 2);
      if (drawMetrics.effectiveRotation !== 0) {
        targetCtx.rotate((drawMetrics.effectiveRotation * Math.PI) / 180);
      }
      if (drawMetrics.sx !== 1 || drawMetrics.sy !== 1) {
        targetCtx.scale(drawMetrics.sx, drawMetrics.sy);
      }
      targetCtx.drawImage(
        filteredCanvas,
        -drawMetrics.drawWidth / 2,
        -drawMetrics.drawHeight / 2,
        drawMetrics.drawWidth,
        drawMetrics.drawHeight,
      );
      targetCtx.restore();
      this._webglAppliedAdvancedLook = this.needsAdvancedPixelAdjustments();
      return true;
    } catch {
      this.webglFilterFailed = true;
      this.webglFilterRenderer?.dispose();
      this.webglFilterRenderer = null;
      this._webglAppliedAdvancedLook = false;
      return false;
    }
  }

  getVideoDrawMetrics(
    targetCanvas: HTMLCanvasElement,
    mode: BufferMode = 'preview',
  ) {
    const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
    return calculateVideoDrawMetrics({
      canvasWidth: targetCanvas.width,
      canvasHeight: targetCanvas.height,
      sourceWidth,
      sourceHeight,
      effectiveRotation: this.getEffectiveRotationDegrees(
        sourceWidth,
        sourceHeight,
      ),
      flipH: this.host.getEffectiveFlipH(),
      flipV: this.host.flipV,
      useCover: mode === 'preview' && this.host.isMobileViewport(),
    });
  }

  drawBaseFrame(
    targetCtx: CanvasRenderingContext2D,
    targetCanvas: HTMLCanvasElement,
    mode: BufferMode = 'preview',
  ) {
    this._webglAppliedAdvancedLook = false;
    const metrics = this.getVideoDrawMetrics(targetCanvas, mode);
    const effectiveRotation = metrics.effectiveRotation;
    let sx = 1;
    let sy = 1;
    if (metrics.flipH) sx = -1;
    if (metrics.flipV) sy = -1;

    if (
      this.tryDrawBaseFrameWithWebGL(targetCtx, targetCanvas, mode, {
        effectiveRotation,
        drawWidth: metrics.drawWidth,
        drawHeight: metrics.drawHeight,
        sx,
        sy,
      })
    ) {
      return effectiveRotation;
    }

    targetCtx.save();
    targetCtx.filter = this.buildCanvasFilter();
    targetCtx.translate(targetCanvas.width / 2, targetCanvas.height / 2);
    if (effectiveRotation !== 0) {
      targetCtx.rotate((effectiveRotation * Math.PI) / 180);
    }
    if (sx !== 1 || sy !== 1) {
      targetCtx.scale(sx, sy);
    }
    targetCtx.drawImage(
      this.host.videoEl,
      -metrics.drawWidth / 2,
      -metrics.drawHeight / 2,
      metrics.drawWidth,
      metrics.drawHeight,
    );
    targetCtx.restore();
    return effectiveRotation;
  }

  applyAdvancedPixelAdjustments(
    targetCanvas = this.host.canvas,
    targetCtx = this.host.ctx,
    mode: BufferMode = 'preview',
  ) {
    const w = targetCanvas.width;
    const h = targetCanvas.height;
    if (w === 0 || h === 0) return;

    let postFxScale =
      mode === 'export'
        ? 1
        : this.host.imageSettings.sharpness > 0
          ? 0.78
          : 0.86;
    if (mode !== 'export' && w * h > 1920 * 1080) postFxScale *= 0.92;
    postFxScale = mode === 'export' ? 1 : clamp(postFxScale, 0.72, 0.9);

    const { pw, ph, fxCanvas, fxCtx } = this.ensurePostFxBuffer(
      mode,
      w,
      h,
      postFxScale,
    );
    fxCtx.drawImage(targetCanvas, 0, 0, pw, ph);

    const imageData = fxCtx.getImageData(0, 0, pw, ph);
    const data = imageData.data;

    const shadows = this.host.imageSettings.shadows / 100;
    const highlights = this.host.imageSettings.highlights / 100;
    const detail = this.host.imageSettings.detail / 100;
    const temperature = this.host.imageSettings.blackAndWhite
      ? 0
      : this.host.imageSettings.temperature / 100;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const shadowMask = (1 - luma) * (1 - luma);
      const highlightMask = luma * luma;

      const toneShift =
        shadows * shadowMask * 48 + highlights * highlightMask * 48;
      const detailShift = detail * (luma - 0.5) * 52;
      const tempShift = temperature * 22;

      r = clamp(Math.round(r + toneShift + detailShift + tempShift), 0, 255);
      g = clamp(Math.round(g + toneShift + detailShift * 0.8), 0, 255);
      b = clamp(Math.round(b + toneShift + detailShift - tempShift), 0, 255);

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    if (this.host.imageSettings.sharpness >= 8) {
      this.applySharpenFilter(
        imageData,
        this.host.imageSettings.sharpness / 100,
      );
    }

    fxCtx.putImageData(imageData, 0, 0);
    targetCtx.save();
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.drawImage(fxCanvas, 0, 0, w, h);
    targetCtx.restore();
  }

  renderEffectsOnlyFrame(
    targetCanvas: HTMLCanvasElement,
    targetCtx: CanvasRenderingContext2D,
    chromaColor = '#00ff00',
    mode: BufferMode = 'export',
  ) {
    if (
      !this.host.videoEl ||
      this.host.videoEl.readyState < 2 ||
      targetCanvas.width === 0 ||
      targetCanvas.height === 0
    )
      return;
    if (!this.effectsOnlyAnalysisCanvas) {
      this.effectsOnlyAnalysisCanvas = document.createElement('canvas');
      this.effectsOnlyAnalysisCtx = this.effectsOnlyAnalysisCanvas.getContext(
        '2d',
        { willReadFrequently: true },
      );
    }
    if (!this.effectsOnlyAnalysisCtx) return;

    const analysisCanvas = this.effectsOnlyAnalysisCanvas;
    const analysisCtx = this.effectsOnlyAnalysisCtx;
    if (
      analysisCanvas.width !== targetCanvas.width ||
      analysisCanvas.height !== targetCanvas.height
    ) {
      analysisCanvas.width = targetCanvas.width;
      analysisCanvas.height = targetCanvas.height;
    }

    const frameRotation = this.drawBaseFrame(analysisCtx, analysisCanvas, mode);
    if (
      this.needsAdvancedPixelAdjustments() &&
      !this._webglAppliedAdvancedLook
    ) {
      this.applyAdvancedPixelAdjustments(analysisCanvas, analysisCtx, mode);
    }

    targetCtx.save();
    targetCtx.fillStyle = chromaColor;
    targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    targetCtx.restore();

    const visualFx = this.host.editor?.visualFx.activeEffect;
    if (visualFx) {
      visualFx.processFullFrame(
        targetCtx,
        analysisCanvas,
        this.host.videoEl,
        this.host.renderEngine.getProfile('export'),
        {
          mediaTime: this.host.videoEl.currentTime,
          mode: `${mode}-chroma`,
          drawMetrics: this.getVideoDrawMetrics(analysisCanvas, mode),
        },
      );
    }

    if (this.host.detectors.face) {
      this.host.detectors.face.flipH = this.host.getEffectiveFlipH();
      this.host.detectors.face.flipV = this.host.flipV;
      this.host.detectors.face.rotationDeg = frameRotation;
    }

    if (this.host.detectors.blob && this.host.detectors.blink) {
      this.host.detectors.blink.setFeedbackColor(
        this.host.detectors.blob.boxColor,
      );
      this.host.detectors.blob.connectionColor =
        this.host.detectors.blob.boxColor;
    }

    this.host.detectors.manager.processFrame(
      targetCtx,
      analysisCanvas,
      this.host.videoEl,
      {
        ...this.host.renderEngine.getProfile('export'),
        overlayOnly: true,
      },
    );
  }

  renderProcessedFrame(
    targetCanvas: HTMLCanvasElement,
    targetCtx: CanvasRenderingContext2D,
    mode: BufferMode = 'preview',
  ) {
    if (
      !this.host.videoEl ||
      this.host.videoEl.readyState < 2 ||
      targetCanvas.width === 0 ||
      targetCanvas.height === 0
    )
      return;
    const frameRotation = this.drawBaseFrame(targetCtx, targetCanvas, mode);
    if (
      this.needsAdvancedPixelAdjustments() &&
      !this._webglAppliedAdvancedLook
    ) {
      this.applyAdvancedPixelAdjustments(targetCanvas, targetCtx, mode);
    }

    const profileName =
      mode === 'preview' && this.host.isMobileViewport() ? 'mobile' : mode;
    const renderProfile = this.host.renderEngine.getProfile(profileName);

    const visualFx = this.host.editor?.visualFx.activeEffect;
    if (visualFx) {
      const drawMetrics = this.getVideoDrawMetrics(targetCanvas, mode);
      visualFx.processFullFrame(
        targetCtx,
        targetCanvas,
        this.host.videoEl,
        renderProfile,
        {
          mediaTime: this.host.videoEl.currentTime,
          drawMetrics,
          mode,
          invalidate: () => this.refreshPausedVideoPreview?.(),
        },
      );
    }

    if (this.host.detectors.face) {
      this.host.detectors.face.flipH = this.host.getEffectiveFlipH();
      this.host.detectors.face.flipV = this.host.flipV;
      this.host.detectors.face.rotationDeg = frameRotation;
    }

    if (this.host.detectors.blob && this.host.detectors.blink) {
      this.host.detectors.blink.setFeedbackColor(
        this.host.detectors.blob.boxColor,
      );
      this.host.detectors.blob.connectionColor =
        this.host.detectors.blob.boxColor;
    }

    this.host.detectors.manager.processFrame(
      targetCtx,
      targetCanvas,
      this.host.videoEl,
      renderProfile,
    );
  }

  applySharpenFilter(imageData: ImageData, amount: number) {
    const { width, height, data } = imageData;
    const src = new Uint8ClampedArray(data);
    const rowSize = width * 4;
    const strength = clamp(amount, 0, 1) * 1.2;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * rowSize + x * 4;
        for (let c = 0; c < 3; c++) {
          const center = src[idx + c];
          const north = src[idx - rowSize + c];
          const south = src[idx + rowSize + c];
          const west = src[idx - 4 + c];
          const east = src[idx + 4 + c];
          const blurred = (center * 4 + north + south + west + east) / 8;
          data[idx + c] = clamp(
            Math.round(center + (center - blurred) * strength),
            0,
            255,
          );
        }
      }
    }
  }
}
