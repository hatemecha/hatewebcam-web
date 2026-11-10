import { VideoTimeline } from '../../editor/video-timeline.ts';
import { updateShellState } from '../../../src/lib/shell/shell-bridge.mjs';

/** @param {import('../controller.mjs').AppController} proto */
export function applyVideoEditorSourceMixin(proto) {
  proto.setSourceMode = function (mode) {
    if (mode === this.sourceMode) return;
    if (this.isVideoExporting) return;

    if (mode === 'video') {
      this.webcamSessionState = {
        imageSettings: { ...this.imageSettings },
        blob: this.chkBlobTracking.checked,
        face: this.chkFaceDetection.checked,
        blink: this.chkBlinkDetection.checked,
        blobConfig: this.blobTrackingEffect?.getConfig() || null,
        faceConfig: this.faceDetectionEffect?.getConfig() || null,
        blinkConfig: this.blinkDetectionEffect?.getConfig() || null,
      };
      if (this.isRunning) {
        this.cameraManager.stop();
        this.isRunning = false;
        this.cancelRenderLoop();
      }
      this.sourceMode = 'video';
      document.body.classList.add('video-mode');
      document
        .querySelectorAll('.webcam-only')
        .forEach((el) => el.classList.add('hidden'));
      document
        .querySelectorAll('.video-only')
        .forEach((el) => el.classList.remove('hidden'));
      this.mountVideoEffectsControls();
      this.ensureVisualFxLab?.();
      this.setEditorTool('select');
      this.setInspectorTab('project');
      this.applyTimelineZoom();
      updateShellState({ mode: 'video' });
      this.publishWebcamPanel?.();
      this.videoPlaceholderLoading = false;
      this.clearPreviewCanvas();
      void this.resetVideoTimelineDetectors();
      this.updatePreviewPlaceholder();
      this.updateVideoEditorUI();
      return;
    }

    this.disposeVideoSource();
    this.sourceMode = 'camera';
    document.body.classList.remove('video-mode');
    delete document.body.dataset.editorTool;
    this.unmountVideoEffectsControls();
    document
      .querySelectorAll('.video-only')
      .forEach((el) => el.classList.add('hidden'));
    document
      .querySelectorAll('.webcam-only')
      .forEach((el) => el.classList.remove('hidden'));
    updateShellState({ mode: 'camera' });
    this.publishWebcamPanel?.();
    this.setCameraPlaceholderMessage('Iniciando cámara automáticamente...');
    this.updatePreviewPlaceholder();
    void this.restoreWebcamSessionState();
    void this.toggleCamera(true);
  };

  proto.restoreWebcamSessionState = async function () {
    if (!this.webcamSessionState) return;
    this.imageSettings = { ...this.webcamSessionState.imageSettings };
    this.updateImageControlsUI();
    for (const [type, checkbox] of [
      ['blob', this.chkBlobTracking],
      ['face', this.chkFaceDetection],
      ['blink', this.chkBlinkDetection],
    ]) {
      if (checkbox.checked) {
        checkbox.checked = false;
        await this.toggleEffect(type);
      }
      if (this.webcamSessionState[type]) {
        checkbox.checked = true;
        await this.toggleEffect(type);
        const effect =
          type === 'blob'
            ? this.blobTrackingEffect
            : type === 'face'
              ? this.faceDetectionEffect
              : this.blinkDetectionEffect;
        const config = this.webcamSessionState[`${type}Config`];
        if (effect && config) effect.setConfig(config);
      }
    }
    this.webcamSessionState = null;
    this.updateQuickDetectorControlsUI();
    this.updateEffectsInfo();
  };

  proto.disposeVideoSource = function () {
    if (this.isVideoExporting) this.cancelVideoExport();
    this.videoEl.pause();
    this.cancelRenderLoop();
    this.isRunning = false;
    if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
    this.videoObjectUrl = '';
    this.videoSourceFile = null;
    this.videoSourceFps = 30;
    this.videoSourceAverageBitrate = 0;
    this.videoEl.removeAttribute('src');
    this.videoEl.load();
    this.videoTimeline = new VideoTimeline();
    this.editorHistory?.clear();
    this.updateEditorHistoryButtons();
    this.timelineZoom = 1;
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.timelineClipboard = null;
    this.updateTimelineClipboardStatus();
    this.appliedTimelineItemIds = {};
    this.appliedVisualFxClipId = '';
    this.resetVisualFxTemporalState?.({ hard: true });
    this.timelineDetectorSyncPromise = null;
    this.timelineDetectorSyncForce = false;
    this.videoBaseImageSettings = null;
    this.editAssist?.reset();
    this.clearTimelineItemElements();
    this.videoPlaceholderLoading = false;
    if (this.sourceMode === 'video') {
      void this.resetVideoTimelineDetectors();
      this.clearPreviewCanvas();
      this.updatePreviewPlaceholder();
    } else {
      this.updatePreviewPlaceholder();
    }
  };

  proto.loadVideoFile = async function (file) {
    if (!file || !(file instanceof File)) return;
    if (!file.type.startsWith('video/')) {
      this.showStatus(
        this.videoEditorStatus,
        'Elegí un archivo de video válido.',
        'error',
      );
      return;
    }

    this.disposeVideoSource();
    this.videoSourceFile = file;
    this.videoObjectUrl = URL.createObjectURL(file);
    this.videoEl.srcObject = null;
    this.videoEl.src = this.videoObjectUrl;
    this.videoEl.muted = true;
    this.videoEl.preload = 'auto';
    this.showVideoPlaceholderLoading('Leyendo metadata del video...');

    try {
      await new Promise((resolve, reject) => {
        const loaded = () => {
          this.videoEl.removeEventListener('error', failed);
          resolve();
        };
        const failed = () => {
          this.videoEl.removeEventListener('loadedmetadata', loaded);
          reject(new Error('video_decode_failed'));
        };
        this.videoEl.addEventListener('loadedmetadata', loaded, { once: true });
        this.videoEl.addEventListener('error', failed, { once: true });
        this.videoEl.load();
      });
      if (
        !Number.isFinite(this.videoEl.duration) ||
        this.videoEl.duration <= 0 ||
        !this.videoEl.videoWidth ||
        !this.videoEl.videoHeight
      ) {
        throw new Error('video_metadata_invalid');
      }
      this.videoEl.currentTime = Math.min(0.001, this.videoEl.duration);

      const {
        calculateFrameRateFromMediaTimes,
        calculateSourceAverageBitrate,
      } = await import('../../video-export.mjs');
      this.videoSourceFps = await this.detectVideoSourceFps(
        this.videoEl,
        calculateFrameRateFromMediaTimes,
      );
      this.videoSourceAverageBitrate = calculateSourceAverageBitrate(
        file.size,
        this.videoEl.duration,
      );
      this.videoTimeline.setDuration(this.videoEl.duration);
      this.videoBaseImageSettings = this.createVideoBaseImageSettings();
      this.imageSettings = { ...this.videoBaseImageSettings };
      this.isRunning = true;
      this.videoPlaceholderLoading = false;
      this.updatePreviewPlaceholder();
      this.videoSeek.max = String(this.videoEl.duration);
      this.videoTrimStart.max = String(this.videoEl.duration);
      this.videoTrimEnd.max = String(this.videoEl.duration);
      this.videoEffectStart.max = String(this.videoEl.duration);
      this.videoEffectEnd.max = String(this.videoEl.duration);
      this.videoTrimStart.value = '0';
      this.videoTrimEnd.value = this.videoEl.duration.toFixed(2);
      this.videoEffectStart.value = '0';
      this.videoEffectEnd.value = this.videoEl.duration.toFixed(2);
      const pendingProject = this.pendingEditorProject;
      let projectMessage = '';
      if (pendingProject) {
        if (this.editorProjectMatchesSource(pendingProject, file)) {
          this.applyEditorProject(pendingProject);
          this.pendingEditorProject = null;
          projectMessage = 'Proyecto restaurado con el video reimportado.';
        } else {
          projectMessage =
            'El video no coincide con el proyecto cargado. Elegí el archivo original.';
        }
      }
      this.videoFileMeta.textContent = `${file.name} · ${this.formatBytes(file.size)} · ${this.videoEl.videoWidth}×${this.videoEl.videoHeight} · ${this.formatDurationDetailed(this.videoEl.duration)} · ${this.formatVideoFps(this.videoSourceFps)} FPS · ${this.formatVideoBitrate(this.videoSourceAverageBitrate)} estimado`;
      this.frameCount = 0;
      this.lastFpsTime = performance.now();
      this.syncPreviewCanvasMetrics(
        this.videoEl.videoWidth,
        this.videoEl.videoHeight,
        true,
      );
      this.scheduleRenderLoop();
      this.renderVideoTimeline();
      await this.syncVideoTimelineEffects(true);
      this.updateVideoEditorUI();
      this.applyTimelineZoom();
      this.showStatus(
        this.videoEditorStatus,
        projectMessage || 'Video listo.',
        projectMessage && this.pendingEditorProject ? 'warning' : 'success',
      );
      setTimeout(() => this.hideStatus(this.videoEditorStatus), 1800);
    } catch (err) {
      console.error('Error loading video:', err);
      this.disposeVideoSource();
      const message =
        err?.message === 'video_metadata_invalid'
          ? 'El video no contiene resolución o duración válidas.'
          : 'El navegador no puede decodificar este archivo.';
      this.showStatus(this.videoEditorStatus, message, 'error');
      this.updateVideoEditorUI();
    }
  };
}
