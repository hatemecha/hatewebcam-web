import type { WebcamPreferences } from './webcam-preferences.ts';
import { updateCameraSourceState } from '../../src/lib/webcam/camera-source-bridge.ts';
import type { ImageSettings } from './constants.ts';
import type { SettingsStore } from './settings-store.ts';
import type { Detectors } from './detectors.ts';
import type { WebcamCapture } from './webcam-capture.ts';
import type { WebcamCamera } from './webcam-camera.ts';
import { isExportDebugVisible } from './ui-helpers.ts';
import { loadWebcamSettings } from './webcam-settings.ts';

interface WebcamStartup {
  settingsStore: SettingsStore;
  imageSettings: ImageSettings;
  flipH: boolean;
  flipV: boolean;
  rotation: number;
  camera: Pick<
    WebcamCamera,
    | 'preferredDeviceId'
    | 'applyPerformanceMode'
    | 'setCameraState'
    | 'toggleCamera'
    | 'refreshCameraDevices'
  >;
  preferences: Pick<
    WebcamPreferences,
    | 'publishWebcamPanel'
    | 'syncMirrorControls'
    | 'setAdvancedOptionsVisible'
    | 'loadQuickDetectorSettings'
    | 'updateQuickDetectorControlsUI'
    | 'loadImageSettings'
    | 'updateImageControlsUI'
    | 'syncMobileViewportState'
    | 'setMobileFxPanelVisible'
  >;
  capture: Pick<WebcamCapture, 'updateCaptureButtons'>;
  detectors: Pick<Detectors, 'restore'>;
}

export async function initializeWebcam(app: WebcamStartup) {
  const cfg = loadWebcamSettings(app.settingsStore);
  app.flipH = cfg.flipH === true;

  if (typeof cfg.flipV === 'boolean') app.flipV = cfg.flipV;

  if (typeof cfg.rotation === 'number' || typeof cfg.rotation === 'string') {
    const rotation = Number(cfg.rotation);
    if (Number.isFinite(rotation)) {
      app.rotation = rotation;
    }
  }
  app.preferences.syncMirrorControls();
  app.preferences.setAdvancedOptionsVisible(Boolean(cfg.showAdvancedOptions));
  app.preferences.loadQuickDetectorSettings(cfg);
  app.preferences.updateQuickDetectorControlsUI();
  app.preferences.loadImageSettings(cfg);
  await app.camera.applyPerformanceMode(app.imageSettings.performanceMode, {
    restartCamera: false,
    notify: false,
    save: false,
  });
  app.preferences.updateImageControlsUI();
  app.camera.preferredDeviceId =
    typeof cfg.deviceId === 'string' && cfg.deviceId ? cfg.deviceId : null;
  updateCameraSourceState({
    devices: [],
    devicesStatus: 'loading',
    selectDisabled: true,
    deviceId: '',
  });

  app.preferences.publishWebcamPanel();
  app.preferences.syncMobileViewportState();
  app.preferences.setMobileFxPanelVisible(false);
  if (isExportDebugVisible())
    document.body.classList.add('export-debug-visible');
  app.capture.updateCaptureButtons();
  app.camera.setCameraState('off');
  void app.detectors.restore(cfg);
  void app.camera.toggleCamera(true);
  void app.camera.refreshCameraDevices(app.camera.preferredDeviceId);
}
