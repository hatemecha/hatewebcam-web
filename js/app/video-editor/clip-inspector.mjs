import { createDefaultVisualConfig } from '../../visual-fx/config.mjs';
import { isVisualFxClipType } from '../../editor/timeline-clip-types.mjs';

const VIDEO_EFFECT_AUTOMATION_MODES = new Set([
  'fixed',
  'beat-pulse',
  'fade-in',
  'fade-out',
  'alternate-beat',
]);

/** @param {import('../controller.mjs').AppController} proto */
export function applyVideoEditorClipInspectorMixin(proto) {
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
          this.toFiniteInt(
            config.censorPaddingPercent,
            this.quickDetectorSettings.faceCensorPaddingPercent,
          ),
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
      if (this._adjustClipStatusKey !== 'empty') {
        this._adjustClipStatusKey = 'empty';
        this.adjustClipStatus.classList.add('hidden');
        this.adjustClipStatus.classList.remove('is-live');
      }
      return;
    }
    const active = this.isPlayheadInSelectedClip();
    // This runs every render tick while a clip is selected; the underlying
    // state (item id + in/out-of-clip) only actually changes occasionally,
    // so skip the textContent/classList writes otherwise.
    const key = `${item.id}:${item.startTime}:${item.endTime}:${active}`;
    if (this._adjustClipStatusKey === key) return;
    this._adjustClipStatusKey = key;
    this.adjustClipStatus.textContent = active
      ? `Tramo ${this.formatDurationDetailed(item.startTime)} - ${this.formatDurationDetailed(item.endTime)} · Vista previa activa`
      : `Tramo ${this.formatDurationDetailed(item.startTime)} - ${this.formatDurationDetailed(item.endTime)} · Mové el cursor al clip para previsualizar`;
    this.adjustClipStatus.classList.toggle('is-live', active);
    this.adjustClipStatus.classList.remove('hidden');
  };

  proto.updateAdjustmentsPanelState = function () {
    const hasVideo = !!this.videoSourceFile;
    const item = this.getSelectedVideoEffectItem();
    const hasSelection = !!item;
    const isVisualFx = isVisualFxClipType(item?.type);
    if (this.inspectorAdjustNoVideo)
      this.inspectorAdjustNoVideo.classList.toggle('hidden', hasVideo);
    if (this.inspectorAdjustNoClip)
      this.inspectorAdjustNoClip.classList.toggle(
        'hidden',
        !hasVideo || hasSelection,
      );
    if (this.inspectorAdjustmentsHost) {
      this.inspectorAdjustmentsHost.classList.toggle('hidden', !hasSelection);
      this.inspectorAdjustmentsHost.classList.toggle(
        'is-visual-fx',
        isVisualFx,
      );
    }
    if (this.adjustContextNav)
      this.adjustContextNav.classList.toggle(
        'hidden',
        !hasSelection || isVisualFx,
      );
    if (this.effectsControlsSlot)
      this.effectsControlsSlot.classList.toggle('hidden', isVisualFx);
    if (this.adjustContextHelp)
      this.adjustContextHelp.classList.toggle('hidden', isVisualFx);
    if (this.adjustClipStatus)
      this.adjustClipStatus.classList.toggle('hidden', isVisualFx);
    if (hasSelection) this.updateAdjustmentsContext();
    if (isVisualFx) this.renderVisualFxInspector?.();
  };

  proto.normalizeLookClipConfig = function (config = {}) {
    const merged = { ...this.DEFAULT_IMAGE_SETTINGS, ...config };
    return {
      blackAndWhite: !!merged.blackAndWhite,
      exposure: this.clamp(parseInt(merged.exposure, 10) || 0, -100, 100),
      shadows: this.clamp(parseInt(merged.shadows, 10) || 0, -100, 100),
      highlights: this.clamp(parseInt(merged.highlights, 10) || 0, -100, 100),
      contrast: this.clamp(parseInt(merged.contrast, 10) || 100, 50, 180),
      saturation: this.clamp(this.toFiniteInt(merged.saturation, 100), 0, 200),
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
    if (isVisualFxClipType(type)) {
      return createDefaultVisualConfig('recursive');
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
    } else if (isVisualFxClipType(item.type)) {
      this.visualFxEffect?.setConfig(item.config || {});
      this.renderVisualFxInspector?.();
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
    const row = Math.floor(ratio * this.getTimelineTrackCount());
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
      const rowSize = bounds.height / this.getTimelineTrackCount();
      this.timelineDragGhost.classList.add('is-timeline-preview');
      this.timelineDragGhost.style.left = `${bounds.left + (startTime / duration) * bounds.width}px`;
      this.timelineDragGhost.style.top = `${bounds.top + row * rowSize}px`;
      this.timelineDragGhost.style.width = `${Math.max(12, ((endTime - startTime) / duration) * bounds.width)}px`;
      this.timelineDragGhost.style.height = `${rowSize}px`;
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
    if (moved) {
      this.suppressPaletteClick = true;
      setTimeout(() => {
        this.suppressPaletteClick = false;
      }, 0);
    }
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
        chip.addEventListener('click', (event) => {
          if (
            this.suppressPaletteClick ||
            !this.videoSourceFile ||
            this.isVideoExporting ||
            chip.disabled
          )
            return;
          event.preventDefault();
          void this.addTimelineEffectClip(
            chip.dataset.effectType,
            this.videoEl.currentTime || this.videoTimeline.trimStart,
          );
        });
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
    this.renderVisualFxInspector?.();
  };
}
