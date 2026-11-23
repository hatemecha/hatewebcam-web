import { updateCameraSourceState } from '../../src/lib/webcam/camera-source-bridge.ts';
import type { ImageSettings } from './constants.ts';
import type { SettingsStore } from './settings-store.ts';
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
  mobileActivePreset: string | null;
  camera: Pick<
    WebcamCamera,
    | 'preferredDeviceId'
    | 'applyPerformanceMode'
    | 'setCameraState'
    | 'toggleCamera'
    | 'refreshCameraDevices'
  >;
  chkMirror: HTMLInputElement | null;
  chkFlipV: HTMLInputElement | null;
  rotationSelect: HTMLSelectElement | null;
  syncMirrorControls(): void;
  setAdvancedOptionsVisible(visible: boolean): void;
  loadQuickDetectorSettings(config: Record<string, unknown>): void;
  updateQuickDetectorControlsUI(): void;
  loadImageSettings(config: Record<string, unknown>): void;
  updateImageControlsUI(): void;
  getMatchingImagePreset(): string | null;
  updateMobilePresetButtons(preset: string | null): void;
  updateProfilesList(): void;
  syncMobileViewportState(): void;
  setMobileFxPanelVisible(visible: boolean): void;
  capture: Pick<WebcamCapture, 'updateCaptureButtons'>;
  restoreActiveDetectors(config: Record<string, unknown>): Promise<void>;
}

export async function initializeWebcam(app: WebcamStartup) {
  const cfg = loadWebcamSettings(app.settingsStore);
  app.flipH = cfg.flipH === true;
  if (app.chkMirror) app.chkMirror.checked = app.flipH;
  app.syncMirrorControls();

  if (typeof cfg.flipV === 'boolean') app.flipV = cfg.flipV;
  if (app.chkFlipV) app.chkFlipV.checked = app.flipV;

  if (typeof cfg.rotation === 'number' || typeof cfg.rotation === 'string') {
    const rotation = Number(cfg.rotation);
    if (Number.isFinite(rotation)) {
      app.rotation = rotation;
      if (app.rotationSelect) app.rotationSelect.value = String(rotation);
    }
  }
  app.setAdvancedOptionsVisible(Boolean(cfg.showAdvancedOptions));
  app.loadQuickDetectorSettings(cfg);
  app.updateQuickDetectorControlsUI();
  app.loadImageSettings(cfg);
  await app.camera.applyPerformanceMode(app.imageSettings.performanceMode, {
    restartCamera: false,
    notify: false,
    save: false,
  });
  app.updateImageControlsUI();
  app.mobileActivePreset = app.getMatchingImagePreset();
  app.updateMobilePresetButtons(app.mobileActivePreset);
  app.camera.preferredDeviceId =
    typeof cfg.deviceId === 'string' && cfg.deviceId ? cfg.deviceId : null;
  updateCameraSourceState({
    devices: [],
    devicesStatus: 'loading',
    selectDisabled: true,
    deviceId: '',
  });

  app.updateProfilesList();
  app.syncMobileViewportState();
  app.setMobileFxPanelVisible(false);
  if (isExportDebugVisible())
    document.body.classList.add('export-debug-visible');
  app.capture.updateCaptureButtons();
  app.camera.setCameraState('off');
  void app.restoreActiveDetectors(cfg);
  void app.camera.toggleCamera(true);
  void app.camera.refreshCameraDevices(app.camera.preferredDeviceId);
}
