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
import { VideoTimeline } from '../editor/video-timeline.mjs';
import { EditorHistory } from '../editor/editor-history.mjs';
import { EffectManager } from '../effects/effect-manager.mjs';
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
import { SettingsStore } from './settings-store.mjs';
import { TimelineView } from './timeline-view.mjs';
import { EditAssistController } from './edit-assist-controller.mjs';
import { RenderEngine } from './render-engine.mjs';
import { VideoExportSession } from './video-export-session.mjs';
import { applySubjectFxIntegrationMixin } from './subject-fx-integration.mjs';
import { applySubjectFxUIMixin } from './subject-fx-ui.mjs';
import { applySubjectFxLabMixin } from './subject-fx-fxlab.mjs';

export class AppController {
  constructor() {
    this.settingsStore = new SettingsStore({
      onError: (err) => this.notifyStorageUnavailable(err),
    });
    this.timelineView = new TimelineView({
      formatTime: (seconds) => this.formatDurationDetailed(seconds),
    });
    this.editAssist = new EditAssistController({
      getSourceFile: () => this.videoSourceFile,
      getTimeline: () => this.videoTimeline,
      isExporting: () => this.isVideoExporting,
      getElements: () => ({
        analyzeButton: this.btnEditAssistAnalyze,
        beatButton: this.btnEditAssistBeat,
        every2Button: this.btnEditAssistEvery2,
        every4Button: this.btnEditAssistEvery4,
        every8Button: this.btnEditAssistEvery8,
        halfButton: this.btnEditAssistHalf,
        doubleButton: this.btnEditAssistDouble,
        offsetDownButton: this.btnEditAssistOffsetDown,
        offsetUpButton: this.btnEditAssistOffsetUp,
        regenerateButton: this.btnEditAssistRegenerate,
        clearButton: this.btnEditAssistClear,
        bpmInput: this.editAssistBpmInput,
        offsetInput: this.editAssistOffsetInput,
        densitySelect: this.editAssistDensitySelect,
        result: this.editAssistResult,
        status: this.editAssistStatus,
      }),
      pushHistory: () => this.pushTimelineHistory(),
      renderTimeline: () => this.renderVideoTimeline(),
      showStatus: (el, message, type) => this.showStatus(el, message, type),
      updateTimelineHint: () => this.updateTimelineHint(),
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

    this.videoExportSession = new VideoExportSession();
    this.videoExportDiagnosis = null;
    this.videoExportPreflight = null;
    this.videoExportRecoveredSource = false;
    this.videoExportPlayback = null;
    this.videoExportSession.attachLegacyAccessors(this);

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
    await this.init();
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
applySubjectFxIntegrationMixin(AppController.prototype);
applySubjectFxUIMixin(AppController.prototype);
applySubjectFxLabMixin(AppController.prototype);
