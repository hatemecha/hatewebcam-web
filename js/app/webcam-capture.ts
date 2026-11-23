import { translateCurrent } from '../../src/lib/i18n/translate.ts';
import {
  patchCaptureChromeState,
  patchCapturePreviewState,
} from '../../src/lib/capture/session-state.ts';
import {
  formatBytes,
  formatDuration,
  formatDurationDetailed,
  getRecommendedVideoBitrate,
  pickSupportedMimeType,
  timestamp,
} from './media-format.ts';

import {
  PhotoCountdown,
  RecordingSession,
} from '../../src/lib/capture/media-sessions.ts';
import { DEFAULT_CAMERA_FPS, type ImageSettings } from './constants.ts';
import { downloadBlob, hideStatus, showStatus } from './feedback.ts';
import type { RenderEngine } from './render-engine.ts';
import type { WebcamCamera } from './webcam-camera.ts';

type CaptureKind = 'photo' | 'video';

interface CaptureMetadata {
  width?: number;
  height?: number;
  size?: number;
  format?: string;
  durationSec?: number;
  jpegQuality?: number;
  fps?: number;
  bitrate?: number;
  enhanced?: boolean;
  enhancerStrength?: number;
}

interface Capture {
  kind: CaptureKind;
  blob: Blob;
  filename: string;
  meta: CaptureMetadata;
  baseCanvas?: HTMLCanvasElement;
}

interface PendingCapture extends Capture {
  objectUrl: string;
  previewEnhancerEnabled: boolean;
  previewEnhancerStrength: number;
}

interface CaptureHost {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  videoEl: HTMLVideoElement;
  sourceMode: 'camera' | 'video';
  isRunning: boolean;
  mobileFxOpen: boolean;
  captureStatus: HTMLElement | null;
  chkBlobTracking: HTMLInputElement | null;
  chkFaceDetection: HTMLInputElement | null;
  videoFormatSelect: HTMLSelectElement | null;
  sldJpegQuality: HTMLInputElement | null;
  chkQualityEnhancer: HTMLInputElement | null;
  sldQualityEnhancerStrength: HTMLInputElement | null;
  imageSettings: ImageSettings;
  camera: Pick<WebcamCamera, 'getStreamSettings'>;
  renderEngine: RenderEngine;
  videoExportPreflight: { width: number; height: number; fps: number } | null;
  videoSourceAverageBitrate: number;
  getSourceFrameDimensions(): { sourceWidth: number; sourceHeight: number };
  getEffectiveFrameDimensions(
    width: number,
    height: number,
  ): { width: number; height: number };
  renderProcessedFrame(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    mode: string,
  ): void;
  applySharpenFilter(imageData: ImageData, amount: number): void;
  normalizeCaptureTimerSeconds(value: unknown): number;
  toggleVisualFxBypass?(): void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export class WebcamCapture {
  private readonly photoCountdown = new PhotoCountdown();
  private readonly recordingSession = new RecordingSession();
  private pendingCapture: PendingCapture | null = null;
  private photoPreviewRenderToken = 0;
  private captureFlashToken = 0;
  private previewPhotoEnhancerDebounceId: ReturnType<typeof setTimeout> | null =
    null;
  private shutterAudioContext: AudioContext | null = null;
  private shutterSoundArmed = false;

  constructor(private readonly host: CaptureHost) {}

  get recording() {
    return this.recordingSession.active;
  }

  dispose(): void {
    this.photoCountdown.cancel();
    this.recordingSession.dispose();
    this.clearPendingCapture();
    void this.shutterAudioContext?.close().catch(() => {});
    this.shutterAudioContext = null;
    this.shutterSoundArmed = false;
  }

  publishCaptureChrome() {
    const seconds = Math.floor(this.recordingSession.elapsedSeconds);
    const format = this.recordingSession.format === 'webm' ? 'WebM' : 'MP4';
    patchCaptureChromeState({
      cameraRunning: !!this.host.isRunning,
      recording: !!this.recordingSession.active,
      countdownActive: !!this.photoCountdown.active,
      countdownRemaining: this.photoCountdown.remaining || 0,
      countdownTotal: this.photoCountdown.total || 0,
      previewOpen: !!this.pendingCapture,
      mobileFxOpen: !!this.host.mobileFxOpen,
      recordingTime: this.recordingSession.active
        ? formatDuration(seconds)
        : '00:00',
      recordingFormat: this.recordingSession.active ? format : 'WebM',
      flashToken: this.captureFlashToken || 0,
      blobEnabled: !!this.host.chkBlobTracking?.checked,
      faceEnabled: !!this.host.chkFaceDetection?.checked,
      lockCaptureSettings: !!(
        this.recordingSession.active ||
        this.pendingCapture ||
        this.photoCountdown.active
      ),
      lockDetectors: !!this.pendingCapture,
    });
  }

  private buildCapturePreviewRows(meta: CaptureMetadata, kind: CaptureKind) {
    const rows: [string, string][] = [
      ['Tipo', kind === 'video' ? 'Video' : 'Foto'],
      ['Resolución', `${meta.width || 0} × ${meta.height || 0}`],
      ['Formato', meta.format || (kind === 'video' ? 'WEBM/MP4' : 'JPEG')],
      ['Tamaño', formatBytes(meta.size || 0)],
    ];
    if (meta.durationSec != null)
      rows.push(['Duración', formatDurationDetailed(meta.durationSec)]);
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
  }

  publishCapturePreview() {
    const capture = this.pendingCapture;
    if (!this.pendingCapture || !capture) {
      patchCapturePreviewState({
        open: false,
        kind: 'none',
        title: 'Captura lista',
        filename: '-',
        downloadLabel: 'Descargar',
        mediaUrl: '',
        rows: [],
        enhancerEnabled: false,
        enhancerStrength:
          this.host.imageSettings?.qualityEnhancerStrength ?? 35,
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
      enhancerStrength: capture.previewEnhancerStrength,
    });
  }

  onGlobalKeyDown(e: KeyboardEvent) {
    if (
      this.host.sourceMode === 'video' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      e.key.toLowerCase() === 'b' &&
      !(
        e.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
      )
    ) {
      this.host.toggleVisualFxBypass?.();
    }
  }

  private syncPreviewPhotoTools() {
    if (this.pendingCapture?.kind !== 'photo') {
      this.publishCapturePreview();
      return;
    }
    const parsedStrength = this.pendingCapture.previewEnhancerStrength;
    const strength = clamp(
      Number.isFinite(parsedStrength)
        ? parsedStrength
        : this.host.imageSettings.qualityEnhancerStrength,
      0,
      100,
    );
    this.pendingCapture.previewEnhancerStrength = strength;
    this.publishCapturePreview();
  }

  private async rebuildPendingPhotoPreview() {
    if (
      this.pendingCapture?.kind !== 'photo' ||
      !this.pendingCapture.baseCanvas
    )
      return;
    const token = ++this.photoPreviewRenderToken;
    const enabled = !!this.pendingCapture.previewEnhancerEnabled;
    const strength = clamp(this.pendingCapture.previewEnhancerStrength, 0, 100);

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
        this.pendingCapture?.kind !== 'photo'
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
      showStatus(
        this.host.captureStatus,
        'No se pudo aplicar el mejorador a la foto',
        'error',
      );
    }
  }

  onPreviewPhotoEnhancerToggle(enabled: boolean) {
    if (this.pendingCapture?.kind !== 'photo') return;
    if (this.previewPhotoEnhancerDebounceId) {
      clearTimeout(this.previewPhotoEnhancerDebounceId);
      this.previewPhotoEnhancerDebounceId = null;
    }
    this.pendingCapture.previewEnhancerEnabled = !!enabled;
    this.publishCapturePreview();
    this.rebuildPendingPhotoPreview();
  }

  onPreviewPhotoEnhancerStrengthInput(value: number) {
    if (this.pendingCapture?.kind !== 'photo') return;
    const strength = clamp(Math.trunc(value) || 0, 0, 100);
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
  }

  cancelPhotoCountdown(showMessage = true) {
    const wasActive = this.photoCountdown.cancel();
    this.updateCaptureButtons();

    if (showMessage && wasActive) {
      showStatus(this.host.captureStatus, 'Temporizador cancelado', 'warning');
      setTimeout(() => hideStatus(this.host.captureStatus), 1400);
    }
  }

  private validatePhotoCaptureReady() {
    if (!this.host.isRunning) {
      showStatus(
        this.host.captureStatus,
        'Primero encendé la cámara',
        'warning',
      );
      return false;
    }
    if (this.pendingCapture) {
      showStatus(
        this.host.captureStatus,
        'Primero cerrá la vista previa actual',
        'info',
      );
      return false;
    }
    const { sourceWidth, sourceHeight } = this.host.getSourceFrameDimensions();
    if (
      this.host.videoEl.readyState < 2 ||
      sourceWidth <= 1 ||
      sourceHeight <= 1
    ) {
      showStatus(
        this.host.captureStatus,
        'Esperá un momento y volvé a sacar la foto',
        'info',
      );
      return false;
    }
    return true;
  }

  private startPhotoCountdown(seconds: number) {
    this.photoCountdown.start(
      seconds,
      (remaining) => {
        this.publishCaptureChrome();
        showStatus(
          this.host.captureStatus,
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
    showStatus(
      this.host.captureStatus,
      translateCurrent('Foto en {seconds} segundos', { seconds }),
      'info',
    );
  }

  requestPhotoCapture() {
    this.armShutterSound();
    if (this.photoCountdown.active) {
      this.cancelPhotoCountdown(true);
      return;
    }

    const timerSeconds = this.host.normalizeCaptureTimerSeconds(
      this.host.imageSettings.captureTimerSeconds,
    );
    if (timerSeconds > 0) {
      if (!this.validatePhotoCaptureReady()) return;
      this.startPhotoCountdown(timerSeconds);
      return;
    }

    void this.takePhoto();
  }

  updateCaptureButtons() {
    const previewOpen = this.pendingCapture !== null;
    const lockCaptureSettings =
      this.recordingSession.active || previewOpen || this.photoCountdown.active;

    if (this.host.videoFormatSelect)
      this.host.videoFormatSelect.disabled = lockCaptureSettings;
    if (this.host.sldJpegQuality)
      this.host.sldJpegQuality.disabled = lockCaptureSettings;
    if (this.host.chkQualityEnhancer)
      this.host.chkQualityEnhancer.disabled = lockCaptureSettings;
    if (this.host.sldQualityEnhancerStrength) {
      this.host.sldQualityEnhancerStrength.disabled =
        lockCaptureSettings || !this.host.imageSettings.qualityEnhancer;
    }

    if (previewOpen) this.host.mobileFxOpen = false;
    this.publishCaptureChrome();
  }

  private canvasToBlobAsync(
    sourceCanvas: HTMLCanvasElement,
    mimeType: string,
    quality: number,
  ) {
    return new Promise<Blob | null>((resolve) => {
      sourceCanvas.toBlob((blob) => resolve(blob), mimeType, quality);
    });
  }

  ensureRecordingCanvas() {
    const { sourceWidth, sourceHeight } = this.host.getSourceFrameDimensions();
    let { width: recordingWidth, height: recordingHeight } =
      this.host.getEffectiveFrameDimensions(sourceWidth, sourceHeight);
    if (
      this.host.sourceMode === 'video' &&
      this.host.videoExportPreflight?.width &&
      this.host.videoExportPreflight?.height
    ) {
      recordingWidth = this.host.videoExportPreflight.width;
      recordingHeight = this.host.videoExportPreflight.height;
    }
    return this.host.renderEngine.ensureRecordingCanvas(
      recordingWidth,
      recordingHeight,
    );
  }

  private ensureRecordingEnhancerBuffer(width: number, height: number) {
    return this.host.renderEngine.ensureRecordingEnhancerBuffer(width, height);
  }

  private getPreferredRecordingFps() {
    const sourceFps = Number(this.host.camera.getStreamSettings().frameRate);
    return clamp(Math.round(sourceFps || DEFAULT_CAMERA_FPS), 1, 120);
  }

  private getRecommendedVideoBitrate(
    width: number,
    height: number,
    fps: number,
  ) {
    return getRecommendedVideoBitrate({
      width,
      height,
      fps,
      qualityEnhancer: !!this.host.imageSettings.qualityEnhancer,
      sourceAverageBitrate: this.host.videoSourceAverageBitrate,
      defaultFps: DEFAULT_CAMERA_FPS,
    });
  }

  private drawEnhancedFrameToContext(
    targetCtx: CanvasRenderingContext2D,
    sourceCanvas: HTMLCanvasElement,
    width: number,
    height: number,
    strengthPct: number,
    forExport = false,
  ) {
    const amount = clamp((strengthPct || 0) / 100, 0, 1);
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
      this.host.applySharpenFilter(
        imageData,
        clamp(0.18 + amount * 0.62, 0, 1),
      );
      targetCtx.putImageData(imageData, 0, 0);
    } else if (!forExport && amount >= 0.22) {
      targetCtx.save();
      targetCtx.globalCompositeOperation = 'overlay';
      targetCtx.globalAlpha = 0.05 + amount * 0.1;
      targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
      targetCtx.restore();
    }
  }

  renderSourceFrameBuffer(
    applyQualityEnhancer = false,
    mode: string = 'recording',
  ) {
    if (this.host.videoEl.readyState < 2) return;

    this.ensureRecordingCanvas();
    if (
      !this.host.renderEngine.recordingCanvas ||
      !this.host.renderEngine.recordingCtx
    )
      return;

    this.host.renderProcessedFrame(
      this.host.renderEngine.recordingCanvas,
      this.host.renderEngine.recordingCtx,
      mode,
    );

    if (applyQualityEnhancer && this.host.imageSettings.qualityEnhancer) {
      const enhancerBuffer = this.ensureRecordingEnhancerBuffer(
        this.host.renderEngine.recordingCanvas.width,
        this.host.renderEngine.recordingCanvas.height,
      );
      if (this.host.renderEngine.recordingEnhancerCtx) {
        this.host.renderEngine.recordingEnhancerCtx.clearRect(
          0,
          0,
          enhancerBuffer.width,
          enhancerBuffer.height,
        );
        this.host.renderEngine.recordingEnhancerCtx.drawImage(
          this.host.renderEngine.recordingCanvas,
          0,
          0,
          enhancerBuffer.width,
          enhancerBuffer.height,
        );
        this.drawEnhancedFrameToContext(
          this.host.renderEngine.recordingCtx,
          enhancerBuffer,
          this.host.renderEngine.recordingCanvas.width,
          this.host.renderEngine.recordingCanvas.height,
          this.host.imageSettings.qualityEnhancerStrength,
          mode === 'export',
        );
      }
    }
  }

  blitProcessedFrameToPreview() {
    if (
      !this.host.renderEngine.recordingCanvas ||
      this.host.renderEngine.recordingCanvas.width === 0 ||
      this.host.canvas.width === 0
    )
      return;
    this.host.ctx.drawImage(
      this.host.renderEngine.recordingCanvas,
      0,
      0,
      this.host.canvas.width,
      this.host.canvas.height,
    );
  }

  private copyFrameToRecordingCanvas() {
    this.renderSourceFrameBuffer(true);
  }

  private async buildPhotoBlobFromCanvas(
    baseCanvas: HTMLCanvasElement,
    enhancerEnabled: boolean,
    enhancerStrength: number,
  ) {
    if (!baseCanvas || baseCanvas.width === 0 || baseCanvas.height === 0) {
      throw new Error('photo_base_canvas_invalid');
    }

    if (!enhancerEnabled) {
      const rawBlob = await this.canvasToBlobAsync(
        baseCanvas,
        'image/jpeg',
        this.host.imageSettings.jpegQuality / 100,
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
    if (!exportCtx) throw new Error('photo_context_unavailable');
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
      this.host.imageSettings.jpegQuality / 100,
    );
    if (!blob) throw new Error('photo_blob_failed');
    return {
      blob,
      width: exportCanvas.width,
      height: exportCanvas.height,
    };
  }

  private async buildPhotoCaptureSnapshot(
    enhancerEnabled: boolean,
    enhancerStrength: number,
  ) {
    const { sourceWidth, sourceHeight } = this.host.getSourceFrameDimensions();
    if (sourceWidth <= 1 || sourceHeight <= 1) {
      throw new Error('source_frame_unavailable');
    }

    const { width: captureWidth, height: captureHeight } =
      this.host.getEffectiveFrameDimensions(sourceWidth, sourceHeight);
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = captureWidth;
    baseCanvas.height = captureHeight;
    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
    if (!baseCtx) throw new Error('photo_context_unavailable');
    this.host.renderProcessedFrame(baseCanvas, baseCtx, 'capture');

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
  }

  private async takePhoto() {
    if (!this.validatePhotoCaptureReady()) return;

    try {
      this.showCaptureFlash();
      this.playShutterSound();
      const initialEnhancerEnabled = !!this.host.imageSettings.qualityEnhancer;
      const initialEnhancerStrength =
        this.host.imageSettings.qualityEnhancerStrength;
      const { blob, width, height, baseCanvas } =
        await this.buildPhotoCaptureSnapshot(
          initialEnhancerEnabled,
          initialEnhancerStrength,
        );
      const filename = `hatewebcam-photo-${timestamp()}.jpg`;
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
          jpegQuality: this.host.imageSettings.jpegQuality,
          enhanced: initialEnhancerEnabled,
          enhancerStrength: initialEnhancerStrength,
        },
      });
      showStatus(this.host.captureStatus, 'Foto lista en vista previa', 'info');
    } catch (err) {
      console.error('Error taking photo:', err);
      showStatus(this.host.captureStatus, 'No se pudo tomar la foto', 'error');
    }
  }

  toggleRecording() {
    if (this.recordingSession.active) {
      this.stopRecording(true);
    } else {
      this.startRecording();
    }
  }

  private showCaptureFlash() {
    this.captureFlashToken = (this.captureFlashToken || 0) + 1;
    this.publishCaptureChrome();
  }

  private armShutterSound() {
    if (!this.host.imageSettings.shutterSound) return;
    try {
      const AudioContextClass =
        globalThis.AudioContext ||
        (
          globalThis as typeof globalThis & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.shutterAudioContext)
        this.shutterAudioContext = new AudioContextClass();
      void this.shutterAudioContext.resume?.().catch(() => {});
      this.shutterSoundArmed = true;
    } catch {
      this.shutterSoundArmed = false;
    }
  }

  private playShutterSound() {
    if (
      !this.host.imageSettings.shutterSound ||
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
  }

  private startRecording() {
    if (this.recordingSession.mediaRecorder) return;
    if (this.photoCountdown.active) {
      showStatus(
        this.host.captureStatus,
        'Cancelá el temporizador antes de grabar',
        'info',
      );
      return;
    }
    if (!this.host.isRunning) {
      showStatus(
        this.host.captureStatus,
        'Primero encendé la cámara',
        'warning',
      );
      return;
    }
    if (this.pendingCapture) {
      showStatus(
        this.host.captureStatus,
        'Primero cierra la vista previa actual',
        'info',
      );
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      showStatus(
        this.host.captureStatus,
        'Tu navegador no soporta grabación',
        'error',
      );
      return;
    }

    const recordingProfile = this.getRecordingProfile();
    if (!recordingProfile) {
      showStatus(
        this.host.captureStatus,
        'No hay formato de video compatible',
        'error',
      );
      return;
    }

    try {
      const canvas = this.ensureRecordingCanvas();
      const { width, height } = canvas;
      if (width === 0 || height === 0) {
        showStatus(
          this.host.captureStatus,
          'Esperá un momento y reintentá la grabación',
          'info',
        );
        return;
      }
      this.copyFrameToRecordingCanvas();
      const fps = this.getPreferredRecordingFps();
      const bitrate = this.getRecommendedVideoBitrate(width, height, fps);
      const { qualityEnhancer, qualityEnhancerStrength } =
        this.host.imageSettings;
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
            filename: `hatewebcam-record-${timestamp()}.${result.extension}`,
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
          showStatus(
            this.host.captureStatus,
            'Video listo en vista previa',
            'info',
          );
        },
      });
      const effectiveFormat =
        recordingProfile.extension === 'webm' ? 'WebM' : 'MP4';
      showStatus(
        this.host.captureStatus,
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
      showStatus(
        this.host.captureStatus,
        'No se pudo iniciar la grabación',
        'error',
      );
      this.updateCaptureButtons();
    }
  }

  stopRecording(saveFile: boolean) {
    if (!this.recordingSession.mediaRecorder) return;
    showStatus(
      this.host.captureStatus,
      saveFile
        ? 'Grabación detenida. Preparando vista previa.'
        : 'Grabación cancelada.',
      'info',
    );
    this.recordingSession.stop(saveFile);
    this.updateCaptureButtons();
  }

  private openCapturePreview(capture: Capture) {
    if (!capture?.blob) return;

    this.clearPendingCapture();
    const objectUrl = URL.createObjectURL(capture.blob);
    const initialPreviewEnhancerEnabled =
      capture.kind === 'photo'
        ? !!(capture.meta && typeof capture.meta.enhanced === 'boolean'
            ? capture.meta.enhanced
            : this.host.imageSettings.qualityEnhancer)
        : false;
    const parsedPreviewEnhancerStrength = capture.meta?.enhancerStrength ?? NaN;
    const initialPreviewEnhancerStrength =
      capture.kind === 'photo'
        ? clamp(
            Number.isFinite(parsedPreviewEnhancerStrength)
              ? parsedPreviewEnhancerStrength
              : this.host.imageSettings.qualityEnhancerStrength,
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
    this.syncPreviewPhotoTools();
    this.updateCaptureButtons();
  }

  clearPendingCapture() {
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
  }

  closeCapturePreview(showDiscardStatus: boolean) {
    if (!this.pendingCapture) return;
    this.clearPendingCapture();
    this.updateCaptureButtons();

    if (showDiscardStatus) {
      showStatus(this.host.captureStatus, 'Captura descartada', 'warning');
      setTimeout(() => hideStatus(this.host.captureStatus), 1800);
    }
  }

  downloadPendingCapture() {
    if (!this.pendingCapture) return;

    downloadBlob(this.pendingCapture.blob, this.pendingCapture.filename);
    const label = this.pendingCapture.kind === 'video' ? 'Video' : 'Foto';
    showStatus(
      this.host.captureStatus,
      `${label} guardado: ${this.pendingCapture.filename}`,
      'success',
    );
    setTimeout(() => hideStatus(this.host.captureStatus), 2600);
    this.closeCapturePreview(false);
  }

  private pickSupportedMimeType(list: readonly string[]) {
    return pickSupportedMimeType(
      list,
      (type) =>
        typeof MediaRecorder !== 'undefined' &&
        MediaRecorder.isTypeSupported(type),
    );
  }

  private getRecordingProfile() {
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

    const desired = this.host.imageSettings.videoFormat || 'auto';
    let mimeType;
    let extension: 'webm' | 'mp4';
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
  }
}
