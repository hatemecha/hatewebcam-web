/**
 * HateWebcam Web — application controller.
 *
 * Mixins attach behavior onto this instance. Domain objects with real
 * methods (camera, render buffers, export session) live here as fields;
 * there is no property-proxy layer between them and the mixins.
 */
import {
  TIMELINE_EFFECT_META,
  DEFAULT_TIMELINE_EFFECT_DURATION,
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_CAMERA_FPS,
  DEFAULT_PREVIEW_QUALITY,
  MEDIAPIPE_FACE_MESH_VERSION,
  MEDIAPIPE_FACE_MESH_BASE_URL,
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
  PERFORMANCE_MODE_PRESETS,
  normalizePreviewQuality,
  normalizePerformanceMode,
} from './constants.mjs';
import { CameraManager } from '../core/camera-manager.mjs';
import { EffectManager } from '../effects/effect-manager.mjs';
import { setupDom } from './dom.mjs';
import { applyStorageMixin } from './settings.mjs';
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
import { SettingsStore } from './settings-store.ts';
import { RenderEngine } from './render-engine.ts';

export class AppController {
  constructor() {
    this.settingsStore = new SettingsStore({
      onError: (err) => this.notifyStorageUnavailable(err),
    });

    this.cameraManager = new CameraManager();
    this.isRunning = false;
    this.preferredDeviceId = null;
    this.webcamSessionState = null;
    this.autoPerformanceDowngraded = false;
    this.lowFpsSampleCount = 0;

    this.renderEngine = new RenderEngine();
    this.animFrameId = null;
    this.animFrameType = '';
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.previewScale = 1;
    this.renderEngine.attachLegacyAccessors(this);

    this.effectManager = new EffectManager();
    this.blobTrackingEffect = null;
    this.faceDetectionEffect = null;
    this.blinkDetectionEffect = null;
    this.faceMeshScriptLoadPromise = null;
    this.mediaPipeConsoleFilterInstalled = false;
    this.faceLoadRequestId = 0;
    this.blinkLoadRequestId = 0;
    this.quickDetectorSettings = { ...DEFAULT_QUICK_DETECTOR_SETTINGS };
    this.saveQuickDetectorSettingsTimer = null;
    this.saveEffectSettingsTimer = null;

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

    this.sourceMode = 'camera';
    this.videoObjectUrl = '';
    this.videoSourceFile = null;
    this.videoPlaceholderLoading = false;
    this.videoSourceFps = 30;
    this.videoSourceAverageBitrate = 0;
    // Editor state is installed on first use by installVideoEditor(). Keep
    // only the inert defaults the webcam path may read.
    this.videoTimeline = null;
    this.editorHistory = null;
    this.editorTool = 'select';
    this.inspectorTab = 'project';
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
    this.videoExportSession = null;
    this.videoExportDiagnosis = null;
    this.videoExportPreflight = null;
    this.videoExportRecoveredSource = false;
    this.videoExportPlayback = null;

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

    this.TIMELINE_EFFECT_META = TIMELINE_EFFECT_META;
    this.DEFAULT_TIMELINE_EFFECT_DURATION = DEFAULT_TIMELINE_EFFECT_DURATION;
    this.DEFAULT_IMAGE_SETTINGS = DEFAULT_IMAGE_SETTINGS;
    this.DEFAULT_CAMERA_FPS = DEFAULT_CAMERA_FPS;
    this.DEFAULT_PREVIEW_QUALITY = DEFAULT_PREVIEW_QUALITY;
    this.MEDIAPIPE_FACE_MESH_VERSION = MEDIAPIPE_FACE_MESH_VERSION;
    this.MEDIAPIPE_FACE_MESH_BASE_URL = MEDIAPIPE_FACE_MESH_BASE_URL;
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
    this.PERFORMANCE_MODE_PRESETS = PERFORMANCE_MODE_PRESETS;
    this.normalizePreviewQuality = normalizePreviewQuality;
    this.normalizePerformanceMode = normalizePerformanceMode;
    this.imageSettings = { ...DEFAULT_IMAGE_SETTINGS };
  }

  /**
   * Load the editor mixins, timeline model and Visual FX engine only when the
   * user asks for the video editor. The webcam path never imports them.
   */
  async installVideoEditor() {
    if (!this._editorInstallPromise) {
      this._editorInstallPromise = import('./editor-install.mjs').then(
        ({ installVideoEditor }) => installVideoEditor(this),
      );
    }
    await this._editorInstallPromise;
    return this;
  }

  async setSourceMode(mode) {
    if (mode === this.sourceMode || this.isVideoExporting) return;
    if (mode === 'video') await this.installVideoEditor();
    return this.applySourceMode?.(mode);
  }

  async importVideoFile(file) {
    await this.installVideoEditor();
    return this.loadVideoFile(file);
  }

  async importEditorProjectFile(file) {
    await this.installVideoEditor();
    return this.loadEditorProjectFile(file);
  }

  // Editor presentation hooks. The editor mixins replace these when the
  // editor chunk is installed; the webcam render loop can call them safely.
  /** Detector toggles are shared by the webcam panel and the editor tracks. */
  getTimelineDetectorCheckbox(type) {
    if (type === 'blob') return this.chkBlobTracking || null;
    if (type === 'face') return this.chkFaceDetection || null;
    return this.chkBlinkDetection || null;
  }

  handleVideoDetectorToggle(type) {
    if (this.sourceMode === 'video') {
      void this.syncVideoTimelineEffects(true);
      return;
    }
    void this.toggleEffect(type);
  }

  updateVideoTransport() {}
  updateVideoEditorUI() {}
  updateVideoEffectInspector() {}
  updateTimelineHint() {}
  syncVideoTimelineLookNow() {}
  syncVideoTimelineDetectors() {}
  syncVideoTimelineEffects() {}
  getVideoPlayableEnd(end) {
    return end;
  }

  async start() {
    setupDom(this);
    if (
      !this.videoEl ||
      !this.canvas ||
      !this.ctx ||
      !this.btnToggleCamera ||
      !this.cameraSelect ||
      !this.btnTakePhoto ||
      !this.btnRecord
    ) {
      throw new Error(
        'HateWebcam: faltan elementos base del DOM para iniciar la app.',
      );
    }
    // Bind DOM events before the first await so a fast user (or a slow CI
    // worker) cannot lose clicks and file selections while settings load.
    // Init still publishes the initial UI state after this.
    this.bindEvents();
    this.bindQuickDetectorEvents();
    this.bindImageControlEvents();
    this.initializeColorPalettes();
    await this.init();
  }
}

applyStorageMixin(AppController.prototype);
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
