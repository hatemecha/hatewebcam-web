/** @param {import('./controller.mjs').AppController} proto */
export function applyEventsMixin(proto) {
  proto.bindEvents = function () {
    this.btnWebcamMode.addEventListener('click', () => this.setSourceMode('camera'));
    this.btnVideoMode.addEventListener('click', () => this.setSourceMode('video'));
    this.btnChooseVideo.addEventListener('click', () => this.videoFileInput.click());
    if (this.videoEffectType) {
      this.videoEffectType.addEventListener('change', () => {
        this.updateEffectTrackHighlight();
        this.updateTimelineHint();
        if (this.sourceMode === 'video' && document.querySelector('.video-inspector-tab[data-tab="adjust"]')?.classList.contains('is-active')) {
          this.setAdjustmentsContext(this.videoEffectType.value);
        }
      });
    }
    this.videoFileInput.addEventListener('change', () => {
      const [file] = this.videoFileInput.files || [];
      if (file) void this.loadVideoFile(file);
      this.videoFileInput.value = '';
    });
    this.btnVideoStart.addEventListener('click', () => this.seekVideo(this.videoTimeline.trimStart));
    this.btnVideoBack.addEventListener('click', () => this.jumpVideo(-5));
    this.btnVideoPlay.addEventListener('click', () => { void this.toggleVideoPlayback(); });
    this.btnVideoForward.addEventListener('click', () => this.jumpVideo(5));
    this.btnVideoEnd.addEventListener('click', () => this.seekVideo(this.videoTimeline.trimEnd));
    this.btnVideoMute.addEventListener('click', () => {
      this.videoEl.muted = !this.videoEl.muted;
      this.updateVideoMuteButton();
    });
    this.videoSeek.addEventListener('input', () => this.seekVideo(this.videoSeek.value));
    this.videoTrimStart.addEventListener('change', () => {
      this.pushTimelineHistory();
      this.applyVideoTrim();
    });
    this.videoTrimEnd.addEventListener('change', () => {
      this.pushTimelineHistory();
      this.applyVideoTrim();
    });
    this.btnSetTrimFromPlayhead.addEventListener('click', () => {
      this.videoTrimStart.value = String(this.videoEl.currentTime || 0);
      this.pushTimelineHistory();
      this.applyVideoTrim();
    });
    this.btnSetTrimEndFromPlayhead.addEventListener('click', () => {
      this.videoTrimEnd.value = String(this.videoEl.currentTime || 0);
      this.pushTimelineHistory();
      this.applyVideoTrim();
    });
    if (this.btnOpenEffectAdjust) {
      this.btnOpenEffectAdjust.addEventListener('click', () => {
        const item = this.videoTimeline.items.find((candidate) => candidate.id === this.selectedVideoEffectId);
        if (item) this.openAdjustmentsForContext(item.type);
      });
    }
    if (this.videoEffectStart) {
      this.videoEffectStart.addEventListener('change', () => this.commitSelectedEffectTiming({ pushHistory: true }));
    }
    if (this.videoEffectEnd) {
      this.videoEffectEnd.addEventListener('change', () => this.commitSelectedEffectTiming({ pushHistory: true }));
    }
    this.btnDeleteVideoEffect.addEventListener('click', this.deleteSelectedVideoEffect.bind(this));
    this.btnExportVideo.addEventListener('click', () => { void this.startVideoExport(); });
    if (this.btnHeaderExportVideo) this.btnHeaderExportVideo.addEventListener('click', () => { void this.startVideoExport(); });
    this.btnCancelVideoExport.addEventListener('click', () => { void this.cancelVideoExport(); });
    this.btnCloseVideoExportModal.addEventListener('click', this.closeVideoExportModal.bind(this));
    if (this.btnToolSelect) this.btnToolSelect.addEventListener('click', () => this.setEditorTool('select'));
    if (this.btnToolTrim) this.btnToolTrim.addEventListener('click', () => this.setEditorTool('trim'));
    if (this.btnTimelineZoomIn) this.btnTimelineZoomIn.addEventListener('click', () => {
      this.timelineZoom = this.clamp(this.timelineZoom + 0.5, 1, 8);
      this.applyTimelineZoom();
    });
    if (this.btnTimelineZoomOut) this.btnTimelineZoomOut.addEventListener('click', () => {
      this.timelineZoom = this.clamp(this.timelineZoom - 0.5, 1, 8);
      this.applyTimelineZoom();
    });
    if (this.timelineZoomInput) this.timelineZoomInput.addEventListener('input', () => {
      this.timelineZoom = this.clamp(Number(this.timelineZoomInput.value) || 1, 1, 8);
      this.applyTimelineZoom();
    });
    if (this.timelineViewport) {
      this.timelineViewport.addEventListener('wheel', (event) => {
        if (!event.ctrlKey || this.sourceMode !== 'video') return;
        event.preventDefault();
        this.timelineZoom = this.clamp(this.timelineZoom + (event.deltaY < 0 ? 0.25 : -0.25), 1, 8);
        this.applyTimelineZoom();
      }, { passive: false });
    }
    if (this.btnEditorUndo) this.btnEditorUndo.addEventListener('click', this.undoTimelineEdit.bind(this));
    if (this.btnEditorRedo) this.btnEditorRedo.addEventListener('click', this.redoTimelineEdit.bind(this));
    this.inspectorTabs.forEach((tab) => {
      tab.addEventListener('click', () => this.setInspectorTab(tab.dataset.tab));
    });
    this.adjustContextNav?.querySelectorAll('.adjust-context-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.openAdjustmentsForContext(tab.dataset.adjustContext);
      });
    });
    this.videoTimelineEl?.querySelectorAll('.timeline-track-label[data-adjust-context]').forEach((label) => {
      label.addEventListener('click', () => {
        const context = label.dataset.adjustContext;
        const options = {};
        if (label.dataset.syncTool === 'trim') {
          options.syncTool = true;
          options.tool = 'trim';
        } else if (label.dataset.syncTool === 'effect') {
          options.syncTool = true;
          options.tool = 'effect';
          options.syncEffectType = true;
          if (label.dataset.effectType) options.effectType = label.dataset.effectType;
        }
        this.openAdjustmentsForContext(context, options);
      });
    });
    document.addEventListener('keydown', this.handleVideoEditorKeydown.bind(this));
    window.addEventListener('resize', () => {
      if (this.sourceMode === 'video') this.applyTimelineZoom();
    });
    if (this.timelinePlayheadHandle) this.timelinePlayheadHandle.addEventListener('pointerdown', this.beginPlayheadDrag.bind(this));
    if (this.timelineTrackArea) this.timelineTrackArea.addEventListener('pointerdown', this.beginTimelineSelection.bind(this));
    this.timelineTrimStartHandle.addEventListener('pointerdown', (event) => this.beginTrimDrag(event, 'start'));
    this.timelineTrimEndHandle.addEventListener('pointerdown', (event) => this.beginTrimDrag(event, 'end'));
    this.videoEl.addEventListener('play', this.updateVideoTransport.bind(this));
    this.videoEl.addEventListener('pause', this.updateVideoTransport.bind(this));
    this.videoEl.addEventListener('seeked', () => {
      this.updateVideoTransport();
      void this.syncVideoTimelineEffects();
      if (!this.animFrameId && this.isRunning) this.scheduleRenderLoop();
    });
    this.btnToggleCamera.addEventListener('click', () => this.toggleCamera(false));
    this.cameraSelect.addEventListener('change', this.onCameraChange.bind(this));
    this.chkMirror.addEventListener('change', this.onTransformChange.bind(this));
    this.chkFlipV.addEventListener('change', this.onTransformChange.bind(this));
    this.rotationSelect.addEventListener('change', this.onTransformChange.bind(this));

    this.chkBlobTracking.addEventListener('change', () => { void this.toggleEffect('blob'); });
    this.chkFaceDetection.addEventListener('change', () => { void this.toggleEffect('face'); });
    this.chkBlinkDetection.addEventListener('change', () => { void this.toggleEffect('blink'); });

    this.btnColorPick.addEventListener('click', this.enableColorPick.bind(this));
    if (this.btnToggleAdvancedOptions) this.btnToggleAdvancedOptions.addEventListener('click', this.toggleAdvancedOptions.bind(this));
    this.canvas.addEventListener('click', this.onCanvasClick.bind(this));

    if (this.btnTakePhoto) this.btnTakePhoto.addEventListener('click', this.requestPhotoCapture.bind(this));
    if (this.btnRecord) this.btnRecord.addEventListener('click', this.toggleRecording.bind(this));
    if (this.btnDownloadCapture) this.btnDownloadCapture.addEventListener('click', this.downloadPendingCapture.bind(this));
    if (this.btnDiscardCapture) this.btnDiscardCapture.addEventListener('click', () => this.closeCapturePreview(true));
    if (this.btnCloseCapturePreview) this.btnCloseCapturePreview.addEventListener('click', () => this.closeCapturePreview(true));
    if (this.btnMobileEffectsDock) {
      this.btnMobileEffectsDock.addEventListener('click', () => {
        this.setMobileFxPanelVisible(!this.isMobileFxPanelVisible());
      });
    }
    if (this.btnMobileFxClose) {
      this.btnMobileFxClose.addEventListener('click', () => this.setMobileFxPanelVisible(false));
    }
    if (this.mobileFxBackdrop) {
      this.mobileFxBackdrop.addEventListener('click', () => this.setMobileFxPanelVisible(false));
    }
    if (this.btnMobileTakePhoto) {
      this.btnMobileTakePhoto.addEventListener('click', () => {
        this.setMobileFxPanelVisible(false);
        this.requestPhotoCapture();
      });
    }
    if (this.btnMobileRecord) {
      this.btnMobileRecord.addEventListener('click', () => {
        this.setMobileFxPanelVisible(false);
        this.toggleRecording();
      });
    }
    if (this.btnMobileBlobToggle) {
      this.btnMobileBlobToggle.addEventListener('click', () => {
        this.chkBlobTracking.checked = !this.chkBlobTracking.checked;
        void this.toggleEffect('blob');
      });
    }
    if (this.btnMobileFaceToggle) {
      this.btnMobileFaceToggle.addEventListener('click', () => {
        this.chkFaceDetection.checked = !this.chkFaceDetection.checked;
        void this.toggleEffect('face');
      });
    }
    if (this.btnMobileBlinkToggle) {
      this.btnMobileBlinkToggle.addEventListener('click', () => {
        this.chkBlinkDetection.checked = !this.chkBlinkDetection.checked;
        void this.toggleEffect('blink');
      });
    }
    if (this.btnMobileColorPick) {
      this.btnMobileColorPick.addEventListener('click', () => {
        this.enableColorPick();
        this.setMobileFxPanelVisible(false);
      });
    }
    if (this.inpMobileBlobColor) {
      this.inpMobileBlobColor.addEventListener('input', (e) => {
        this.quickDetectorSettings.blobBoxColor = e.target.value;
        if (this.blobTrackingEffect) this.blobTrackingEffect.boxColor = e.target.value;
        this.updateQuickDetectorControlsUI();
        this.scheduleSaveQuickDetectorSettings();
        this.scheduleSaveActiveEffectSettings();
      });
    }
    if (this.inpMobileFaceColor) {
      this.inpMobileFaceColor.addEventListener('input', (e) => {
        this.quickDetectorSettings.faceBoxColor = e.target.value;
        if (this.faceDetectionEffect) this.faceDetectionEffect.boxColor = e.target.value;
        this.updateQuickDetectorControlsUI();
        this.scheduleSaveQuickDetectorSettings();
        this.scheduleSaveActiveEffectSettings();
      });
    }
    this.bindFaceVisualToggle(this.chkMobileFaceShowBox, this.chkMobileFaceShowBlur, 'box');
    this.bindFaceVisualToggle(this.chkMobileFaceShowBlur, this.chkMobileFaceShowBox, 'blur');
    if (this.inpMobileFaceLabel) {
      this.inpMobileFaceLabel.addEventListener('input', (e) => {
        const value = String(e.target.value || '').slice(0, 28);
        this.quickDetectorSettings.faceLabelText = value || 'CARA';
        if (this.faceDetectionEffect) this.faceDetectionEffect.labelText = value;
        this.updateQuickDetectorControlsUI();
        this.scheduleSaveQuickDetectorSettings();
        this.scheduleSaveActiveEffectSettings();
      });
      this.inpMobileFaceLabel.addEventListener('blur', (e) => {
        const normalized = this.normalizeFaceLabel(e.target.value);
        this.quickDetectorSettings.faceLabelText = normalized;
        e.target.value = normalized;
        if (this.faceDetectionEffect) this.faceDetectionEffect.labelText = normalized;
        this.saveQuickDetectorSettings();
        this.saveActiveEffectSettings();
      });
    }
    if (this.chkPreviewPhotoEnhancer) {
      this.chkPreviewPhotoEnhancer.addEventListener('change', this.onPreviewPhotoEnhancerToggle.bind(this));
    }
    if (this.sldPreviewPhotoEnhancerStrength) {
      this.sldPreviewPhotoEnhancerStrength.addEventListener('input', this.onPreviewPhotoEnhancerStrengthInput.bind(this));
    }
    if (this.capturePreviewModal) {
      this.capturePreviewModal.addEventListener('click', (e) => {
        if (e.target === this.capturePreviewModal) this.closeCapturePreview(true);
      });
    }

    this.btnSaveProfile.addEventListener('click', this.saveCurrentProfile.bind(this));
    this.btnDeleteProfile.addEventListener('click', this.deleteProfile.bind(this));
    this.profileSelect.addEventListener('change', this.loadProfile.bind(this));
    window.addEventListener('keydown', this.onGlobalKeyDown.bind(this));
    document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this));
    window.addEventListener('resize', () => {
      this.syncMobileViewportState();
      this.requestPreviewRefresh(true);
    });

    window.addEventListener('beforeunload', () => {
      this.cancelPhotoCountdown(false);
      this.stopRecording(false);
      this.clearPendingCapture(true);
      if (this.isRunning) this.cameraManager.stop();
      if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
    });
  }

  proto.onVisibilityChange = function () {
    this.isPageVisible = document.visibilityState !== 'hidden';
    if (this.isVideoExporting) return;
    if (!this.isRunning) return;

    if (!this.isPageVisible) {
      this.cancelRenderLoop();
      return;
    }

    if (!this.animFrameId) {
      this.frameCount = 0;
      this.lastFpsTime = performance.now();
      this.scheduleRenderLoop();
    }
  }

}
