import {
  updateCameraSourceState,
  type PerformanceMode,
} from '../../src/lib/webcam/camera-source-bridge.ts';
import type { ImageSettings } from './constants.ts';
import type { SettingsStore } from './settings-store.ts';
import { loadWebcamSettings } from './webcam-settings.ts';

interface WebcamStartup {
  settingsStore: SettingsStore;
  imageSettings: ImageSettings;
  flipH: boolean;
  flipV: boolean;
  rotation: number;
  mobileActivePreset: string | null;
  preferredDeviceId: string | null;
  chkMirror: HTMLInputElement | null;
  chkFlipV: HTMLInputElement | null;
  rotationSelect: HTMLSelectElement | null;
  syncMirrorControls(): void;
  setAdvancedOptionsVisible(visible: boolean): void;
  loadQuickDetectorSettings(config: Record<string, unknown>): void;
  updateQuickDetectorControlsUI(): void;
  loadImageSettings(config: Record<string, unknown>): void;
  applyPerformanceMode(
    mode: PerformanceMode,
    options: { restartCamera: boolean; notify: boolean; save: boolean },
  ): Promise<void>;
  updateImageControlsUI(): void;
  getMatchingImagePreset(): string | null;
  updateMobilePresetButtons(preset: string | null): void;
  updateProfilesList(): void;
  syncMobileViewportState(): void;
  setMobileFxPanelVisible(visible: boolean): void;
  isExportDebugVisible(): boolean;
  updateCaptureButtons(): void;
  setCameraState(state: 'off'): void;
  restoreActiveDetectors(config: Record<string, unknown>): Promise<void>;
  toggleCamera(forceStart: boolean): Promise<void>;
  refreshCameraDevices(deviceId: string | null): Promise<void>;
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
  await app.applyPerformanceMode(app.imageSettings.performanceMode, {
    restartCamera: false,
    notify: false,
    save: false,
  });
  app.updateImageControlsUI();
  app.mobileActivePreset = app.getMatchingImagePreset();
  app.updateMobilePresetButtons(app.mobileActivePreset);
  app.preferredDeviceId =
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
  if (app.isExportDebugVisible())
    document.body.classList.add('export-debug-visible');
  app.updateCaptureButtons();
  app.setCameraState('off');
  void app.restoreActiveDetectors(cfg);
  void app.toggleCamera(true);
  void app.refreshCameraDevices(app.preferredDeviceId);
}
