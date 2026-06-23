/**
 * HateWebcam Web — Main Application Controller
 */
import {
  TIMELINE_EFFECT_META,
  DEFAULT_TIMELINE_EFFECT_DURATION,
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_CAMERA_FPS,
  DEFAULT_PREVIEW_QUALITY,
  MEDIAPIPE_FACE_MESH_VERSION,
  MEDIAPIPE_FACE_MESH_SRC,
  MEDIAPIPE_CONSOLE_NOISE_PATTERNS,
  DETECTOR_DEFAULT_BOX_COLOR,
  DEFAULT_QUICK_DETECTOR_SETTINGS,
  ADJUST_CONTEXT_HELP,
  ADJUST_CONTEXT_VIDEO_HELP,
  STORAGE_KEY,
  PROFILES_KEY,
  PREVIEW_QUALITY_PRESETS,
  PREVIEW_MIN_WIDTH,
  PREVIEW_MIN_HEIGHT,
  COMMON_VIDEO_FPS,
  normalizePreviewQuality,
} from './constants.mjs';
import { setupDom } from './dom.mjs';
import { applyStorageMixin } from './settings.mjs';
import { applyLocalvideoeditorMixin } from './video-editor.mjs';
import { applyInitMixin } from './init.mjs';
import { applyEventsMixin } from './events.mjs';
import { applyCameraMixin } from './camera.mjs';
import { applyEffectsMixin } from './effects.mjs';
import { applyRenderLoopMixin } from './render.mjs';
import { applyColorPickMixin } from './color-pick.mjs';
import { applyEffectConfigUIMixin } from './effect-config.mjs';
import { applyUIHelpersMixin } from './ui-helpers.mjs';
import { applyProfilesMixin } from './profiles.mjs';
import { applyCaptureMixin } from './capture.mjs';
import { applyModalfocusmanagementMixin } from './modal-focus.mjs';
import { RenderEngine } from './render-engine.mjs';
import { SettingsStore } from './settings-store.mjs';
import { TimelineView } from './timeline-view.mjs';
import { VideoExportSession } from './video-export-session.mjs';

export class AppController {
  constructor() {
    this.renderEngine = new RenderEngine();
    this.renderEngine.attachLegacyAccessors(this);
    this.settingsStore = new SettingsStore({ onError: (err) => this.notifyStorageUnavailable(err) });
    this.timelineView = new TimelineView({ formatTime: (seconds) => this.formatDurationDetailed(seconds) });
    this.videoExportSession = new VideoExportSession();
    this.videoExportSession.attachLegacyAccessors(this);
    this.modalFocusState = new WeakMap();
    this.TIMELINE_EFFECT_META = TIMELINE_EFFECT_META;
    this.DEFAULT_TIMELINE_EFFECT_DURATION = DEFAULT_TIMELINE_EFFECT_DURATION;
    this.DEFAULT_IMAGE_SETTINGS = DEFAULT_IMAGE_SETTINGS;
    this.DEFAULT_CAMERA_FPS = DEFAULT_CAMERA_FPS;
    this.DEFAULT_PREVIEW_QUALITY = DEFAULT_PREVIEW_QUALITY;
    this.MEDIAPIPE_FACE_MESH_VERSION = MEDIAPIPE_FACE_MESH_VERSION;
    this.MEDIAPIPE_FACE_MESH_SRC = MEDIAPIPE_FACE_MESH_SRC;
    this.MEDIAPIPE_CONSOLE_NOISE_PATTERNS = MEDIAPIPE_CONSOLE_NOISE_PATTERNS;
    this.DETECTOR_DEFAULT_BOX_COLOR = DETECTOR_DEFAULT_BOX_COLOR;
    this.DEFAULT_QUICK_DETECTOR_SETTINGS = DEFAULT_QUICK_DETECTOR_SETTINGS;
    this.ADJUST_CONTEXT_HELP = ADJUST_CONTEXT_HELP;
    this.ADJUST_CONTEXT_VIDEO_HELP = ADJUST_CONTEXT_VIDEO_HELP;
    this.STORAGE_KEY = STORAGE_KEY;
    this.PROFILES_KEY = PROFILES_KEY;
    this.PREVIEW_QUALITY_PRESETS = PREVIEW_QUALITY_PRESETS;
    this.PREVIEW_MIN_WIDTH = PREVIEW_MIN_WIDTH;
    this.PREVIEW_MIN_HEIGHT = PREVIEW_MIN_HEIGHT;
    this.COMMON_VIDEO_FPS = COMMON_VIDEO_FPS;
    this.normalizePreviewQuality = normalizePreviewQuality;
    this.cameraManager = new CameraManager();
    this.effectManager = new EffectManager();
    this.blobTrackingEffect = null;
    this.faceDetectionEffect = null;
    this.blinkDetectionEffect = null;
    this.isRunning = false;
    this.colorPickMode = false;
    this.animFrameId = null;
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.flipH = false;
    this.flipV = false;
    this.rotation = 0;
    this.mobileActivePreset = null;
    this.mediaRecorder = null;
    this.recordingStream = null;
    this.recordingChunks = [];
    this.isRecording = false;
    this.recordingStartTs = 0;
    this.recordingTimer = null;
    this.currentRecordingMimeType = '';
    this.currentRecordingExt = 'webm';
    this.currentRecordingBitrate = 6000000;
    this.currentRecordingFps = 30;
    this.pendingCapture = null;
    this.lastRecordingDurationSec = 0;
    this.previewScale = 1;
    this.photoPreviewRenderToken = 0;
    this.previewPhotoEnhancerDebounceId = null;
    this.photoCountdownTimer = null;
    this.photoCountdownRemaining = 0;
    this.isPhotoCountdownActive = false;
    this.preferredDeviceId = null;
    this.faceMeshScriptLoadPromise = null;
    this.mediaPipeConsoleFilterInstalled = false;
    this.faceLoadRequestId = 0;
    this.blinkLoadRequestId = 0;
    this.isPageVisible = document.visibilityState !== 'hidden';
    this.sourceMode = 'camera';
    this.videoObjectUrl = '';
    this.videoSourceFile = null;
    this.videoPlaceholderLoading = false;
    this.videoSourceFps = 30;
    this.videoSourceAverageBitrate = 0;
    this.videoTimeline = new VideoTimeline();
    this.editorHistory = typeof EditorHistory !== 'undefined' ? new EditorHistory() : null;
    this.editorTool = 'select';
    this.adjustmentsContext = 'look';
    this.timelineZoom = 1;
    this.timelineHistorySuspended = false;
    this.selectedVideoEffectId = '';
    this.paletteDragState = null;
    this.timelineDragGhost = null;
    this.appliedTimelineItemIds = {};
    this.timelineDetectorSyncPromise = null;
    this.timelineDetectorSyncForce = false;
    this.videoBaseImageSettings = null;
    this.isVideoExporting = false;
    this.videoExportFileName = '';
    this.videoExportWakeLock = null;
    this.webcamSessionState = null;
    this.imageSettings = { ...DEFAULT_IMAGE_SETTINGS };
    this.quickDetectorSettings = { ...DEFAULT_QUICK_DETECTOR_SETTINGS };
    this.saveImageSettingsTimer = null;
    this.saveQuickDetectorSettingsTimer = null;
    this.saveEffectSettingsTimer = null;
    this.syncSelectedClipConfigTimer = null;
    this.storageWarningShown = false;
  }

  start() {
    setupDom(this);
    if (!this.videoEl || !this.canvas || !this.ctx || !this.btnToggleCamera || !this.cameraSelect || !this.btnTakePhoto || !this.btnRecord) {
      console.error('HateWebcam: faltan elementos base del DOM para iniciar la app.');
      return;
    }
    this.init();
  }
}

applyStorageMixin(AppController.prototype);
applyLocalvideoeditorMixin(AppController.prototype);
applyInitMixin(AppController.prototype);
applyEventsMixin(AppController.prototype);
applyCameraMixin(AppController.prototype);
applyEffectsMixin(AppController.prototype);
applyRenderLoopMixin(AppController.prototype);
applyColorPickMixin(AppController.prototype);
applyEffectConfigUIMixin(AppController.prototype);
applyUIHelpersMixin(AppController.prototype);
applyProfilesMixin(AppController.prototype);
applyCaptureMixin(AppController.prototype);
applyModalfocusmanagementMixin(AppController.prototype);
