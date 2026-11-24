import type { WebcamPreferences } from './webcam-preferences.ts';
import {
  getPlaceholderState,
  updatePlaceholderState,
} from '../../src/lib/preview/placeholder-state.ts';
import { updatePreviewMetrics } from '../../src/lib/preview/metrics-state.ts';
import {
  getCameraSourceState,
  resolveCameraDeviceSelection,
  type PerformanceMode,
  updateCameraSourceState,
} from '../../src/lib/webcam/camera-source-bridge.ts';
import {
  classifyCameraError,
  getCameraStatePresentation,
  type CameraUiState,
} from './camera-state.ts';

import type { MessageKey } from '../../src/lib/i18n/catalog.ts';
import { CameraManager } from '../core/camera-manager.ts';
import {
  normalizePerformanceMode,
  PERFORMANCE_MODE_PRESETS,
  STORAGE_KEY,
  type ImageSettings,
} from './constants.ts';
import type { SettingsStore } from './settings-store.ts';
import type { Detectors } from './detectors.ts';
import type { PreviewRenderer } from './preview-renderer.ts';
import type { WebcamCapture } from './webcam-capture.ts';

type PerformanceProfile = (typeof PERFORMANCE_MODE_PRESETS)[PerformanceMode];
type Status = 'info' | 'warning' | 'error';

interface WebcamCameraHost {
  sourceMode: 'camera' | 'video';
  settingsStore: SettingsStore;
  imageSettings: ImageSettings;
  videoEl: HTMLVideoElement;
  editor: {
    source: { file: File | null; loading: boolean };
    visualFx: {
      activeEffect: { adaptPreviewQuality(fps: number): void } | null;
    };
  } | null;
  previewWrapper: HTMLElement | null;
  isRunning: boolean;
  capture: Pick<
    WebcamCapture,
    | 'recording'
    | 'stopRecording'
    | 'cancelPhotoCountdown'
    | 'updateCaptureButtons'
  >;
  renderer: Pick<
    PreviewRenderer,
    | 'clearPreviewCanvas'
    | 'getSourceFrameDimensions'
    | 'syncPreviewCanvasMetrics'
    | 'cancelRenderLoop'
    | 'scheduleRenderLoop'
    | 'requestPreviewRefresh'
    | 'resetCadence'
  >;
  detectors: Pick<Detectors, 'blob' | 'face' | 'blink'>;
  captureStatus: HTMLElement | null;
  flipH: boolean;
  flipV: boolean;
  rotation: number;
  renderEffectConfig(): void;
  showStatus(element: HTMLElement | null, message: string, type: Status): void;
  hideStatus(element: HTMLElement | null): void;
  preferences: Pick<
    WebcamPreferences,
    'syncMirrorControls' | 'updateImageControlsUI' | 'saveImageSettings'
  >;
}

export class WebcamCamera {
  private readonly manager = new CameraManager();
  private request = 0;
  private state: CameraUiState = 'off';
  private stateKey = '';
  private autoPerformanceDowngraded = false;
  private lowFpsSampleCount = 0;
  preferredDeviceId: string | null = null;

  constructor(private readonly host: WebcamCameraHost) {}

  stop() {
    this.request += 1;
    this.manager.stop();
    updateCameraSourceState({ running: false });
  }

  getStreamSettings() {
    return this.manager.getStreamSettings();
  }

  setCameraState(
    state: CameraUiState,
    error: unknown = null,
    { focus = false } = {},
  ) {
    const view = getCameraStatePresentation(state, error);
    const stateKey = `${state}:${error instanceof Error ? error.name : ''}`;
    const changed = this.stateKey !== stateKey;
    this.stateKey = stateKey;
    this.state = state;
    updatePlaceholderState({
      camera: view,
      cameraMessage: null,
      ...(focus && changed && view.action
        ? { focusRequest: getPlaceholderState().focusRequest + 1 }
        : {}),
    });
    if (
      this.host.sourceMode !== 'video' &&
      state !== 'running' &&
      state !== 'starting' &&
      this.host.captureStatus
    ) {
      this.host.hideStatus(this.host.captureStatus);
    }
  }

  setCameraPlaceholderMessage(message: MessageKey) {
    updatePlaceholderState({ cameraMessage: message });
  }

  updatePreviewPlaceholder() {
    const inVideoMode = this.host.sourceMode === 'video';
    const isLoading = this.host.editor?.source.loading;
    const showVideoPlaceholder =
      inVideoMode && (isLoading || !this.host.editor?.source.file);
    const cameraIdle = !inVideoMode && !this.host.isRunning;
    const view = showVideoPlaceholder
      ? isLoading
        ? 'loading'
        : 'video'
      : cameraIdle
        ? 'camera'
        : 'hidden';

    updatePlaceholderState({ view });
    this.host.previewWrapper?.classList.toggle(
      'is-empty',
      showVideoPlaceholder,
    );
    this.host.previewWrapper?.classList.toggle('is-camera-idle', cameraIdle);
    if (showVideoPlaceholder) this.host.renderer.clearPreviewCanvas();
  }

  showVideoPlaceholderLoading(
    message: MessageKey = 'Leyendo metadata del video...',
  ) {
    updatePlaceholderState({ loadingMessage: message });
    this.updatePreviewPlaceholder();
  }

  private getCameraStartErrorMessage(
    error: unknown,
    wasAutoStart = false,
  ): MessageKey {
    const view = getCameraStatePresentation(classifyCameraError(error), error);
    return wasAutoStart && view.state === 'unknown'
      ? 'La cámara no se inició automáticamente. Volvé a intentarlo.'
      : view.message;
  }

  private getEffectivePerformanceMode(): PerformanceMode {
    const mode = normalizePerformanceMode(
      this.host.imageSettings.performanceMode,
    );
    if (mode === 'auto')
      return this.autoPerformanceDowngraded ? 'performance' : 'normal';
    return mode;
  }

  getPerformanceModePreset() {
    return PERFORMANCE_MODE_PRESETS[this.getEffectivePerformanceMode()];
  }

  private getCameraStartOptions() {
    return { ...this.getPerformanceModePreset().camera };
  }

  applyDetectorPerformanceProfile(profile = this.getPerformanceModePreset()) {
    if (this.host.detectors.blob) {
      this.host.detectors.blob.processScale = profile.blobProcessScale;
      this.host.detectors.blob.processIntervalMs = profile.detectorIntervalMs;
    }
    if (this.host.detectors.face) {
      this.host.detectors.face.processIntervalMs = profile.detectorIntervalMs;
    }
    if (this.host.detectors.blink) {
      this.host.detectors.blink.processIntervalMs = profile.detectorIntervalMs;
    }
    this.host.renderEffectConfig();
  }

  private applyPerformanceProfileSettings(
    profile: PerformanceProfile,
    { save = true } = {},
  ) {
    this.host.imageSettings.previewQuality = profile.previewQuality;
    this.applyDetectorPerformanceProfile(profile);
    this.host.preferences.updateImageControlsUI();
    this.host.renderer.requestPreviewRefresh(true);
    if (save) this.host.preferences.saveImageSettings();
  }

  async applyPerformanceMode(
    mode: PerformanceMode,
    { restartCamera = false, notify = false, save = true } = {},
  ) {
    const normalized = normalizePerformanceMode(mode);
    const changed = this.host.imageSettings.performanceMode !== normalized;
    this.host.imageSettings.performanceMode = normalized;
    this.autoPerformanceDowngraded = false;
    this.lowFpsSampleCount = 0;
    this.applyPerformanceProfileSettings(this.getPerformanceModePreset(), {
      save,
    });
    if (notify) {
      this.host.showStatus(
        this.host.captureStatus,
        `Modo ${PERFORMANCE_MODE_PRESETS[normalized].label} aplicado.`,
        'info',
      );
      setTimeout(() => this.host.hideStatus(this.host.captureStatus), 1600);
    }
    if (
      restartCamera &&
      changed &&
      this.host.isRunning &&
      this.host.sourceMode === 'camera'
    ) {
      this.stop();
      this.host.isRunning = false;
      this.host.renderer.cancelRenderLoop();
      await this.toggleCamera(true);
    }
  }

  handlePreviewFpsSample(fps: number) {
    if (this.host.sourceMode === 'video')
      this.host.editor?.visualFx.activeEffect?.adaptPreviewQuality(fps);
    if (
      this.host.imageSettings.performanceMode !== 'auto' ||
      this.autoPerformanceDowngraded
    ) {
      return;
    }
    if (fps < 24) this.lowFpsSampleCount += 1;
    else this.lowFpsSampleCount = 0;
    if (this.lowFpsSampleCount < 3) return;
    this.autoPerformanceDowngraded = true;
    this.applyPerformanceProfileSettings(PERFORMANCE_MODE_PRESETS.performance, {
      save: false,
    });
    this.host.showStatus(
      this.host.captureStatus,
      'FPS bajo detectado. Se bajó la preview y el tracking.',
      'warning',
    );
  }

  async toggleCamera(forceStart = false) {
    if (this.host.sourceMode !== 'camera') return;
    if (this.host.isRunning && !forceStart) {
      if (this.host.capture.recording) this.host.capture.stopRecording(true);
      this.host.capture.cancelPhotoCountdown(false);

      this.stop();
      this.host.isRunning = false;
      this.host.renderer.cancelRenderLoop();
      this.setCameraState('off');
      this.updatePreviewPlaceholder();
      updatePreviewMetrics({ resolution: '-', fps: '-' });
      this.host.capture.updateCaptureButtons();
      return;
    }

    if (!this.host.isRunning) {
      if (this.state === 'requesting' || this.state === 'starting') return;
      const request = ++this.request;
      const requestedDeviceId =
        getCameraSourceState().deviceId || this.preferredDeviceId || null;
      this.setCameraState('requesting');
      const ok = await this.manager.start(
        this.host.videoEl,
        requestedDeviceId,
        {
          ...this.getCameraStartOptions(),
          onPermissionGranted: () => this.setCameraState('starting'),
        },
      );
      if (request !== this.request || this.host.sourceMode !== 'camera') return;
      if (ok) {
        this.host.isRunning = true;
        this.setCameraState('running');
        this.updatePreviewPlaceholder();
        updateCameraSourceState({ running: true });

        const { sourceWidth, sourceHeight } =
          this.host.renderer.getSourceFrameDimensions();
        this.host.renderer.syncPreviewCanvasMetrics(
          sourceWidth,
          sourceHeight,
          true,
        );

        this.host.renderer.resetCadence();
        this.host.renderer.scheduleRenderLoop();

        const cfg = this.host.settingsStore.loadObject(STORAGE_KEY);
        const settings = this.manager.getStreamSettings();
        this.preferredDeviceId =
          settings.deviceId || requestedDeviceId || this.preferredDeviceId;
        cfg.deviceId = this.preferredDeviceId || '';
        this.host.settingsStore.saveJson(STORAGE_KEY, cfg);
        if (this.preferredDeviceId) {
          updateCameraSourceState({ deviceId: this.preferredDeviceId });
        }
        void this.refreshCameraDevices(this.preferredDeviceId);
      } else {
        const errorState = classifyCameraError(this.manager.lastError);
        this.setCameraState(errorState, this.manager.lastError, {
          focus: true,
        });
        const message = this.getCameraStartErrorMessage(
          this.manager.lastError,
          forceStart,
        );
        this.setCameraPlaceholderMessage(message);
        this.updatePreviewPlaceholder();
      }
      this.host.capture.updateCaptureButtons();
    }
  }

  async selectCamera(deviceId: string) {
    const selectedId = deviceId || null;
    updateCameraSourceState({ deviceId });
    this.preferredDeviceId = selectedId;
    const cfg = this.host.settingsStore.loadObject(STORAGE_KEY);
    cfg.deviceId = this.preferredDeviceId || '';
    this.host.settingsStore.saveJson(STORAGE_KEY, cfg);
    if (!this.host.isRunning || this.host.sourceMode !== 'camera') return;

    const request = ++this.request;
    updateCameraSourceState({ selectDisabled: true });
    try {
      this.setCameraState('starting');
      const ok = await this.manager.switchCamera(selectedId, {
        ...this.getCameraStartOptions(),
        onPermissionGranted: () => this.setCameraState('starting'),
      });
      if (request !== this.request) return;
      if (!ok)
        throw this.manager.lastError || new Error('camera_switch_failed');
      this.setCameraState('running');
      const settings = this.manager.getStreamSettings();
      this.preferredDeviceId = settings.deviceId || this.preferredDeviceId;
      void this.refreshCameraDevices(this.preferredDeviceId);
    } catch (err) {
      if (request !== this.request) return;
      console.error('Error switching camera:', err);
      this.setCameraState(classifyCameraError(err), err, { focus: true });
      this.host.showStatus(
        this.host.captureStatus,
        'No se pudo cambiar de cámara',
        'error',
      );
      setTimeout(() => this.host.hideStatus(this.host.captureStatus), 2200);
    } finally {
      if (request === this.request && this.host.sourceMode === 'camera') {
        updateCameraSourceState({ selectDisabled: false });
      }
    }
  }

  setTransform(
    transform: Partial<Pick<WebcamCameraHost, 'flipH' | 'flipV' | 'rotation'>>,
  ) {
    if (transform.flipH !== undefined) this.host.flipH = transform.flipH;
    if (transform.flipV !== undefined) this.host.flipV = transform.flipV;
    if (transform.rotation !== undefined)
      this.host.rotation = transform.rotation;
    const cfg = this.host.settingsStore.loadObject(STORAGE_KEY);
    cfg.flipH = this.host.flipH;
    cfg.flipV = this.host.flipV;
    cfg.rotation = this.host.rotation;
    this.host.settingsStore.saveJson(STORAGE_KEY, cfg);
    this.host.preferences.syncMirrorControls();
  }

  private renderCameraSelectOptions(
    devices: MediaDeviceInfo[],
    preferredId: string | null,
  ) {
    const current = getCameraSourceState();
    updateCameraSourceState(
      resolveCameraDeviceSelection(
        devices,
        preferredId,
        current.deviceId || this.preferredDeviceId || '',
      ),
    );
    this.preferredDeviceId =
      getCameraSourceState().deviceId || this.preferredDeviceId;
  }

  async refreshCameraDevices(preferredId: string | null = null) {
    const devices = await this.manager.enumerateDevices();
    if (this.host.sourceMode !== 'camera') return;
    this.renderCameraSelectOptions(devices, preferredId);
  }
}
