import { translateCurrent } from '../../src/lib/i18n/translate.ts';
import {
  patchCaptureChromeState,
  patchCapturePreviewState,
} from '../../src/lib/capture/session-state.ts';
import {
  formatBytes,
  formatDuration,
  formatDurationDetailed,
  formatVideoBitrate,
  formatVideoFps,
  getRecommendedVideoBitrate,
  normalizeVideoFps,
  pickSupportedMimeType,
  timestamp,
} from './media-format.ts';

/** @param {import('./controller.mjs').AppController} proto */
export function applyCaptureMixin(proto) {
  proto.isCapturePreviewOpen = function () {
    return !!this.capturePreviewOpen;
  };

  proto.publishCaptureChrome = function () {
    const seconds = Math.floor(this.recordingSession.elapsedSeconds);
    const format = this.recordingSession.format === 'webm' ? 'WebM' : 'MP4';
    patchCaptureChromeState({
      cameraRunning: !!this.isRunning,
      recording: !!this.recordingSession.active,
      countdownActive: !!this.photoCountdown.active,
      countdownRemaining: this.photoCountdown.remaining || 0,
      countdownTotal: this.photoCountdown.total || 0,
      previewOpen: !!this.capturePreviewOpen,
      mobileFxOpen: !!this.mobileFxOpen,
      recordingTime: this.recordingSession.active
        ? this.formatDuration(seconds)
        : '00:00',
      recordingFormat: this.recordingSession.active ? format : 'WebM',
      flashToken: this.captureFlashToken || 0,
      blobEnabled: !!this.chkBlobTracking?.checked,
      faceEnabled: !!this.chkFaceDetection?.checked,
      lockCaptureSettings: !!(
        this.recordingSession.active ||
        this.capturePreviewOpen ||
        this.photoCountdown.active
      ),
      lockDetectors: !!this.capturePreviewOpen,
    });
  };

  proto.buildCapturePreviewRows = function (meta, kind) {
    const rows = [
      ['Tipo', kind === 'video' ? 'Video' : 'Foto'],
      ['Resolución', `${meta.width || 0} × ${meta.height || 0}`],
      ['Formato', meta.format || (kind === 'video' ? 'WEBM/MP4' : 'JPEG')],
      ['Tamaño', this.formatBytes(meta.size || 0)],
    ];
    if (meta.durationSec != null)
      rows.push(['Duración', this.formatDurationDetailed(meta.durationSec)]);
    if (meta.jpegQuality != null)
      rows.push(['Calidad JPEG', `${meta.jpegQuality}%`]);
    if (meta.fps != null) rows.push(['FPS', `${meta.fps}`]);
    if (meta.bitrate != null)
      rows.push(['Bitrate', `${(meta.bitrate / 1000000).toFixed(1)} Mbps`]);
    rows.push([
      'Mejorador',
      meta.enhanced
        ? translateCurrent('Activo ({strength}%)', {
            strength: meta.enhancerStrength || 0,
          })
        : 'Desactivado',
    ]);
    return rows.map(([key, value]) => ({ key, value }));
  };

  proto.publishCapturePreview = function () {
    const capture = this.pendingCapture;
    if (!this.capturePreviewOpen || !capture) {
      patchCapturePreviewState({
        open: false,
        kind: 'none',
        title: 'Captura lista',
        filename: '-',
        downloadLabel: 'Descargar',
        mediaUrl: '',
        rows: [],
        enhancerEnabled: false,
        enhancerStrength: this.imageSettings?.qualityEnhancerStrength ?? 35,
      });
      return;
    }
    const kind = capture.kind === 'video' ? 'video' : 'photo';
    patchCapturePreviewState({
      open: true,
      kind,
      title: kind === 'video' ? 'Video listo' : 'Foto lista',
      filename: capture.filename || '-',
      downloadLabel: kind === 'video' ? 'Descargar video' : 'Descargar foto',
      mediaUrl: capture.objectUrl || '',
      rows: this.buildCapturePreviewRows(capture.meta || {}, kind),
      enhancerEnabled: !!capture.previewEnhancerEnabled,
      enhancerStrength: this.toFiniteInt(
        capture.previewEnhancerStrength,
        this.imageSettings?.qualityEnhancerStrength ?? 35,
      ),
    });
  };

  proto.onGlobalKeyDown = function (e) {
    if (
      this.sourceMode === 'video' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      e.key.toLowerCase() === 'b' &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)
    ) {
      this.toggleVisualFxBypass?.();
    }
  };

  proto.isPendingPhotoCapture = function () {
    return !!this.pendingCapture && this.pendingCapture.kind === 'photo';
  };

  proto.updatePreviewPhotoEnhancerControls = function () {
    this.publishCapturePreview();
  };

  proto.syncPreviewPhotoTools = function () {
    if (!this.isPendingPhotoCapture()) {
      this.publishCapturePreview();
      return;
    }
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
    this.pendingCapture.previewEnhancerStrength = strength;
    this.publishCapturePreview();
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

      this.publishCapturePreview();
    } catch (err) {
      console.error('Error rebuilding photo preview:', err);
      this.showStatus(
        this.captureStatus,
        'No se pudo aplicar el mejorador a la foto',
        'error',
      );
    }
  };

  proto.onPreviewPhotoEnhancerToggle = function (enabled) {
    if (!this.isPendingPhotoCapture()) return;
    if (this.previewPhotoEnhancerDebounceId) {
      clearTimeout(this.previewPhotoEnhancerDebounceId);
      this.previewPhotoEnhancerDebounceId = null;
    }
    this.pendingCapture.previewEnhancerEnabled = !!enabled;
    this.publishCapturePreview();
    this.rebuildPendingPhotoPreview();
  };

  proto.onPreviewPhotoEnhancerStrengthInput = function (value) {
    if (!this.isPendingPhotoCapture()) return;
    const strength = this.clamp(parseInt(value, 10) || 0, 0, 100);
    this.pendingCapture.previewEnhancerStrength = strength;
    this.publishCapturePreview();
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

  proto.cancelPhotoCountdown = function (showMessage = true) {
    const wasActive = this.photoCountdown.cancel();
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
    this.photoCountdown.start(
      seconds,
      (remaining) => {
        this.publishCaptureChrome();
        this.showStatus(
          this.captureStatus,
          translateCurrent('Foto en {seconds} segundos', {
            seconds: remaining,
          }),
          'info',
        );
      },
      () => {
        this.updateCaptureButtons();
        void this.takePhoto();
      },
    );
    this.updateCaptureButtons();
    this.showStatus(
      this.captureStatus,
      translateCurrent('Foto en {seconds} segundos', { seconds }),
      'info',
    );
  };

  proto.requestPhotoCapture = function () {
    this.armShutterSound();
    if (this.photoCountdown.active) {
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
      this.recordingSession.active || previewOpen || this.photoCountdown.active;

    if (this.videoFormatSelect)
      this.videoFormatSelect.disabled = lockCaptureSettings;
    if (this.sldJpegQuality) this.sldJpegQuality.disabled = lockCaptureSettings;
    if (this.chkQualityEnhancer)
      this.chkQualityEnhancer.disabled = lockCaptureSettings;
    if (this.sldQualityEnhancerStrength) {
      this.sldQualityEnhancerStrength.disabled =
        lockCaptureSettings || !this.imageSettings.qualityEnhancer;
    }

    if (previewOpen) this.mobileFxOpen = false;
    this.publishCaptureChrome();
  };

  proto.canvasToBlobAsync = function (sourceCanvas, mimeType, quality) {
    return new Promise((resolve) => {
      sourceCanvas.toBlob((blob) => resolve(blob), mimeType, quality);
    });
  };

  proto.ensureRecordingCanvas = function () {
    const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
    let { width: recordingWidth, height: recordingHeight } =
      this.getEffectiveFrameDimensions(sourceWidth, sourceHeight);
    if (
      this.sourceMode === 'video' &&
      this.videoExportPreflight?.width &&
      this.videoExportPreflight?.height
    ) {
      recordingWidth = this.videoExportPreflight.width;
      recordingHeight = this.videoExportPreflight.height;
    }
    this.renderEngine.ensureRecordingCanvas(recordingWidth, recordingHeight);
    return this.renderEngine.recordingCanvas;
  };

  proto.ensureRecordingEnhancerBuffer = function (width, height) {
    this.renderEngine.ensureRecordingEnhancerBuffer(width, height);
    return this.renderEngine.recordingEnhancerCanvas;
  };

  proto.getPreferredRecordingFps = function () {
    const sourceFps = Number(this.camera.getStreamSettings().frameRate);
    return this.clamp(Math.round(sourceFps || this.DEFAULT_CAMERA_FPS), 1, 120);
  };

  proto.normalizeVideoFps = function (value) {
    return normalizeVideoFps(value);
  };

  proto.formatVideoFps = function (value) {
    return formatVideoFps(value);
  };

  proto.formatVideoBitrate = function (value) {
    return formatVideoBitrate(value);
  };

  proto.getVideoExportFps = function () {
    return (
      this.videoExportPreflight?.fps ||
      this.getEffectiveVideoExportFps?.() ||
      this.normalizeVideoFps(this.videoSourceFps) ||
      this.DEFAULT_CAMERA_FPS
    );
  };

  proto.getRecommendedVideoBitrate = function (width, height, fps) {
    return getRecommendedVideoBitrate({
      width,
      height,
      fps,
      qualityEnhancer: !!this.imageSettings.qualityEnhancer,
      sourceAverageBitrate: this.videoSourceAverageBitrate,
      defaultFps: this.DEFAULT_CAMERA_FPS,
    });
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
    if (!this.renderEngine.recordingCanvas || !this.renderEngine.recordingCtx)
      return;

    this.renderProcessedFrame(
      this.renderEngine.recordingCanvas,
      this.renderEngine.recordingCtx,
      mode,
    );

    if (applyQualityEnhancer && this.imageSettings.qualityEnhancer) {
      const enhancerBuffer = this.ensureRecordingEnhancerBuffer(
        this.renderEngine.recordingCanvas.width,
        this.renderEngine.recordingCanvas.height,
      );
      if (this.renderEngine.recordingEnhancerCtx) {
        this.renderEngine.recordingEnhancerCtx.clearRect(
          0,
          0,
          enhancerBuffer.width,
          enhancerBuffer.height,
        );
        this.renderEngine.recordingEnhancerCtx.drawImage(
          this.renderEngine.recordingCanvas,
          0,
          0,
          enhancerBuffer.width,
          enhancerBuffer.height,
        );
        this.drawEnhancedFrameToContext(
          this.renderEngine.recordingCtx,
          enhancerBuffer,
          this.renderEngine.recordingCanvas.width,
          this.renderEngine.recordingCanvas.height,
          this.imageSettings.qualityEnhancerStrength,
          mode === 'export',
        );
      }
    }
  };

  proto.blitProcessedFrameToPreview = function () {
    if (
      !this.renderEngine.recordingCanvas ||
      this.renderEngine.recordingCanvas.width === 0 ||
      this.canvas.width === 0
    )
      return;
    this.ctx.drawImage(
      this.renderEngine.recordingCanvas,
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
      this.showCaptureFlash();
      this.playShutterSound();
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
    if (this.recordingSession.active) {
      this.stopRecording(true);
    } else {
      this.startRecording();
    }
  };

  proto.showCaptureFlash = function () {
    this.captureFlashToken = (this.captureFlashToken || 0) + 1;
    this.publishCaptureChrome();
  };

  proto.armShutterSound = function () {
    if (!this.imageSettings.shutterSound) return;
    try {
      const AudioContextClass =
        globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.shutterAudioContext)
        this.shutterAudioContext = new AudioContextClass();
      void this.shutterAudioContext.resume?.().catch(() => {});
      this.shutterSoundArmed = true;
    } catch {
      this.shutterSoundArmed = false;
    }
  };

  proto.playShutterSound = function () {
    if (
      !this.imageSettings.shutterSound ||
      !this.shutterSoundArmed ||
      !this.shutterAudioContext
    )
      return;
    try {
      const audio = this.shutterAudioContext;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(180, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        70,
        audio.currentTime + 0.055,
      );
      gain.gain.setValueAtTime(0.035, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.07);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.075);
    } catch {
      // El sonido es opcional: la captura nunca depende de Web Audio.
    }
  };

  proto.startRecording = function () {
    if (this.recordingSession.mediaRecorder) return;
    if (this.photoCountdown.active) {
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
      const canvas = this.ensureRecordingCanvas();
      const { width, height } = canvas;
      if (width === 0 || height === 0) {
        this.showStatus(
          this.captureStatus,
          'Esperá un momento y reintentá la grabación',
          'info',
        );
        return;
      }
      this.copyFrameToRecordingCanvas();
      const fps = this.getPreferredRecordingFps();
      const bitrate = this.getRecommendedVideoBitrate(width, height, fps);
      const { qualityEnhancer, qualityEnhancerStrength } = this.imageSettings;
      this.recordingSession.start({
        stream: canvas.captureStream(fps),
        mimeType: recordingProfile.mimeType,
        extension: recordingProfile.extension,
        videoBitsPerSecond: bitrate,
        onTick: () => this.publishCaptureChrome(),
        onStopped: (result) => {
          this.updateCaptureButtons();
          if (!result) return;
          this.openCapturePreview({
            kind: 'video',
            blob: result.blob,
            filename: `hatewebcam-record-${this.timestamp()}.${result.extension}`,
            meta: {
              width,
              height,
              size: result.blob.size,
              format: result.extension.toUpperCase(),
              durationSec: result.durationSec,
              fps,
              bitrate,
              enhanced: qualityEnhancer,
              enhancerStrength: qualityEnhancerStrength,
            },
          });
          this.showStatus(
            this.captureStatus,
            'Video listo en vista previa',
            'info',
          );
        },
      });
      const effectiveFormat =
        recordingProfile.extension === 'webm' ? 'WebM' : 'MP4';
      this.showStatus(
        this.captureStatus,
        recordingProfile.fallbackMessage
          ? translateCurrent('{notice} Grabación iniciada en {format}.', {
              notice: translateCurrent(recordingProfile.fallbackMessage),
              format: effectiveFormat,
            })
          : translateCurrent('Grabación iniciada en {format}.', {
              format: effectiveFormat,
            }),
        recordingProfile.fallbackMessage ? 'warning' : 'info',
      );
      this.updateCaptureButtons();
    } catch (err) {
      console.error('Error starting recording:', err);
      this.showStatus(
        this.captureStatus,
        'No se pudo iniciar la grabación',
        'error',
      );
      this.updateCaptureButtons();
    }
  };

  proto.stopRecording = function (saveFile) {
    if (!this.recordingSession.mediaRecorder) return;
    this.showStatus(
      this.captureStatus,
      saveFile
        ? 'Grabación detenida. Preparando vista previa.'
        : 'Grabación cancelada.',
      'info',
    );
    this.recordingSession.stop(saveFile);
    this.updateCaptureButtons();
  };

  proto.openCapturePreview = function (capture) {
    if (!capture?.blob) return;

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
    this.capturePreviewOpen = true;
    this.syncPreviewPhotoTools();
    this.updateCaptureButtons();
  };

  proto.renderCapturePreviewInfo = function (meta, _kind) {
    if (!this.pendingCapture) return;
    this.pendingCapture.meta = { ...(this.pendingCapture.meta || {}), ...meta };
    this.publishCapturePreview();
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
    this.pendingCapture = null;
    this.syncPreviewPhotoTools();
    if (silent) return;
  };

  proto.closeCapturePreview = function (showDiscardStatus) {
    if (!this.capturePreviewOpen) return;
    this.capturePreviewOpen = false;
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
    return formatBytes(bytes);
  };

  proto.formatDurationDetailed = function (seconds) {
    return formatDurationDetailed(seconds);
  };

  proto.pickSupportedMimeType = function (list) {
    return pickSupportedMimeType(
      list,
      (type) =>
        typeof MediaRecorder !== 'undefined' &&
        MediaRecorder.isTypeSupported(type),
    );
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
    let mimeType;
    let extension;
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
    return timestamp();
  };

  proto.formatDuration = function (seconds) {
    return formatDuration(seconds);
  };

  proto.showStatus = function (el, msg, type) {
    if (!el) return;
    el.textContent = translateCurrent(msg);
    el.classList.remove('hidden', 'success', 'warning', 'info', 'error');
    el.classList.add('status-msg', type);
  };

  proto.hideStatus = function (el) {
    if (!el) return;
    el.textContent = '';
    el.classList.add('hidden');
    el.classList.remove('success', 'warning', 'info', 'error');
  };
}
