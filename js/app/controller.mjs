/**
 * HateWebcam Web — application controller.
 *
 * Mixins attach behavior onto this instance. Domain objects with real
 * methods (camera, render buffers, export session) live here as fields;
 * there is no property-proxy layer between them and the mixins.
 */
import editorEntryUrl from 'virtual:editor-entry-url';
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
  normalizePreviewQuality,
  normalizePerformanceMode,
} from './constants.ts';
import { EffectManager } from '../effects/effect-manager.ts';
import { readAppDom } from './dom.ts';
import { applyStorageMixin } from './settings.mjs';
import { initializeWebcam } from './init.ts';
import { applyEventsMixin } from './events.mjs';
import { WebcamCamera } from './webcam-camera.ts';
import { applyEffectsMixin } from './effects.mjs';
import { PreviewRenderer } from './preview-renderer.ts';
import { ColorPicker } from './color-pick.ts';
import { applyEffectConfigUIMixin } from './effect-config.mjs';
import { applyProfilesMixin } from './profiles.mjs';
import { WebcamCapture } from './webcam-capture.ts';
import { downloadBlob, hideStatus, showStatus } from './feedback.ts';
import {
  formatBytes,
  formatDuration,
  formatDurationDetailed,
  formatVideoBitrate,
  formatVideoFps,
  normalizeVideoFps,
  timestamp,
} from './media-format.ts';
import { SettingsStore } from './settings-store.ts';
import { RenderEngine } from './render-engine.ts';

export class AppController {
  constructor() {
    this.settingsStore = new SettingsStore({
      onError: (err) => this.notifyStorageUnavailable(err),
    });

    this.camera = new WebcamCamera(this);
    this.isRunning = false;
    this.webcamSessionState = null;

    this.renderEngine = new RenderEngine();
    this.renderer = new PreviewRenderer(this);

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

    this.capture = new WebcamCapture(this);
    Object.assign(this, {
      downloadBlob,
      hideStatus,
      showStatus,
      formatBytes,
      formatDuration,
      formatDurationDetailed,
      formatVideoBitrate,
      formatVideoFps,
      normalizeVideoFps,
      timestamp,
    });

    this.sourceMode = 'camera';
    this.requestedSourceMode = 'camera';
    this.editor = null;
    this.editorLoadAttempt = 0;
    this.videoPlaceholderLoading = false;
    this.videoSourceFps = 30;
    this.videoSourceAverageBitrate = 0;
    // Editor state is installed on first use by installVideoEditor(). Keep
    // only the inert defaults the webcam path may read.
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
    this.videoExportDiagnosis = null;
    this.videoExportPreflight = null;
    this.videoExportRecoveredSource = false;
    this.videoExportPlayback = null;

    this.colorPicker = new ColorPicker(this);
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
      const entry = new URL(editorEntryUrl, import.meta.url);
      // A failed module fetch is cached for its URL by the browser.
      if (this.editorLoadAttempt > 0) {
        entry.searchParams.set('retry', String(this.editorLoadAttempt));
      }
      this.editorLoadAttempt += 1;
      this._editorInstallPromise = import(/* @vite-ignore */ entry.href)
        .then(({ installVideoEditor }) => installVideoEditor(this))
        .catch((error) => {
          this._editorInstallPromise = null;
          console.error('Error loading the video editor:', error);
          this.showStatus(
            this.captureStatus,
            'No se pudo abrir el editor. Volvé a intentarlo.',
            'error',
          );
          return null;
        });
    }
    return this._editorInstallPromise;
  }

  async setSourceMode(mode) {
    if (this.editor?.exportSession.active) return;
    this.requestedSourceMode = mode;
    if (mode === this.sourceMode) return;
    if (mode === 'video') {
      if (
        !(await this.installVideoEditor()) ||
        this.requestedSourceMode !== mode
      )
        return;
    }
    return this.applySourceMode?.(mode);
  }

  async importVideoFile(file) {
    if (this.requestedSourceMode === 'video') {
      await this.setSourceMode('video');
    }
    if (this.sourceMode !== 'video') return;
    return this.loadVideoFile(file);
  }

  async importEditorProjectFile(file) {
    if (this.requestedSourceMode === 'video') {
      await this.setSourceMode('video');
    }
    if (this.sourceMode !== 'video') return;
    return this.editor.projects.load(file);
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

  updateVideoEditorUI() {}
  updateVideoEffectInspector() {}
  updateTimelineHint() {}
  syncVideoTimelineLookNow() {}
  syncVideoTimelineDetectors() {}
  syncVideoTimelineEffects() {}

  async start() {
    Object.assign(this, readAppDom());
    // Bind DOM events before the first await so a fast user (or a slow CI
    // worker) cannot lose clicks and file selections while settings load.
    // Init still publishes the initial UI state after this.
    this.bindEvents();
    this.bindImageControlEvents();
    this.initializeColorPalettes();
    await initializeWebcam(this);
  }
}

applyStorageMixin(AppController.prototype);
applyEventsMixin(AppController.prototype);
applyEffectsMixin(AppController.prototype);
applyEffectConfigUIMixin(AppController.prototype);
applyProfilesMixin(AppController.prototype);
