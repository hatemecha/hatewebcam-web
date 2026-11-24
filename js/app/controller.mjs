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
import { readAppDom } from './dom.ts';
import {
  WebcamPreferences,
  getCurrentPreviewQualityPreset,
  isMobileViewport,
} from './webcam-preferences.ts';
import {
  clamp,
  toFiniteInt,
  normalizeFaceLabel,
  normalizeHexColor,
  normalizeCaptureTimerSeconds,
} from './webcam-settings.ts';
import { escapeHtml, toFiniteNumber } from './ui-helpers.ts';
import { initializeWebcam } from './init.ts';
import { applyEventsMixin } from './events.mjs';
import { WebcamCamera } from './webcam-camera.ts';
import { Detectors } from './detectors.ts';
import { PreviewRenderer } from './preview-renderer.ts';
import { ColorPicker } from './color-pick.ts';
import { WebcamProfiles } from './webcam-profiles.ts';
import { WebcamCapture } from './webcam-capture.ts';
import { bindWebcamEvents } from './webcam-events.ts';
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
      onError: (err) => this.preferences.notifyStorageUnavailable(err),
    });

    this.preferences = new WebcamPreferences(this);
    this.profiles = new WebcamProfiles(this);
    this.camera = new WebcamCamera(this);
    this.isRunning = false;

    this.renderEngine = new RenderEngine();
    this.renderer = new PreviewRenderer(this);

    this.detectors = new Detectors(this);
    this.quickDetectorSettings = { ...DEFAULT_QUICK_DETECTOR_SETTINGS };

    this.capture = new WebcamCapture(this);
    Object.assign(this, {
      clamp,
      toFiniteInt,
      toFiniteNumber,
      normalizeHexColor,
      normalizeFaceLabel,
      normalizeCaptureTimerSeconds,
      isMobileViewport,
      escapeHtml,
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

    this.colorPicker = new ColorPicker(this);
    this.flipH = false;
    this.flipV = false;
    this.rotation = 0;
    this.isPageVisible = document.visibilityState !== 'hidden';

    this.TIMELINE_EFFECT_META = TIMELINE_EFFECT_META;
    this.DEFAULT_TIMELINE_EFFECT_DURATION = DEFAULT_TIMELINE_EFFECT_DURATION;
    this.DEFAULT_IMAGE_SETTINGS = DEFAULT_IMAGE_SETTINGS;
    this.DEFAULT_CAMERA_FPS = DEFAULT_CAMERA_FPS;
    this.DEFAULT_PREVIEW_QUALITY = DEFAULT_PREVIEW_QUALITY;
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
    return this.editor?.sourceController?.setMode(mode);
  }

  async importVideoFile(file) {
    if (this.requestedSourceMode === 'video') {
      await this.setSourceMode('video');
    }
    if (this.sourceMode !== 'video') return;
    return this.editor.sourceController?.load(file);
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
  handleVideoDetectorToggle(type, checked) {
    if (this.sourceMode === 'video') {
      void this.editor?.timelineEffects.sync(true);
      return;
    }
    void this.detectors.setEnabled(type, checked);
  }

  updateVideoEditorUI() {
    this.editor?.exporter.updateVideoEditorUI();
  }
  updateVideoEffectInspector() {}
  updateTimelineHint() {}

  enterVideoUI() {
    this.mountVideoEffectsControls();
    this.ensureVisualFxLab?.();
    this.setEditorTool('select');
    this.setInspectorTab('project');
    this.applyTimelineZoom();
    this.preferences.publishWebcamPanel();
  }

  leaveVideoUI() {
    this.unmountVideoEffectsControls();
    this.preferences.publishWebcamPanel();
  }

  resetVideoTimelineUI() {
    this.updateEditorHistoryButtons();
    this.timelineZoom = 1;
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.timelineClipboard = null;
    this.updateTimelineClipboardStatus();
    this.clearTimelineItemElements();
  }

  prepareSourceUI(duration) {
    for (const input of [
      this.videoTrimStart,
      this.videoTrimEnd,
      this.videoEffectStart,
      this.videoEffectEnd,
    ]) {
      if (input) input.max = String(duration);
    }
    if (this.videoTrimStart) this.videoTrimStart.value = '0';
    if (this.videoTrimEnd) this.videoTrimEnd.value = duration.toFixed(2);
    if (this.videoEffectStart) this.videoEffectStart.value = '0';
    if (this.videoEffectEnd) this.videoEffectEnd.value = duration.toFixed(2);
  }

  getEffectiveFlipH() {
    return this.flipH;
  }

  getCurrentPreviewQualityPreset() {
    return getCurrentPreviewQualityPreset(this.imageSettings);
  }

  async start() {
    this.dom = readAppDom();
    Object.assign(this, this.dom);
    const lifecycle = bindWebcamEvents(this);
    try {
      await initializeWebcam(this);
      return lifecycle;
    } catch (error) {
      lifecycle.dispose();
      throw error;
    }
  }
}

applyEventsMixin(AppController.prototype);
