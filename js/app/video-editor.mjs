import { diagnoseVideoExportSupport, formatObservedExportProgress } from '../video-export.mjs';

/** @param {import('./controller.mjs').AppController} proto */
export function applyLocalvideoeditorMixin(proto) {
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
      document.querySelectorAll('.webcam-only').forEach((el) => el.classList.add('hidden'));
      document.querySelectorAll('.video-only').forEach((el) => el.classList.remove('hidden'));
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
    document.querySelectorAll('.video-only').forEach((el) => el.classList.add('hidden'));
    document.querySelectorAll('.webcam-only').forEach((el) => el.classList.remove('hidden'));
    this.btnVideoMode.classList.remove('is-active');
    this.btnWebcamMode.classList.add('is-active');
    this.btnVideoMode.setAttribute('aria-selected', 'false');
    this.btnWebcamMode.setAttribute('aria-selected', 'true');
    this.setCameraPlaceholderMessage('Iniciando cámara automáticamente...');
    this.updatePreviewPlaceholder();
    void this.restoreWebcamSessionState();
    void this.toggleCamera(true);
  }

  proto.restoreWebcamSessionState = async function () {
    if (!this.webcamSessionState) return;
    this.imageSettings = { ...this.webcamSessionState.imageSettings };
    this.updateImageControlsUI();
    for (const [type, checkbox] of [['blob', this.chkBlobTracking], ['face', this.chkFaceDetection], ['blink', this.chkBlinkDetection]]) {
      if (checkbox.checked) {
        checkbox.checked = false;
        await this.toggleEffect(type);
      }
      if (this.webcamSessionState[type]) {
        checkbox.checked = true;
        await this.toggleEffect(type);
        const effect = type === 'blob' ? this.blobTrackingEffect : type === 'face' ? this.faceDetectionEffect : this.blinkDetectionEffect;
        const config = this.webcamSessionState[`${type}Config`];
        if (effect && config) effect.setConfig(config);
      }
    }
    this.webcamSessionState = null;
    this.updateQuickDetectorControlsUI();
    this.updateEffectsInfo();
  }

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
    this.appliedTimelineItemIds = {};
    this.timelineDetectorSyncPromise = null;
    this.timelineDetectorSyncForce = false;
    this.videoBaseImageSettings = null;
    this.timelineItems.innerHTML = '';
    this.videoPlaceholderLoading = false;
    if (this.sourceMode === 'video') {
      void this.resetVideoTimelineDetectors();
      this.clearPreviewCanvas();
      this.updatePreviewPlaceholder();
    } else {
      this.updatePreviewPlaceholder();
    }
  }

  proto.loadVideoFile = async function (file) {
    if (!file || !(file instanceof File)) return;
    if (!file.type.startsWith('video/')) {
      this.showStatus(this.videoEditorStatus, 'Elegí un archivo de video válido.', 'error');
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
      if (!Number.isFinite(this.videoEl.duration) || this.videoEl.duration <= 0 || !this.videoEl.videoWidth || !this.videoEl.videoHeight) {
        throw new Error('video_metadata_invalid');
      }
      this.videoEl.currentTime = Math.min(0.001, this.videoEl.duration);

      const { calculateFrameRateFromMediaTimes, calculateSourceAverageBitrate } = await import('../video-export.mjs');
      this.videoSourceFps = await this.detectVideoSourceFps(this.videoEl, calculateFrameRateFromMediaTimes);
      this.videoSourceAverageBitrate = calculateSourceAverageBitrate(file.size, this.videoEl.duration);
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
      this.videoFileMeta.textContent = `${file.name} · ${this.formatBytes(file.size)} · ${this.videoEl.videoWidth}×${this.videoEl.videoHeight} · ${this.formatDurationDetailed(this.videoEl.duration)} · ${this.formatVideoFps(this.videoSourceFps)} FPS · ${this.formatVideoBitrate(this.videoSourceAverageBitrate)} estimado`;
      this.frameCount = 0;
      this.lastFpsTime = performance.now();
      this.syncPreviewCanvasMetrics(this.videoEl.videoWidth, this.videoEl.videoHeight, true);
      this.scheduleRenderLoop();
      this.renderVideoTimeline();
      await this.syncVideoTimelineEffects(true);
      this.updateVideoEditorUI();
      this.applyTimelineZoom();
      this.showStatus(this.videoEditorStatus, 'Video listo.', 'success');
      setTimeout(() => this.hideStatus(this.videoEditorStatus), 1800);
    } catch (err) {
      console.error('Error loading video:', err);
      this.disposeVideoSource();
      const message = err?.message === 'video_metadata_invalid'
        ? 'El video no contiene resolución o duración válidas.'
        : 'El navegador no puede decodificar este archivo.';
      this.showStatus(this.videoEditorStatus, message, 'error');
      this.updateVideoEditorUI();
    }
  }

  proto.applyVideoTrim = function (resetSelection = true) {
    if (!this.videoSourceFile) return;
    try {
      this.videoTimeline.setTrim(this.videoTrimStart.value, this.videoTrimEnd.value);
      this.videoEl.currentTime = this.clamp(this.videoEl.currentTime, this.videoTimeline.trimStart, this.videoTimeline.trimEnd);
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
  }

  proto.getSelectedVideoEffectItem = function () {
    return this.videoTimeline.items.find((candidate) => candidate.id === this.selectedVideoEffectId) || null;
  }

  proto.isPlayheadInSelectedClip = function () {
    const item = this.getSelectedVideoEffectItem();
    if (!item || !this.videoSourceFile) return false;
    const time = this.videoEl.currentTime || 0;
    return time >= item.startTime && time < item.endTime;
  }

  proto.applyClipConfigToQuickSettings = function (item) {
    if (!item?.config) return;
    if (item.type === 'blob') {
      if (item.config.boxColor) this.quickDetectorSettings.blobBoxColor = item.config.boxColor;
      return;
    }
    if (item.type === 'face') {
      const config = item.config;
      if (config.boxColor) this.quickDetectorSettings.faceBoxColor = config.boxColor;
      if (config.labelText != null) this.quickDetectorSettings.faceLabelText = this.normalizeFaceLabel(config.labelText);
      if (config.showBox != null) this.quickDetectorSettings.faceShowBox = !!config.showBox;
      if (config.showBlur != null) this.quickDetectorSettings.faceShowBlur = !!config.showBlur;
      if (config.pixelationCellSize != null) {
        this.quickDetectorSettings.facePixelationCellSize = this.clamp(parseInt(config.pixelationCellSize, 10) || this.quickDetectorSettings.facePixelationCellSize, 4, 48);
      }
      if (config.censorPaddingPercent != null) {
        this.quickDetectorSettings.faceCensorPaddingPercent = this.clamp(parseInt(config.censorPaddingPercent, 10) || this.quickDetectorSettings.faceCensorPaddingPercent, 0, 48);
      }
    }
  }

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
  }

  proto.updateAdjustmentsPanelState = function () {
    const hasVideo = !!this.videoSourceFile;
    const item = this.getSelectedVideoEffectItem();
    const hasSelection = !!item;
    if (this.inspectorAdjustNoVideo) this.inspectorAdjustNoVideo.classList.toggle('hidden', hasVideo);
    if (this.inspectorAdjustNoClip) this.inspectorAdjustNoClip.classList.toggle('hidden', !hasVideo || hasSelection);
    if (this.inspectorAdjustmentsHost) this.inspectorAdjustmentsHost.classList.toggle('hidden', !hasSelection);
    if (this.adjustContextNav) this.adjustContextNav.classList.toggle('hidden', !hasSelection);
    if (hasSelection) this.updateAdjustmentsContext();
  }

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
    };
  }

  proto.syncLookClipConfigNow = function () {
    if (this.sourceMode !== 'video' || !this.selectedVideoEffectId) return;
    const item = this.videoTimeline.items.find((candidate) => candidate.id === this.selectedVideoEffectId);
    if (!item || item.type !== 'look') return;
    try {
      this.videoTimeline.upsert({
        ...item,
        config: this.snapshotVideoEffectConfig('look'),
      });
    } catch (err) {
      console.warn('No se pudo guardar el look del clip:', err.message);
    }
  }

  proto.snapshotVideoEffectConfig = function (type) {
    if (type === 'look') {
      const {
        previewQuality,
        jpegQuality,
        videoFormat,
        captureTimerSeconds,
        qualityEnhancer,
        qualityEnhancerStrength,
        ...lookSettings
      } = this.imageSettings;
      return this.normalizeLookClipConfig(lookSettings);
    }
    if (type === 'blob') return this.blobTrackingEffect ? this.blobTrackingEffect.getConfig() : {
      boxColor: this.quickDetectorSettings.blobBoxColor,
    };
    if (type === 'face') return this.faceDetectionEffect ? this.faceDetectionEffect.getConfig() : {
      boxColor: this.quickDetectorSettings.faceBoxColor,
      labelText: this.quickDetectorSettings.faceLabelText,
      showBox: this.quickDetectorSettings.faceShowBox,
      showBlur: this.quickDetectorSettings.faceShowBlur,
      visualMode: this.getFaceVisualMode(),
      pixelationCellSize: this.quickDetectorSettings.facePixelationCellSize,
      censorPaddingPercent: this.quickDetectorSettings.faceCensorPaddingPercent,
    };
    return this.blinkDetectionEffect ? this.blinkDetectionEffect.getConfig() : {};
  }

  proto.applyVideoEffectItemConfig = function (item) {
    if (!item?.config) return;
    if (item.type === 'look') {
      const {
        previewQuality,
        jpegQuality,
        videoFormat,
        captureTimerSeconds,
        qualityEnhancer,
        qualityEnhancerStrength,
        ...lookSettings
      } = item.config;
      this.imageSettings = { ...this.imageSettings, ...lookSettings };
      this.updateImageControlsUI();
      this.saveImageSettings();
      return;
    }
    if (item.type === 'blob') {
      if (this.blobTrackingEffect) this.blobTrackingEffect.setConfig(item.config);
      else this.applyClipConfigToQuickSettings(item);
    } else if (item.type === 'face') {
      if (this.faceDetectionEffect) this.faceDetectionEffect.setConfig(item.config);
      else this.applyClipConfigToQuickSettings(item);
    } else if (item.type === 'blink' && this.blinkDetectionEffect) {
      this.blinkDetectionEffect.setConfig(item.config);
    }
    this.syncQuickDetectorSettingsFromEffects();
    this.updateQuickDetectorControlsUI();
    this.renderEffectConfig();
  }

  proto.commitSelectedEffectTiming = function (options = {}) {
    if (!this.selectedVideoEffectId) return;
    const item = this.videoTimeline.items.find((candidate) => candidate.id === this.selectedVideoEffectId);
    if (!item) return;
    const minSpan = 0.05;
    const startTime = this.clamp(Number(this.videoEffectStart.value) || 0, this.videoTimeline.trimStart, this.videoTimeline.trimEnd - minSpan);
    const endTime = this.clamp(Number(this.videoEffectEnd.value) || 0, startTime + minSpan, this.videoTimeline.trimEnd);
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
  }

  proto.roundTimelineTime = function (time) {
    return Math.round((Number(time) || 0) * 1000) / 1000;
  }

  proto.resolveTimelineClipTimes = function ({ type, startTime, endTime, edge = 'move', itemId = '' }) {
    const minSpan = 0.05;
    let start = this.roundTimelineTime(startTime);
    let end = this.roundTimelineTime(endTime);
    const span = Math.max(minSpan, end - start);

    if (edge === 'move') {
      start = this.clamp(start, this.videoTimeline.trimStart, this.videoTimeline.trimEnd - span);
      end = start + span;
    } else if (edge === 'start') {
      start = this.clamp(start, this.videoTimeline.trimStart, end - minSpan);
    } else {
      end = this.clamp(end, start + minSpan, this.videoTimeline.trimEnd);
    }

    if (this.chkTimelineSnap?.checked) {
      const threshold = 0.12 / Math.max(1, this.timelineZoom);
      const points = [
        this.videoTimeline.trimStart,
        this.videoTimeline.trimEnd,
        this.videoEl.currentTime || 0,
      ];
      this.videoTimeline.items.forEach((item) => {
        if (item.id === itemId || item.type !== type) return;
        points.push(item.startTime, item.endTime);
      });
      let bestDelta = threshold;
      let bestShift = 0;
      for (const point of points) {
        for (const time of edge === 'move' ? [start, end] : [edge === 'start' ? start : end]) {
          const delta = Math.abs(point - time);
          if (delta < bestDelta) {
            bestDelta = delta;
            bestShift = point - time;
          }
        }
      }
      if (bestShift) {
        if (edge === 'move') {
          start += bestShift;
          end += bestShift;
        } else if (edge === 'start') {
          start += bestShift;
        } else {
          end += bestShift;
        }
      }
    }

    if (edge === 'move') {
      start = this.clamp(start, this.videoTimeline.trimStart, this.videoTimeline.trimEnd - span);
      end = start + span;
    } else {
      start = this.clamp(start, this.videoTimeline.trimStart, this.videoTimeline.trimEnd - minSpan);
      end = this.clamp(end, start + minSpan, this.videoTimeline.trimEnd);
    }
    return { startTime: this.roundTimelineTime(start), endTime: this.roundTimelineTime(end) };
  }

  proto.addTimelineEffectClip = async function (type, anchorTime, duration = this.DEFAULT_TIMELINE_EFFECT_DURATION) {
    if (!this.videoSourceFile || !this.TIMELINE_EFFECT_META[type]) return null;
    const span = Math.max(0.05, Math.min(duration, this.videoTimeline.trimEnd - this.videoTimeline.trimStart));
    const placed = this.resolveTimelineClipTimes({
      type,
      startTime: anchorTime,
      endTime: anchorTime + span,
      edge: 'move',
    });
    const { startTime, endTime } = placed;
    if (endTime <= startTime) {
      this.showStatus(this.videoEditorStatus, 'No hay espacio libre en esa pista.', 'error');
      return null;
    }
    try {
      this.pushTimelineHistory();
      const saved = this.videoTimeline.upsert({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        type,
        startTime,
        endTime,
        config: this.snapshotVideoEffectConfig(type),
      });
      if (type === 'face' || type === 'blink') {
        try { await this.ensureFaceMeshLoaded(); } catch (err) { console.warn('Detector preload failed:', err); }
      }
      this.selectVideoEffect(saved.id);
      void this.syncVideoTimelineEffects(true);
      this.showStatus(this.videoEditorStatus, `${this.TIMELINE_EFFECT_META[type].label} agregado.`, 'success');
      setTimeout(() => this.hideStatus(this.videoEditorStatus), 1200);
      this.setInspectorTab('adjust');
      return saved;
    } catch (err) {
      this.showStatus(this.videoEditorStatus, err.message, 'error');
      return null;
    }
  }

  proto.getTimelineRowFromClientY = function (clientY) {
    if (!this.timelineTrackArea) return null;
    const bounds = this.timelineTrackArea.getBoundingClientRect();
    if (clientY < bounds.top || clientY > bounds.bottom) return null;
    const ratio = this.clamp((clientY - bounds.top) / bounds.height, 0, 0.999);
    const row = Math.floor(ratio * 5);
    if (row <= 0) return null;
    return Object.keys(this.TIMELINE_EFFECT_META).find((type) => this.TIMELINE_EFFECT_META[type].row === row) || null;
  }

  proto.clearTimelineDropTargets = function () {
    this.videoTimelineEl?.querySelectorAll('.timeline-track-effects.is-drop-target').forEach((track) => {
      track.classList.remove('is-drop-target');
    });
  }

  proto.setTimelineDropTarget = function (type) {
    this.clearTimelineDropTargets();
    if (!type || !this.videoTimelineEl) return;
    const track = this.videoTimelineEl.querySelector(`.timeline-track-effects[data-track="${type}"]`);
    track?.classList.add('is-drop-target');
  }

  proto.updateTimelineDragGhost = function (clientX, clientY, label, type = null) {
    this.timelineDragGhost = this.timelineView.ensureDragGhost(document.body);
    this.timelineDragGhost.textContent = label;
    this.timelineDragGhost.dataset.type = type || '';
    const rowType = this.getTimelineRowFromClientY(clientY);
    if (type && rowType === type && this.timelineTrackArea) {
      const bounds = this.timelineTrackArea.getBoundingClientRect();
      const span = Math.max(0.05, Math.min(this.DEFAULT_TIMELINE_EFFECT_DURATION, this.videoTimeline.trimEnd - this.videoTimeline.trimStart));
      const rawTime = this.getTimelineRawTime(clientX);
      const { startTime, endTime } = this.resolveTimelineClipTimes({
        type,
        startTime: rawTime,
        endTime: rawTime + span,
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
  }

  proto.removeTimelineDragGhost = function () {
    this.timelineView.removeDragGhost();
    this.timelineDragGhost = null;
  }

  proto.finishPaletteDrag = function (event) {
    if (!this.paletteDragState) return;
    const chip = this.paletteDragState.chip;
    chip?.classList.remove('is-dragging');
    if (chip?.hasPointerCapture?.(event.pointerId)) chip.releasePointerCapture(event.pointerId);
    const type = this.paletteDragState.type;
    const moved = this.paletteDragState.moved;
    this.paletteDragState = null;
    this.removeTimelineDragGhost();
    this.clearTimelineDropTargets();
    this.updateEffectTrackHighlight();
    if (!moved || !this.videoSourceFile) return;
    const rowType = this.getTimelineRowFromClientY(event.clientY);
    if (rowType !== type) {
      this.showStatus(this.videoEditorStatus, `Soltá ${this.TIMELINE_EFFECT_META[type].label} en la pista ${this.TIMELINE_EFFECT_META[type].trackLabel}.`, 'warning');
      setTimeout(() => this.hideStatus(this.videoEditorStatus), 1800);
      return;
    }
    void this.addTimelineEffectClip(type, this.getTimelineTime(event.clientX));
  }

  proto.bindTimelinePaletteDrag = function () {
    if (!this.timelineEffectPalette) return;
    this.timelineEffectPalette.querySelectorAll('.timeline-palette-chip').forEach((chip) => {
      chip.addEventListener('pointerdown', (event) => {
        if (!this.videoSourceFile || this.isVideoExporting || event.button !== 0 || chip.disabled) return;
        event.preventDefault();
        const type = chip.dataset.effectType;
        if (!this.TIMELINE_EFFECT_META[type]) return;
        this.paletteDragState = { type, chip, moved: false };
        chip.classList.add('is-dragging');
        chip.setPointerCapture(event.pointerId);
        this.updateTimelineDragGhost(event.clientX, event.clientY, this.TIMELINE_EFFECT_META[type].label, type);
        this.setTimelineDropTarget(type);
      });
      chip.addEventListener('pointermove', (event) => {
        if (!this.paletteDragState || this.paletteDragState.chip !== chip) return;
        this.paletteDragState.moved = true;
        this.updateTimelineDragGhost(event.clientX, event.clientY, this.TIMELINE_EFFECT_META[this.paletteDragState.type].label, this.paletteDragState.type);
        const rowType = this.getTimelineRowFromClientY(event.clientY);
        this.setTimelineDropTarget(rowType === this.paletteDragState.type ? rowType : null);
      });
      chip.addEventListener('pointerup', this.finishPaletteDrag.bind(this));
      chip.addEventListener('pointercancel', this.finishPaletteDrag.bind(this));
      chip.addEventListener('dragstart', (event) => event.preventDefault());
    });

    this.videoTimelineEl?.querySelectorAll('.timeline-track-effects').forEach((track) => {
      track.addEventListener('dblclick', (event) => {
        if (!this.videoSourceFile || event.target.closest('.timeline-item')) return;
        event.preventDefault();
        void this.addTimelineEffectClip(track.dataset.track, this.videoEl.currentTime || this.videoTimeline.trimStart);
      });
    });
  }

  proto.selectVideoEffect = function (id) {
    this.syncLookClipConfigNow();
    this.selectedVideoEffectId = id || '';
    const item = this.videoTimeline.items.find((candidate) => candidate.id === this.selectedVideoEffectId);
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
    this.updateTimelineHint();
    if (item) this.setInspectorTab('effect');
  }

  proto.deleteSelectedVideoEffect = function () {
    if (!this.selectedVideoEffectId) return;
    this.pushTimelineHistory();
    this.videoTimeline.remove(this.selectedVideoEffectId);
    this.selectedVideoEffectId = '';
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    void this.syncVideoTimelineEffects(true);
  }

  proto.updateVideoEffectInspector = function () {
    const hasVideo = !!this.videoSourceFile;
    const item = this.videoTimeline.items.find((candidate) => candidate.id === this.selectedVideoEffectId);
    const editing = !!item;
    if (this.videoEffectEmptyNoVideo) this.videoEffectEmptyNoVideo.classList.toggle('hidden', hasVideo);
    if (this.videoEffectEmptyHint) this.videoEffectEmptyHint.classList.toggle('hidden', !hasVideo || editing);
    if (this.videoEffectClipMeta) this.videoEffectClipMeta.classList.toggle('hidden', !editing);
    if (item && this.videoEffectTypeLabel) {
      this.videoEffectTypeLabel.textContent = `${this.TIMELINE_EFFECT_META[item.type]?.trackLabel || item.type} · ${this.TIMELINE_EFFECT_META[item.type]?.label || item.type}`;
    }
    if (item && this.videoEffectDurationLabel) {
      const duration = Math.max(0, item.endTime - item.startTime);
      this.videoEffectDurationLabel.textContent = `Duración: ${duration.toFixed(2)} s`;
    }
    if (this.btnDeleteVideoEffect) this.btnDeleteVideoEffect.disabled = !editing;
    if (this.btnOpenEffectAdjust) this.btnOpenEffectAdjust.disabled = !editing;
  }

  proto.mountVideoEffectsControls = function () {
    if (!this.effectsControlsSlot || !this.inspectorAdjustmentsHost) return;
    if (this.effectsControlsSlot.parentElement !== this.inspectorAdjustmentsHost) {
      this.inspectorAdjustmentsHost.appendChild(this.effectsControlsSlot);
    }
    this.effectsControlsSlot.classList.add('is-contextual');
    this.setAdvancedOptionsVisible(true);
    this.updateAdjustmentsPanelState();
  }

  proto.unmountVideoEffectsControls = function () {
    if (!this.effectsControlsSlot || !this.controlPanel) return;
    this.effectsControlsSlot.classList.remove('is-contextual');
    delete this.effectsControlsSlot.dataset.adjustContext;
    this.adjustContextNav?.classList.add('hidden');
    this.effectsControlsSlot.querySelectorAll('.adjust-context-group').forEach((group) => {
      group.classList.remove('is-active');
    });
    this.videoTimelineEl?.querySelectorAll('.timeline-track-label[data-adjust-context]').forEach((label) => {
      label.classList.remove('is-active');
    });
    const cfg = this.loadConfig();
    this.setAdvancedOptionsVisible(!!cfg.showAdvancedOptions);
    const captureSection = this.controlPanel.querySelector('.panel-section.webcam-only:nth-of-type(2)');
    if (captureSection && this.effectsControlsSlot.parentElement !== this.controlPanel) {
      captureSection.insertAdjacentElement('afterend', this.effectsControlsSlot);
    }
  }

  proto.resolveAdjustmentsContext = function () {
    const selected = this.getSelectedVideoEffectItem();
    if (selected) return selected.type;
    return 'look';
  }

  proto.setAdjustmentsContext = function (context, options = {}) {
    if (!this.getSelectedVideoEffectItem()) return;
    if (context === 'video') context = 'look';
    if (!context || !this.ADJUST_CONTEXT_HELP[context]) return;
    this.adjustmentsContext = context;
    if (this.effectsControlsSlot) {
      this.effectsControlsSlot.dataset.adjustContext = context;
    }
    this.adjustContextNav?.querySelectorAll('.adjust-context-tab').forEach((tab) => {
      const active = tab.dataset.adjustContext === context;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    this.effectsControlsSlot?.querySelectorAll('.adjust-context-group').forEach((group) => {
      group.classList.toggle('is-active', group.dataset.adjustContext === context);
    });
    this.videoTimelineEl?.querySelectorAll('.timeline-track-label[data-adjust-context]').forEach((label) => {
      label.classList.toggle('is-active', label.dataset.adjustContext === context);
    });
    if (this.adjustContextHelp) {
      const help = this.ADJUST_CONTEXT_VIDEO_HELP?.[context] || this.ADJUST_CONTEXT_HELP[context];
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
          this.videoEffectType.value = options.effectType || (context === 'look' ? 'look' : context);
        }
        this.updateEffectTrackHighlight();
        this.updateTimelineHint();
      }
    }
  }

  proto.updateAdjustmentsContext = function (options = {}) {
    if (this.sourceMode !== 'video') return;
    if (!this.getSelectedVideoEffectItem()) {
      this.updateAdjustmentsPanelState();
      return;
    }
    this.setAdjustmentsContext(this.resolveAdjustmentsContext(), options);
  }

  proto.openAdjustmentsForContext = function (context, options = {}) {
    if (this.sourceMode !== 'video') return;
    this.setAdjustmentsContext(context, options);
    this.setInspectorTab('adjust');
  }

  proto.updateEffectTrackHighlight = function (activeType = null) {
    if (!this.videoTimelineEl) return;
    const selected = this.videoTimeline.items.find((item) => item.id === this.selectedVideoEffectId);
    const type = activeType || this.paletteDragState?.type || selected?.type || null;
    this.videoTimelineEl.querySelectorAll('.timeline-track-effects').forEach((track) => {
      track.classList.toggle('is-target-track', !!type && track.dataset.track === type);
    });
  }

  proto.setInspectorTab = function (tabName) {
    this.inspectorTabs.forEach((tab) => {
      const active = tab.dataset.tab === tabName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    this.inspectorPanels.forEach((panel) => {
      const active = panel.id === `inspectorPanel${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}`;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    if (tabName === 'adjust' && this.sourceMode === 'video') {
      this.updateAdjustmentsPanelState();
    }
  }

  proto.setEditorTool = function (tool, options = {}) {
    this.editorTool = tool;
    document.body.dataset.editorTool = tool;
    if (this.videoTimelineEl) this.videoTimelineEl.dataset.editorTool = tool;
    [this.btnToolSelect, this.btnToolTrim].forEach((button) => {
      if (!button) return;
      button.classList.toggle('is-active', button.dataset.tool === tool);
    });
    this.updateTimelineHint();
    this.updateEffectTrackHighlight();
    if (this.sourceMode === 'video' && document.querySelector('.video-inspector-tab[data-tab="adjust"]')?.classList.contains('is-active')) {
      this.updateAdjustmentsPanelState();
    }
  }

  proto.updateTimelineHint = function () {
    if (!this.timelineHintText) return;
    if (!this.videoSourceFile) {
      this.timelineHintText.textContent = '';
      return;
    }
    const hints = {
      select: 'Arrastrá efectos a la timeline o mové los clips con el mouse.',
      trim: 'Arrastrá los bordes rojos en VIDEO.',
    };
    this.timelineHintText.textContent = hints[this.editorTool] || hints.select;
  }

  proto.pushTimelineHistory = function () {
    if (!this.editorHistory || this.timelineHistorySuspended || !this.videoSourceFile) return;
    this.editorHistory.push(this.videoTimeline);
    this.updateEditorHistoryButtons();
  }

  proto.undoTimelineEdit = function () {
    if (!this.editorHistory?.undo(this.videoTimeline)) return;
    this.selectedVideoEffectId = '';
    this.applyVideoTrim(false);
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    void this.syncVideoTimelineEffects(true);
  }

  proto.redoTimelineEdit = function () {
    if (!this.editorHistory?.redo(this.videoTimeline)) return;
    this.selectedVideoEffectId = '';
    this.applyVideoTrim(false);
    this.renderVideoTimeline();
    this.updateVideoEffectInspector();
    void this.syncVideoTimelineEffects(true);
  }

  proto.updateEditorHistoryButtons = function () {
    if (this.btnEditorUndo) this.btnEditorUndo.disabled = !this.editorHistory?.canUndo || this.isVideoExporting;
    if (this.btnEditorRedo) this.btnEditorRedo.disabled = !this.editorHistory?.canRedo || this.isVideoExporting;
  }

  proto.applyTimelineZoom = function () {
    if (!this.timelineScroll || !this.timelineTrackArea) return;
    const baseWidth = this.timelineViewport ? this.timelineViewport.clientWidth - 72 : 800;
    const width = Math.max(baseWidth, baseWidth * this.timelineZoom);
    this.timelineScroll.style.width = `${width + 72}px`;
    if (this.timelineZoomInput) this.timelineZoomInput.value = String(this.timelineZoom);
    this.renderVideoTimeline();
    this.renderTimelineRuler();
  }

  proto.getTimelineTrackAreaBounds = function () {
    if (!this.timelineTrackArea) return { left: 0, width: 1 };
    const rect = this.timelineTrackArea.getBoundingClientRect();
    return { left: rect.left, width: Math.max(1, rect.width) };
  }

  proto.snapTimelineTime = function (time) {
    if (!this.chkTimelineSnap?.checked) return time;
    const points = new Set([
      this.videoTimeline.trimStart,
      this.videoTimeline.trimEnd,
      this.videoEl.currentTime || 0,
    ]);
    this.videoTimeline.items.forEach((item) => {
      points.add(item.startTime);
      points.add(item.endTime);
    });
    let closest = time;
    let minDelta = 0.12 / Math.max(1, this.timelineZoom);
    points.forEach((point) => {
      const delta = Math.abs(point - time);
      if (delta < minDelta) {
        minDelta = delta;
        closest = point;
      }
    });
    return closest;
  }

  proto.renderTimelineRuler = function () {
    if (!this.timelineTimeRuler || !this.timelineTrackArea) return;
    const duration = Math.max(0.001, this.videoTimeline.duration);
    const width = this.timelineTrackArea.offsetWidth;
    this.timelineView.renderRuler({ ruler: this.timelineTimeRuler, duration, width });
  }

  proto.positionTimelineElement = function (el, startTime, endTime = null) {
    const duration = Math.max(0.001, this.videoTimeline.duration);
    const left = (startTime / duration) * 100;
    el.style.left = `${this.clamp(left, 0, 100)}%`;
    if (endTime != null) {
      el.style.width = `${this.clamp(((endTime - startTime) / duration) * 100, 0, 100)}%`;
    }
  }

  proto.getTimelineRowStyle = function (rowIndex) {
    return {
      top: `calc(${rowIndex} * 20%)`,
      height: '20%',
    };
  }

  proto.positionTimelineRowElement = function (el, startTime, endTime, rowIndex) {
    this.positionTimelineElement(el, startTime, endTime);
    const rowStyle = this.getTimelineRowStyle(rowIndex);
    el.style.top = rowStyle.top;
    el.style.height = rowStyle.height;
  }

  proto.renderVideoTimeline = function () {
    if (!this.timelineItems || !this.videoTimelineEl || !this.timelineTrackArea) return;
    const duration = Math.max(0.001, this.videoTimeline.duration);
    const percent = (time) => `${this.clamp((time / duration) * 100, 0, 100)}%`;

    if (this.timelineVideoClip) {
      this.timelineVideoClip.style.left = '0';
      this.timelineVideoClip.style.width = '100%';
    }
    this.timelineTrim.style.left = percent(this.videoTimeline.trimStart);
    this.timelineTrim.style.width = percent(this.videoTimeline.trimEnd - this.videoTimeline.trimStart);
    this.timelineTrimStartHandle.style.left = percent(this.videoTimeline.trimStart);
    this.timelineTrimEndHandle.style.left = percent(this.videoTimeline.trimEnd);
    if (this.timelineTrimOutsideStart) {
      this.timelineTrimOutsideStart.style.width = percent(this.videoTimeline.trimStart);
    }
    if (this.timelineTrimOutsideEnd) {
      this.timelineTrimOutsideEnd.style.left = percent(this.videoTimeline.trimEnd);
      this.timelineTrimOutsideEnd.style.width = percent(duration - this.videoTimeline.trimEnd);
    }

    const selectionStart = this.selectedVideoEffectId
      ? this.clamp(Number(this.videoEffectStart.value) || 0, this.videoTimeline.trimStart, this.videoTimeline.trimEnd)
      : (this.videoEl.currentTime || 0);
    const selectionEnd = this.selectedVideoEffectId
      ? this.clamp(Number(this.videoEffectEnd.value) || 0, selectionStart, this.videoTimeline.trimEnd)
      : selectionStart;
    if (this.selectedVideoEffectId) {
      this.videoEffectStart.value = selectionStart.toFixed(2);
      this.videoEffectEnd.value = selectionEnd.toFixed(2);
    }
    if (this.videoEffectRangeLabel) {
      if (this.selectedVideoEffectId) {
        this.videoEffectRangeLabel.textContent = `${this.formatDurationDetailed(selectionStart)} — ${this.formatDurationDetailed(selectionEnd)}`;
      } else {
        this.videoEffectRangeLabel.textContent = `Cursor: ${this.formatDurationDetailed(this.videoEl.currentTime || 0)}`;
      }
    }
    this.timelinePlayhead.style.left = percent(this.videoEl.currentTime || 0);

    this.timelineItems.innerHTML = '';
    this.videoTimeline.items.forEach((item) => {
      const meta = this.TIMELINE_EFFECT_META[item.type] || { trackLabel: item.type, row: 1 };
      const el = document.createElement('div');
      el.className = `timeline-item${item.id === this.selectedVideoEffectId ? ' is-selected' : ''}`;
      el.dataset.id = item.id;
      el.dataset.type = item.type;
      el.innerHTML = `
        <span class="timeline-item-handle start" aria-hidden="true"></span>
        <span class="timeline-item-label">${meta.trackLabel}</span>
        <span class="timeline-item-handle end" aria-hidden="true"></span>
      `;
      this.positionTimelineRowElement(el, item.startTime, item.endTime, meta.row);
      el.addEventListener('pointerdown', (event) => this.beginTimelineDrag(event, item, el));
      this.timelineItems.appendChild(el);
    });
    this.renderTimelineRuler();
    this.updateEffectTrackHighlight();
  }

  proto.getTimelineTime = function (clientX) {
    return this.snapTimelineTime(this.getTimelineRawTime(clientX));
  }

  proto.getTimelineRawTime = function (clientX) {
    const bounds = this.getTimelineTrackAreaBounds();
    const ratio = this.clamp((clientX - bounds.left) / bounds.width, 0, 1);
    return ratio * this.videoTimeline.duration;
  }

  proto.beginTimelineSelection = function (event) {
    if (!this.videoSourceFile || this.isVideoExporting || event.button !== 0) return;
    if (event.target.closest('.timeline-item, .timeline-item-handle, .timeline-trim-handle, .timeline-playhead-handle')) return;
    event.preventDefault();

    if (this.editorTool === 'trim') {
      this.seekVideo(this.getTimelineTime(event.clientX));
      return;
    }

    this.seekVideo(this.getTimelineTime(event.clientX));

    if (this.editorTool === 'select' && event.target.closest('.timeline-track-effects') && !event.target.closest('.timeline-item')) {
      this.selectVideoEffect('');
    }
  }

  proto.beginTrimDrag = function (event, edge) {
    if (!this.videoSourceFile || this.isVideoExporting || this.editorTool !== 'trim') return;
    event.preventDefault();
    event.stopPropagation();
    this.pushTimelineHistory();
    const itemStarts = this.videoTimeline.items.map((item) => item.startTime);
    const itemEnds = this.videoTimeline.items.map((item) => item.endTime);
    const minEnd = itemEnds.length ? Math.max(...itemEnds) : 0.05;
    const maxStart = itemStarts.length ? Math.min(...itemStarts) : this.videoTimeline.duration - 0.05;

    const move = (moveEvent) => {
      const time = this.getTimelineTime(moveEvent.clientX);
      if (edge === 'start') {
        this.videoTrimStart.value = this.clamp(time, 0, Math.min(maxStart, this.videoTimeline.trimEnd - 0.05)).toFixed(2);
      } else {
        this.videoTrimEnd.value = this.clamp(time, Math.max(minEnd, this.videoTimeline.trimStart + 0.05), this.videoTimeline.duration).toFixed(2);
      }
      this.applyVideoTrim(false);
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  }

  proto.beginTimelineDrag = function (event, item, element) {
    if (!this.videoSourceFile || this.isVideoExporting || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.editorTool !== 'select') this.setEditorTool('select', { skipTab: true });
    this.selectedVideoEffectId = item.id;
    this.videoEffectType.value = item.type;
    this.videoEffectStart.value = item.startTime.toFixed(2);
    this.videoEffectEnd.value = item.endTime.toFixed(2);
    this.timelineItems.querySelectorAll('.timeline-item').forEach((candidate) => {
      candidate.classList.toggle('is-selected', candidate === element);
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
      const delta = ((moveEvent.clientX - originX) / bounds.width) * this.videoTimeline.duration;
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
      this.positionTimelineRowElement(element, startTime, endTime, this.TIMELINE_EFFECT_META[item.type]?.row || 1);
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
        this.videoTimeline.upsert({ ...item, startTime: Number(this.videoEffectStart.value), endTime: Number(this.videoEffectEnd.value) });
      } catch (err) {
        this.showStatus(this.videoEditorStatus, err.message, 'error');
      }
      this.selectVideoEffect(item.id);
      void this.syncVideoTimelineEffects(true);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  }

  proto.beginPlayheadDrag = function (event) {
    if (!this.videoSourceFile || this.isVideoExporting || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.seekVideo(this.getTimelineTime(event.clientX));
    const move = (moveEvent) => this.seekVideo(this.getTimelineTime(moveEvent.clientX));
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  }

  proto.handleVideoEditorKeydown = function (event) {
    if (this.sourceMode !== 'video' || this.isVideoExporting) return;
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable) return;

    if (event.ctrlKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redoTimelineEdit();
      else this.undoTimelineEdit();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'y') {
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
      this.setEditorTool('trim');
    }
  }

  proto.handleVideoDetectorToggle = function (type) {
    if (this.sourceMode === 'video') {
      void this.syncVideoTimelineEffects(true);
      return;
    }
    void this.toggleEffect(type);
  }

  proto.getTimelineDetectorCheckbox = function (type) {
    if (type === 'blob') return this.chkBlobTracking;
    if (type === 'face') return this.chkFaceDetection;
    return this.chkBlinkDetection;
  }

  proto.getTimelineDetectorEffect = function (type) {
    if (type === 'blob') return this.blobTrackingEffect;
    if (type === 'face') return this.faceDetectionEffect;
    return this.blinkDetectionEffect;
  }

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
  }

  proto.setTimelineDetector = async function (type, item) {
    const checkbox = this.getTimelineDetectorCheckbox(type);
    if (!checkbox) return;
    const shouldEnable = !!item;
    if (checkbox.checked !== shouldEnable) {
      checkbox.checked = shouldEnable;
      await this.toggleEffect(type);
    }
    const effect = this.getTimelineDetectorEffect(type);
    if (item && effect && typeof effect.setConfig === 'function') effect.setConfig(item.config || {});
  }

  proto.getVideoOperationalImageSettings = function () {
    return {
      previewQuality: this.imageSettings.previewQuality,
      jpegQuality: this.imageSettings.jpegQuality,
      videoFormat: this.imageSettings.videoFormat,
      captureTimerSeconds: this.imageSettings.captureTimerSeconds,
      qualityEnhancer: this.imageSettings.qualityEnhancer,
      qualityEnhancerStrength: this.imageSettings.qualityEnhancerStrength,
    };
  }

  proto.createVideoBaseImageSettings = function () {
    return {
      ...this.DEFAULT_IMAGE_SETTINGS,
      ...this.getVideoOperationalImageSettings(),
    };
  }

  proto.applyVideoTimelineLook = function (mediaTime, options = {}) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return false;
    const lookItem = this.videoTimeline.activeAt(mediaTime).find((item) => item.type === 'look');
    const nextId = lookItem?.id || '';
    const force = !!options.force;
    if (!force && this.appliedTimelineItemIds.look === nextId) return false;

    this.imageSettings = {
      ...(this.videoBaseImageSettings || this.createVideoBaseImageSettings()),
      ...(lookItem ? this.normalizeLookClipConfig(lookItem.config) : {}),
      ...this.getVideoOperationalImageSettings(),
    };
    this.appliedTimelineItemIds.look = nextId;
    this.updateImageControlsUI?.();
    return true;
  }

  proto.syncVideoTimelineLookNow = function (options = {}) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    const changed = this.applyVideoTimelineLook(this.videoEl.currentTime || 0, options);
    if (changed) this.updateEffectsInfo();
  }

  proto.syncVideoTimelineLookAt = function (mediaTime, options = {}) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    this.applyVideoTimelineLook(mediaTime, options);
    this.updateEffectsInfo();
  }

  proto.syncVideoTimelineDetectorsAt = async function (mediaTime, force = false) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    const active = this.videoTimeline.activeAt(mediaTime);
    const byType = Object.fromEntries(active.map((item) => [item.type, item]));
    for (const type of ['blob', 'face', 'blink']) {
      const nextId = byType[type]?.id || '';
      if (force || this.appliedTimelineItemIds[type] !== nextId) {
        await this.setTimelineDetector(type, byType[type]);
        this.appliedTimelineItemIds[type] = nextId;
      }
    }
  }

  proto.syncVideoTimelineDetectors = async function (force = false) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    this.timelineDetectorSyncForce = !!force || !!this.timelineDetectorSyncForce;
    if (this.timelineDetectorSyncPromise) return this.timelineDetectorSyncPromise;

    this.timelineDetectorSyncPromise = (async () => {
      const shouldForce = this.timelineDetectorSyncForce;
      this.timelineDetectorSyncForce = false;
      await this.syncVideoTimelineDetectorsAt(this.videoEl.currentTime || 0, shouldForce);
      this.updateEffectsInfo();
      this.updateAdjustmentsClipStatus();
    })().finally(() => {
      this.timelineDetectorSyncPromise = null;
      if (this.timelineDetectorSyncForce) {
        void this.syncVideoTimelineDetectors();
      }
    });

    return this.timelineDetectorSyncPromise;
  }

  proto.timelineDetectorIdsAt = function (mediaTime) {
    const active = this.videoTimeline.activeAt(mediaTime);
    return Object.fromEntries(['blob', 'face', 'blink'].map((type) => {
      const item = active.find((entry) => entry.type === type);
      return [type, item?.id || ''];
    }));
  }

  proto.needsTimelineDetectorSync = function (mediaTime) {
    const ids = this.timelineDetectorIdsAt(mediaTime);
    return ['blob', 'face', 'blink'].some((type) => this.appliedTimelineItemIds[type] !== ids[type]);
  }

  proto.syncVideoTimelineEffects = async function (force = false) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    this.syncVideoTimelineLookNow({ force });
    await this.syncVideoTimelineDetectors(force);
  }

  proto.updateInspectorWorkflow = function () {
    if (!this.inspectorWorkflowSteps) return;
    const hasVideo = !!this.videoSourceFile;
    const hasEffects = this.videoTimeline.items.length > 0;
    this.inspectorWorkflowSteps.querySelectorAll('[data-step]').forEach((stepEl) => {
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
  }

  proto.updateVideoEditorUI = function () {
    const loaded = !!this.videoSourceFile;
    const canExport = loaded && typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
    [this.btnVideoStart, this.btnVideoBack, this.btnVideoPlay, this.btnVideoForward, this.btnVideoEnd]
      .forEach((button) => { if (button) button.disabled = !loaded || this.isVideoExporting; });
    if (this.videoSeek) this.videoSeek.disabled = !loaded || this.isVideoExporting;
    if (this.btnExportVideo) this.btnExportVideo.disabled = !canExport || this.isVideoExporting;
    if (this.btnHeaderExportVideo) this.btnHeaderExportVideo.disabled = !canExport || this.isVideoExporting;
    if (this.videoTrimStart) this.videoTrimStart.disabled = !loaded || this.isVideoExporting;
    if (this.videoTrimEnd) this.videoTrimEnd.disabled = !loaded || this.isVideoExporting;
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
    this.timelineEffectPalette?.querySelectorAll('.timeline-palette-chip').forEach((chip) => {
      chip.disabled = !loaded || this.isVideoExporting;
    });
    this.updateVideoEffectInspector();
    this.updateAdjustmentsPanelState();
    this.updateInspectorWorkflow();
    this.updateEditorHistoryButtons();
    if (!loaded) {
      if (this.videoFileMeta) this.videoFileMeta.textContent = 'Ningún archivo cargado';
      if (this.videoExportDetails) this.videoExportDetails.textContent = 'Importá un video para habilitar la exportación.';
      if (this.videoExportDiagnostics) this.videoExportDiagnostics.textContent = '';
      if (this.sourceMode === 'video') {
        this.updatePreviewPlaceholder();
      }
      this.updateTimelineHint();
      return;
    }
    this.updatePreviewPlaceholder();
    if (this.videoExportDetails) {
      const bitrate = this.getRecommendedVideoBitrate(this.videoEl.videoWidth, this.videoEl.videoHeight, this.videoSourceFps);
      const exportLabel = canExport ? 'WebM · WebCodecs · video sin audio' : 'WebCodecs no disponible';
      this.videoExportDetails.textContent = `${this.videoEl.videoWidth}×${this.videoEl.videoHeight} · ${this.formatVideoFps(this.videoSourceFps)} FPS · ${this.formatVideoBitrate(bitrate)} · ${exportLabel}`;
    }
    void this.refreshVideoExportDiagnostics();
    this.updateTimelineHint();
  }

  proto.formatVideoExportDiagnosis = function (diagnosis, bitrate) {
    if (!diagnosis.webCodecs) return 'Diagnóstico: WebCodecs no disponible. Usá Chrome o Edge actualizado.';
    if (!diagnosis.videoFrame) return 'Diagnóstico: VideoFrame no disponible. Usá Chrome o Edge actualizado.';
    if (!diagnosis.supported) return `Diagnóstico: codec WebM no soportado (${diagnosis.reason || 'sin codec'}).`;
    return `Diagnóstico: ${diagnosis.codec} · ${this.videoEl.videoWidth}×${this.videoEl.videoHeight} · ${this.formatVideoFps(this.videoSourceFps)} FPS · ${this.formatVideoBitrate(bitrate)} · WebM video sin audio`;
  }

  proto.refreshVideoExportDiagnostics = async function () {
    if (!this.videoExportDiagnostics || !this.videoSourceFile) return null;
    const bitrate = this.getRecommendedVideoBitrate(this.videoEl.videoWidth, this.videoEl.videoHeight, this.videoSourceFps);
    const diagnosis = await diagnoseVideoExportSupport({
      width: this.videoEl.videoWidth,
      height: this.videoEl.videoHeight,
      fps: this.getVideoExportFps(),
      bitrate,
    });
    this.videoExportDiagnostics.textContent = this.formatVideoExportDiagnosis(diagnosis, bitrate);
    return diagnosis;
  }

  proto.updateVideoTransport = function () {
    if (this.sourceMode !== 'video') return;
    const duration = this.videoTimeline.duration || 0;
    this.videoSeek.value = String(this.videoEl.currentTime || 0);
    this.videoTimeLabel.textContent = `${this.formatDurationDetailed(this.videoEl.currentTime || 0)} / ${this.formatDurationDetailed(duration)}`;
    this.btnVideoPlay.innerHTML = this.videoEl.paused
      ? '<i class="fa-solid fa-play"></i>'
      : '<i class="fa-solid fa-pause"></i>';
    if (duration > 0) this.timelinePlayhead.style.left = `${this.clamp((this.videoEl.currentTime / duration) * 100, 0, 100)}%`;
  }

  proto.toggleVideoPlayback = async function () {
    if (!this.videoSourceFile || this.isVideoExporting) return;
    if (this.videoEl.paused) {
      if (this.videoEl.currentTime < this.videoTimeline.trimStart || this.videoEl.currentTime >= this.videoTimeline.trimEnd) {
        this.videoEl.currentTime = this.videoTimeline.trimStart;
      }
      await this.videoEl.play().catch(() => this.showStatus(this.videoEditorStatus, 'No se pudo reproducir el video.', 'error'));
      if (!this.animFrameId) this.scheduleRenderLoop();
    } else {
      this.videoEl.pause();
    }
    this.updateVideoTransport();
  }

  proto.seekVideo = function (time) {
    if (!this.videoSourceFile || this.isVideoExporting) return;
    this.videoEl.currentTime = this.clamp(Number(time) || 0, this.videoTimeline.trimStart, this.videoTimeline.trimEnd);
    this.updateVideoTransport();
    if (!this.animFrameId) this.scheduleRenderLoop();
  }

  proto.jumpVideo = function (seconds) {
    this.seekVideo((this.videoEl.currentTime || 0) + seconds);
  }

  proto.renderVideoExportFrame = async function (frameIndex, fps) {
    const start = this.videoTimeline.trimStart;
    const time = start + frameIndex / fps;
    this.updateVideoExportProgress(frameIndex, this.videoExportTotalFrames || 0, fps, { stage: 'seek', time, force: true });
    try {
      await this.seekVideoForExport(time);
    } catch (err) {
      this.updateVideoExportProgress(frameIndex, this.videoExportTotalFrames || 0, fps, {
        stage: 'seek-retry',
        time,
        force: true,
        note: err?.message || err?.name || 'seek_failed',
      });
      await this.seekVideoForExport(time);
    }
    this.updateVideoExportProgress(frameIndex, this.videoExportTotalFrames || 0, fps, { stage: 'look', time, force: true });
    this.applyVideoTimelineLook(time, { force: true });
    this.updateVideoExportProgress(frameIndex, this.videoExportTotalFrames || 0, fps, { stage: 'detectors', time, force: true });
    await this.syncVideoTimelineDetectorsAt(time, false);
    this.updateVideoExportProgress(frameIndex, this.videoExportTotalFrames || 0, fps, { stage: 'canvas', time, force: true });
    this.renderSourceFrameBuffer(!!this.imageSettings.qualityEnhancer, 'export');
    this.videoExportLastRenderedFrameIndex = frameIndex;
  }

  proto.updateVideoExportProgress = function (done, total, fps, meta = {}) {
    if (!this.videoExportProgress || !this.videoExportSummary) return;
    const now = performance.now();
    const force = !!meta.force || done >= total || meta.stage === 'error';
    if (!force && this.videoExportLastUiUpdate && now - this.videoExportLastUiUpdate < 250) return;
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
        time: meta.time ?? (this.videoTimeline.trimStart + Math.max(0, safeDone - 1) / Math.max(1, Number(fps) || 1)),
        width: this.recordingCanvas?.width || 0,
        height: this.recordingCanvas?.height || 0,
        queueSize: meta.queueSize || 0,
        note: meta.note || '',
      });
    }
  }

  proto.runVideoExportViaWebCodecs = async function () {
    const { calculateExportBitrate, calculateExportFrameCount, encodeCanvasSequence, formatExportDebugInfo } = await import('../video-export.mjs');
    const fps = this.getVideoExportFps();
    const start = this.videoTimeline.trimStart;
    const end = this.videoTimeline.trimEnd;
    const totalFrames = calculateExportFrameCount(end - start, fps);
    this.ensureRecordingCanvas();
    this.formatExportDebugInfo = formatExportDebugInfo;
    this.videoExportTotalFrames = totalFrames;

    const baseName = this.videoSourceFile.name.replace(/\.[^.]+$/, '') || 'hatewebcam-video';
    this.videoExportFileName = `${baseName}-editado.webm`;

    return encodeCanvasSequence({
      canvas: this.recordingCanvas,
      width: this.recordingCanvas.width,
      height: this.recordingCanvas.height,
      fps,
      totalFrames,
      duration: end - start,
      bitrate: calculateExportBitrate(
        this.videoSourceAverageBitrate,
        this.recordingCanvas.width,
        this.recordingCanvas.height,
        fps,
        this.imageSettings.qualityEnhancer
      ),
      renderFrame: (frameIndex) => this.renderVideoExportFrame(frameIndex, fps),
      onProgress: (done, total, meta) => this.updateVideoExportProgress(done, total, fps, meta),
      shouldCancel: () => !this.isVideoExporting,
    });
  }

  proto.finalizeVideoExportBlob = async function (blob) {
    this.downloadBlob(blob, this.videoExportFileName);
    this.showStatus(this.videoEditorStatus, 'Exportación terminada y guardada.', 'success');
    this.videoExportProgress.value = 1;
    this.videoExportTitle.innerHTML = '<i class="fa-solid fa-circle-check"></i> Exportación terminada';
    this.videoExportSummary.textContent = `${this.videoExportFileName} · ${this.formatBytes(blob.size)} · descarga iniciada`;
    this.btnCancelVideoExport.classList.add('hidden');
    this.btnCloseVideoExportModal.classList.remove('hidden');
    this.cleanupVideoExport(true);
  }

  proto.startVideoExport = async function () {
    if (!this.videoSourceFile || this.isVideoExporting) return;
    if (typeof HTMLCanvasElement === 'undefined') {
      this.showStatus(this.videoEditorStatus, 'Este navegador no puede exportar el video.', 'error');
      return;
    }

    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      this.showStatus(this.videoEditorStatus, 'La exportación fiable requiere Chrome o Edge actualizado con WebCodecs.', 'error');
      return;
    }

    try {
      this.ensureRecordingCanvas();
      const bitrate = this.getRecommendedVideoBitrate(this.recordingCanvas.width, this.recordingCanvas.height, this.getVideoExportFps());
      const diagnosis = await diagnoseVideoExportSupport({
        width: this.recordingCanvas.width,
        height: this.recordingCanvas.height,
        fps: this.getVideoExportFps(),
        bitrate,
      });
      if (this.videoExportDiagnostics) {
        this.videoExportDiagnostics.textContent = this.formatVideoExportDiagnosis(diagnosis, bitrate);
      }
      if (!diagnosis.supported) {
        this.showStatus(this.videoEditorStatus, this.formatVideoExportDiagnosis(diagnosis, bitrate), 'error');
        return;
      }
      this.flushPendingClipConfigSync();
      this.appliedTimelineItemIds = {
        look: '',
        blob: '',
        face: '',
        blink: '',
      };
      this.videoExportSession.start(0);
      this.videoExportProgress.value = 0;
      this.videoExportTitle.innerHTML = '<i class="fa-solid fa-file-export"></i> Exportando video';
      this.videoExportSummary.textContent = 'Preparando exportación…';
      if (this.videoExportDebug) this.videoExportDebug.textContent = 'stage:preparando · frame:0/?';
      this.btnCancelVideoExport.classList.remove('hidden');
      this.btnCloseVideoExportModal.classList.add('hidden');
      this.videoExportModal.classList.remove('hidden');
      this.activateModalFocusTrap(this.videoExportModal, this.btnCancelVideoExport);
      this.updateVideoEditorUI();
      this.cancelRenderLoop();
      if ('wakeLock' in navigator) {
        this.videoExportWakeLock = await navigator.wakeLock.request('screen').catch(() => null);
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
  }

  proto.seekVideoForExport = function (time) {
    const target = this.clamp(time, 0, Math.max(0, this.videoTimeline.duration - 0.000001));
    if (Math.abs(this.videoEl.currentTime - target) < 0.00005) return this.waitForExportVideoFrame();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        this.videoEl.removeEventListener('seeked', onSeeked);
        this.videoEl.removeEventListener('error', onError);
      };
      const fail = (err) => {
        cleanup();
        reject(err);
      };
      const onSeeked = () => {
        cleanup();
        this.waitForExportVideoFrame().then(resolve, reject);
      };
      const onError = () => fail(new Error('video_decode_failed'));
      const timeout = setTimeout(() => fail(new Error('video_seek_timeout')), 3500);
      this.videoEl.addEventListener('seeked', onSeeked, { once: true });
      this.videoEl.addEventListener('error', onError, { once: true });
      this.videoEl.currentTime = target;
    });
  }

  proto.waitForExportVideoFrame = function () {
    if (typeof this.videoEl.requestVideoFrameCallback !== 'function') return Promise.resolve();
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
  }

  proto.cancelVideoExport = async function (showMessage = true) {
    if (!this.isVideoExporting) return;
    this.isVideoExporting = false;
    this.videoEl.pause();
    this.videoEl.playbackRate = 1;
    if (showMessage) this.showStatus(this.videoEditorStatus, 'Exportación cancelada.', 'warning');
    this.videoExportTitle.innerHTML = '<i class="fa-solid fa-ban"></i> Exportación cancelada';
    this.videoExportSummary.textContent = 'No se descargó ningún archivo.';
    this.btnCancelVideoExport.classList.add('hidden');
    this.btnCloseVideoExportModal.classList.remove('hidden');
    this.cleanupVideoExport(true);
  }

  proto.failVideoExport = function (err) {
    console.error('Video export failed:', err);
    const messages = {
      webcodecs_codec_unsupported: 'No hay un codec WebM compatible para este video.',
      video_seek_timeout: 'No se pudo leer un frame del video a tiempo.',
      video_decode_failed: 'El navegador no pudo decodificar el video.',
    };
    const message = messages[err?.message] || 'La exportación falló. Revisá espacio libre y permisos.';
    this.showStatus(this.videoEditorStatus, message, 'error');
    void this.cancelVideoExport(false).then(() => {
      this.videoExportTitle.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error de exportación';
      const detail = err?.message || err?.name || 'error_desconocido';
      this.videoExportSummary.textContent = `${message} · ${detail}`;
      if (this.videoExportDebug && this.formatExportDebugInfo) {
        this.videoExportDebug.textContent = this.formatExportDebugInfo({
          stage: 'error',
          done: this.videoExportProgress?.value ? Math.round(this.videoExportProgress.value * (this.videoExportTotalFrames || 0)) : 0,
          total: this.videoExportTotalFrames || 0,
          fps: this.getVideoExportFps(),
          width: this.recordingCanvas?.width || 0,
          height: this.recordingCanvas?.height || 0,
        });
      }
    });
  }

  proto.cleanupVideoExport = function (keepModal = false) {
    this.videoExportSession.stop();
    this.videoExportFileName = '';
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
    if (this.isRunning && this.videoSourceFile && !this.animFrameId) this.scheduleRenderLoop();
  }

  proto.closeVideoExportModal = function () {
    if (this.isVideoExporting) return;
    this.videoExportModal.classList.add('hidden');
    this.deactivateModalFocusTrap(this.videoExportModal);
    this.videoExportProgress.value = 0;
  }

}
