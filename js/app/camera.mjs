import {
  getPlaceholderState,
  updatePlaceholderState,
} from '../../src/lib/preview/placeholder-state.ts';
import { updatePreviewMetrics } from '../../src/lib/preview/metrics-state.ts';
import {
  getCameraSourceState,
  updateCameraSourceState,
} from '../../src/lib/webcam/camera-source-bridge.ts';
import {
  classifyCameraError,
  getCameraStatePresentation,
} from './camera-state.ts';

/** @param {import('./controller.mjs').AppController} proto */
export function applyCameraMixin(proto) {
  proto.getCameraStatePresentation = getCameraStatePresentation;
  proto.classifyCameraError = classifyCameraError;

  proto.setCameraState = function (
    state,
    error = null,
    { focus = false } = {},
  ) {
    const view = this.getCameraStatePresentation(state, error);
    const stateKey = `${state}:${error?.name || ''}`;
    const changed = this.cameraUiStateKey !== stateKey;
    this.cameraUiStateKey = stateKey;
    this.cameraUiState = state;
    updatePlaceholderState({
      camera: view,
      cameraMessage: null,
      ...(focus && changed && view.action
        ? { focusRequest: getPlaceholderState().focusRequest + 1 }
        : {}),
    });
    if (
      this.sourceMode !== 'video' &&
      state !== 'running' &&
      state !== 'starting' &&
      this.captureStatus
    ) {
      this.hideStatus(this.captureStatus);
    }
  };

  proto.setCameraPlaceholderMessage = function (message) {
    updatePlaceholderState({ cameraMessage: message });
  };

  proto.updatePreviewPlaceholder = function () {
    const inVideoMode = this.sourceMode === 'video';
    const isLoading = this.videoPlaceholderLoading;
    const showVideoPlaceholder =
      inVideoMode && (isLoading || !this.videoSource?.file);
    const cameraIdle = !inVideoMode && !this.isRunning;
    const view = showVideoPlaceholder
      ? isLoading
        ? 'loading'
        : 'video'
      : cameraIdle
        ? 'camera'
        : 'hidden';

    updatePlaceholderState({ view });
    this.previewWrapper?.classList.toggle('is-empty', showVideoPlaceholder);
    this.previewWrapper?.classList.toggle('is-camera-idle', cameraIdle);
    if (showVideoPlaceholder) this.clearPreviewCanvas?.();
  };

  proto.showVideoPlaceholderLoading = function (
    message = 'Leyendo metadata del video...',
  ) {
    this.videoPlaceholderLoading = true;
    updatePlaceholderState({ loadingMessage: message });
    this.updatePreviewPlaceholder();
  };

  proto.getCameraStartErrorMessage = function (error, wasAutoStart = false) {
    const view = this.getCameraStatePresentation(
      this.classifyCameraError(error),
      error,
    );
    // The title is already rendered above the message by setCameraState, so
    // repeating it here read as "Permission denied. Permission denied. ...".
    return wasAutoStart && view.state === 'unknown'
      ? 'La cámara no se inició automáticamente. Volvé a intentarlo.'
      : view.message;
  };

  proto.getEffectivePerformanceMode = function () {
    const mode = this.normalizePerformanceMode(
      this.imageSettings.performanceMode,
    );
    if (mode === 'auto')
      return this.autoPerformanceDowngraded ? 'performance' : 'normal';
    return mode;
  };

  proto.getPerformanceModePreset = function (mode) {
    const effective = mode || this.getEffectivePerformanceMode?.() || 'normal';
    return (
      this.PERFORMANCE_MODE_PRESETS[effective] ||
      this.PERFORMANCE_MODE_PRESETS.normal
    );
  };

  proto.getCameraStartOptions = function () {
    return { ...this.getPerformanceModePreset().camera };
  };

  proto.applyDetectorPerformanceProfile = function (profile) {
    if (this.blobTrackingEffect) {
      this.blobTrackingEffect.processScale = profile.blobProcessScale;
      this.blobTrackingEffect.processIntervalMs = profile.detectorIntervalMs;
    }
    if (this.faceDetectionEffect) {
      this.faceDetectionEffect.processIntervalMs = profile.detectorIntervalMs;
    }
    if (this.blinkDetectionEffect) {
      this.blinkDetectionEffect.processIntervalMs = profile.detectorIntervalMs;
    }
    this.renderEffectConfig?.();
  };

  proto.applyPerformanceProfileSettings = function (
    profile,
    { save = true } = {},
  ) {
    this.imageSettings.previewQuality = profile.previewQuality;
    this.applyDetectorPerformanceProfile(profile);
    this.updateImageControlsUI();
    this.requestPreviewRefresh(true);
    if (save) this.saveImageSettings();
  };

  proto.applyPerformanceMode = async function (
    mode,
    { restartCamera = false, notify = false, save = true } = {},
  ) {
    const normalized = this.normalizePerformanceMode(mode);
    const changed = this.imageSettings.performanceMode !== normalized;
    this.imageSettings.performanceMode = normalized;
    this.autoPerformanceDowngraded = false;
    this.lowFpsSampleCount = 0;
    this.applyPerformanceProfileSettings(this.getPerformanceModePreset(), {
      save,
    });
    if (notify) {
      this.showStatus(
        this.captureStatus,
        `Modo ${this.PERFORMANCE_MODE_PRESETS[normalized].label} aplicado.`,
        'info',
      );
      setTimeout(() => this.hideStatus(this.captureStatus), 1600);
    }
    if (
      restartCamera &&
      changed &&
      this.isRunning &&
      this.sourceMode === 'camera'
    ) {
      this.cameraManager.stop();
      this.isRunning = false;
      this.cancelRenderLoop();
      await this.toggleCamera(true);
    }
  };

  proto.handlePreviewFpsSample = function (fps) {
    if (this.sourceMode === 'video' && this.visualFxEffect?.active) {
      this.visualFxEffect.adaptPreviewQuality?.(fps);
    }
    if (
      this.imageSettings.performanceMode !== 'auto' ||
      this.autoPerformanceDowngraded
    ) {
      return;
    }
    if (fps < 24) this.lowFpsSampleCount += 1;
    else this.lowFpsSampleCount = 0;
    if (this.lowFpsSampleCount < 3) return;
    this.autoPerformanceDowngraded = true;
    this.applyPerformanceProfileSettings(
      this.PERFORMANCE_MODE_PRESETS.performance,
      { save: false },
    );
    this.showStatus(
      this.captureStatus,
      'FPS bajo detectado. Se bajó la preview y el tracking.',
      'warning',
    );
  };

  proto.toggleCamera = async function (forceStart = false) {
    if (this.sourceMode !== 'camera') return;
    if (this.isRunning && !forceStart) {
      if (this.isRecording) this.stopRecording(true);
      this.cancelPhotoCountdown(false);

      this.cameraRequest += 1;
      this.cameraManager.stop();
      this.isRunning = false;
      this.cancelRenderLoop();
      updateCameraSourceState({ running: false });
      this.setCameraState('off');
      this.updatePreviewPlaceholder();
      updatePreviewMetrics({ resolution: '-', fps: '-' });
      this.updateCaptureButtons();
      return;
    }

    if (!this.isRunning) {
      if (
        this.cameraUiState === 'requesting' ||
        this.cameraUiState === 'starting'
      )
        return;
      const request = ++this.cameraRequest;
      const requestedDeviceId =
        getCameraSourceState().deviceId || this.preferredDeviceId || null;
      this.setCameraState('requesting');
      const ok = await this.cameraManager.start(
        this.videoEl,
        requestedDeviceId,
        {
          ...this.getCameraStartOptions(),
          onPermissionGranted: () => this.setCameraState('starting'),
        },
      );
      if (request !== this.cameraRequest || this.sourceMode !== 'camera')
        return;
      if (ok) {
        this.isRunning = true;
        this.setCameraState('running');
        this.updatePreviewPlaceholder();
        updateCameraSourceState({ running: true });

        const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
        this.syncPreviewCanvasMetrics(sourceWidth, sourceHeight, true);

        this.frameCount = 0;
        this.lastFpsTime = performance.now();
        if (this.isPageVisible) {
          this.scheduleRenderLoop();
        } else {
          this.animFrameId = null;
        }

        const cfg = this.loadConfig();
        const settings = this.cameraManager.getStreamSettings();
        this.preferredDeviceId =
          settings.deviceId || requestedDeviceId || this.preferredDeviceId;
        cfg.deviceId = this.preferredDeviceId || '';
        this.saveConfig(cfg);
        if (this.preferredDeviceId) {
          updateCameraSourceState({ deviceId: this.preferredDeviceId });
        }
        void this.refreshCameraDevices(this.preferredDeviceId);
      } else {
        const errorState = this.classifyCameraError(
          this.cameraManager.lastError,
        );
        this.setCameraState(errorState, this.cameraManager.lastError, {
          focus: true,
        });
        const message = this.getCameraStartErrorMessage(
          this.cameraManager.lastError,
          forceStart,
        );
        this.setCameraPlaceholderMessage(message);
        this.updatePreviewPlaceholder();
      }
      this.updateCaptureButtons();
    }
  };

  proto.onCameraChange = async function () {
    const selectedId = getCameraSourceState().deviceId || null;
    this.preferredDeviceId = selectedId;
    const cfg = this.loadConfig();
    cfg.deviceId = this.preferredDeviceId || '';
    this.saveConfig(cfg);
    if (!this.isRunning) return;

    const request = ++this.cameraRequest;
    updateCameraSourceState({ selectDisabled: true });
    try {
      this.setCameraState('starting');
      const ok = await this.cameraManager.switchCamera(selectedId, {
        ...this.getCameraStartOptions(),
        onPermissionGranted: () => this.setCameraState('starting'),
      });
      if (request !== this.cameraRequest || this.sourceMode !== 'camera')
        return;
      if (!ok)
        throw this.cameraManager.lastError || new Error('camera_switch_failed');
      this.setCameraState('running');
      const settings = this.cameraManager.getStreamSettings();
      this.preferredDeviceId = settings.deviceId || this.preferredDeviceId;
      void this.refreshCameraDevices(this.preferredDeviceId);
    } catch (err) {
      if (request !== this.cameraRequest || this.sourceMode !== 'camera')
        return;
      console.error('Error switching camera:', err);
      this.setCameraState(this.classifyCameraError(err), err, { focus: true });
      this.showStatus(
        this.captureStatus,
        'No se pudo cambiar de cámara',
        'error',
      );
      setTimeout(() => this.hideStatus(this.captureStatus), 2200);
    } finally {
      if (request === this.cameraRequest && this.sourceMode === 'camera') {
        updateCameraSourceState({ selectDisabled: false });
      }
    }
  };

  proto.onTransformChange = function () {
    this.flipH = this.chkMirror.checked;
    this.flipV = this.chkFlipV.checked;
    this.rotation = parseInt(this.rotationSelect.value, 10);
    const cfg = this.loadConfig();
    cfg.flipH = this.flipH;
    cfg.flipV = this.flipV;
    cfg.rotation = this.rotation;
    this.saveConfig(cfg);
    this.syncMirrorControls?.();
  };
}
