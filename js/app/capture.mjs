/** @param {import('./controller.mjs').AppController} proto */
export function applyCaptureMixin(proto) {
  proto.isCapturePreviewOpen = function () {
    return (
      !!this.capturePreviewModal &&
      !this.capturePreviewModal.classList.contains('hidden')
    );
  };

  proto.onGlobalKeyDown = function (e) {
    if (e.key === 'Escape' && this.isCapturePreviewOpen()) {
      this.closeCapturePreview(true);
      return;
    }
    if (e.key === 'Escape' && this.isMobileFxPanelVisible()) {
      this.setMobileFxPanelVisible(false);
    }
  };

  proto.isPendingPhotoCapture = function () {
    return !!this.pendingCapture && this.pendingCapture.kind === 'photo';
  };

  proto.updatePreviewPhotoEnhancerControls = function () {
    if (
      !this.previewPhotoEnhancerStrengthGroup ||
      !this.sldPreviewPhotoEnhancerStrength
    )
      return;
    const enabled =
      this.isPendingPhotoCapture() &&
      !!this.pendingCapture.previewEnhancerEnabled;
    this.previewPhotoEnhancerStrengthGroup.classList.toggle('hidden', !enabled);
    this.sldPreviewPhotoEnhancerStrength.disabled = !enabled;
  };

  proto.syncPreviewPhotoTools = function () {
    const isPhoto = this.isPendingPhotoCapture();
    if (this.capturePreviewPhotoTools) {
      this.capturePreviewPhotoTools.classList.toggle('hidden', !isPhoto);
    }

    if (!isPhoto) {
      if (this.chkPreviewPhotoEnhancer)
        this.chkPreviewPhotoEnhancer.checked = false;
      if (this.sldPreviewPhotoEnhancerStrength) {
        this.sldPreviewPhotoEnhancerStrength.value = String(
          this.imageSettings.qualityEnhancerStrength,
        );
      }
      if (this.valPreviewPhotoEnhancerStrength) {
        this.valPreviewPhotoEnhancerStrength.textContent = `${this.imageSettings.qualityEnhancerStrength}%`;
      }
      this.updatePreviewPhotoEnhancerControls();
      return;
    }

    const enabled = !!this.pendingCapture.previewEnhancerEnabled;
    const parsedStrength = parseInt(
      this.pendingCapture.previewEnhancerStrength,
      10,
    );
    const strength = this.clamp(
      Number.isFinite(parsedStrength)
        ? parsedStrength
        : this.imageSettings.qualityEnhancerStrength,
      0,
      100,
    );
    this.pendingCapture.previewEnhancerEnabled = enabled;
    this.pendingCapture.previewEnhancerStrength = strength;

    if (this.chkPreviewPhotoEnhancer)
      this.chkPreviewPhotoEnhancer.checked = enabled;
    if (this.sldPreviewPhotoEnhancerStrength)
      this.sldPreviewPhotoEnhancerStrength.value = String(strength);
    if (this.valPreviewPhotoEnhancerStrength)
      this.valPreviewPhotoEnhancerStrength.textContent = `${strength}%`;
    this.updatePreviewPhotoEnhancerControls();
  };

  proto.rebuildPendingPhotoPreview = async function () {
    if (!this.isPendingPhotoCapture() || !this.pendingCapture.baseCanvas)
      return;
    const token = ++this.photoPreviewRenderToken;
    const enabled = !!this.pendingCapture.previewEnhancerEnabled;
    const strength = this.clamp(
      parseInt(this.pendingCapture.previewEnhancerStrength, 10) || 0,
      0,
      100,
    );

    try {
      const {
        blob: nextBlob,
        width: nextWidth,
        height: nextHeight,
      } = await this.buildPhotoBlobFromCanvas(
        this.pendingCapture.baseCanvas,
        enabled,
        strength,
      );
      if (
        token !== this.photoPreviewRenderToken ||
        !this.isPendingPhotoCapture()
      )
        return;

      if (this.pendingCapture.objectUrl) {
        URL.revokeObjectURL(this.pendingCapture.objectUrl);
      }

      const nextObjectUrl = URL.createObjectURL(nextBlob);
      this.pendingCapture.objectUrl = nextObjectUrl;
      this.pendingCapture.blob = nextBlob;
      this.pendingCapture.meta = {
        ...(this.pendingCapture.meta || {}),
        width: nextWidth,
        height: nextHeight,
        size: nextBlob.size,
        enhanced: enabled,
        enhancerStrength: enabled ? strength : 0,
      };

      if (this.capturePreviewImage) {
        this.capturePreviewImage.src = nextObjectUrl;
      }
      this.renderCapturePreviewInfo(this.pendingCapture.meta || {}, 'photo');
    } catch (err) {
      console.error('Error rebuilding photo preview:', err);
      this.showStatus(
        this.captureStatus,
        'No se pudo aplicar el mejorador a la foto',
        'error',
      );
    }
  };

  proto.onPreviewPhotoEnhancerToggle = function (e) {
    if (!this.isPendingPhotoCapture()) return;
    if (this.previewPhotoEnhancerDebounceId) {
      clearTimeout(this.previewPhotoEnhancerDebounceId);
      this.previewPhotoEnhancerDebounceId = null;
    }
    this.pendingCapture.previewEnhancerEnabled = !!e.target.checked;
    this.updatePreviewPhotoEnhancerControls();
    this.rebuildPendingPhotoPreview();
  };

  proto.onPreviewPhotoEnhancerStrengthInput = function (e) {
    if (!this.isPendingPhotoCapture()) return;
    const strength = this.clamp(parseInt(e.target.value, 10) || 0, 0, 100);
    this.pendingCapture.previewEnhancerStrength = strength;
    if (this.valPreviewPhotoEnhancerStrength) {
      this.valPreviewPhotoEnhancerStrength.textContent = `${strength}%`;
    }
    if (this.pendingCapture.previewEnhancerEnabled) {
      if (this.previewPhotoEnhancerDebounceId) {
        clearTimeout(this.previewPhotoEnhancerDebounceId);
      }
      this.previewPhotoEnhancerDebounceId = setTimeout(() => {
        this.previewPhotoEnhancerDebounceId = null;
        this.rebuildPendingPhotoPreview();
      }, 180);
    }
  };

  proto.updateCaptureCountdownUI = function () {
    if (!this.captureCountdown) return;
    this.captureCountdown.classList.toggle(
      'hidden',
      !this.isPhotoCountdownActive,
    );
    this.captureCountdown.classList.toggle(
      'is-final',
      this.isPhotoCountdownActive && this.photoCountdownRemaining <= 1,
    );
    if (this.captureCountdownValue) {
      this.captureCountdownValue.textContent = String(
        Math.max(1, this.photoCountdownRemaining),
      );
    }
  };

  proto.cancelPhotoCountdown = function (showMessage = true) {
    if (this.photoCountdownTimer) {
      clearInterval(this.photoCountdownTimer);
      this.photoCountdownTimer = null;
    }
    const wasActive = this.isPhotoCountdownActive;
    this.isPhotoCountdownActive = false;
    this.photoCountdownRemaining = 0;
    this.updateCaptureCountdownUI();
    this.updateCaptureButtons();

    if (showMessage && wasActive) {
      this.showStatus(this.captureStatus, 'Temporizador cancelado', 'warning');
      setTimeout(() => this.hideStatus(this.captureStatus), 1400);
    }
  };

  proto.validatePhotoCaptureReady = function () {
    if (!this.isRunning) {
      this.showStatus(
        this.captureStatus,
        'Primero encendé la cámara',
        'warning',
      );
      return false;
    }
    if (this.isCapturePreviewOpen()) {
      this.showStatus(
        this.captureStatus,
        'Primero cerrá la vista previa actual',
        'info',
      );
      return false;
    }
    const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
    if (this.videoEl.readyState < 2 || sourceWidth <= 1 || sourceHeight <= 1) {
      this.showStatus(
        this.captureStatus,
        'Esperá un momento y volvé a sacar la foto',
        'info',
      );
      return false;
    }
    return true;
  };

  proto.startPhotoCountdown = function (seconds) {
    this.cancelPhotoCountdown(false);
    this.isPhotoCountdownActive = true;
    this.photoCountdownRemaining = seconds;
    this.updateCaptureCountdownUI();
    this.updateCaptureButtons();
    this.showStatus(this.captureStatus, `Foto en ${seconds} segundos`, 'info');

    this.photoCountdownTimer = setInterval(() => {
      this.photoCountdownRemaining -= 1;
      if (this.photoCountdownRemaining <= 0) {
        clearInterval(this.photoCountdownTimer);
        this.photoCountdownTimer = null;
        this.isPhotoCountdownActive = false;
        this.updateCaptureCountdownUI();
        this.updateCaptureButtons();
        void this.takePhoto();
        return;
      }
      this.updateCaptureCountdownUI();
      this.showStatus(
        this.captureStatus,
        `Foto en ${this.photoCountdownRemaining} segundos`,
        'info',
      );
    }, 1000);
  };

  proto.requestPhotoCapture = function () {
    if (this.isPhotoCountdownActive) {
      this.cancelPhotoCountdown(true);
      return;
    }

    const timerSeconds = this.normalizeCaptureTimerSeconds(
      this.imageSettings.captureTimerSeconds,
    );
    if (timerSeconds > 0) {
      if (!this.validatePhotoCaptureReady()) return;
      this.startPhotoCountdown(timerSeconds);
      return;
    }

    void this.takePhoto();
  };

  proto.updateCaptureButtons = function () {
    const previewOpen = this.isCapturePreviewOpen();
    const lockCaptureSettings =
      this.isRecording || previewOpen || this.isPhotoCountdownActive;
    const lockDetectorControls = previewOpen;

    if (this.btnTakePhoto) {
      this.btnTakePhoto.disabled =
        (!this.isRunning || this.isRecording || previewOpen) &&
        !this.isPhotoCountdownActive;
      this.btnTakePhoto.innerHTML = this.isPhotoCountdownActive
        ? '<i class="fa-solid fa-xmark"></i> Cancelar timer'
        : '<i class="fa-solid fa-camera"></i> Sacar foto';
    }
    if (this.btnRecord)
      this.btnRecord.disabled =
        (!this.isRunning && !this.isRecording) ||
        previewOpen ||
        this.isPhotoCountdownActive;
    if (this.videoFormatSelect)
      this.videoFormatSelect.disabled = lockCaptureSettings;
    if (this.sldJpegQuality) this.sldJpegQuality.disabled = lockCaptureSettings;
    if (this.captureTimerSelect)
      this.captureTimerSelect.disabled = lockCaptureSettings;
    if (this.chkQualityEnhancer)
      this.chkQualityEnhancer.disabled = lockCaptureSettings;
    if (this.sldQualityEnhancerStrength) {
      this.sldQualityEnhancerStrength.disabled =
        lockCaptureSettings || !this.imageSettings.qualityEnhancer;
    }

    if (this.btnRecord) {
      if (this.isRecording) {
        this.btnRecord.classList.add('recording');
        this.btnRecord.innerHTML = '<i class="fa-solid fa-stop"></i> Detener';
      } else {
        this.btnRecord.classList.remove('recording');
        this.btnRecord.innerHTML =
          '<i class="fa-solid fa-circle-dot"></i> Grabar';
      }
    }

    if (this.btnMobileTakePhoto) {
      this.btnMobileTakePhoto.disabled =
        (!this.isRunning || this.isRecording || previewOpen) &&
        !this.isPhotoCountdownActive;
      this.btnMobileTakePhoto.classList.toggle(
        'is-countdown',
        this.isPhotoCountdownActive,
      );
      this.btnMobileTakePhoto.innerHTML = this.isPhotoCountdownActive
        ? '<i class="fa-solid fa-xmark"></i>'
        : '<i class="fa-solid fa-camera"></i>';
    }
    if (this.selMobileCaptureTimer)
      this.selMobileCaptureTimer.disabled = lockCaptureSettings;
    if (this.btnMobileEffectsDock) {
      this.btnMobileEffectsDock.disabled = previewOpen;
    }
    if (this.btnMobileRecord) {
      this.btnMobileRecord.disabled =
        (!this.isRunning && !this.isRecording) ||
        previewOpen ||
        this.isPhotoCountdownActive;
      this.btnMobileRecord.classList.toggle('is-recording', this.isRecording);
      this.btnMobileRecord.innerHTML = this.isRecording
        ? '<i class="fa-solid fa-stop"></i>'
        : '<i class="fa-solid fa-circle-dot"></i>';
    }
    if (this.btnMobileBlobToggle)
      this.btnMobileBlobToggle.disabled = lockDetectorControls;
    if (this.btnMobileFaceToggle)
      this.btnMobileFaceToggle.disabled = lockDetectorControls;
    if (this.btnMobileBlinkToggle)
      this.btnMobileBlinkToggle.disabled = lockDetectorControls;
    if (this.btnMobileColorPick)
      this.btnMobileColorPick.disabled =
        !this.chkBlobTracking.checked ||
        !this.isRunning ||
        lockDetectorControls;
    if (this.inpMobileBlobColor)
      this.inpMobileBlobColor.disabled =
        !this.chkBlobTracking.checked || lockDetectorControls;
    if (this.inpMobileFaceColor)
      this.inpMobileFaceColor.disabled =
        !this.chkFaceDetection.checked || lockDetectorControls;
    if (this.inpMobileFaceLabel)
      this.inpMobileFaceLabel.disabled =
        !this.chkFaceDetection.checked || lockDetectorControls;

    if (previewOpen) {
      this.setMobileFxPanelVisible(false);
    }
  };

  proto.canvasToBlobAsync = function (sourceCanvas, mimeType, quality) {
    return new Promise((resolve) => {
      sourceCanvas.toBlob((blob) => resolve(blob), mimeType, quality);
    });
  };

  proto.ensureRecordingCanvas = function () {
    const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
    const { width: recordingWidth, height: recordingHeight } =
      this.getEffectiveFrameDimensions(sourceWidth, sourceHeight);
    this.renderEngine.ensureRecordingCanvas(recordingWidth, recordingHeight);
    return this.recordingCanvas;
  };

  proto.ensureRecordingEnhancerBuffer = function (width, height) {
    this.renderEngine.ensureRecordingEnhancerBuffer(width, height);
    return this.recordingEnhancerCanvas;
  };

  proto.getPreferredRecordingFps = function () {
    const sourceFps = Number(this.cameraManager.getStreamSettings().frameRate);
    return this.clamp(Math.round(sourceFps || this.DEFAULT_CAMERA_FPS), 1, 120);
  };

  proto.normalizeVideoFps = function (value) {
    const fps = Number(value);
    if (!Number.isFinite(fps) || fps <= 0) return null;
    return this.clamp(Math.round(fps * 1000) / 1000, 1, 240);
  };

  proto.snapVideoSourceFps = function (value) {
    const fps = this.normalizeVideoFps(value);
    if (!fps) return null;
    let best = fps;
    let bestDiff = Infinity;
    for (const candidate of this.COMMON_VIDEO_FPS) {
      const diff = Math.abs(fps - candidate);
      if (diff < bestDiff && diff <= 0.08) {
        bestDiff = diff;
        best = candidate;
      }
    }
    return best;
  };

  proto.formatVideoFps = function (value) {
    const fps = this.normalizeVideoFps(value);
    if (!fps) return '—';
    return Number.isInteger(fps)
      ? String(fps)
      : fps.toFixed(3).replace(/\.?0+$/, '');
  };

  proto.formatVideoBitrate = function (value) {
    return `${(Math.max(0, Number(value) || 0) / 1_000_000).toFixed(1)} Mbps`;
  };

  proto.getVideoExportFps = function () {
    return (
      this.normalizeVideoFps(this.videoSourceFps) || this.DEFAULT_CAMERA_FPS
    );
  };

  proto.readFpsFromCaptureStream = function (video) {
    if (typeof video.captureStream !== 'function') return null;
    const stream = video.captureStream();
    const track = stream.getVideoTracks()[0];
    const settingsFps = Number(track?.getSettings?.().frameRate);
    stream.getTracks().forEach((t) => t.stop());
    return this.snapVideoSourceFps(settingsFps);
  };

  proto.probeVideoFrameRate = function (video, calculateFrameRate) {
    if (typeof video.requestVideoFrameCallback !== 'function')
      return Promise.resolve(null);
    const savedTime = video.currentTime;
    const wasPaused = video.paused;
    this.frameCount = 0;
    let callbackId = null;
    const mediaTimes = [];

    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(
        () => finish(calculateFrameRate(mediaTimes)),
        3500,
      );
      const finish = (fps) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (
          callbackId != null &&
          typeof video.cancelVideoFrameCallback === 'function'
        ) {
          video.cancelVideoFrameCallback(callbackId);
        }
        video.pause();
        video.currentTime = savedTime;
        if (!wasPaused) void video.play().catch(() => {});
        resolve(this.snapVideoSourceFps(fps));
      };

      const onFrame = (_now, metadata) => {
        this.frameCount += 1;
        if (metadata && Number.isFinite(metadata.mediaTime)) {
          const previousTime = mediaTimes.at(-1);
          if (
            previousTime == null ||
            metadata.mediaTime - previousTime > 0.0005
          ) {
            mediaTimes.push(metadata.mediaTime);
          }
        }
        if (mediaTimes.length >= 25) {
          finish(calculateFrameRate(mediaTimes));
          return;
        }
        if (this.frameCount >= 120) {
          finish(calculateFrameRate(mediaTimes));
          return;
        }
        callbackId = video.requestVideoFrameCallback(onFrame);
      };

      void video.play().catch(() => finish(null));
      callbackId = video.requestVideoFrameCallback(onFrame);
    });
  };

  proto.detectVideoSourceFps = async function (video, calculateFrameRate) {
    const probed = await this.probeVideoFrameRate(video, calculateFrameRate);
    if (probed) return probed;

    const fromStream = this.readFpsFromCaptureStream(video);
    if (fromStream) return fromStream;

    const quality = video.getVideoPlaybackQuality?.();
    if (quality && video.currentTime > 0.2) {
      const measured = quality.totalVideoFrames / video.currentTime;
      const normalized = this.snapVideoSourceFps(measured);
      if (normalized) return normalized;
    }

    return this.DEFAULT_CAMERA_FPS;
  };

  proto.getRecommendedVideoBitrate = function (width, height, fps) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const safeFps = this.clamp(
      this.normalizeVideoFps(fps) || this.DEFAULT_CAMERA_FPS,
      1,
      240,
    );
    const bitsPerPixelFrame = this.imageSettings.qualityEnhancer ? 0.22 : 0.18;
    const estimate = Math.round(
      safeWidth * safeHeight * safeFps * bitsPerPixelFrame,
    );
    return Math.max(
      this.videoSourceAverageBitrate,
      this.clamp(estimate, 8000000, 80000000),
    );
  };

  proto.drawEnhancedFrameToContext = function (
    targetCtx,
    sourceCanvas,
    width,
    height,
    strengthPct,
    forExport = false,
  ) {
    const amount = this.clamp((strengthPct || 0) / 100, 0, 1);
    const brightness = 100 + amount * 4;
    const contrast = 100 + amount * 14;
    const saturation = 100 + amount * 12;

    targetCtx.save();
    targetCtx.clearRect(0, 0, width, height);
    targetCtx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
    targetCtx.restore();

    if (forExport && amount > 0.05) {
      const imageData = targetCtx.getImageData(0, 0, width, height);
      this.applySharpenFilter(
        imageData,
        this.clamp(0.18 + amount * 0.62, 0, 1),
      );
      targetCtx.putImageData(imageData, 0, 0);
    } else if (!forExport && amount >= 0.22) {
      targetCtx.save();
      targetCtx.globalCompositeOperation = 'overlay';
      targetCtx.globalAlpha = 0.05 + amount * 0.1;
      targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
      targetCtx.restore();
    }
  };

  proto.renderSourceFrameBuffer = function (
    applyQualityEnhancer = false,
    mode = 'recording',
  ) {
    if (this.videoEl.readyState < 2) return;

    this.ensureRecordingCanvas();
    if (!this.recordingCanvas || !this.recordingCtx) return;

    this.renderProcessedFrame(this.recordingCanvas, this.recordingCtx, mode);

    if (applyQualityEnhancer && this.imageSettings.qualityEnhancer) {
      const enhancerBuffer = this.ensureRecordingEnhancerBuffer(
        this.recordingCanvas.width,
        this.recordingCanvas.height,
      );
      if (this.recordingEnhancerCtx) {
        this.recordingEnhancerCtx.clearRect(
          0,
          0,
          enhancerBuffer.width,
          enhancerBuffer.height,
        );
        this.recordingEnhancerCtx.drawImage(
          this.recordingCanvas,
          0,
          0,
          enhancerBuffer.width,
          enhancerBuffer.height,
        );
        this.drawEnhancedFrameToContext(
          this.recordingCtx,
          enhancerBuffer,
          this.recordingCanvas.width,
          this.recordingCanvas.height,
          this.imageSettings.qualityEnhancerStrength,
          mode === 'export',
        );
      }
    }
  };

  proto.blitProcessedFrameToPreview = function () {
    if (
      !this.recordingCanvas ||
      this.recordingCanvas.width === 0 ||
      this.canvas.width === 0
    )
      return;
    this.ctx.drawImage(
      this.recordingCanvas,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
  };

  proto.copyFrameToRecordingCanvas = function () {
    this.renderSourceFrameBuffer(true);
  };

  proto.buildPhotoBlobFromCanvas = async function (
    baseCanvas,
    enhancerEnabled,
    enhancerStrength,
  ) {
    if (!baseCanvas || baseCanvas.width === 0 || baseCanvas.height === 0) {
      throw new Error('photo_base_canvas_invalid');
    }

    if (!enhancerEnabled) {
      const rawBlob = await this.canvasToBlobAsync(
        baseCanvas,
        'image/jpeg',
        this.imageSettings.jpegQuality / 100,
      );
      if (!rawBlob) throw new Error('photo_blob_failed');
      return {
        blob: rawBlob,
        width: baseCanvas.width,
        height: baseCanvas.height,
      };
    }

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = baseCanvas.width;
    exportCanvas.height = baseCanvas.height;
    const exportCtx = exportCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    this.drawEnhancedFrameToContext(
      exportCtx,
      baseCanvas,
      exportCanvas.width,
      exportCanvas.height,
      enhancerStrength,
      true,
    );

    const blob = await this.canvasToBlobAsync(
      exportCanvas,
      'image/jpeg',
      this.imageSettings.jpegQuality / 100,
    );
    if (!blob) throw new Error('photo_blob_failed');
    return {
      blob,
      width: exportCanvas.width,
      height: exportCanvas.height,
    };
  };

  proto.buildPhotoCaptureSnapshot = async function (
    enhancerEnabled,
    enhancerStrength,
  ) {
    const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
    if (sourceWidth <= 1 || sourceHeight <= 1) {
      throw new Error('source_frame_unavailable');
    }

    const { width: captureWidth, height: captureHeight } =
      this.getEffectiveFrameDimensions(sourceWidth, sourceHeight);
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = captureWidth;
    baseCanvas.height = captureHeight;
    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
    this.renderProcessedFrame(baseCanvas, baseCtx, 'capture');

    const { blob, width, height } = await this.buildPhotoBlobFromCanvas(
      baseCanvas,
      enhancerEnabled,
      enhancerStrength,
    );
    return {
      blob,
      width,
      height,
      baseCanvas,
    };
  };

  proto.takePhoto = async function () {
    if (!this.validatePhotoCaptureReady()) return;

    try {
      const initialEnhancerEnabled = !!this.imageSettings.qualityEnhancer;
      const initialEnhancerStrength =
        this.imageSettings.qualityEnhancerStrength;
      const { blob, width, height, baseCanvas } =
        await this.buildPhotoCaptureSnapshot(
          initialEnhancerEnabled,
          initialEnhancerStrength,
        );
      const filename = `hatewebcam-photo-${this.timestamp()}.jpg`;
      this.openCapturePreview({
        kind: 'photo',
        blob,
        baseCanvas,
        filename,
        meta: {
          width,
          height,
          size: blob.size,
          format: 'JPEG',
          jpegQuality: this.imageSettings.jpegQuality,
          enhanced: initialEnhancerEnabled,
          enhancerStrength: initialEnhancerStrength,
        },
      });
      this.showStatus(this.captureStatus, 'Foto lista en vista previa', 'info');
    } catch (err) {
      console.error('Error taking photo:', err);
      this.showStatus(this.captureStatus, 'No se pudo tomar la foto', 'error');
    }
  };

  proto.toggleRecording = function () {
    if (this.isRecording) {
      this.stopRecording(true);
    } else {
      this.startRecording();
    }
  };

  proto.startRecording = function () {
    if (this.isPhotoCountdownActive) {
      this.showStatus(
        this.captureStatus,
        'Cancelá el temporizador antes de grabar',
        'info',
      );
      return;
    }
    if (!this.isRunning) {
      this.showStatus(
        this.captureStatus,
        'Primero encendé la cámara',
        'warning',
      );
      return;
    }
    if (this.isCapturePreviewOpen()) {
      this.showStatus(
        this.captureStatus,
        'Primero cierra la vista previa actual',
        'info',
      );
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      this.showStatus(
        this.captureStatus,
        'Tu navegador no soporta grabación',
        'error',
      );
      return;
    }

    const recordingProfile = this.getRecordingProfile();
    if (!recordingProfile) {
      this.showStatus(
        this.captureStatus,
        'No hay formato de video compatible',
        'error',
      );
      return;
    }

    try {
      this.recordingChunks = [];

      this.ensureRecordingCanvas();
      if (
        this.recordingCanvas.width === 0 ||
        this.recordingCanvas.height === 0
      ) {
        this.showStatus(
          this.captureStatus,
          'Esperá un momento y reintentá la grabación',
          'info',
        );
        return;
      }
      this.currentRecordingMimeType = recordingProfile.mimeType;
      this.currentRecordingExt = recordingProfile.extension;
      this.copyFrameToRecordingCanvas();
      this.currentRecordingFps = this.getPreferredRecordingFps();
      this.currentRecordingBitrate = this.getRecommendedVideoBitrate(
        this.recordingCanvas.width,
        this.recordingCanvas.height,
        this.currentRecordingFps,
      );

      this.recordingStream = this.recordingCanvas.captureStream(
        this.currentRecordingFps,
      );
      this.mediaRecorder = new MediaRecorder(this.recordingStream, {
        mimeType: recordingProfile.mimeType,
        videoBitsPerSecond: this.currentRecordingBitrate,
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.recordingChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        const chunks = this.recordingChunks;
        this.recordingChunks = [];
        const recordedWidth = this.recordingCanvas
          ? this.recordingCanvas.width
          : this.canvas.width;
        const recordedHeight = this.recordingCanvas
          ? this.recordingCanvas.height
          : this.canvas.height;

        if (this.recordingStream) {
          this.recordingStream.getTracks().forEach((t) => t.stop());
          this.recordingStream = null;
        }

        const shouldSave = chunks.length > 0;
        this.mediaRecorder = null;
        const savedMimeType = this.currentRecordingMimeType;
        const savedExtension = this.currentRecordingExt;
        this.currentRecordingMimeType = '';
        this.currentRecordingExt = 'webm';

        if (shouldSave) {
          const blob = new Blob(chunks, {
            type: savedMimeType || 'video/webm',
          });
          const filename = `hatewebcam-record-${this.timestamp()}.${savedExtension}`;
          this.openCapturePreview({
            kind: 'video',
            blob,
            filename,
            meta: {
              width: recordedWidth,
              height: recordedHeight,
              size: blob.size,
              format: savedExtension.toUpperCase(),
              durationSec: this.lastRecordingDurationSec,
              fps: this.currentRecordingFps,
              bitrate: this.currentRecordingBitrate,
              enhanced: !!this.imageSettings.qualityEnhancer,
              enhancerStrength: this.imageSettings.qualityEnhancerStrength,
            },
          });
          this.showStatus(
            this.captureStatus,
            'Video listo en vista previa',
            'info',
          );
        }

        this.currentRecordingBitrate = 6000000;
        this.currentRecordingFps = 30;
        this.lastRecordingDurationSec = 0;
      };

      if (recordingProfile.fallbackMessage) {
        this.showStatus(
          this.captureStatus,
          recordingProfile.fallbackMessage,
          'info',
        );
      }

      this.mediaRecorder.start(250);
      this.isRecording = true;
      this.recordingStartTs = Date.now();
      if (this.recordingTimer) clearInterval(this.recordingTimer);
      this.recordingTimer = setInterval(() => {
        if (!this.isRecording) return;
        const sec = Math.floor((Date.now() - this.recordingStartTs) / 1000);
        this.showStatus(
          this.captureStatus,
          `Grabando ${this.formatDuration(sec)}`,
          'warning',
        );
      }, 300);

      this.updateCaptureButtons();
    } catch (err) {
      console.error('Error starting recording:', err);
      this.showStatus(
        this.captureStatus,
        'No se pudo iniciar la grabación',
        'error',
      );
      this.isRecording = false;
      if (this.recordingStream) {
        this.recordingStream.getTracks().forEach((t) => t.stop());
        this.recordingStream = null;
      }
      this.mediaRecorder = null;
      this.currentRecordingMimeType = '';
      this.currentRecordingExt = 'webm';
      this.currentRecordingBitrate = 6000000;
      this.currentRecordingFps = 30;
      this.lastRecordingDurationSec = 0;
      this.updateCaptureButtons();
    }
  };

  proto.stopRecording = function (saveFile) {
    if (!this.isRecording && !this.mediaRecorder) return;

    this.isRecording = false;
    if (saveFile && this.recordingStartTs > 0) {
      this.lastRecordingDurationSec = Math.max(
        0,
        (Date.now() - this.recordingStartTs) / 1000,
      );
    } else {
      this.lastRecordingDurationSec = 0;
    }
    this.recordingStartTs = 0;

    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }

    this.updateCaptureButtons();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (!saveFile) {
      this.recordingChunks = [];
      if (this.recordingStream) {
        this.recordingStream.getTracks().forEach((t) => t.stop());
        this.recordingStream = null;
      }
      this.mediaRecorder = null;
      this.currentRecordingMimeType = '';
      this.currentRecordingExt = 'webm';
      this.currentRecordingBitrate = 6000000;
      this.currentRecordingFps = 30;
      this.lastRecordingDurationSec = 0;
    }
  };

  proto.openCapturePreview = function (capture) {
    if (!this.capturePreviewModal || !capture) return;

    this.clearPendingCapture(true);
    const objectUrl = URL.createObjectURL(capture.blob);
    const initialPreviewEnhancerEnabled =
      capture.kind === 'photo'
        ? !!(capture.meta && typeof capture.meta.enhanced === 'boolean'
            ? capture.meta.enhanced
            : this.imageSettings.qualityEnhancer)
        : false;
    const parsedPreviewEnhancerStrength = parseInt(
      capture.meta && capture.meta.enhancerStrength,
      10,
    );
    const initialPreviewEnhancerStrength =
      capture.kind === 'photo'
        ? this.clamp(
            Number.isFinite(parsedPreviewEnhancerStrength)
              ? parsedPreviewEnhancerStrength
              : this.imageSettings.qualityEnhancerStrength,
            0,
            100,
          )
        : 0;

    this.pendingCapture = {
      ...capture,
      objectUrl,
      previewEnhancerEnabled: initialPreviewEnhancerEnabled,
      previewEnhancerStrength: initialPreviewEnhancerStrength,
    };
    this.photoPreviewRenderToken++;

    if (this.capturePreviewTitle) {
      this.capturePreviewTitle.innerHTML =
        capture.kind === 'video'
          ? '<i class="fa-solid fa-film"></i> Vista previa de video'
          : '<i class="fa-solid fa-image"></i> Vista previa de foto';
    }
    if (this.capturePreviewFilename) {
      this.capturePreviewFilename.textContent = capture.filename;
    }
    if (this.btnDownloadCapture) {
      this.btnDownloadCapture.innerHTML =
        capture.kind === 'video'
          ? '<i class="fa-solid fa-download"></i> Descargar video'
          : '<i class="fa-solid fa-download"></i> Descargar foto';
    }

    if (this.capturePreviewImage) {
      this.capturePreviewImage.classList.toggle(
        'hidden',
        capture.kind !== 'photo',
      );
      if (capture.kind === 'photo') this.capturePreviewImage.src = objectUrl;
      else this.capturePreviewImage.removeAttribute('src');
    }

    if (this.capturePreviewVideo) {
      this.capturePreviewVideo.classList.toggle(
        'hidden',
        capture.kind !== 'video',
      );
      if (capture.kind === 'video') {
        this.capturePreviewVideo.src = objectUrl;
        this.capturePreviewVideo.currentTime = 0;
        this.capturePreviewVideo.load();
      } else {
        this.capturePreviewVideo.pause();
        this.capturePreviewVideo.removeAttribute('src');
        this.capturePreviewVideo.load();
      }
    }

    this.syncPreviewPhotoTools();
    this.renderCapturePreviewInfo(capture.meta || {}, capture.kind);
    this.capturePreviewModal.classList.remove('hidden');
    this.activateModalFocusTrap(
      this.capturePreviewModal,
      this.btnDownloadCapture,
    );
    this.updateCaptureButtons();
  };

  proto.renderCapturePreviewInfo = function (meta, kind) {
    if (!this.capturePreviewInfo) return;
    this.capturePreviewInfo.innerHTML = '';

    const rows = [
      ['Tipo', kind === 'video' ? 'Video' : 'Foto'],
      ['Resolucion', `${meta.width || 0}x${meta.height || 0}`],
      ['Formato', meta.format || (kind === 'video' ? 'WEBM/MP4' : 'JPEG')],
      ['Tamano', this.formatBytes(meta.size || 0)],
    ];

    if (meta.durationSec != null)
      rows.push(['Duracion', this.formatDurationDetailed(meta.durationSec)]);
    if (meta.jpegQuality != null)
      rows.push(['Calidad JPEG', `${meta.jpegQuality}%`]);
    if (meta.fps != null) rows.push(['FPS', `${meta.fps}`]);
    if (meta.bitrate != null)
      rows.push(['Bitrate', `${(meta.bitrate / 1000000).toFixed(1)} Mbps`]);

    const enhancerLabel = meta.enhanced
      ? `Activo (${meta.enhancerStrength || 0}%)`
      : 'Desactivado';
    rows.push(['Mejorador', enhancerLabel]);

    for (const [key, value] of rows) {
      const row = document.createElement('div');
      row.className = 'capture-preview-row';
      const keyEl = document.createElement('div');
      keyEl.className = 'capture-preview-key';
      keyEl.textContent = key;
      const valueEl = document.createElement('div');
      valueEl.className = 'capture-preview-value';
      valueEl.textContent = value;
      row.appendChild(keyEl);
      row.appendChild(valueEl);
      this.capturePreviewInfo.appendChild(row);
    }
  };

  proto.clearPendingCapture = function (silent = false) {
    this.photoPreviewRenderToken++;
    if (this.previewPhotoEnhancerDebounceId) {
      clearTimeout(this.previewPhotoEnhancerDebounceId);
      this.previewPhotoEnhancerDebounceId = null;
    }
    if (!this.pendingCapture) {
      this.syncPreviewPhotoTools();
      return;
    }

    if (this.pendingCapture.objectUrl) {
      URL.revokeObjectURL(this.pendingCapture.objectUrl);
    }

    if (this.capturePreviewImage) {
      this.capturePreviewImage.removeAttribute('src');
      this.capturePreviewImage.classList.add('hidden');
    }

    if (this.capturePreviewVideo) {
      this.capturePreviewVideo.pause();
      this.capturePreviewVideo.removeAttribute('src');
      this.capturePreviewVideo.load();
      this.capturePreviewVideo.classList.add('hidden');
    }

    this.pendingCapture = null;
    if (!silent && this.capturePreviewFilename) {
      this.capturePreviewFilename.textContent = '-';
    }
    if (this.capturePreviewInfo) {
      this.capturePreviewInfo.innerHTML = '';
    }
    if (this.btnDownloadCapture) {
      this.btnDownloadCapture.innerHTML =
        '<i class="fa-solid fa-download"></i> Descargar';
    }
    if (this.capturePreviewTitle) {
      this.capturePreviewTitle.innerHTML =
        '<i class="fa-solid fa-image"></i> Vista previa de captura';
    }
    this.syncPreviewPhotoTools();
  };

  proto.closeCapturePreview = function (showDiscardStatus) {
    if (
      !this.capturePreviewModal ||
      this.capturePreviewModal.classList.contains('hidden')
    )
      return;
    this.capturePreviewModal.classList.add('hidden');
    this.deactivateModalFocusTrap(this.capturePreviewModal);
    this.clearPendingCapture(false);
    this.updateCaptureButtons();

    if (showDiscardStatus) {
      this.showStatus(this.captureStatus, 'Captura descartada', 'warning');
      setTimeout(() => this.hideStatus(this.captureStatus), 1800);
    }
  };

  proto.downloadPendingCapture = function () {
    if (!this.pendingCapture) return;

    this.downloadBlob(this.pendingCapture.blob, this.pendingCapture.filename);
    const label = this.pendingCapture.kind === 'video' ? 'Video' : 'Foto';
    this.showStatus(
      this.captureStatus,
      `${label} guardado: ${this.pendingCapture.filename}`,
      'success',
    );
    setTimeout(() => this.hideStatus(this.captureStatus), 2600);
    this.closeCapturePreview(false);
  };

  proto.formatBytes = function (bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exp = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );
    const value = bytes / 1024 ** exp;
    const digits = exp === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return `${value.toFixed(digits)} ${units[exp]}`;
  };

  proto.formatDurationDetailed = function (seconds) {
    const safe = Math.max(0, Math.round(seconds || 0));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  proto.pickSupportedMimeType = function (list) {
    for (const t of list) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  };

  proto.getRecordingProfile = function () {
    const mp4List = [
      'video/mp4;codecs=avc1.64001F,mp4a.40.2',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
    ];
    const webmList = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];

    const desired = this.imageSettings.videoFormat || 'auto';
    let mimeType = '';
    let extension = 'webm';
    let fallbackMessage = '';

    if (desired === 'mp4') {
      mimeType = this.pickSupportedMimeType(mp4List);
      if (!mimeType) {
        mimeType = this.pickSupportedMimeType(webmList);
        extension = 'webm';
        if (mimeType) {
          fallbackMessage =
            'MP4 no disponible en este navegador. Se usará WebM.';
        }
      } else {
        extension = 'mp4';
      }
    } else if (desired === 'webm') {
      mimeType = this.pickSupportedMimeType(webmList);
      if (mimeType) {
        extension = 'webm';
      } else {
        mimeType = this.pickSupportedMimeType(mp4List);
        extension = 'mp4';
        if (mimeType) {
          fallbackMessage =
            'WebM no disponible en este navegador. Se usará MP4.';
        }
      }
    } else {
      mimeType = this.pickSupportedMimeType(mp4List);
      if (mimeType) {
        extension = 'mp4';
      } else {
        mimeType = this.pickSupportedMimeType(webmList);
        extension = 'webm';
      }
    }

    if (!mimeType) return null;
    return { mimeType, extension, fallbackMessage };
  };

  proto.downloadBlob = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  proto.timestamp = function () {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };

  proto.formatDuration = function (seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  proto.showStatus = function (el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = `status-msg ${type}`;
    el.classList.remove('hidden');
  };

  proto.hideStatus = function (el) {
    if (!el) return;
    el.classList.add('hidden');
  };
}
