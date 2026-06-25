import {
  buildEditorExportPreflight,
  diagnoseVideoExportSupport,
  formatObservedExportProgress,
  getEditorChromaColor,
} from '../video-export.mjs';
import { VideoTimeline } from '../editor/video-timeline.mjs';
import { applyVideoEditorClipboardMixin } from './video-editor-clipboard.mjs';
import { applyVideoEditorTimelineMixin } from './video-editor-timeline.mjs';

const VIDEO_END_EPSILON = 0.001;
const VIDEO_EXPORT_PLAYBACK_RATE = 4;
const VIDEO_EFFECT_AUTOMATION_MODES = new Set([
  'fixed',
  'beat-pulse',
  'fade-in',
  'fade-out',
  'alternate-beat',
]);

/** @param {import('./controller.mjs').AppController} proto */
export function applyLocalvideoeditorMixin(proto) {
  applyVideoEditorTimelineMixin(proto);
  applyVideoEditorClipboardMixin(proto);

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
      this.setEditorTool('select');
      this.setInspectorTab('project');
      this.applyTimelineZoom();
      this.btnWebcamMode.classList.remove('is-active');
      this.btnVideoMode.classList.add('is-active');
      this.btnWebcamMode.setAttribute('aria-selected', 'false');
      this.btnVideoMode.setAttribute('aria-selected', 'true');
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
    this.btnVideoMode.classList.remove('is-active');
    this.btnWebcamMode.classList.add('is-active');
    this.btnVideoMode.setAttribute('aria-selected', 'false');
    this.btnWebcamMode.setAttribute('aria-selected', 'true');
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
    this.timelineDetectorSyncPromise = null;
    this.timelineDetectorSyncForce = false;
    this.videoBaseImageSettings = null;
    this.editAssist?.reset();
    this.timelineItems.innerHTML = '';
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
      } = await import('../video-export.mjs');
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

  proto.buildEditorProjectData = function () {
    if (!this.videoSourceFile) return null;
    const timeline = this.videoTimeline.toJSON();
    return {
      version: 1,
      source: {
        name: this.videoSourceFile.name,
        size: this.videoSourceFile.size,
        duration: this.videoTimeline.duration,
        width: this.videoEl.videoWidth || 0,
        height: this.videoEl.videoHeight || 0,
        fps: this.videoSourceFps || 30,
      },
      trim: {
        start: this.videoTimeline.trimStart,
        end: this.videoTimeline.trimEnd,
      },
      timeline: {
        items: timeline.items,
        markers: timeline.markers,
      },
      settings: {
        editorExport: {
          editorExportPreset: this.imageSettings.editorExportPreset,
          editorExportFormat: this.imageSettings.editorExportFormat,
          editorExportMode: this.imageSettings.editorExportMode,
          editorCopyAudio: this.imageSettings.editorCopyAudio,
          experimentalExportFeatures:
            this.imageSettings.experimentalExportFeatures,
          effectsExportChroma: this.imageSettings.effectsExportChroma,
          qualityEnhancer: this.imageSettings.qualityEnhancer,
          qualityEnhancerStrength: this.imageSettings.qualityEnhancerStrength,
        },
        preview: {
          previewQuality: this.imageSettings.previewQuality,
          performanceMode: this.imageSettings.performanceMode,
        },
      },
      editAssist: this.editAssist?.toJSON?.() || null,
    };
  };

  proto.saveEditorProject = function () {
    const project = this.buildEditorProjectData();
    if (!project) {
      this.showStatus(
        this.videoEditorStatus,
        'Importá un video antes de guardar el proyecto.',
        'warning',
      );
      return;
    }
    const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], {
      type: 'application/json',
    });
    const basename =
      this.videoSourceFile.name.replace(/\.[^.]+$/, '') || 'hatewebcam';
    this.downloadBlob(blob, `${basename}.hatewebcam.json`);
    this.showStatus(this.videoEditorStatus, 'Proyecto guardado.', 'success');
  };

  proto.loadEditorProjectFile = async function (file) {
    try {
      const project = this.normalizeEditorProject(
        JSON.parse(await file.text()),
      );
      if (
        this.videoSourceFile &&
        this.editorProjectMatchesSource(project, this.videoSourceFile)
      ) {
        this.applyEditorProject(project);
        this.pendingEditorProject = null;
        this.showStatus(this.videoEditorStatus, 'Proyecto cargado.', 'success');
        return;
      }
      this.pendingEditorProject = project;
      this.showStatus(
        this.videoEditorStatus,
        'Proyecto cargado. Reimportá el video original para restaurarlo.',
        'warning',
      );
    } catch (err) {
      this.showStatus(
        this.videoEditorStatus,
        err?.message === 'invalid_project'
          ? 'El archivo de proyecto no es válido.'
          : 'No se pudo cargar el proyecto.',
        'error',
      );
    }
  };

  proto.normalizeEditorProject = function (project) {
    if (
      !project ||
      project.version !== 1 ||
      !project.source ||
      !project.timeline
    )
      throw new Error('invalid_project');
    return project;
  };

  proto.editorProjectMatchesSource = function (project, file) {
    const source = project?.source || {};
    if (source.name && file?.name && source.name !== file.name) return false;
    if (source.size && file?.size && source.size !== file.size) return false;
    const projectDuration = Number(source.duration);
    if (
      Number.isFinite(projectDuration) &&
      this.videoEl?.duration &&
      Math.abs(projectDuration - this.videoEl.duration) > 0.5
    ) {
      return false;
    }
    return true;
  };

  proto.applyEditorProject = function (project) {
    const duration = Number(project.source?.duration || this.videoEl?.duration);
    this.videoTimeline = VideoTimeline.fromJSON(
      {
        ...project.timeline,
        trim: project.trim,
      },
      Number.isFinite(duration) ? duration : 0,
    );
    const editorExport = project.settings?.editorExport || {};
    Object.assign(this.imageSettings, {
      ...editorExport,
      ...(project.settings?.preview || {}),
    });
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.timelineClipboard = null;
    this.editAssist?.loadMetadata?.(project.editAssist);
    this.editorHistory?.clear();
    this.updateEditorHistoryButtons();
    if (this.videoTrimStart)
      this.videoTrimStart.value = this.videoTimeline.trimStart;
    if (this.videoTrimEnd) this.videoTrimEnd.value = this.videoTimeline.trimEnd;
    this.updateImageControlsUI();
    this.updateTimelineClipboardStatus();
    this.renderVideoTimeline();
    this.updateVideoEditorUI();
    if (this.videoSourceFile) void this.syncVideoTimelineEffects(true);
  };

  proto.applyVideoTrim = function (resetSelection = true) {
    if (!this.videoSourceFile) return;
    try {
      this.videoTimeline.setTrim(
        this.videoTrimStart.value,
        this.videoTrimEnd.value,
      );
      this.videoEl.currentTime = this.clamp(
        this.videoEl.currentTime,
        this.videoTimeline.trimStart,
        this.videoTimeline.trimEnd,
      );
      if (resetSelection) {
        this.videoEffectStart.value = this.videoTimeline.trimStart.toFixed(2);
        this.videoEffectEnd.value = this.videoTimeline.trimEnd.toFixed(2);
      }
      this.renderVideoTimeline();
      this.updateVideoEditorUI();
    } catch (err) {
      this.videoTrimStart.value = this.videoTimeline.trimStart.toFixed(2);
      this.videoTrimEnd.value = this.videoTimeline.trimEnd.toFixed(2);
      this.showStatus(this.videoEditorStatus, err.message, 'error');
    }
  };

  proto.getSelectedVideoEffectItem = function () {
    return (
      this.videoTimeline.items.find(
        (candidate) => candidate.id === this.selectedVideoEffectId,
      ) || null
    );
  };

  proto.isPlayheadInSelectedClip = function () {
    const item = this.getSelectedVideoEffectItem();
    if (!item || !this.videoSourceFile) return false;
    const time = this.videoEl.currentTime || 0;
    return time >= item.startTime && time < item.endTime;
  };

  proto.applyClipConfigToQuickSettings = function (item) {
    if (!item?.config) return;
    if (item.type === 'blob') {
      if (item.config.boxColor)
        this.quickDetectorSettings.blobBoxColor = item.config.boxColor;
      return;
    }
    if (item.type === 'face') {
      const config = item.config;
      if (config.boxColor)
        this.quickDetectorSettings.faceBoxColor = config.boxColor;
      if (config.labelText != null)
        this.quickDetectorSettings.faceLabelText = this.normalizeFaceLabel(
          config.labelText,
        );
      if (config.showBox != null)
        this.quickDetectorSettings.faceShowBox = !!config.showBox;
      if (config.showBlur != null)
        this.quickDetectorSettings.faceShowBlur = !!config.showBlur;
      if (config.pixelationCellSize != null) {
        this.quickDetectorSettings.facePixelationCellSize = this.clamp(
          parseInt(config.pixelationCellSize, 10) ||
            this.quickDetectorSettings.facePixelationCellSize,
          4,
          48,
        );
      }
      if (config.censorPaddingPercent != null) {
        this.quickDetectorSettings.faceCensorPaddingPercent = this.clamp(
          parseInt(config.censorPaddingPercent, 10) ||
            this.quickDetectorSettings.faceCensorPaddingPercent,
          0,
          48,
        );
      }
    }
  };

  proto.updateAdjustmentsClipStatus = function () {
    if (!this.adjustClipStatus || this.sourceMode !== 'video') return;
    const item = this.getSelectedVideoEffectItem();
    if (!item) {
      this.adjustClipStatus.classList.add('hidden');
      this.adjustClipStatus.classList.remove('is-live');
      return;
    }
    const active = this.isPlayheadInSelectedClip();
    this.adjustClipStatus.textContent = active
      ? `Tramo ${this.formatDurationDetailed(item.startTime)} — ${this.formatDurationDetailed(item.endTime)} · Vista previa activa`
      : `Tramo ${this.formatDurationDetailed(item.startTime)} — ${this.formatDurationDetailed(item.endTime)} · Mové el cursor al clip para previsualizar`;
    this.adjustClipStatus.classList.toggle('is-live', active);
    this.adjustClipStatus.classList.remove('hidden');
  };

  proto.updateAdjustmentsPanelState = function () {
    const hasVideo = !!this.videoSourceFile;
    const item = this.getSelectedVideoEffectItem();
    const hasSelection = !!item;
    if (this.inspectorAdjustNoVideo)
      this.inspectorAdjustNoVideo.classList.toggle('hidden', hasVideo);
    if (this.inspectorAdjustNoClip)
      this.inspectorAdjustNoClip.classList.toggle(
        'hidden',
        !hasVideo || hasSelection,
      );
    if (this.inspectorAdjustmentsHost)
      this.inspectorAdjustmentsHost.classList.toggle('hidden', !hasSelection);
    if (this.adjustContextNav)
      this.adjustContextNav.classList.toggle('hidden', !hasSelection);
    if (hasSelection) this.updateAdjustmentsContext();
  };

  proto.normalizeLookClipConfig = function (config = {}) {
    const merged = { ...this.DEFAULT_IMAGE_SETTINGS, ...config };
    return {
      blackAndWhite: !!merged.blackAndWhite,
      exposure: this.clamp(parseInt(merged.exposure, 10) || 0, -100, 100),
      shadows: this.clamp(parseInt(merged.shadows, 10) || 0, -100, 100),
      highlights: this.clamp(parseInt(merged.highlights, 10) || 0, -100, 100),
      contrast: this.clamp(parseInt(merged.contrast, 10) || 100, 50, 180),
      saturation: this.clamp(parseInt(merged.saturation, 10) || 100, 0, 200),
      temperature: this.clamp(parseInt(merged.temperature, 10) || 0, -100, 100),
      detail: this.clamp(parseInt(merged.detail, 10) || 0, -100, 100),
      sharpness: this.clamp(parseInt(merged.sharpness, 10) || 0, 0, 100),
      automation: this.normalizeClipAutomation(merged.automation),
    };
  };

  proto.normalizeClipAutomation = function (mode) {
    return VIDEO_EFFECT_AUTOMATION_MODES.has(mode) ? mode : 'fixed';
  };

  proto.getSelectedAutomationMode = function () {
    return this.normalizeClipAutomation(
      this.videoEffectAutomationSelect?.value,
    );
  };

  proto.syncLookClipConfigNow = function () {
    if (this.sourceMode !== 'video' || !this.selectedVideoEffectId) return;
    const item = this.videoTimeline.items.find(
      (candidate) => candidate.id === this.selectedVideoEffectId,
    );
    if (!item || item.type !== 'look') return;
    try {
      this.videoTimeline.upsert({
        ...item,
        config: this.snapshotVideoEffectConfig('look'),
      });
    } catch (err) {
      console.warn('No se pudo guardar el look del clip:', err.message);
    }
  };

  proto.snapshotVideoEffectConfig = function (type) {
    if (type === 'look') {
      const {
        previewQuality,
        jpegQuality,
        videoFormat,
        editorExportFormat,
        editorExportMode,
        editorCopyAudio,
        experimentalExportFeatures,
        effectsExportChroma,
        captureTimerSeconds,
        qualityEnhancer,
        qualityEnhancerStrength,
        ...lookSettings
      } = this.imageSettings;
      return {
        ...this.normalizeLookClipConfig(lookSettings),
        automation: this.getSelectedAutomationMode(),
      };
    }
    if (type === 'blob') {
      const config = this.blobTrackingEffect
        ? this.blobTrackingEffect.getConfig()
        : {
            boxColor: this.quickDetectorSettings.blobBoxColor,
          };
      return { ...config, automation: this.getSelectedAutomationMode() };
    }
    if (type === 'face') {
      const config = this.faceDetectionEffect
        ? this.faceDetectionEffect.getConfig()
        : {
            boxColor: this.quickDetectorSettings.faceBoxColor,
            labelText: this.quickDetectorSettings.faceLabelText,
            showBox: this.quickDetectorSettings.faceShowBox,
            showBlur: this.quickDetectorSettings.faceShowBlur,
            visualMode: this.getFaceVisualMode(),
            pixelationCellSize:
              this.quickDetectorSettings.facePixelationCellSize,
            censorPaddingPercent:
              this.quickDetectorSettings.faceCensorPaddingPercent,
          };
      return { ...config, automation: this.getSelectedAutomationMode() };
    }
    return {
      ...(this.blinkDetectionEffect
        ? this.blinkDetectionEffect.getConfig()
        : {}),
      automation: this.getSelectedAutomationMode(),
    };
  };

  proto.applyVideoEffectItemConfig = function (item) {
    if (!item?.config) return;
    if (item.type === 'look') {
      const {
        previewQuality,
        jpegQuality,
        videoFormat,
        editorExportFormat,
        editorExportMode,
        editorCopyAudio,
        experimentalExportFeatures,
        effectsExportChroma,
        captureTimerSeconds,
        qualityEnhancer,
        qualityEnhancerStrength,
        automation,
        ...lookSettings
      } = item.config;
      this.imageSettings = { ...this.imageSettings, ...lookSettings };
      this.updateImageControlsUI();
      this.saveImageSettings();
      return;
    }
    if (item.type === 'blob') {
      if (this.blobTrackingEffect)
        this.blobTrackingEffect.setConfig(item.config);
      else this.applyClipConfigToQuickSettings(item);
    } else if (item.type === 'face') {
      if (this.faceDetectionEffect)
        this.faceDetectionEffect.setConfig(item.config);
      else this.applyClipConfigToQuickSettings(item);
    } else if (item.type === 'blink' && this.blinkDetectionEffect) {
      this.blinkDetectionEffect.setConfig(item.config);
    }
    this.syncQuickDetectorSettingsFromEffects();
    this.updateQuickDetectorControlsUI();
    this.renderEffectConfig();
  };

  proto.commitSelectedEffectTiming = function (options = {}) {
    if (!this.selectedVideoEffectId) return;
    const item = this.videoTimeline.items.find(
      (candidate) => candidate.id === this.selectedVideoEffectId,
    );
    if (!item) return;
    const minSpan = 0.05;
    const startTime = this.clamp(
      Number(this.videoEffectStart.value) || 0,
      this.videoTimeline.trimStart,
      this.videoTimeline.trimEnd - minSpan,
    );
    const endTime = this.clamp(
      Number(this.videoEffectEnd.value) || 0,
      startTime + minSpan,
      this.videoTimeline.trimEnd,
    );
    this.videoEffectStart.value = startTime.toFixed(2);
    this.videoEffectEnd.value = endTime.toFixed(2);
    try {
      if (options.pushHistory) this.pushTimelineHistory();
      this.videoTimeline.upsert({ ...item, startTime, endTime });
      this.renderVideoTimeline();
      void this.syncVideoTimelineEffects(true);
    } catch (err) {
      this.showStatus(this.videoEditorStatus, err.message, 'error');
      this.selectVideoEffect(item.id);
    }
  };

  proto.roundTimelineTime = function (time) {
    return Math.round((Number(time) || 0) * 1000) / 1000;
  };

  proto.getTimelineRowFromClientY = function (clientY) {
    if (!this.timelineTrackArea) return null;
    const bounds = this.timelineTrackArea.getBoundingClientRect();
    if (clientY < bounds.top || clientY > bounds.bottom) return null;
    const ratio = this.clamp((clientY - bounds.top) / bounds.height, 0, 0.999);
    const row = Math.floor(ratio * 5);
    if (row <= 0) return null;
    return (
      Object.keys(this.TIMELINE_EFFECT_META).find(
        (type) => this.TIMELINE_EFFECT_META[type].row === row,
      ) || null
    );
  };

  proto.clearTimelineDropTargets = function () {
    this.videoTimelineEl
      ?.querySelectorAll('.timeline-track-effects.is-drop-target')
      .forEach((track) => {
        track.classList.remove('is-drop-target');
      });
  };

  proto.setTimelineDropTarget = function (type) {
    this.clearTimelineDropTargets();
    if (!type || !this.videoTimelineEl) return;
    const track = this.videoTimelineEl.querySelector(
      `.timeline-track-effects[data-track="${type}"]`,
    );
    track?.classList.add('is-drop-target');
  };

  proto.updateTimelineDragGhost = function (
    clientX,
    clientY,
    label,
    type = null,
  ) {
    this.timelineDragGhost = this.timelineView.ensureDragGhost(document.body);
    this.timelineDragGhost.textContent = label;
    this.timelineDragGhost.dataset.type = type || '';
    const rowType = this.getTimelineRowFromClientY(clientY);
    if (type && rowType && this.timelineTrackArea) {
      const bounds = this.timelineTrackArea.getBoundingClientRect();
      const rawTime = this.getTimelineRawTime(clientX);
      const { startTime, endTime } = this.resolveTimelineInsertionTimes({
        type,
        anchorTime: rawTime,
        duration: this.DEFAULT_TIMELINE_EFFECT_DURATION,
      });
      const duration = Math.max(0.001, this.videoTimeline.duration);
      const row = this.TIMELINE_EFFECT_META[type]?.row || 1;
      this.timelineDragGhost.classList.add('is-timeline-preview');
      this.timelineDragGhost.style.left = `${bounds.left + (startTime / duration) * bounds.width}px`;
      this.timelineDragGhost.style.top = `${bounds.top + row * bounds.height * 0.2}px`;
      this.timelineDragGhost.style.width = `${Math.max(12, ((endTime - startTime) / duration) * bounds.width)}px`;
      this.timelineDragGhost.style.height = `${bounds.height * 0.2}px`;
      return;
    }
    this.timelineDragGhost.classList.remove('is-timeline-preview');
    this.timelineDragGhost.style.left = `${clientX}px`;
    this.timelineDragGhost.style.top = `${clientY}px`;
    this.timelineDragGhost.style.width = '';
    this.timelineDragGhost.style.height = '';
  };

  proto.removeTimelineDragGhost = function () {
    this.timelineView.removeDragGhost();
    this.timelineDragGhost = null;
  };

  proto.finishPaletteDrag = function (event) {
    if (!this.paletteDragState) return;
    const chip = this.paletteDragState.chip;
    chip?.classList.remove('is-dragging');
    if (chip?.hasPointerCapture?.(event.pointerId))
      chip.releasePointerCapture(event.pointerId);
    const type = this.paletteDragState.type;
    const moved = this.paletteDragState.moved;
    this.paletteDragState = null;
    this.removeTimelineDragGhost();
    this.clearTimelineDropTargets();
    this.updateEffectTrackHighlight();
    if (!moved || !this.videoSourceFile) return;
    if (!this.getTimelineRowFromClientY(event.clientY)) {
      this.showStatus(
        this.videoEditorStatus,
        'Soltá el efecto sobre la timeline.',
        'warning',
      );
      setTimeout(() => this.hideStatus(this.videoEditorStatus), 1800);
      return;
    }
    void this.addTimelineEffectClip(type, this.getTimelineTime(event.clientX));
  };

  proto.bindTimelinePaletteDrag = function () {
    if (!this.timelineEffectPalette) return;
    this.timelineEffectPalette
      .querySelectorAll('.timeline-palette-chip')
      .forEach((chip) => {
        chip.addEventListener('pointerdown', (event) => {
          if (
            !this.videoSourceFile ||
            this.isVideoExporting ||
            event.button !== 0 ||
            chip.disabled
          )
            return;
          event.preventDefault();
          const type = chip.dataset.effectType;
          if (!this.TIMELINE_EFFECT_META[type]) return;
          this.paletteDragState = { type, chip, moved: false };
          chip.classList.add('is-dragging');
          chip.setPointerCapture(event.pointerId);
          this.updateTimelineDragGhost(
            event.clientX,
            event.clientY,
            this.TIMELINE_EFFECT_META[type].label,
            type,
          );
          this.setTimelineDropTarget(type);
        });
        chip.addEventListener('pointermove', (event) => {
          if (!this.paletteDragState || this.paletteDragState.chip !== chip)
            return;
          this.paletteDragState.moved = true;
          this.updateTimelineDragGhost(
            event.clientX,
            event.clientY,
            this.TIMELINE_EFFECT_META[this.paletteDragState.type].label,
            this.paletteDragState.type,
          );
          const rowType = this.getTimelineRowFromClientY(event.clientY);
          this.setTimelineDropTarget(
            rowType ? this.paletteDragState.type : null,
          );
        });
        chip.addEventListener('pointerup', this.finishPaletteDrag.bind(this));
        chip.addEventListener(
          'pointercancel',
          this.finishPaletteDrag.bind(this),
        );
        chip.addEventListener('dragstart', (event) => event.preventDefault());
      });

    this.videoTimelineEl
      ?.querySelectorAll('.timeline-track-effects')
      .forEach((track) => {
        track.addEventListener('dblclick', (event) => {
          if (!this.videoSourceFile || event.target.closest('.timeline-item'))
            return;
          event.preventDefault();
          void this.addTimelineEffectClip(
            track.dataset.track,
            this.videoEl.currentTime || this.videoTimeline.trimStart,
          );
        });
      });
  };

  proto.toggleVideoEffectSelection = function (id) {
    if (!id) return;
    this.selectedVideoEffectIds ||= new Set();
    if (this.selectedVideoEffectIds.has(id))
      this.selectedVideoEffectIds.delete(id);
    else this.selectedVideoEffectIds.add(id);
    this.selectedVideoEffectId = this.selectedVideoEffectIds.has(id)
      ? id
      : this.selectedVideoEffectIds.values().next().value || '';
    if (this.selectedVideoEffectId) {
      const item = this.videoTimeline.items.find(
        (candidate) => candidate.id === this.selectedVideoEffectId,
      );
      if (item) {
        this.videoEffectType.value = item.type;
        this.videoEffectStart.value = item.startTime.toFixed(2);
        this.videoEffectEnd.value = item.endTime.toFixed(2);
      }
    }
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    this.updateEffectTrackHighlight();
  };

  proto.selectVideoEffectsByType = function (type) {
    if (!type || !this.videoSourceFile) return;
    const ids = this.videoTimeline.items
      .filter((item) => item.type === type)
      .map((item) => item.id);
    if (!ids.length) return;
    this.selectedVideoEffectIds = new Set(ids);
    this.selectedVideoEffectId = ids[0];
    const item = this.getSelectedVideoEffectItem();
    if (item) {
      this.videoEffectType.value = item.type;
      this.videoEffectStart.value = item.startTime.toFixed(2);
      this.videoEffectEnd.value = item.endTime.toFixed(2);
      this.applyVideoEffectItemConfig(item);
    }
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    this.updateEffectTrackHighlight();
    this.setInspectorTab('effect');
  };

  proto.selectAllVideoEffects = function () {
    this.selectedVideoEffectIds = new Set(
      this.videoTimeline.items.map((item) => item.id),
    );
    this.selectedVideoEffectId = this.videoTimeline.items[0]?.id || '';
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    this.updateEffectTrackHighlight();
  };

  proto.updateVideoEffectInspector = function () {
    const hasVideo = !!this.videoSourceFile;
    const item = this.videoTimeline.items.find(
      (candidate) => candidate.id === this.selectedVideoEffectId,
    );
    const editing = !!item;
    if (this.videoEffectEmptyNoVideo)
      this.videoEffectEmptyNoVideo.classList.toggle('hidden', hasVideo);
    if (this.videoEffectEmptyHint)
      this.videoEffectEmptyHint.classList.toggle(
        'hidden',
        !hasVideo || editing,
      );
    if (this.videoEffectClipMeta)
      this.videoEffectClipMeta.classList.toggle('hidden', !editing);
    if (item && this.videoEffectTypeLabel) {
      this.videoEffectTypeLabel.textContent = `${this.TIMELINE_EFFECT_META[item.type]?.trackLabel || item.type} · ${this.TIMELINE_EFFECT_META[item.type]?.label || item.type}`;
    }
    if (item && this.videoEffectDurationLabel) {
      const duration = Math.max(0, item.endTime - item.startTime);
      this.videoEffectDurationLabel.textContent = `Duración: ${duration.toFixed(2)} s`;
    }
    if (this.videoEffectAutomationSelect) {
      this.videoEffectAutomationSelect.disabled = !editing;
      this.videoEffectAutomationSelect.value = this.normalizeClipAutomation(
        item?.config?.automation,
      );
    }
    if (this.btnDeleteVideoEffect)
      this.btnDeleteVideoEffect.disabled = !editing;
    if (this.btnOpenEffectAdjust) this.btnOpenEffectAdjust.disabled = !editing;
  };

  proto.commitSelectedEffectAutomation = function () {
    const item = this.getSelectedVideoEffectItem();
    if (!item) return;
    this.pushTimelineHistory();
    this.videoTimeline.upsert({
      ...item,
      config: {
        ...(item.config || {}),
        automation: this.getSelectedAutomationMode(),
      },
    });
    this.renderVideoTimeline();
    void this.syncVideoTimelineEffects(true);
  };

  proto.updateTimelineClipboardStatus = function (message = '') {
    if (!this.timelineClipboardStatus) return;
    this.timelineClipboardStatus.textContent = message;
    this.timelineClipboardStatus.classList.toggle('is-active', !!message);
  };

  proto.mountVideoEffectsControls = function () {
    if (!this.effectsControlsSlot || !this.inspectorAdjustmentsHost) return;
    if (
      this.effectsControlsSlot.parentElement !== this.inspectorAdjustmentsHost
    ) {
      this.inspectorAdjustmentsHost.appendChild(this.effectsControlsSlot);
    }
    this.effectsControlsSlot.classList.add('is-contextual');
    this.setAdvancedOptionsVisible(true);
    this.updateAdjustmentsPanelState();
  };

  proto.unmountVideoEffectsControls = function () {
    if (!this.effectsControlsSlot || !this.controlPanel) return;
    this.effectsControlsSlot.classList.remove('is-contextual');
    delete this.effectsControlsSlot.dataset.adjustContext;
    this.adjustContextNav?.classList.add('hidden');
    this.effectsControlsSlot
      .querySelectorAll('.adjust-context-group')
      .forEach((group) => {
        group.classList.remove('is-active');
      });
    this.videoTimelineEl
      ?.querySelectorAll('.timeline-track-label[data-adjust-context]')
      .forEach((label) => {
        label.classList.remove('is-active');
      });
    const cfg = this.loadConfig();
    this.setAdvancedOptionsVisible(!!cfg.showAdvancedOptions);
    const captureSection = this.controlPanel.querySelector(
      '.panel-section.webcam-only:nth-of-type(2)',
    );
    if (
      captureSection &&
      this.effectsControlsSlot.parentElement !== this.controlPanel
    ) {
      captureSection.insertAdjacentElement(
        'afterend',
        this.effectsControlsSlot,
      );
    }
  };

  proto.resolveAdjustmentsContext = function () {
    const selected = this.getSelectedVideoEffectItem();
    if (selected) return selected.type;
    return 'look';
  };

  proto.setAdjustmentsContext = function (context, options = {}) {
    if (!this.getSelectedVideoEffectItem()) return;
    if (context === 'video') context = 'look';
    if (!context || !this.ADJUST_CONTEXT_HELP[context]) return;
    this.adjustmentsContext = context;
    if (this.effectsControlsSlot) {
      this.effectsControlsSlot.dataset.adjustContext = context;
    }
    this.adjustContextNav
      ?.querySelectorAll('.adjust-context-tab')
      .forEach((tab) => {
        const active = tab.dataset.adjustContext === context;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
    this.effectsControlsSlot
      ?.querySelectorAll('.adjust-context-group')
      .forEach((group) => {
        group.classList.toggle(
          'is-active',
          group.dataset.adjustContext === context,
        );
      });
    this.videoTimelineEl
      ?.querySelectorAll('.timeline-track-label[data-adjust-context]')
      .forEach((label) => {
        label.classList.toggle(
          'is-active',
          label.dataset.adjustContext === context,
        );
      });
    if (this.adjustContextHelp) {
      const help =
        this.ADJUST_CONTEXT_VIDEO_HELP?.[context] ||
        this.ADJUST_CONTEXT_HELP[context];
      this.adjustContextHelp.textContent = help;
    }
    this.updateAdjustmentsClipStatus();
    if (options.syncEffectType && this.videoEffectType) {
      this.videoEffectType.value = options.effectType || context;
      this.updateEffectTrackHighlight();
      this.updateTimelineHint();
    }
    if (options.syncTool) {
      if (options.tool === 'trim') {
        this.setEditorTool('trim', { skipTab: true });
      } else if (options.tool === 'effect') {
        this.setEditorTool('select', { skipTab: true });
        if (this.videoEffectType) {
          this.videoEffectType.value =
            options.effectType || (context === 'look' ? 'look' : context);
        }
        this.updateEffectTrackHighlight();
        this.updateTimelineHint();
      }
    }
  };

  proto.updateAdjustmentsContext = function (options = {}) {
    if (this.sourceMode !== 'video') return;
    if (!this.getSelectedVideoEffectItem()) {
      this.updateAdjustmentsPanelState();
      return;
    }
    this.setAdjustmentsContext(this.resolveAdjustmentsContext(), options);
  };

  proto.openAdjustmentsForContext = function (context, options = {}) {
    if (this.sourceMode !== 'video') return;
    this.setAdjustmentsContext(context, options);
    this.setInspectorTab('adjust');
  };

  proto.updateEffectTrackHighlight = function (activeType = null) {
    if (!this.videoTimelineEl) return;
    const selected = this.videoTimeline.items.find(
      (item) => item.id === this.selectedVideoEffectId,
    );
    const type =
      activeType || this.paletteDragState?.type || selected?.type || null;
    this.videoTimelineEl
      .querySelectorAll('.timeline-track-effects')
      .forEach((track) => {
        track.classList.toggle(
          'is-target-track',
          !!type && track.dataset.track === type,
        );
      });
  };

  proto.setInspectorTab = function (tabName) {
    this.inspectorTabs.forEach((tab) => {
      const active = tab.dataset.tab === tabName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    this.inspectorPanels.forEach((panel) => {
      const active =
        panel.id ===
        `inspectorPanel${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}`;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    if (tabName === 'adjust' && this.sourceMode === 'video') {
      this.updateAdjustmentsPanelState();
    }
  };

  proto.setEditorTool = function (tool) {
    this.editorTool = tool;
    document.body.dataset.editorTool = tool;
    if (this.videoTimelineEl) this.videoTimelineEl.dataset.editorTool = tool;
    [this.btnToolSelect, this.btnToolTrim].forEach((button) => {
      if (!button) return;
      button.classList.toggle('is-active', button.dataset.tool === tool);
    });
    this.updateTimelineHint();
    this.updateEffectTrackHighlight();
    if (tool !== 'cut') this.hideTimelineCutGuide();
    if (
      this.sourceMode === 'video' &&
      document
        .querySelector('.video-inspector-tab[data-tab="adjust"]')
        ?.classList.contains('is-active')
    ) {
      this.updateAdjustmentsPanelState();
    }
  };

  proto.updateTimelineHint = function () {
    if (!this.timelineHintText) return;
    if (!this.videoSourceFile) {
      this.timelineHintText.textContent = '';
      return;
    }
    const hints = {
      select:
        'Arrastrá para seleccionar varios, mové clips o presioná M para marcar.',
      cut: 'La línea roja marca el corte. Click sobre un clip de efecto.',
      trim: 'Arrastrá los bordes rojos en VIDEO.',
    };
    this.timelineHintText.textContent = hints[this.editorTool] || hints.select;
  };

  proto.pushTimelineHistory = function () {
    if (
      !this.editorHistory ||
      this.timelineHistorySuspended ||
      !this.videoSourceFile
    )
      return;
    this.editorHistory.push(this.videoTimeline);
    this.updateEditorHistoryButtons();
  };

  proto.undoTimelineEdit = function () {
    if (!this.editorHistory?.undo(this.videoTimeline)) return;
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.applyVideoTrim(false);
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    void this.syncVideoTimelineEffects(true);
  };

  proto.redoTimelineEdit = function () {
    if (!this.editorHistory?.redo(this.videoTimeline)) return;
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.applyVideoTrim(false);
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    void this.syncVideoTimelineEffects(true);
  };

  proto.updateEditorHistoryButtons = function () {
    if (this.btnEditorUndo)
      this.btnEditorUndo.disabled =
        !this.editorHistory?.canUndo || this.isVideoExporting;
    if (this.btnEditorRedo)
      this.btnEditorRedo.disabled =
        !this.editorHistory?.canRedo || this.isVideoExporting;
  };

  proto.applyTimelineZoom = function () {
    if (!this.timelineScroll || !this.timelineTrackArea) return;
    const baseWidth = this.timelineViewport
      ? this.timelineViewport.clientWidth - 72
      : 800;
    const width = Math.max(baseWidth, baseWidth * this.timelineZoom);
    this.timelineScroll.style.width = `${width + 72}px`;
    if (this.timelineZoomInput)
      this.timelineZoomInput.value = String(this.timelineZoom);
    this.renderVideoTimeline();
    this.renderTimelineRuler();
  };

  proto.getTimelineTrackAreaBounds = function () {
    if (!this.timelineTrackArea)
      return { left: 0, top: 0, width: 1, height: 1 };
    const rect = this.timelineTrackArea.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    };
  };

  proto.renderTimelineRuler = function () {
    if (!this.timelineTimeRuler || !this.timelineTrackArea) return;
    const duration = Math.max(0.001, this.videoTimeline.duration);
    const width = this.timelineTrackArea.offsetWidth;
    this.timelineView.renderRuler({
      ruler: this.timelineTimeRuler,
      duration,
      width,
    });
  };

  proto.positionTimelineElement = function (el, startTime, endTime = null) {
    const duration = Math.max(0.001, this.videoTimeline.duration);
    const left = (startTime / duration) * 100;
    el.style.left = `${this.clamp(left, 0, 100)}%`;
    if (endTime != null) {
      el.style.width = `${this.clamp(((endTime - startTime) / duration) * 100, 0, 100)}%`;
    }
  };

  proto.getTimelineRowStyle = function (rowIndex) {
    return {
      top: `calc(${rowIndex} * 20%)`,
      height: '20%',
    };
  };

  proto.positionTimelineRowElement = function (
    el,
    startTime,
    endTime,
    rowIndex,
  ) {
    this.positionTimelineElement(el, startTime, endTime);
    const rowStyle = this.getTimelineRowStyle(rowIndex);
    el.style.top = rowStyle.top;
    el.style.height = rowStyle.height;
  };

  proto.toggleTimelineMarkerAtPlayhead = function () {
    if (
      !this.videoSourceFile ||
      typeof this.videoTimeline.toggleMarker !== 'function'
    )
      return;
    const threshold = 0.08 / Math.max(1, this.timelineZoom);
    this.pushTimelineHistory();
    const result = this.videoTimeline.toggleMarker(
      this.videoEl.currentTime || this.videoTimeline.trimStart,
      threshold,
    );
    this.renderVideoTimeline();
    this.showStatus(
      this.videoEditorStatus,
      result.action === 'added' ? 'Marcador agregado.' : 'Marcador eliminado.',
      'success',
    );
    setTimeout(() => this.hideStatus(this.videoEditorStatus), 900);
    this.updateTimelineHint();
  };

  proto.getTimelineTime = function (clientX) {
    return this.snapTimelineTime(this.getTimelineRawTime(clientX));
  };

  proto.getTimelineRawTime = function (clientX) {
    const bounds = this.getTimelineTrackAreaBounds();
    const ratio = this.clamp((clientX - bounds.left) / bounds.width, 0, 1);
    return ratio * this.videoTimeline.duration;
  };

  proto.beginTimelineSelection = function (event) {
    if (!this.videoSourceFile || this.isVideoExporting || event.button !== 0)
      return;
    if (
      event.target.closest(
        '.timeline-item, .timeline-item-handle, .timeline-trim-handle, .timeline-playhead-handle',
      )
    )
      return;
    event.preventDefault();

    if (this.editorTool === 'trim') {
      this.seekVideo(this.getTimelineTime(event.clientX));
      return;
    }

    if (
      this.editorTool === 'select' &&
      event.target.closest('.timeline-track-effects') &&
      !event.target.closest('.timeline-item')
    ) {
      this.beginTimelineBoxSelection(event);
      return;
    }

    this.seekVideo(this.getTimelineTime(event.clientX));
  };

  proto.beginTimelineBoxSelection = function (event) {
    const bounds = this.getTimelineTrackAreaBounds();
    const originX = this.clamp(event.clientX - bounds.left, 0, bounds.width);
    const originY = this.clamp(event.clientY - bounds.top, 0, bounds.height);
    let dragged = false;

    const draw = (moveEvent) => {
      const x = this.clamp(moveEvent.clientX - bounds.left, 0, bounds.width);
      const y = this.clamp(moveEvent.clientY - bounds.top, 0, bounds.height);
      if (Math.abs(x - originX) > 4 || Math.abs(y - originY) > 4)
        dragged = true;
      if (!dragged || !this.timelineSelection) return;
      this.timelineSelection.classList.add('is-active');
      this.timelineSelection.style.left = `${Math.min(originX, x)}px`;
      this.timelineSelection.style.top = `${Math.min(originY, y)}px`;
      this.timelineSelection.style.width = `${Math.abs(x - originX)}px`;
      this.timelineSelection.style.height = `${Math.abs(y - originY)}px`;
    };

    const end = (upEvent) => {
      document.removeEventListener('pointermove', draw);
      document.removeEventListener('pointerup', end);
      this.timelineSelection?.classList.remove('is-active');
      if (!dragged) {
        this.seekVideo(this.getTimelineTime(event.clientX));
        this.selectVideoEffect('');
        return;
      }
      const endX = this.clamp(upEvent.clientX - bounds.left, 0, bounds.width);
      const endY = this.clamp(upEvent.clientY - bounds.top, 0, bounds.height);
      this.selectVideoEffectsInRect(
        Math.min(originX, endX),
        Math.max(originX, endX),
        Math.min(originY, endY),
        Math.max(originY, endY),
        bounds,
      );
    };

    document.addEventListener('pointermove', draw);
    document.addEventListener('pointerup', end, { once: true });
  };

  proto.selectVideoEffectsInRect = function (left, right, top, bottom, bounds) {
    const start = (left / bounds.width) * this.videoTimeline.duration;
    const end = (right / bounds.width) * this.videoTimeline.duration;
    const rowHeight = bounds.height / 5;
    const ids = this.videoTimeline.items
      .filter((item) => {
        const row = this.TIMELINE_EFFECT_META[item.type]?.row || 1;
        const rowTop = (row - 1) * rowHeight;
        const rowBottom = row * rowHeight;
        return (
          item.startTime <= end &&
          item.endTime >= start &&
          rowBottom >= top &&
          rowTop <= bottom
        );
      })
      .map((item) => item.id);
    this.selectedVideoEffectIds = new Set(ids);
    this.selectedVideoEffectId = ids[0] || '';
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    this.updateEffectTrackHighlight();
    if (ids.length) this.setInspectorTab('effect');
  };

  proto.beginTrimDrag = function (event, edge) {
    if (
      !this.videoSourceFile ||
      this.isVideoExporting ||
      this.editorTool !== 'trim'
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.pushTimelineHistory();
    const itemStarts = this.videoTimeline.items.map((item) => item.startTime);
    const itemEnds = this.videoTimeline.items.map((item) => item.endTime);
    const minEnd = itemEnds.length ? Math.max(...itemEnds) : 0.05;
    const maxStart = itemStarts.length
      ? Math.min(...itemStarts)
      : this.videoTimeline.duration - 0.05;

    const move = (moveEvent) => {
      const time = this.getTimelineTime(moveEvent.clientX);
      if (edge === 'start') {
        this.videoTrimStart.value = this.clamp(
          time,
          0,
          Math.min(maxStart, this.videoTimeline.trimEnd - 0.05),
        ).toFixed(2);
      } else {
        this.videoTrimEnd.value = this.clamp(
          time,
          Math.max(minEnd, this.videoTimeline.trimStart + 0.05),
          this.videoTimeline.duration,
        ).toFixed(2);
      }
      this.applyVideoTrim(false);
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  };

  proto.beginTimelineDrag = function (event, item, element) {
    if (!this.videoSourceFile || this.isVideoExporting || event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    if (this.editorTool === 'cut') {
      this.splitTimelineEffectClipAtEvent(event, item);
      return;
    }
    if (this.editorTool !== 'select')
      this.setEditorTool('select', { skipTab: true });
    if (event.shiftKey) {
      this.toggleVideoEffectSelection(item.id);
      return;
    }
    if (!this.selectedVideoEffectIds?.has(item.id)) {
      this.selectedVideoEffectIds = new Set([item.id]);
    }
    this.selectedVideoEffectId = item.id;
    this.videoEffectType.value = item.type;
    this.videoEffectStart.value = item.startTime.toFixed(2);
    this.videoEffectEnd.value = item.endTime.toFixed(2);
    this.timelineItems
      .querySelectorAll('.timeline-item')
      .forEach((candidate) => {
        candidate.classList.toggle(
          'is-selected',
          this.selectedVideoEffectIds?.has(candidate.dataset.id),
        );
      });
    this.updateVideoEffectInspector();
    this.setInspectorTab('effect');
    const bounds = this.getTimelineTrackAreaBounds();
    const originX = event.clientX;
    const original = { ...item };
    const handleStart = event.target.closest('.timeline-item-handle.start');
    const handleEnd = event.target.closest('.timeline-item-handle.end');
    let edge = 'move';
    if (handleStart) edge = 'start';
    else if (handleEnd) edge = 'end';
    element.classList.add('is-dragging');

    const move = (moveEvent) => {
      const delta =
        ((moveEvent.clientX - originX) / bounds.width) *
        this.videoTimeline.duration;
      let startTime = original.startTime;
      let endTime = original.endTime;
      if (edge === 'start') startTime = original.startTime + delta;
      else if (edge === 'end') endTime = original.endTime + delta;
      else {
        const length = original.endTime - original.startTime;
        startTime = original.startTime + delta;
        endTime = startTime + length;
      }
      ({ startTime, endTime } = this.resolveTimelineClipTimes({
        type: item.type,
        startTime,
        endTime,
        edge,
        itemId: item.id,
      }));
      this.videoEffectStart.value = startTime.toFixed(2);
      this.videoEffectEnd.value = endTime.toFixed(2);
      this.positionTimelineRowElement(
        element,
        startTime,
        endTime,
        this.TIMELINE_EFFECT_META[item.type]?.row || 1,
      );
      if (this.videoEffectRangeLabel) {
        this.videoEffectRangeLabel.textContent = `${this.formatDurationDetailed(startTime)} — ${this.formatDurationDetailed(endTime)}`;
      }
      if (this.videoEffectDurationLabel) {
        this.videoEffectDurationLabel.textContent = `Duración: ${Math.max(0, endTime - startTime).toFixed(2)} s`;
      }
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      element.classList.remove('is-dragging');
      try {
        this.pushTimelineHistory();
        this.videoTimeline.upsert({
          ...item,
          startTime: Number(this.videoEffectStart.value),
          endTime: Number(this.videoEffectEnd.value),
        });
      } catch (err) {
        this.showStatus(this.videoEditorStatus, err.message, 'error');
      }
      this.selectVideoEffect(item.id);
      void this.syncVideoTimelineEffects(true);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  };

  proto.splitTimelineEffectClipAtEvent = function (event, item) {
    try {
      const time = this.getTimelineTime(event.clientX);
      if (time <= item.startTime + 0.05 || time >= item.endTime - 0.05)
        throw new Error('Elegí un punto dentro del clip.');
      this.pushTimelineHistory();
      const [, right] = this.videoTimeline.split(item.id, time);
      this.selectedVideoEffectIds = new Set([right.id]);
      this.selectedVideoEffectId = right.id;
      this.renderVideoTimeline();
      this.updateVideoEffectInspector();
      this.updateAdjustmentsPanelState();
      this.updateEffectTrackHighlight();
      void this.syncVideoTimelineEffects(true);
    } catch (err) {
      this.showStatus(this.videoEditorStatus, err.message, 'error');
    }
  };

  proto.updateTimelineCutGuide = function (event) {
    if (
      this.editorTool !== 'cut' ||
      !this.videoSourceFile ||
      this.isVideoExporting ||
      !this.timelineCutGuide
    ) {
      this.hideTimelineCutGuide();
      return;
    }
    const bounds = this.getTimelineTrackAreaBounds();
    const x = this.clamp(event.clientX - bounds.left, 0, bounds.width);
    this.timelineCutGuide.style.left = `${x}px`;
    this.timelineCutGuide.classList.add('is-active');
  };

  proto.hideTimelineCutGuide = function () {
    this.timelineCutGuide?.classList.remove('is-active');
  };

  proto.splitAllEffectsAtMarkers = function () {
    if (!this.videoSourceFile || this.isVideoExporting) return;
    const times = Array.from(
      new Set(
        (this.videoTimeline.markers || [])
          .map((marker) => this.roundTimelineTime(marker.time))
          .filter(
            (time) =>
              time > this.videoTimeline.trimStart &&
              time < this.videoTimeline.trimEnd,
          ),
      ),
    ).sort((a, b) => a - b);
    if (!times.length) {
      this.showStatus(
        this.videoEditorStatus,
        'No hay marcadores para cortar.',
        'error',
      );
      return;
    }

    const hasCuts = times.some((time) =>
      this.videoTimeline.items.some(
        (item) => time > item.startTime + 0.05 && time < item.endTime - 0.05,
      ),
    );
    if (!hasCuts) {
      this.showStatus(
        this.videoEditorStatus,
        'Ningún efecto cruza esos marcadores.',
        'error',
      );
      return;
    }

    let cuts = 0;
    try {
      this.pushTimelineHistory();
      times.forEach((time) => {
        [...this.videoTimeline.items].forEach((item) => {
          const current = this.videoTimeline.items.find(
            (candidate) => candidate.id === item.id,
          );
          if (
            current &&
            time > current.startTime + 0.05 &&
            time < current.endTime - 0.05
          ) {
            this.videoTimeline.split(current.id, time);
            cuts += 1;
          }
        });
      });
      if (!cuts) throw new Error('Ningún efecto cruza esos marcadores.');
      this.selectedVideoEffectIds = new Set();
      this.selectedVideoEffectId = '';
      this.renderVideoTimeline();
      this.updateVideoEffectInspector();
      this.updateAdjustmentsPanelState();
      this.updateEffectTrackHighlight();
      void this.syncVideoTimelineEffects(true);
      this.showStatus(
        this.videoEditorStatus,
        `Cortes creados: ${cuts}.`,
        'success',
      );
      setTimeout(() => this.hideStatus(this.videoEditorStatus), 1200);
    } catch (err) {
      this.showStatus(this.videoEditorStatus, err.message, 'error');
    }
  };

  proto.beginPlayheadDrag = function (event) {
    if (!this.videoSourceFile || this.isVideoExporting || event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    this.seekVideo(this.getTimelineTime(event.clientX));
    const move = (moveEvent) =>
      this.seekVideo(this.getTimelineTime(moveEvent.clientX));
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  };

  proto.handleVideoEditorKeydown = function (event) {
    if (this.sourceMode !== 'video' || this.isVideoExporting) return;
    const tag = event.target.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      event.target.isContentEditable
    )
      return;

    const primaryMod = event.ctrlKey || event.metaKey;
    if (primaryMod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redoTimelineEdit();
      else this.undoTimelineEdit();
      return;
    }
    if (primaryMod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectAllVideoEffects();
      return;
    }
    if (primaryMod && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.copySelectedVideoEffects(false);
      return;
    }
    if (primaryMod && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      this.copySelectedVideoEffects(true);
      return;
    }
    if (primaryMod && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      this.pasteVideoEffects(event.shiftKey);
      return;
    }
    if (primaryMod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redoTimelineEdit();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      void this.toggleVideoPlayback();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.jumpVideo(event.shiftKey ? -5 : -0.04);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.jumpVideo(event.shiftKey ? 5 : 0.04);
      return;
    }
    if (event.key.toLowerCase() === 'i') {
      event.preventDefault();
      this.videoTrimStart.value = String(this.videoEl.currentTime || 0);
      this.pushTimelineHistory();
      this.applyVideoTrim();
      this.setEditorTool('trim');
      return;
    }
    if (event.key.toLowerCase() === 'o') {
      event.preventDefault();
      this.videoTrimEnd.value = String(this.videoEl.currentTime || 0);
      this.pushTimelineHistory();
      this.applyVideoTrim();
      this.setEditorTool('trim');
      return;
    }
    if (event.key.toLowerCase() === 'm') {
      event.preventDefault();
      this.toggleTimelineMarkerAtPlayhead();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedVideoEffectId) {
        event.preventDefault();
        this.deleteSelectedVideoEffect();
      }
      return;
    }
    if (event.key.toLowerCase() === 'v') {
      this.setEditorTool('select');
      return;
    }
    if (event.key.toLowerCase() === 't') {
      this.setEditorTool('cut');
    }
  };

  proto.handleVideoDetectorToggle = function (type) {
    if (this.sourceMode === 'video') {
      void this.syncVideoTimelineEffects(true);
      return;
    }
    void this.toggleEffect(type);
  };

  proto.getTimelineDetectorCheckbox = function (type) {
    if (type === 'blob') return this.chkBlobTracking;
    if (type === 'face') return this.chkFaceDetection;
    return this.chkBlinkDetection;
  };

  proto.getTimelineDetectorEffect = function (type) {
    if (type === 'blob') return this.blobTrackingEffect;
    if (type === 'face') return this.faceDetectionEffect;
    return this.blinkDetectionEffect;
  };

  proto.resetVideoTimelineDetectors = async function () {
    for (const type of ['blob', 'face', 'blink']) {
      const checkbox = this.getTimelineDetectorCheckbox(type);
      if (checkbox?.checked) {
        checkbox.checked = false;
        await this.toggleEffect(type);
      }
      this.appliedTimelineItemIds[type] = '';
    }
    this.updateQuickDetectorControlsUI?.();
    this.updateEffectsInfo();
  };

  proto.setTimelineDetector = async function (type, item) {
    const checkbox = this.getTimelineDetectorCheckbox(type);
    if (!checkbox) return;
    const shouldEnable = !!item;
    if (checkbox.checked !== shouldEnable) {
      checkbox.checked = shouldEnable;
      const wasSuppressed = !!this.suppressEffectSideEffects;
      this.suppressEffectSideEffects = wasSuppressed || !!this.isVideoExporting;
      try {
        await this.toggleEffect(type);
      } finally {
        this.suppressEffectSideEffects = wasSuppressed;
      }
    }
    const effect = this.getTimelineDetectorEffect(type);
    if (item && effect && typeof effect.setConfig === 'function')
      effect.setConfig(item.config || {});
  };

  proto.getVideoOperationalImageSettings = function () {
    return {
      previewQuality: this.imageSettings.previewQuality,
      jpegQuality: this.imageSettings.jpegQuality,
      videoFormat: this.imageSettings.videoFormat,
      editorExportPreset: this.imageSettings.editorExportPreset,
      editorExportFormat: this.imageSettings.editorExportFormat,
      editorExportMode: this.imageSettings.editorExportMode,
      editorCopyAudio: this.imageSettings.editorCopyAudio,
      experimentalExportFeatures: this.imageSettings.experimentalExportFeatures,
      effectsExportChroma: this.imageSettings.effectsExportChroma,
      captureTimerSeconds: this.imageSettings.captureTimerSeconds,
      qualityEnhancer: this.imageSettings.qualityEnhancer,
      qualityEnhancerStrength: this.imageSettings.qualityEnhancerStrength,
    };
  };

  proto.createVideoBaseImageSettings = function () {
    return {
      ...this.DEFAULT_IMAGE_SETTINGS,
      ...this.getVideoOperationalImageSettings(),
    };
  };

  proto.getBeatMarkerIndexAt = function (mediaTime) {
    const markers = (this.videoTimeline.markers || []).filter(
      (marker) =>
        marker.source === 'edit-assist' &&
        (marker.kind === 'beat' || marker.kind === 'bar') &&
        marker.time <= mediaTime,
    );
    return markers.length - 1;
  };

  proto.getNearestBeatDelta = function (mediaTime) {
    let delta = Infinity;
    (this.videoTimeline.markers || []).forEach((marker) => {
      if (
        marker.source !== 'edit-assist' ||
        (marker.kind !== 'beat' && marker.kind !== 'bar')
      )
        return;
      delta = Math.min(delta, Math.abs(marker.time - mediaTime));
    });
    return delta;
  };

  proto.getTimelineAutomationIntensity = function (item, mediaTime) {
    const mode = this.normalizeClipAutomation(item?.config?.automation);
    if (!item || mode === 'fixed') return 1;
    const duration = Math.max(0.001, item.endTime - item.startTime);
    if (mode === 'fade-in')
      return this.clamp((mediaTime - item.startTime) / duration, 0, 1);
    if (mode === 'fade-out')
      return this.clamp((item.endTime - mediaTime) / duration, 0, 1);
    if (mode === 'alternate-beat') {
      const index = this.getBeatMarkerIndexAt(mediaTime);
      return index === -1 || index % 2 === 0 ? 1 : 0;
    }
    const delta = this.getNearestBeatDelta(mediaTime);
    if (!Number.isFinite(delta)) return 1;
    return this.clamp(1 - delta / 0.22, 0, 1);
  };

  proto.applyLookAutomation = function (base, lookConfig, item, mediaTime) {
    const intensity = this.getTimelineAutomationIntensity(item, mediaTime);
    const automated = { ...lookConfig };
    [
      'exposure',
      'shadows',
      'highlights',
      'contrast',
      'saturation',
      'temperature',
      'detail',
      'sharpness',
    ].forEach((key) => {
      automated[key] = Math.round(
        Number(base[key] || 0) +
          (Number(lookConfig[key] || 0) - Number(base[key] || 0)) * intensity,
      );
    });
    automated.blackAndWhite = intensity >= 0.5 && !!lookConfig.blackAndWhite;
    return automated;
  };

  proto.applyVideoTimelineLook = function (mediaTime, options = {}) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return false;
    const lookItem = this.videoTimeline
      .activeAt(mediaTime)
      .find((item) => item.type === 'look');
    const nextId = lookItem?.id || '';
    const force = !!options.force;
    if (!force && this.appliedTimelineItemIds.look === nextId) return false;

    const baseSettings =
      this.videoBaseImageSettings || this.createVideoBaseImageSettings();
    const lookConfig = lookItem
      ? this.applyLookAutomation(
          baseSettings,
          this.normalizeLookClipConfig(lookItem.config),
          lookItem,
          mediaTime,
        )
      : {};
    this.imageSettings = {
      ...baseSettings,
      ...lookConfig,
      ...this.getVideoOperationalImageSettings(),
    };
    this.appliedTimelineItemIds.look = nextId;
    this.updateImageControlsUI?.();
    return true;
  };

  proto.syncVideoTimelineLookNow = function (options = {}) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    const changed = this.applyVideoTimelineLook(
      this.videoEl.currentTime || 0,
      options,
    );
    if (changed) this.updateEffectsInfo();
  };

  proto.syncVideoTimelineLookAt = function (mediaTime, options = {}) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    this.applyVideoTimelineLook(mediaTime, options);
    this.updateEffectsInfo();
  };

  proto.syncVideoTimelineDetectorsAt = async function (
    mediaTime,
    force = false,
  ) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    const active = this.videoTimeline.activeAt(mediaTime);
    const byType = Object.fromEntries(
      active
        .filter(
          (item) =>
            item.type === 'look' ||
            this.getTimelineAutomationIntensity(item, mediaTime) > 0.1,
        )
        .map((item) => [item.type, item]),
    );
    for (const type of ['blob', 'face', 'blink']) {
      const nextId = byType[type]?.id || '';
      if (force || this.appliedTimelineItemIds[type] !== nextId) {
        await this.setTimelineDetector(type, byType[type]);
        this.appliedTimelineItemIds[type] = nextId;
      }
    }
  };

  proto.syncVideoTimelineDetectors = async function (force = false) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    this.timelineDetectorSyncForce =
      !!force || !!this.timelineDetectorSyncForce;
    if (this.timelineDetectorSyncPromise)
      return this.timelineDetectorSyncPromise;

    this.timelineDetectorSyncPromise = (async () => {
      const shouldForce = this.timelineDetectorSyncForce;
      this.timelineDetectorSyncForce = false;
      await this.syncVideoTimelineDetectorsAt(
        this.videoEl.currentTime || 0,
        shouldForce,
      );
      this.updateEffectsInfo();
      this.updateAdjustmentsClipStatus();
    })().finally(() => {
      this.timelineDetectorSyncPromise = null;
      if (this.timelineDetectorSyncForce) {
        void this.syncVideoTimelineDetectors();
      }
    });

    return this.timelineDetectorSyncPromise;
  };

  proto.timelineDetectorIdsAt = function (mediaTime) {
    const active = this.videoTimeline.activeAt(mediaTime);
    return Object.fromEntries(
      ['blob', 'face', 'blink'].map((type) => {
        const item = active.find((entry) => entry.type === type);
        return [type, item?.id || ''];
      }),
    );
  };

  proto.needsTimelineDetectorSync = function (mediaTime) {
    const ids = this.timelineDetectorIdsAt(mediaTime);
    return ['blob', 'face', 'blink'].some(
      (type) => this.appliedTimelineItemIds[type] !== ids[type],
    );
  };

  proto.syncVideoTimelineEffects = async function (force = false) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    this.syncVideoTimelineLookNow({ force });
    await this.syncVideoTimelineDetectors(force);
  };

  proto.updateInspectorWorkflow = function () {
    if (!this.inspectorWorkflowSteps) return;
    const hasVideo = !!this.videoSourceFile;
    const hasEffects = this.videoTimeline.items.length > 0;
    this.inspectorWorkflowSteps
      .querySelectorAll('[data-step]')
      .forEach((stepEl) => {
        const key = stepEl.dataset.step;
        let done = false;
        let current = false;
        if (key === 'import') {
          done = hasVideo;
          current = !hasVideo;
        } else if (key === 'effects') {
          done = hasEffects;
          current = hasVideo && !hasEffects;
        } else if (key === 'export') {
          current = hasVideo && hasEffects;
        }
        stepEl.classList.toggle('is-done', done);
        stepEl.classList.toggle('is-current', current && !done);
      });
  };

  proto.buildVideoExportPreflight = function () {
    if (!this.videoSourceFile) return null;
    const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
    const { width, height } = this.getEffectiveFrameDimensions(
      sourceWidth,
      sourceHeight,
    );
    return buildEditorExportPreflight({
      preset: this.imageSettings.editorExportPreset,
      width,
      height,
      sourceFps: this.videoSourceFps,
      duration: Math.max(
        0,
        (Number(this.videoTimeline?.trimEnd) || 0) -
          (Number(this.videoTimeline?.trimStart) || 0),
      ),
      sourceBitrate: this.videoSourceAverageBitrate,
      mode: this.imageSettings.editorExportMode,
      requestedFormat: this.imageSettings.editorExportFormat,
      copyAudio: this.imageSettings.editorCopyAudio,
      qualityEnhancer: this.imageSettings.qualityEnhancer,
    });
  };

  proto.getEffectiveVideoExportFps = function () {
    return this.buildVideoExportPreflight()?.fps || null;
  };

  proto.formatVideoExportPreflight = function (preflight) {
    if (!preflight) return 'Importá un video para habilitar la exportación.';
    return `Preflight: ${preflight.width}×${preflight.height} · ${this.formatVideoFps(preflight.fps)} FPS · ${this.formatDurationDetailed(preflight.duration)} · ${preflight.totalFrames} frames · ${this.formatVideoBitrate(preflight.bitrate)} · memoria ${preflight.risk.label}`;
  };

  proto.updateVideoEditorUI = function () {
    const loaded = !!this.videoSourceFile;
    const canExport =
      loaded &&
      typeof VideoEncoder !== 'undefined' &&
      typeof VideoFrame !== 'undefined';
    [
      this.btnVideoStart,
      this.btnVideoBack,
      this.btnVideoPlay,
      this.btnVideoForward,
      this.btnVideoEnd,
    ].forEach((button) => {
      if (button) button.disabled = !loaded || this.isVideoExporting;
    });
    if (this.videoSeek)
      this.videoSeek.disabled = !loaded || this.isVideoExporting;
    if (this.btnExportVideo)
      this.btnExportVideo.disabled = !canExport || this.isVideoExporting;
    if (this.btnHeaderExportVideo)
      this.btnHeaderExportVideo.disabled = !canExport || this.isVideoExporting;
    if (this.btnSaveProject)
      this.btnSaveProject.disabled = !loaded || this.isVideoExporting;
    if (this.btnLoadProject)
      this.btnLoadProject.disabled = this.isVideoExporting;
    if (this.videoTrimStart)
      this.videoTrimStart.disabled = !loaded || this.isVideoExporting;
    if (this.videoTrimEnd)
      this.videoTrimEnd.disabled = !loaded || this.isVideoExporting;
    if (this.btnCutAtMarkers)
      this.btnCutAtMarkers.disabled = !loaded || this.isVideoExporting;
    if (this.btnChooseVideo) {
      this.btnChooseVideo.innerHTML = loaded
        ? '<i class="fa-solid fa-folder-open"></i> Cambiar video'
        : '<i class="fa-solid fa-folder-open"></i> Importar video';
    }
    if (this.videoProjectHelp) {
      this.videoProjectHelp.textContent = loaded
        ? 'Podés reemplazar el video o exportar cuando termines de editar.'
        : 'Elegí el archivo con el que querés trabajar. Podés cambiarlo en cualquier momento.';
    }
    this.timelineEffectPalette
      ?.querySelectorAll('.timeline-palette-chip')
      .forEach((chip) => {
        chip.disabled = !loaded || this.isVideoExporting;
      });
    this.updateVideoEffectInspector();
    this.updateEditorExportControls();
    this.updateAdjustmentsPanelState();
    this.updateInspectorWorkflow();
    this.updateEditorHistoryButtons();
    this.editAssist?.updateUI();
    if (!loaded) {
      if (this.videoFileMeta)
        this.videoFileMeta.textContent = 'Ningún archivo cargado';
      if (this.videoExportDetails)
        this.videoExportDetails.textContent =
          'Importá un video para habilitar la exportación.';
      if (this.videoExportDiagnostics)
        this.videoExportDiagnostics.textContent = '';
      if (this.sourceMode === 'video') {
        this.updatePreviewPlaceholder();
      }
      this.updateTimelineHint();
      return;
    }
    this.updatePreviewPlaceholder();
    if (this.videoExportDetails) {
      const preflight = this.buildVideoExportPreflight();
      const modeLabel =
        preflight?.mode === 'effects-chroma'
          ? 'solo efectos chroma'
          : 'video + efectos';
      const formatLabel =
        preflight?.mode === 'effects-chroma'
          ? 'WebM'
          : (
              preflight?.format ||
              this.imageSettings.editorExportFormat ||
              'auto'
            ).toUpperCase();
      const audioLabel =
        preflight?.mode === 'effects-chroma'
          ? 'sin audio'
          : preflight?.copyAudio
            ? 'audio si compatible'
            : 'sin audio';
      const exportLabel = canExport
        ? `${formatLabel} · ${modeLabel} · ${audioLabel}`
        : 'WebCodecs no disponible';
      this.videoExportDetails.textContent = `${this.formatVideoExportPreflight(preflight)} · ${exportLabel}`;
    }
    void this.refreshVideoExportDiagnostics();
    this.updateTimelineHint();
  };

  proto.updateEditorExportControls = function () {
    const effectsOnly =
      this.imageSettings.editorExportMode === 'effects-chroma';
    const experimental = !!this.imageSettings.experimentalExportFeatures;
    if (!experimental) {
      this.imageSettings.editorExportFormat = 'webm';
      this.imageSettings.editorCopyAudio = false;
    }
    if (this.videoExportModeSelect)
      this.videoExportModeSelect.value = this.imageSettings.editorExportMode;
    if (this.editorExportPresetSelect) {
      this.editorExportPresetSelect.value =
        this.imageSettings.editorExportPreset || 'balanced';
      this.editorExportPresetSelect.disabled = this.isVideoExporting;
    }
    if (this.chkExperimentalExportFeatures) {
      this.chkExperimentalExportFeatures.checked = experimental;
      this.chkExperimentalExportFeatures.disabled = this.isVideoExporting;
    }
    if (this.editorExperimentalExportGroup) {
      this.editorExperimentalExportGroup.classList.toggle(
        'hidden',
        !experimental,
      );
    }
    if (this.editorStableExportDetails) {
      this.editorStableExportDetails.textContent = effectsOnly
        ? 'Estable: WebM · solo efectos chroma'
        : 'Estable: WebM · sin audio';
    }
    if (this.editorExportFormatSelect) {
      this.editorExportFormatSelect.value =
        this.imageSettings.editorExportFormat;
      this.editorExportFormatSelect.disabled =
        !experimental || effectsOnly || this.isVideoExporting;
    }
    if (this.chkEditorCopyAudio) {
      this.chkEditorCopyAudio.checked = !!this.imageSettings.editorCopyAudio;
      this.chkEditorCopyAudio.disabled =
        !experimental || effectsOnly || this.isVideoExporting;
    }
    if (this.effectsExportChromaGroup) {
      this.effectsExportChromaGroup.classList.toggle('hidden', !effectsOnly);
    }
    if (this.effectsExportChromaSelect) {
      this.effectsExportChromaSelect.value =
        this.imageSettings.effectsExportChroma;
      this.effectsExportChromaSelect.disabled =
        !effectsOnly || this.isVideoExporting;
    }
  };

  proto.applyEditorExportPreset = function (preset) {
    const value = [
      'fast',
      'balanced',
      'high',
      'chroma',
      'experimental-mp4',
    ].includes(preset)
      ? preset
      : 'balanced';
    const presets = {
      fast: {
        editorExportMode: 'full',
        experimentalExportFeatures: false,
        editorExportFormat: 'webm',
        editorCopyAudio: false,
        qualityEnhancer: false,
        qualityEnhancerStrength: 20,
      },
      balanced: {
        editorExportMode: 'full',
        experimentalExportFeatures: false,
        editorExportFormat: 'webm',
        editorCopyAudio: false,
        qualityEnhancer: false,
        qualityEnhancerStrength: 35,
      },
      high: {
        editorExportMode: 'full',
        experimentalExportFeatures: false,
        editorExportFormat: 'webm',
        editorCopyAudio: false,
        qualityEnhancer: true,
        qualityEnhancerStrength: 55,
      },
      chroma: {
        editorExportMode: 'effects-chroma',
        experimentalExportFeatures: false,
        editorExportFormat: 'webm',
        editorCopyAudio: false,
        effectsExportChroma: 'green',
        qualityEnhancer: false,
        qualityEnhancerStrength: 35,
      },
      'experimental-mp4': {
        editorExportMode: 'full',
        experimentalExportFeatures: true,
        editorExportFormat: 'mp4',
        editorCopyAudio: true,
        qualityEnhancer: false,
        qualityEnhancerStrength: 35,
      },
    };
    Object.assign(this.imageSettings, presets[value], {
      editorExportPreset: value,
    });
    this.updateImageControlsUI();
    this.updateVideoEditorUI();
    this.saveImageSettings();
  };

  proto.formatVideoExportDiagnosis = function (diagnosis, bitrate) {
    if (!diagnosis.webCodecs)
      return 'Diagnóstico: WebCodecs no disponible. Usá Chrome o Edge actualizado.';
    if (!diagnosis.videoFrame)
      return 'Diagnóstico: VideoFrame no disponible. Usá Chrome o Edge actualizado.';
    const requested =
      diagnosis.requestedFormat === 'auto'
        ? 'Auto'
        : String(diagnosis.requestedFormat || '').toUpperCase();
    if (!diagnosis.supported)
      return `Diagnóstico: ${requested} no soportado (${diagnosis.reason || 'sin codec'}).`;
    const format = String(diagnosis.format || 'webm').toUpperCase();
    const mode =
      diagnosis.mode === 'effects-chroma'
        ? 'solo efectos chroma'
        : 'video + efectos';
    const audio =
      diagnosis.mode === 'effects-chroma'
        ? 'sin audio'
        : diagnosis.audioCopySupported
          ? `audio copiado (${diagnosis.audioCodec})`
          : diagnosis.audioCopyRequested &&
              diagnosis.audioReason === 'audio_codec_unknown'
            ? 'audio se intentará si es compatible'
            : `sin audio${diagnosis.audioReason ? ` (${diagnosis.audioReason})` : ''}`;
    return `Diagnóstico: ${format} · ${diagnosis.codec} · ${this.formatVideoBitrate(bitrate)} · ${mode} · ${audio}`;
  };

  proto.refreshVideoExportDiagnostics = async function () {
    if (!this.videoExportDiagnostics || !this.videoSourceFile) return null;
    const preflight = this.buildVideoExportPreflight();
    if (!preflight) return null;
    const diagnosis = await diagnoseVideoExportSupport({
      width: preflight.width,
      height: preflight.height,
      fps: preflight.fps,
      bitrate: preflight.bitrate,
      requestedFormat: preflight.format,
      mode: preflight.mode,
      copyAudio: preflight.copyAudio,
    });
    this.videoExportDiagnostics.textContent = `${this.formatVideoExportDiagnosis(
      diagnosis,
      preflight.bitrate,
    )} · ${preflight.risk.recommendation}`;
    return diagnosis;
  };

  proto.updateVideoTransport = function () {
    if (this.sourceMode !== 'video') return;
    const duration = this.videoTimeline.duration || 0;
    this.videoSeek.value = String(this.videoEl.currentTime || 0);
    this.videoTimeLabel.textContent = `${this.formatDurationDetailed(this.videoEl.currentTime || 0)} / ${this.formatDurationDetailed(duration)}`;
    this.btnVideoPlay.innerHTML = this.videoEl.paused
      ? '<i class="fa-solid fa-play"></i>'
      : '<i class="fa-solid fa-pause"></i>';
    if (duration > 0)
      this.timelinePlayhead.style.left = `${this.clamp((this.videoEl.currentTime / duration) * 100, 0, 100)}%`;
  };

  proto.getVideoPlayableEnd = function (end = this.videoTimeline?.trimEnd) {
    const duration =
      Number(this.videoTimeline?.duration || this.videoEl?.duration) || 0;
    const safeEnd = Number.isFinite(Number(end)) ? Number(end) : duration;
    return duration > 0 && safeEnd >= duration
      ? Math.max(0, duration - VIDEO_END_EPSILON)
      : Math.max(0, safeEnd);
  };

  proto.clampVideoSeekTime = function (time) {
    const start = Math.max(0, Number(this.videoTimeline?.trimStart) || 0);
    const end = this.getVideoPlayableEnd(this.videoTimeline?.trimEnd);
    return this.clamp(Number(time) || 0, start, Math.max(start, end));
  };

  proto.toggleVideoPlayback = async function () {
    if (!this.videoSourceFile || this.isVideoExporting) return;
    if (this.videoEl.paused) {
      const end = this.getVideoPlayableEnd(this.videoTimeline.trimEnd);
      if (
        this.videoEl.currentTime < this.videoTimeline.trimStart ||
        this.videoEl.currentTime >= end
      ) {
        this.cancelRenderLoop();
        this.videoEl.currentTime = this.videoTimeline.trimStart;
      }
      await this.videoEl
        .play()
        .catch(() =>
          this.showStatus(
            this.videoEditorStatus,
            'No se pudo reproducir el video.',
            'error',
          ),
        );
      if (!this.animFrameId) this.scheduleRenderLoop();
    } else {
      this.videoEl.pause();
    }
    this.updateVideoTransport();
  };

  proto.seekVideo = function (time) {
    if (!this.videoSourceFile || this.isVideoExporting) return;
    this.videoEl.currentTime = this.clampVideoSeekTime(time);
    this.updateVideoTransport();
    if (!this.animFrameId) this.scheduleRenderLoop();
  };

  proto.jumpVideo = function (seconds) {
    this.seekVideo((this.videoEl.currentTime || 0) + seconds);
  };

  proto.renderVideoExportFrame = async function (
    frameIndex,
    fps,
    exportMeta = {},
  ) {
    const start = this.videoTimeline.trimStart;
    const time = start + frameIndex / fps;
    const exportMode =
      exportMeta.mode || this.imageSettings.editorExportMode || 'full';
    this.updateVideoExportProgress(
      frameIndex,
      this.videoExportTotalFrames || 0,
      fps,
      { stage: frameIndex === 0 ? 'seek' : 'decode', time, force: true },
    );
    try {
      await this.advanceVideoForExport(time, fps, frameIndex);
    } catch (err) {
      if (this.videoExportPlayback && frameIndex > 0) {
        await this.reuseCurrentVideoExportFrame();
        this.updateVideoExportProgress(
          frameIndex,
          this.videoExportTotalFrames || 0,
          fps,
          {
            stage: 'frame-reuse',
            time,
            force: true,
            note: `frames_reutilizados:${this.videoExportSkippedFrames || 0}`,
          },
        );
      } else {
        this.updateVideoExportProgress(
          frameIndex,
          this.videoExportTotalFrames || 0,
          fps,
          {
            stage: 'seek-retry',
            time,
            force: true,
            note: err?.message || err?.name || 'seek_failed',
          },
        );
        if (this.canRecoverVideoExportSeek(err)) {
          await this.recoverVideoSourceForExport(time);
        }
        await this.seekVideoForExport(time);
      }
    }
    if (exportMode === 'full') {
      this.updateVideoExportProgress(
        frameIndex,
        this.videoExportTotalFrames || 0,
        fps,
        { stage: 'look', time },
      );
      this.applyVideoTimelineLook(time, { force: true });
    }
    this.updateVideoExportProgress(
      frameIndex,
      this.videoExportTotalFrames || 0,
      fps,
      { stage: 'detectors', time },
    );
    await this.syncVideoTimelineDetectorsAt(time, false);
    this.updateVideoExportProgress(
      frameIndex,
      this.videoExportTotalFrames || 0,
      fps,
      { stage: 'canvas', time },
    );
    if (exportMode === 'effects-chroma') {
      this.ensureRecordingCanvas();
      this.renderEffectsOnlyFrame(
        this.recordingCanvas,
        this.recordingCtx,
        exportMeta.chromaColor ||
          getEditorChromaColor(this.imageSettings.effectsExportChroma),
        'export',
      );
    } else {
      this.renderSourceFrameBuffer(
        !!this.imageSettings.qualityEnhancer,
        'export',
      );
    }
    this.videoExportLastRenderedFrameIndex = frameIndex;
  };

  proto.updateVideoExportProgress = function (done, total, fps, meta = {}) {
    if (!this.videoExportProgress || !this.videoExportSummary) return;
    const now = performance.now();
    const force = !!meta.force || done >= total || meta.stage === 'error';
    if (
      !force &&
      this.videoExportLastUiUpdate &&
      now - this.videoExportLastUiUpdate < 250
    )
      return;
    this.videoExportLastUiUpdate = now;
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeDone = this.clamp(Number(done) || 0, 0, safeTotal);
    const progress = safeDone / safeTotal;
    this.videoExportProgress.value = progress;
    this.videoExportSummary.textContent = formatObservedExportProgress({
      done: safeDone,
      total: safeTotal,
      startedAt: this.videoExportSession.startedAt || now,
      now,
      fps,
      stage: meta.stage,
    });
    if (this.videoExportDebug && this.formatExportDebugInfo) {
      this.videoExportDebug.textContent = this.formatExportDebugInfo({
        stage: meta.stage || 'encode',
        done: safeDone,
        total: safeTotal,
        fps,
        time:
          meta.time ??
          this.videoTimeline.trimStart +
            Math.max(0, safeDone - 1) / Math.max(1, Number(fps) || 1),
        width: this.recordingCanvas?.width || 0,
        height: this.recordingCanvas?.height || 0,
        queueSize: meta.queueSize || 0,
        note: meta.note || '',
      });
    }
  };

  proto.runVideoExportViaWebCodecs = async function () {
    const { encodeCanvasSequence, formatExportDebugInfo } =
      await import('../video-export.mjs');
    const preflight =
      this.videoExportPreflight || this.buildVideoExportPreflight();
    if (!preflight) throw new Error('video_export_preflight_missing');
    this.videoExportPreflight = preflight;
    const fps = preflight.fps;
    const start = this.videoTimeline.trimStart;
    const end = this.videoTimeline.trimEnd;
    const mode = preflight.mode;
    const totalFrames = preflight.totalFrames;
    this.ensureRecordingCanvas();
    this.formatExportDebugInfo = formatExportDebugInfo;
    this.videoExportTotalFrames = totalFrames;
    const bitrate = preflight.bitrate;
    const diagnosis =
      this.videoExportDiagnosis ||
      (await diagnoseVideoExportSupport({
        width: preflight.width,
        height: preflight.height,
        fps,
        bitrate,
        requestedFormat: preflight.format,
        mode,
        copyAudio: preflight.copyAudio,
      }));

    const baseName =
      this.videoSourceFile.name.replace(/\.[^.]+$/, '') || 'hatewebcam-video';
    const suffix = mode === 'effects-chroma' ? 'efectos-chroma' : 'editado';
    this.videoExportFileName = `${baseName}-${suffix}.${diagnosis.extension || 'webm'}`;

    await this.prepareSequentialVideoExport(start);

    return encodeCanvasSequence({
      canvas: this.recordingCanvas,
      width: this.recordingCanvas.width,
      height: this.recordingCanvas.height,
      fps,
      totalFrames,
      duration: end - start,
      bitrate,
      requestedFormat: preflight.format,
      mode,
      chromaColor: this.imageSettings.effectsExportChroma,
      audioSourceFile: this.videoSourceFile,
      trimStart: start,
      trimEnd: end,
      copyAudio: !!preflight.copyAudio,
      diagnosis,
      renderFrame: (frameIndex, meta) =>
        this.renderVideoExportFrame(frameIndex, fps, meta),
      onProgress: (done, total, meta) =>
        this.updateVideoExportProgress(done, total, fps, meta),
      shouldCancel: () => !this.isVideoExporting,
    });
  };

  proto.finalizeVideoExportBlob = async function (blob) {
    if (
      blob?.exportInfo?.extension &&
      !this.videoExportFileName.endsWith(`.${blob.exportInfo.extension}`)
    ) {
      this.videoExportFileName = this.videoExportFileName.replace(
        /\.[^.]+$/,
        `.${blob.exportInfo.extension}`,
      );
    }
    this.downloadBlob(blob, this.videoExportFileName);
    this.showStatus(
      this.videoEditorStatus,
      'Exportación terminada y guardada.',
      'success',
    );
    this.videoExportProgress.value = 1;
    this.videoExportTitle.innerHTML =
      '<i class="fa-solid fa-circle-check"></i> Exportación terminada';
    const audioNote = blob?.exportInfo?.audioCopied
      ? ` · audio ${blob.exportInfo.audioCodec}`
      : blob?.exportInfo?.audioReason && blob.exportInfo.mode === 'full'
        ? ` · ${blob.exportInfo.audioReason}`
        : '';
    this.videoExportSummary.textContent = `${this.videoExportFileName} · ${this.formatBytes(blob.size)}${audioNote} · descarga iniciada`;
    this.btnCancelVideoExport.classList.add('hidden');
    this.btnCloseVideoExportModal.classList.remove('hidden');
    this.cleanupVideoExport(true);
  };

  proto.startVideoExport = async function () {
    if (!this.videoSourceFile || this.isVideoExporting) return;
    if (typeof HTMLCanvasElement === 'undefined') {
      this.showStatus(
        this.videoEditorStatus,
        'Este navegador no puede exportar el video.',
        'error',
      );
      return;
    }

    if (
      typeof VideoEncoder === 'undefined' ||
      typeof VideoFrame === 'undefined'
    ) {
      this.showStatus(
        this.videoEditorStatus,
        'La exportación fiable requiere Chrome o Edge actualizado con WebCodecs.',
        'error',
      );
      return;
    }

    try {
      const preflight = this.buildVideoExportPreflight();
      if (!preflight) throw new Error('video_export_preflight_missing');
      this.videoExportPreflight = preflight;
      if (this.videoExportDetails) {
        this.videoExportDetails.textContent =
          this.formatVideoExportPreflight(preflight);
      }
      if (preflight.blocked) {
        if (this.videoExportDiagnostics) {
          this.videoExportDiagnostics.textContent =
            preflight.risk.recommendation;
        }
        this.showStatus(
          this.videoEditorStatus,
          'Exportación bloqueada por riesgo de memoria. Reducí duración o usá Rápido/Balanceado.',
          'error',
        );
        this.videoExportPreflight = null;
        return;
      }
      this.ensureRecordingCanvas();
      const diagnosis = await diagnoseVideoExportSupport({
        width: preflight.width,
        height: preflight.height,
        fps: preflight.fps,
        bitrate: preflight.bitrate,
        requestedFormat: preflight.format,
        mode: preflight.mode,
        copyAudio: preflight.copyAudio,
      });
      this.videoExportDiagnosis = diagnosis;
      if (this.videoExportDiagnostics) {
        this.videoExportDiagnostics.textContent = `${this.formatVideoExportDiagnosis(
          diagnosis,
          preflight.bitrate,
        )} · ${preflight.risk.recommendation}`;
      }
      if (!diagnosis.supported) {
        this.showStatus(
          this.videoEditorStatus,
          this.formatVideoExportDiagnosis(diagnosis, preflight.bitrate),
          'error',
        );
        this.videoExportPreflight = null;
        return;
      }
      this.flushPendingClipConfigSync();
      this.appliedTimelineItemIds = {
        look: '',
        blob: '',
        face: '',
        blink: '',
      };
      this.videoExportRecoveredSource = false;
      this.videoExportSession.start(0);
      this.videoExportProgress.value = 0;
      this.videoExportTitle.innerHTML =
        '<i class="fa-solid fa-file-export"></i> Exportando video';
      this.videoExportSummary.textContent = 'Preparando exportación…';
      if (this.videoExportDebug)
        this.videoExportDebug.textContent = 'stage:preparando · frame:0/?';
      this.btnCancelVideoExport.classList.remove('hidden');
      this.btnCloseVideoExportModal.classList.add('hidden');
      this.videoExportModal.classList.remove('hidden');
      this.activateModalFocusTrap(
        this.videoExportModal,
        this.btnCancelVideoExport,
      );
      this.updateVideoEditorUI();
      this.cancelRenderLoop();
      if ('wakeLock' in navigator) {
        this.videoExportWakeLock = await navigator.wakeLock
          .request('screen')
          .catch(() => null);
      }

      const blob = await this.runVideoExportViaWebCodecs();
      await this.finalizeVideoExportBlob(blob);
    } catch (err) {
      if (err?.message === 'export_cancelled') {
        this.cleanupVideoExport(true);
        return;
      }
      this.failVideoExport(err);
    }
  };

  proto.seekVideoForExport = function (time) {
    const target = this.clamp(
      time,
      0,
      this.getVideoPlayableEnd(this.videoTimeline.duration),
    );
    const tolerance = 0.02;
    if (Math.abs(this.videoEl.currentTime - target) <= tolerance)
      return this.waitForExportVideoFrame();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        clearInterval(poll);
        this.videoEl.removeEventListener('seeked', onSeeked);
        this.videoEl.removeEventListener('error', onError);
      };
      const isAtTarget = () =>
        Math.abs((this.videoEl.currentTime || 0) - target) <= tolerance &&
        this.videoEl.readyState >= 2;
      const fail = (err) => {
        if (isAtTarget()) {
          onSeeked();
          return;
        }
        cleanup();
        reject(err);
      };
      const onSeeked = () => {
        cleanup();
        this.waitForExportVideoFrame().then(resolve, reject);
      };
      const onError = () => fail(new Error('video_decode_failed'));
      const poll = setInterval(() => {
        if (isAtTarget()) onSeeked();
      }, 120);
      const timeout = setTimeout(
        () => fail(new Error('video_seek_timeout')),
        5000,
      );
      this.videoEl.addEventListener('seeked', onSeeked, { once: true });
      this.videoEl.addEventListener('error', onError, { once: true });
      this.videoEl.currentTime = target;
    });
  };

  proto.canRecoverVideoExportSeek = function (err) {
    return (
      !this.videoExportRecoveredSource &&
      ['video_decode_failed', 'video_seek_timeout'].includes(err?.message)
    );
  };

  proto.recoverVideoSourceForExport = async function (time) {
    if (!this.videoSourceFile) throw new Error('video_decode_failed');
    this.videoExportRecoveredSource = true;
    this.updateVideoExportProgress(
      0,
      this.videoExportTotalFrames || 0,
      this.getVideoExportFps(),
      {
        stage: 'source-reload',
        time,
        force: true,
        note: 'recargando_video',
      },
    );

    const previousUrl = this.videoObjectUrl;
    const nextUrl = URL.createObjectURL(this.videoSourceFile);
    try {
      await new Promise((resolve, reject) => {
        let timeout = null;
        const cleanup = () => {
          clearTimeout(timeout);
          this.videoEl.removeEventListener('loadedmetadata', loaded);
          this.videoEl.removeEventListener('error', failed);
        };
        const loaded = () => {
          cleanup();
          resolve();
        };
        const failed = () => {
          cleanup();
          reject(new Error('video_decode_failed'));
        };
        timeout = setTimeout(() => {
          cleanup();
          reject(new Error('video_seek_timeout'));
        }, 5000);
        this.videoEl.addEventListener('loadedmetadata', loaded, {
          once: true,
        });
        this.videoEl.addEventListener('error', failed, { once: true });
        this.videoEl.pause();
        this.videoEl.srcObject = null;
        this.videoEl.src = nextUrl;
        this.videoEl.muted = true;
        this.videoEl.preload = 'auto';
        this.videoEl.load();
      });
      if (previousUrl && previousUrl !== nextUrl)
        URL.revokeObjectURL(previousUrl);
      this.videoObjectUrl = nextUrl;
    } catch (err) {
      URL.revokeObjectURL(nextUrl);
      if (previousUrl) {
        this.videoEl.src = previousUrl;
        this.videoEl.load();
      }
      throw err;
    }
  };

  proto.prepareSequentialVideoExport = async function (startTime) {
    this.videoExportPlayback = {
      originalPlaybackRate: this.videoEl.playbackRate || 1,
      originalMuted: this.videoEl.muted,
      playbackRate: VIDEO_EXPORT_PLAYBACK_RATE,
    };
    this.videoEl.muted = true;
    this.videoEl.playbackRate = this.videoExportPlayback.playbackRate;
    this.videoEl.pause();
    try {
      await this.seekVideoForExport(startTime);
    } catch (err) {
      if (!this.canRecoverVideoExportSeek(err)) throw err;
      await this.recoverVideoSourceForExport(startTime);
      await this.seekVideoForExport(startTime);
    }
  };

  proto.advanceVideoForExport = async function (
    targetTime,
    fps,
    frameIndex = 0,
  ) {
    if (!this.videoExportPlayback || frameIndex === 0)
      return this.seekVideoForExport(targetTime);
    const tolerance = Math.min(0.025, 0.45 / Math.max(1, Number(fps) || 1));
    const current = this.videoEl.currentTime || 0;
    if (Math.abs(current - targetTime) <= tolerance) return;
    if (current > targetTime + tolerance) {
      this.videoEl.pause();
      if (this.videoExportPlayback) this.videoExportPlayback.playbackRate = 1;
      this.videoEl.playbackRate = 1;
      return this.reuseCurrentVideoExportFrame();
    }
    return this.playVideoUntilExportTime(targetTime, tolerance);
  };

  proto.reuseCurrentVideoExportFrame = async function () {
    this.videoExportSkippedFrames = (this.videoExportSkippedFrames || 0) + 1;
  };

  proto.playVideoUntilExportTime = function (targetTime, tolerance) {
    if (typeof this.videoEl.play !== 'function')
      return this.reuseCurrentVideoExportFrame();
    this.videoEl.playbackRate = this.videoExportPlayback?.playbackRate || 1;
    return new Promise((resolve, reject) => {
      let frameCallbackId = null;
      const cleanup = () => {
        clearTimeout(timeout);
        this.videoEl.removeEventListener('error', onError);
        if (
          frameCallbackId != null &&
          typeof this.videoEl.cancelVideoFrameCallback === 'function'
        ) {
          this.videoEl.cancelVideoFrameCallback(frameCallbackId);
        }
      };
      const done = () => {
        this.videoEl.pause();
        cleanup();
        resolve();
      };
      const fail = (err) => {
        cleanup();
        reject(err);
      };
      const tick = () => {
        frameCallbackId = null;
        if (!this.isVideoExporting) {
          fail(new Error('export_cancelled'));
          return;
        }
        if (
          (this.videoEl.currentTime || 0) >= targetTime - tolerance ||
          this.videoEl.ended
        ) {
          done();
          return;
        }
        if (typeof this.videoEl.requestVideoFrameCallback === 'function') {
          frameCallbackId = this.videoEl.requestVideoFrameCallback(tick);
        } else {
          setTimeout(tick, 8);
        }
      };
      const onError = () => fail(new Error('video_decode_failed'));
      const secondsLeft = Math.max(
        0,
        targetTime - (this.videoEl.currentTime || 0),
      );
      const timeout = setTimeout(
        () => {
          cleanup();
          this.videoEl.pause();
          this.reuseCurrentVideoExportFrame().then(resolve, reject);
        },
        Math.max(700, secondsLeft * 1200 + 500),
      );
      this.videoEl.addEventListener('error', onError, { once: true });
      this.videoEl.play().then(tick, () => {
        cleanup();
        this.videoEl.pause();
        this.reuseCurrentVideoExportFrame().then(resolve, reject);
      });
    });
  };

  proto.waitForExportVideoFrame = function () {
    if (typeof this.videoEl.requestVideoFrameCallback !== 'function')
      return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(done, 120);
      this.videoEl.requestVideoFrameCallback(done);
    });
  };

  proto.cancelVideoExport = async function (showMessage = true) {
    if (!this.isVideoExporting) return;
    this.isVideoExporting = false;
    this.videoEl.pause();
    this.videoEl.playbackRate =
      this.videoExportPlayback?.originalPlaybackRate || 1;
    if (this.videoExportPlayback)
      this.videoEl.muted = this.videoExportPlayback.originalMuted;
    this.videoExportPlayback = null;
    if (showMessage)
      this.showStatus(
        this.videoEditorStatus,
        'Exportación cancelada.',
        'warning',
      );
    this.videoExportTitle.innerHTML =
      '<i class="fa-solid fa-ban"></i> Exportación cancelada';
    this.videoExportSummary.textContent = 'No se descargó ningún archivo.';
    this.btnCancelVideoExport.classList.add('hidden');
    this.btnCloseVideoExportModal.classList.remove('hidden');
    this.cleanupVideoExport(true);
  };

  proto.failVideoExport = function (err) {
    console.error('Video export failed:', err);
    const messages = {
      webcodecs_codec_unsupported:
        'No hay un codec compatible para el formato elegido.',
      webcodecs_unavailable:
        'WebCodecs no está disponible. Usá Chrome o Edge actualizado.',
      videoframe_unavailable:
        'VideoFrame no está disponible. Usá Chrome o Edge actualizado.',
      video_export_preflight_missing:
        'No se pudo calcular la exportación antes de iniciar.',
      video_seek_timeout: 'No se pudo leer un frame del video a tiempo.',
      video_playback_timeout:
        'No se pudo avanzar el video a tiempo durante la exportación.',
      video_decode_failed: 'El navegador no pudo decodificar el video.',
    };
    const message =
      messages[err?.message] ||
      'La exportación falló. Revisá espacio libre y permisos.';
    this.showStatus(this.videoEditorStatus, message, 'error');
    void this.cancelVideoExport(false).then(() => {
      this.videoExportTitle.innerHTML =
        '<i class="fa-solid fa-triangle-exclamation"></i> Error de exportación';
      const detail = err?.message || err?.name || 'error_desconocido';
      this.videoExportSummary.textContent = `${message} · ${detail}`;
      if (this.videoExportDebug && this.formatExportDebugInfo) {
        this.videoExportDebug.textContent = this.formatExportDebugInfo({
          stage: 'error',
          done: this.videoExportProgress?.value
            ? Math.round(
                this.videoExportProgress.value *
                  (this.videoExportTotalFrames || 0),
              )
            : 0,
          total: this.videoExportTotalFrames || 0,
          fps: this.getVideoExportFps(),
          width: this.recordingCanvas?.width || 0,
          height: this.recordingCanvas?.height || 0,
        });
      }
    });
  };

  proto.cleanupVideoExport = function (keepModal = false) {
    this.videoExportSession.stop();
    this.videoExportFileName = '';
    this.videoExportDiagnosis = null;
    this.videoExportPreflight = null;
    this.videoExportRecoveredSource = false;
    if (this.videoExportPlayback) {
      this.videoEl.pause();
      this.videoEl.playbackRate =
        this.videoExportPlayback.originalPlaybackRate || 1;
      this.videoEl.muted = this.videoExportPlayback.originalMuted;
      this.videoExportPlayback = null;
    }
    if (!keepModal) {
      this.videoExportTotalFrames = 0;
      this.videoExportLastRenderedFrameIndex = -1;
      this.videoExportSeekFallback = false;
      this.videoExportSkippedFrames = 0;
      this.videoExportProgress.value = 0;
      this.videoExportModal.classList.add('hidden');
      this.deactivateModalFocusTrap(this.videoExportModal);
    }
    void this.videoExportSession.releaseWakeLock();
    this.updateVideoEditorUI();
    this.updateVideoTransport();
    if (this.isRunning && this.videoSourceFile && !this.animFrameId)
      this.scheduleRenderLoop();
  };

  proto.closeVideoExportModal = function () {
    if (this.isVideoExporting) return;
    this.videoExportModal.classList.add('hidden');
    this.deactivateModalFocusTrap(this.videoExportModal);
    this.videoExportProgress.value = 0;
  };
}
