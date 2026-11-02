/** @param {import('../controller.mjs').AppController} proto */
export function applyVideoEditorTimelineSyncMixin(proto) {
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
    await this.syncVideoTimelineVisualFx?.(force);
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
}
