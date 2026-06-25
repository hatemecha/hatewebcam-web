import { CameraManager } from '../core/camera-manager.mjs';
import { VideoTimeline } from '../editor/video-timeline.mjs';
import { EditorHistory } from '../editor/editor-history.mjs';
import { EffectManager } from '../effects/effect-manager.mjs';
import { RenderEngine } from './render-engine.mjs';
import { VideoExportSession } from './video-export-session.mjs';

// ponytail: transitional bridge; new behavior should enter controllers, not more AppController mixins.
function attachAccessors(target, source, keys) {
  keys.forEach((key) => {
    Object.defineProperty(target, key, {
      configurable: true,
      get: () => source[key],
      set: (value) => {
        source[key] = value;
      },
    });
  });
}

function attachOwner(controller, owner) {
  Object.defineProperty(controller, 'owner', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: owner,
  });
}

export class CameraController {
  constructor(owner = null) {
    attachOwner(this, owner);
    this.cameraManager = new CameraManager();
    this.isRunning = false;
    this.preferredDeviceId = null;
    this.webcamSessionState = null;
    this.autoPerformanceDowngraded = false;
    this.lowFpsSampleCount = 0;
  }

  attachLegacyAccessors(target) {
    attachAccessors(target, this, [
      'cameraManager',
      'isRunning',
      'preferredDeviceId',
      'webcamSessionState',
      'autoPerformanceDowngraded',
      'lowFpsSampleCount',
    ]);
  }

  start() {
    return this.owner?.toggleCamera(true);
  }

  stop() {
    if (!this.owner) {
      this.cameraManager.stop();
      this.isRunning = false;
      return undefined;
    }
    if (!this.owner.isRunning) return undefined;
    return this.owner.toggleCamera(false);
  }

  switch(deviceId = null) {
    if (!this.owner) return this.cameraManager.switchCamera(deviceId);
    if (this.owner.cameraSelect) this.owner.cameraSelect.value = deviceId || '';
    return this.owner.onCameraChange();
  }
}

export class RenderController {
  constructor() {
    this.renderEngine = new RenderEngine();
    this.animFrameId = null;
    this.animFrameType = '';
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.previewScale = 1;
  }

  attachLegacyAccessors(target) {
    attachAccessors(target, this, [
      'renderEngine',
      'animFrameId',
      'animFrameType',
      'frameCount',
      'lastFpsTime',
      'previewScale',
    ]);
    this.renderEngine.attachLegacyAccessors(target);
  }
}

export class EffectsController {
  constructor(defaultQuickDetectorSettings) {
    this.effectManager = new EffectManager();
    this.blobTrackingEffect = null;
    this.faceDetectionEffect = null;
    this.blinkDetectionEffect = null;
    this.faceMeshScriptLoadPromise = null;
    this.mediaPipeConsoleFilterInstalled = false;
    this.faceLoadRequestId = 0;
    this.blinkLoadRequestId = 0;
    this.quickDetectorSettings = { ...defaultQuickDetectorSettings };
    this.saveQuickDetectorSettingsTimer = null;
    this.saveEffectSettingsTimer = null;
  }

  attachLegacyAccessors(target) {
    attachAccessors(target, this, [
      'effectManager',
      'blobTrackingEffect',
      'faceDetectionEffect',
      'blinkDetectionEffect',
      'faceMeshScriptLoadPromise',
      'mediaPipeConsoleFilterInstalled',
      'faceLoadRequestId',
      'blinkLoadRequestId',
      'quickDetectorSettings',
      'saveQuickDetectorSettingsTimer',
      'saveEffectSettingsTimer',
    ]);
  }
}

export class CaptureController {
  constructor() {
    this.mediaRecorder = null;
    this.recordingStream = null;
    this.recordingChunks = [];
    this.isRecording = false;
    this.recordingStartTs = 0;
    this.recordingTimer = null;
    this.currentRecordingMimeType = '';
    this.currentRecordingExt = 'webm';
    this.currentRecordingBitrate = 6_000_000;
    this.currentRecordingFps = 30;
    this.pendingCapture = null;
    this.lastRecordingDurationSec = 0;
    this.photoPreviewRenderToken = 0;
    this.previewPhotoEnhancerDebounceId = null;
    this.photoCountdownTimer = null;
    this.photoCountdownRemaining = 0;
    this.isPhotoCountdownActive = false;
  }

  attachLegacyAccessors(target) {
    attachAccessors(target, this, Object.keys(this));
  }
}

export class VideoEditorController {
  constructor(owner = null) {
    attachOwner(this, owner);
    this.sourceMode = 'camera';
    this.videoObjectUrl = '';
    this.videoSourceFile = null;
    this.videoPlaceholderLoading = false;
    this.videoSourceFps = 30;
    this.videoSourceAverageBitrate = 0;
    this.videoTimeline = new VideoTimeline();
    this.editorHistory = new EditorHistory();
    this.editorTool = 'select';
    this.adjustmentsContext = 'look';
    this.timelineZoom = 1;
    this.timelineHistorySuspended = false;
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.timelineClipboard = null;
    this.paletteDragState = null;
    this.timelineDragGhost = null;
    this.appliedTimelineItemIds = {};
    this.timelineDetectorSyncPromise = null;
    this.timelineDetectorSyncForce = false;
    this.videoBaseImageSettings = null;
    this.pendingEditorProject = null;
  }

  attachLegacyAccessors(target) {
    attachAccessors(target, this, Object.keys(this));
  }

  loadFile(file) {
    return this.owner?.loadVideoFile(file);
  }
}

export class ExportController {
  constructor(owner = null) {
    attachOwner(this, owner);
    this.videoExportSession = new VideoExportSession();
    this.videoExportDiagnosis = null;
    this.videoExportPreflight = null;
    this.videoExportRecoveredSource = false;
    this.videoExportPlayback = null;
  }

  attachLegacyAccessors(target) {
    attachAccessors(target, this, [
      'videoExportSession',
      'videoExportDiagnosis',
      'videoExportPreflight',
      'videoExportRecoveredSource',
      'videoExportPlayback',
    ]);
    this.videoExportSession.attachLegacyAccessors(target);
  }

  start() {
    return this.owner?.startVideoExport();
  }

  cancel(showMessage = true) {
    return this.owner?.cancelVideoExport(showMessage);
  }
}

export class UiController {
  constructor() {
    this.modalFocusState = new WeakMap();
    this.colorPickMode = false;
    this.flipH = false;
    this.flipV = false;
    this.rotation = 0;
    this.mobileActivePreset = null;
    this.isPageVisible = document.visibilityState !== 'hidden';
    this.saveImageSettingsTimer = null;
    this.syncSelectedClipConfigTimer = null;
    this.storageWarningShown = false;
  }

  attachLegacyAccessors(target) {
    attachAccessors(target, this, Object.keys(this));
  }
}
