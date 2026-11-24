import { translateCurrent } from '../../src/lib/i18n/translate.ts';
import type { Detectors } from './detectors.ts';
import { PROFILES_KEY, type ImageSettings } from './constants.ts';
import { hideStatus, showStatus, type StatusType } from './feedback.ts';
import type { SettingsStore } from './settings-store.ts';
import type { WebcamCamera } from './webcam-camera.ts';
import type { WebcamPreferences } from './webcam-preferences.ts';
import {
  clamp,
  configObject,
  faceFlagsFromVisualMode,
  normalizeFaceLabel,
  normalizeHexColor,
  readImageSettings,
  toFiniteInt,
  type QuickDetectorSettings,
} from './webcam-settings.ts';

interface ProfilesHost {
  settingsStore: SettingsStore;
  dom: { profileStatus: HTMLElement | null };
  flipH: boolean;
  flipV: boolean;
  rotation: number;
  imageSettings: ImageSettings;
  quickDetectorSettings: QuickDetectorSettings;
  detectors: Detectors;
  camera: WebcamCamera;
  preferences: WebcamPreferences;
}

export class WebcamProfiles {
  private selectedName = '';

  constructor(private readonly host: ProfilesHost) {}

  get selected(): string {
    return this.selectedName;
  }

  get names(): string[] {
    return Object.keys(this.load());
  }

  private load(): Record<string, unknown> {
    return this.host.settingsStore.loadObject(PROFILES_KEY);
  }

  private save(profiles: Record<string, unknown>): void {
    this.host.settingsStore.saveJson(PROFILES_KEY, profiles);
    this.host.preferences.publishWebcamPanel();
  }

  private announce(message: string, type: StatusType): void {
    const status = this.host.dom.profileStatus;
    showStatus(status, message, type);
    setTimeout(() => hideStatus(status), 2500);
  }

  saveCurrent(): void {
    const name = prompt(translateCurrent('Nombre para este ajuste:'));
    if (!name) return;
    const profiles = this.load();
    const { detectors } = this.host;
    const config = {
      display: {
        flipH: this.host.flipH,
        flipV: this.host.flipV,
        rotation: this.host.rotation,
        imageSettings: { ...this.host.imageSettings },
        activeDetectors: { ...detectors.selection },
      },
      blob: detectors.blob?.getConfig(),
      face: detectors.face?.getConfig(),
      blink: detectors.blink?.getConfig(),
    };
    Object.defineProperty(profiles, name, {
      value: config,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    this.selectedName = name;
    this.save(profiles);
    this.announce(translateCurrent('"{name}" guardado', { name }), 'success');
  }

  async select(name: string): Promise<void> {
    this.selectedName = name;
    this.host.preferences.publishWebcamPanel();
    const profiles = this.load();
    if (!name || !Object.hasOwn(profiles, name)) return;

    const { detectors, preferences } = this.host;
    const config = configObject(profiles[name]);
    const display = configObject(config.display);
    if (typeof display.flipH === 'boolean') this.host.flipH = display.flipH;
    if (typeof display.flipV === 'boolean') this.host.flipV = display.flipV;
    if (typeof display.rotation === 'number')
      this.host.rotation = display.rotation;
    preferences.syncMirrorControls();

    if (display.imageSettings) {
      const settings = readImageSettings({
        ...this.host.imageSettings,
        ...configObject(display.imageSettings),
      });
      this.host.imageSettings = settings;
      await this.host.camera.applyPerformanceMode(settings.performanceMode, {
        save: false,
      });
      preferences.updateImageControlsUI();
      preferences.saveImageSettings();
    }
    this.loadDetectorPreferences(config);
    if (display.activeDetectors) {
      const selection = configObject(display.activeDetectors);
      for (const kind of ['blob', 'face', 'blink'] as const) {
        const enabled = Boolean(selection[kind]);
        if (detectors.selection[kind] !== enabled)
          await detectors.setEnabled(kind, enabled);
      }
    }
    this.applyDetectorConfig(config);
    preferences.applyQuickDetectorSettingsToEffects();
    preferences.updateQuickDetectorControlsUI();
    preferences.saveQuickDetectorSettings();
    this.announce(translateCurrent('"{name}" cargado', { name }), 'success');
  }

  private loadDetectorPreferences(config: Record<string, unknown>): void {
    const quick = this.host.quickDetectorSettings;
    const blob = configObject(config.blob);
    if (blob.boxColor)
      quick.blobBoxColor = normalizeHexColor(blob.boxColor, quick.blobBoxColor);

    const face = configObject(config.face);
    if (face.boxColor)
      quick.faceBoxColor = normalizeHexColor(face.boxColor, quick.faceBoxColor);
    if (face.labelText != null)
      quick.faceLabelText = normalizeFaceLabel(face.labelText);
    if (face.showBox != null) quick.faceShowBox = Boolean(face.showBox);
    if (face.showBlur != null) quick.faceShowBlur = Boolean(face.showBlur);
    if (face.visualMode != null) {
      const legacy = faceFlagsFromVisualMode(face.visualMode);
      if (face.showBox == null) quick.faceShowBox = legacy.showBox;
      if (face.showBlur == null) quick.faceShowBlur = legacy.showBlur;
    }
    if (face.pixelationCellSize != null) {
      quick.facePixelationCellSize = clamp(
        toFiniteInt(face.pixelationCellSize) || quick.facePixelationCellSize,
        4,
        48,
      );
    }
    if (face.censorPaddingPercent != null) {
      quick.faceCensorPaddingPercent = clamp(
        toFiniteInt(face.censorPaddingPercent, quick.faceCensorPaddingPercent),
        0,
        48,
      );
    }
    this.applyDetectorConfig(config);
  }

  private applyDetectorConfig(config: Record<string, unknown>): void {
    for (const kind of ['blob', 'face', 'blink'] as const) {
      if (config[kind])
        this.host.detectors[kind]?.setConfig(configObject(config[kind]));
    }
  }

  deleteSelected(): void {
    const name = this.selectedName;
    if (!name || !confirm(translateCurrent('¿Eliminar "{name}"?', { name })))
      return;
    const profiles = this.load();
    delete profiles[name];
    this.selectedName = '';
    this.save(profiles);
    this.announce(translateCurrent('"{name}" eliminado', { name }), 'warning');
  }

  deleteAll(): void {
    if (this.names.length === 0) {
      showStatus(
        this.host.dom.profileStatus,
        'No hay perfiles guardados',
        'info',
      );
      return;
    }
    if (
      !confirm(
        translateCurrent(
          '¿Eliminar todos los perfiles guardados? Esta acción no restablece la webcam.',
        ),
      )
    )
      return;
    this.selectedName = '';
    this.save({});
    showStatus(
      this.host.dom.profileStatus,
      'Perfiles guardados eliminados',
      'warning',
    );
  }
}
