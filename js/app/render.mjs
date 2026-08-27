import { WebGLFilterRenderer } from './webgl-filter-renderer.mjs';
import { metricsFromApp } from '../subject/subject-frame-map.mjs';

/** @param {import('./controller.mjs').AppController} proto */
export function applyRenderLoopMixin(proto) {
  proto.getSourceFrameDimensions = function () {
    return {
      sourceWidth: Math.max(
        1,
        this.videoEl.videoWidth || this.canvas.width || 1,
      ),
      sourceHeight: Math.max(
        1,
        this.videoEl.videoHeight || this.canvas.height || 1,
      ),
    };
  };

  proto.normalizeRotationDegrees = function (deg) {
    const normalized = (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
    if (normalized === 360) return 0;
    return normalized;
  };

  proto.getMobileAutoRotationDegrees = function (sourceWidth, sourceHeight) {
    const shouldAutoRotate =
      this.isMobileViewport() && sourceWidth > sourceHeight;
    return shouldAutoRotate ? 90 : 0;
  };

  proto.getEffectiveRotationDegrees = function (sourceWidth, sourceHeight) {
    if (this.sourceMode === 'camera' && this.isMobileViewport()) {
      return this.normalizeRotationDegrees(
        this.getMobileAutoRotationDegrees(sourceWidth, sourceHeight),
      );
    }
    return this.normalizeRotationDegrees(this.rotation);
  };

  proto.getEffectiveFrameDimensions = function (sourceWidth, sourceHeight) {
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
  };

  proto.getPreviewFrameDimensions = function (sourceWidth, sourceHeight) {
    const { width: effectiveWidth, height: effectiveHeight } =
      this.getEffectiveFrameDimensions(sourceWidth, sourceHeight);
    const previewPreset = this.getCurrentPreviewQualityPreset();
    const sourcePixels = Math.max(1, effectiveWidth * effectiveHeight);
    const pixelScale =
      sourcePixels > previewPreset.maxPixels
        ? Math.sqrt(previewPreset.maxPixels / sourcePixels)
        : 1;
    const baseScale = Math.min(1, pixelScale, previewPreset.maxScale);

    const aspect = Math.max(0.0001, effectiveWidth / effectiveHeight);
    let width = Math.max(1, Math.round(effectiveWidth * baseScale));
    let height = Math.max(1, Math.round(effectiveHeight * baseScale));

    if (width < this.PREVIEW_MIN_WIDTH) {
      width = this.PREVIEW_MIN_WIDTH;
      height = Math.max(1, Math.round(width / aspect));
    }
    if (height < this.PREVIEW_MIN_HEIGHT) {
      height = this.PREVIEW_MIN_HEIGHT;
      width = Math.max(1, Math.round(height * aspect));
    }

    return { width, height, scale: width / Math.max(1, effectiveWidth) };
  };

  proto.buildResolutionLabel = function (
    sourceWidth,
    sourceHeight,
    previewWidth,
    previewHeight,
  ) {
    const previewLabel = this.getCurrentPreviewQualityPreset().label;
    if (sourceWidth === previewWidth && sourceHeight === previewHeight) {
      return `${sourceWidth}×${sourceHeight} · Vista previa ${previewLabel}`;
    }
    return `${sourceWidth}×${sourceHeight} · Vista previa ${previewLabel} ${previewWidth}×${previewHeight}`;
  };

  proto.getDesiredPreviewCanvasMetrics = function (sourceWidth, sourceHeight) {
    if (this.isMobileViewport()) {
      const wrapperWidth = Math.round(
        (this.previewWrapper && this.previewWrapper.clientWidth) ||
          window.innerWidth ||
          sourceWidth,
      );
      const wrapperHeight = Math.round(
        (this.previewWrapper && this.previewWrapper.clientHeight) ||
          window.innerHeight ||
          sourceHeight,
      );
      return {
        width: Math.max(this.PREVIEW_MIN_WIDTH, wrapperWidth),
        height: Math.max(this.PREVIEW_MIN_HEIGHT, wrapperHeight),
        scale: wrapperWidth / Math.max(1, sourceWidth),
      };
    }
    return this.getPreviewFrameDimensions(sourceWidth, sourceHeight);
  };

  proto.clearPreviewCanvas = function () {
    if (!this.ctx || !this.canvas) return;
    const width = Math.max(1, this.canvas.width || 1);
    const height = Math.max(1, this.canvas.height || 1);
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, width, height);
  };

  proto.syncPreviewCanvasMetrics = function (
    sourceWidth,
    sourceHeight,
    forceLabel = false,
  ) {
    const { width, height, scale } = this.getDesiredPreviewCanvasMetrics(
      sourceWidth,
      sourceHeight,
    );
    const resized =
      this.canvas.width !== width || this.canvas.height !== height;
    if (resized) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    if (forceLabel || resized || this.previewScale !== scale) {
      this.resolutionInfo.textContent = this.buildResolutionLabel(
        sourceWidth,
        sourceHeight,
        width,
        height,
      );
    }
    this.previewScale = scale;
    return { width, height, scale };
  };

  proto.requestPreviewRefresh = function (forceLabel = false) {
    if (!this.isRunning || this.videoEl.readyState < 2) return;
    const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
    this.syncPreviewCanvasMetrics(sourceWidth, sourceHeight, forceLabel);
  };

  proto.scheduleRenderLoop = function () {
    if (this.isVideoExporting) return;
    const useVideoFrame =
      typeof this.videoEl.requestVideoFrameCallback === 'function' &&
      !(this.sourceMode === 'video' && this.videoEl.paused);
    this.animFrameType = useVideoFrame ? 'video' : 'animation';
    this.animFrameId = useVideoFrame
      ? this.videoEl.requestVideoFrameCallback(this.renderLoop.bind(this))
      : requestAnimationFrame(this.renderLoop.bind(this));
  };

  proto.cancelRenderLoop = function () {
    if (this.animFrameId == null) return;
    if (
      this.animFrameType !== 'animation' &&
      typeof this.videoEl.cancelVideoFrameCallback === 'function'
    ) {
      this.videoEl.cancelVideoFrameCallback(this.animFrameId);
    } else {
      cancelAnimationFrame(this.animFrameId);
    }
    this.animFrameId = null;
    this.animFrameType = '';
  };

  proto.refreshPausedVideoPreview = function () {
    if (
      this.sourceMode !== 'video' ||
      !this.videoEl?.paused ||
      this.isVideoExporting
    )
      return;
    this.cancelRenderLoop();
    this.scheduleRenderLoop();
  };

  proto.renderLoop = function () {
    if (!this.isRunning || this.isVideoExporting) {
      this.animFrameId = null;
      return;
    }
    if (!this.isPageVisible) {
      this.animFrameId = null;
      return;
    }

    try {
      if (this.videoEl.readyState >= 2) {
        if (this.sourceMode === 'video') {
          this.syncVideoTimelineLookNow();
          void this.syncVideoTimelineDetectors();
          const trimEnd =
            this.getVideoPlayableEnd?.(this.videoTimeline.trimEnd) ??
            this.videoTimeline.trimEnd;
          if (!this.videoEl.paused && this.videoEl.currentTime >= trimEnd) {
            this.videoEl.pause();
            this.videoEl.currentTime = trimEnd;
          }
        }
        const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
        this.syncPreviewCanvasMetrics(
          sourceWidth,
          sourceHeight,
          this.frameCount % 30 === 0,
        );

        try {
          if (this.isRecording) {
            this.renderSourceFrameBuffer(true);
            this.blitProcessedFrameToPreview();
          } else {
            this.renderProcessedFrame(this.canvas, this.ctx, 'preview');
          }
        } catch (renderErr) {
          console.error('Render frame fallback error:', renderErr);
          this.drawBaseFrame(this.ctx, this.canvas, 'preview');
        }

        // FPS
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsTime >= 1000) {
          this.fpsInfo.textContent = `${this.frameCount} FPS`;
          this.handlePreviewFpsSample?.(this.frameCount);
          this.frameCount = 0;
          this.lastFpsTime = now;
        }
        this.updateEffectsInfo?.();
        this.updateVideoTransport();
        this.updateSubjectFxLab?.();
        if (
          this.sourceMode === 'video' &&
          this.subjectFxEffect?.active &&
          !this.subjectFxInspectorHost?.classList.contains('hidden')
        ) {
          const nextStatus = this.subjectFxEffect.analyzer?.status || '';
          if (nextStatus !== this._subjectFxInspectorStatus) {
            this._subjectFxInspectorStatus = nextStatus;
            this.renderSubjectFxInspector?.();
          }
        }
      }
    } catch (err) {
      console.error('Render loop error:', err);
    }

    if (this.sourceMode === 'video' && this.videoEl.paused) {
      this.animFrameId = null;
      this.animFrameType = '';
      return;
    }
    this.scheduleRenderLoop();
  };

  proto.isNeutralLookProcessing = function () {
    const settings = this.imageSettings;
    return (
      !settings.blackAndWhite &&
      settings.exposure === 0 &&
      settings.contrast === 100 &&
      settings.saturation === 100 &&
      !this.needsAdvancedPixelAdjustments()
    );
  };

  proto.getBaseFilterValues = function () {
    const exposureBoost = this.clamp(
      100 + this.imageSettings.exposure * 0.8,
      35,
      200,
    );
    const contrast = this.clamp(this.imageSettings.contrast, 50, 180);
    const saturation = this.imageSettings.blackAndWhite
      ? 0
      : this.clamp(this.imageSettings.saturation, 0, 200);
    const grayscale = this.imageSettings.blackAndWhite ? 100 : 0;
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
  };

  proto.buildCanvasFilter = function () {
    if (this.isNeutralLookProcessing()) return 'none';
    const values = this.getBaseFilterValues();

    return `brightness(${values.exposureBoost}%) contrast(${values.contrastPercent}%) saturate(${values.saturationPercent}%) grayscale(${values.grayscalePercent}%)`;
  };

  proto.needsAdvancedPixelAdjustments = function () {
    const temperature = this.imageSettings.blackAndWhite
      ? 0
      : this.imageSettings.temperature;
    return (
      this.imageSettings.shadows !== 0 ||
      this.imageSettings.highlights !== 0 ||
      this.imageSettings.detail !== 0 ||
      temperature !== 0 ||
      this.imageSettings.sharpness !== 0
    );
  };

  proto.ensurePostFxBuffer = function (mode, w, h, scale) {
    return this.renderEngine.ensurePostFxBuffer(mode, w, h, scale);
  };

  proto.ensureWebGLFilterRenderer = function () {
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
  };

  proto.tryDrawBaseFrameWithWebGL = function (
    targetCtx,
    targetCanvas,
    mode,
    drawMetrics,
  ) {
    if (mode !== 'preview' || this.isNeutralLookProcessing()) return false;
    const renderer = this.ensureWebGLFilterRenderer();
    if (!renderer) return false;
    try {
      const filteredCanvas = renderer.render(
        this.videoEl,
        drawMetrics.sourceWidth,
        drawMetrics.sourceHeight,
        this.getBaseFilterValues(),
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
      return true;
    } catch {
      this.webglFilterFailed = true;
      return false;
    }
  };

  proto.getVideoDrawMetrics = function (targetCanvas, mode = 'preview') {
    return metricsFromApp(this, targetCanvas, mode);
  };

  proto.drawBaseFrame = function (targetCtx, targetCanvas, mode = 'preview') {
    const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
    const metrics = this.getVideoDrawMetrics(targetCanvas, mode);
    const effectiveRotation = metrics.effectiveRotation;
    let sx = 1;
    let sy = 1;
    if (metrics.flipH) sx = -1;
    if (metrics.flipV) sy = -1;

    if (
      this.tryDrawBaseFrameWithWebGL(targetCtx, targetCanvas, mode, {
        sourceWidth,
        sourceHeight,
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
      this.videoEl,
      -metrics.drawWidth / 2,
      -metrics.drawHeight / 2,
      metrics.drawWidth,
      metrics.drawHeight,
    );
    targetCtx.restore();
    return effectiveRotation;
  };

  proto.applyAdvancedPixelAdjustments = function (
    targetCanvas = this.canvas,
    targetCtx = this.ctx,
    mode = 'preview',
  ) {
    const w = targetCanvas.width;
    const h = targetCanvas.height;
    if (w === 0 || h === 0) return;

    let postFxScale =
      mode === 'export' ? 1 : this.imageSettings.sharpness > 0 ? 0.78 : 0.86;
    if (mode !== 'export' && w * h > 1920 * 1080) postFxScale *= 0.92;
    postFxScale = mode === 'export' ? 1 : this.clamp(postFxScale, 0.72, 0.9);

    const { pw, ph, fxCanvas, fxCtx } = this.ensurePostFxBuffer(
      mode,
      w,
      h,
      postFxScale,
    );
    fxCtx.drawImage(targetCanvas, 0, 0, pw, ph);

    const imageData = fxCtx.getImageData(0, 0, pw, ph);
    const data = imageData.data;

    const shadows = this.imageSettings.shadows / 100;
    const highlights = this.imageSettings.highlights / 100;
    const detail = this.imageSettings.detail / 100;
    const temperature = this.imageSettings.blackAndWhite
      ? 0
      : this.imageSettings.temperature / 100;

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

      r = this.clamp(
        Math.round(r + toneShift + detailShift + tempShift),
        0,
        255,
      );
      g = this.clamp(Math.round(g + toneShift + detailShift * 0.8), 0, 255);
      b = this.clamp(
        Math.round(b + toneShift + detailShift - tempShift),
        0,
        255,
      );

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    if (this.imageSettings.sharpness >= 8) {
      this.applySharpenFilter(imageData, this.imageSettings.sharpness / 100);
    }

    fxCtx.putImageData(imageData, 0, 0);
    targetCtx.save();
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.drawImage(fxCanvas, 0, 0, w, h);
    targetCtx.restore();
  };

  proto.renderEffectsOnlyFrame = function (
    targetCanvas,
    targetCtx,
    chromaColor = '#00ff00',
    mode = 'export',
  ) {
    if (
      !this.videoEl ||
      this.videoEl.readyState < 2 ||
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
    if (this.needsAdvancedPixelAdjustments()) {
      this.applyAdvancedPixelAdjustments(analysisCanvas, analysisCtx, mode);
    }

    targetCtx.save();
    targetCtx.fillStyle = chromaColor;
    targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    targetCtx.restore();

    if (this.faceDetectionEffect) {
      this.faceDetectionEffect.flipH = this.getEffectiveFlipH();
      this.faceDetectionEffect.flipV = this.flipV;
      this.faceDetectionEffect.rotationDeg = frameRotation;
    }

    if (this.blobTrackingEffect && this.blinkDetectionEffect) {
      this.blinkDetectionEffect.setFeedbackColor(
        this.blobTrackingEffect.boxColor,
      );
      this.blobTrackingEffect.connectionColor =
        this.blobTrackingEffect.boxColor;
    }

    this.effectManager.processFrame(targetCtx, analysisCanvas, this.videoEl, {
      ...this.renderEngine.getProfile('export'),
      overlayOnly: true,
    });
  };

  proto.renderProcessedFrame = function (
    targetCanvas,
    targetCtx,
    mode = 'preview',
  ) {
    if (
      !this.videoEl ||
      this.videoEl.readyState < 2 ||
      targetCanvas.width === 0 ||
      targetCanvas.height === 0
    )
      return;
    const frameRotation = this.drawBaseFrame(targetCtx, targetCanvas, mode);
    if (this.needsAdvancedPixelAdjustments()) {
      this.applyAdvancedPixelAdjustments(targetCanvas, targetCtx, mode);
    }

    const profileName =
      mode === 'preview' && this.isMobileViewport() ? 'mobile' : mode;
    const renderProfile = this.renderEngine.getProfile(profileName);

    if (this.subjectFxEffect?.active && !this.subjectFxBypass) {
      const beatStrength = this.getSubjectBeatStrength?.(
        this.videoEl.currentTime || 0,
      );
      const drawMetrics = this.getVideoDrawMetrics(targetCanvas, mode);
      this.subjectFxEffect.processFullFrame(
        targetCtx,
        targetCanvas,
        this.videoEl,
        renderProfile,
        { mediaTime: this.videoEl.currentTime, beatStrength, drawMetrics },
      );
    }

    if (this.faceDetectionEffect) {
      this.faceDetectionEffect.flipH = this.getEffectiveFlipH();
      this.faceDetectionEffect.flipV = this.flipV;
      this.faceDetectionEffect.rotationDeg = frameRotation;
    }

    if (this.blobTrackingEffect && this.blinkDetectionEffect) {
      this.blinkDetectionEffect.setFeedbackColor(
        this.blobTrackingEffect.boxColor,
      );
      this.blobTrackingEffect.connectionColor =
        this.blobTrackingEffect.boxColor;
    }

    this.effectManager.processFrame(
      targetCtx,
      targetCanvas,
      this.videoEl,
      renderProfile,
    );

    if (this.subjectFxEffect?.active && !this.subjectFxBypass) {
      const beatStrength = this.getSubjectBeatStrength?.(
        this.videoEl.currentTime || 0,
      );
      const drawMetrics = this.getVideoDrawMetrics(targetCanvas, mode);
      this.subjectFxEffect.processOverlay(targetCtx, targetCanvas, {
        ...renderProfile,
        beatStrength,
        drawMetrics,
      });
    }
  };

  proto.applySharpenFilter = function (imageData, amount) {
    const { width, height, data } = imageData;
    const src = new Uint8ClampedArray(data);
    const rowSize = width * 4;
    const strength = this.clamp(amount, 0, 1) * 1.2;

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
          data[idx + c] = this.clamp(
            Math.round(center + (center - blurred) * strength),
            0,
            255,
          );
        }
      }
    }
  };
}
