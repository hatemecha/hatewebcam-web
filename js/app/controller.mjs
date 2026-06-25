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
import {
  CameraController,
  RenderController,
  EffectsController,
  CaptureController,
  VideoEditorController,
  ExportController,
  UiController,
} from './domain-controllers.mjs';

export class AppController {
  constructor() {
    this.uiController = new UiController();
    this.uiController.attachLegacyAccessors(this);
    this.renderController = new RenderController();
    this.renderController.attachLegacyAccessors(this);
    this.cameraController = new CameraController(this);
    this.cameraController.attachLegacyAccessors(this);
    this.effectsController = new EffectsController(
      DEFAULT_QUICK_DETECTOR_SETTINGS,
    );
    this.effectsController.attachLegacyAccessors(this);
    this.captureController = new CaptureController();
    this.captureController.attachLegacyAccessors(this);
    this.videoEditorController = new VideoEditorController(this);
    this.videoEditorController.attachLegacyAccessors(this);
    this.exportController = new ExportController(this);
    this.exportController.attachLegacyAccessors(this);
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

  start() {
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
      console.error(
        'HateWebcam: faltan elementos base del DOM para iniciar la app.',
      );
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
