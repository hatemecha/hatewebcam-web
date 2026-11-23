import { STORAGE_KEY } from './constants.ts';
import type { SettingsStore } from './settings-store.ts';

type FaceVisualMode = 'box' | 'pixelate' | 'hybrid';

export interface FaceVisualSettings {
  faceShowBox?: unknown;
  faceShowBlur?: unknown;
  faceVisualMode?: unknown;
}

export function faceFlagsFromVisualMode(mode: unknown) {
  const normalized = String(mode || '')
    .trim()
    .toLowerCase();
  return {
    showBox: normalized !== 'pixelate',
    showBlur: normalized === 'pixelate' || normalized === 'hybrid',
  };
}

export function faceVisualModeFromFlags(
  showBox: boolean,
  showBlur: boolean,
): FaceVisualMode {
  if (showBox && showBlur) return 'hybrid';
  if (showBlur) return 'pixelate';
  return 'box';
}

export function normalizeFaceVisualFlags(settings: FaceVisualSettings) {
  let showBox = settings.faceShowBox;
  let showBlur = settings.faceShowBlur;
  if (showBox == null && showBlur == null && settings.faceVisualMode != null) {
    const legacy = faceFlagsFromVisualMode(settings.faceVisualMode);
    showBox = legacy.showBox;
    showBlur = legacy.showBlur;
  }
  return {
    showBox: showBox !== false || !showBlur,
    showBlur: Boolean(showBlur),
  };
}

function configObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function loadWebcamSettings(
  storage: SettingsStore,
): Record<string, unknown> {
  const config = storage.loadObject(STORAGE_KEY);
  for (const flag of ['forceMirrorDefaultV3', 'forceMirrorDefaultV4']) {
    if (config[flag] === true) continue;
    config.flipH = false;
    config[flag] = true;
    storage.saveJson(STORAGE_KEY, config);
  }

  if (config.faceVisualModeDefaultV2 !== true) {
    const saved = configObject(config.quickDetectorSettings);
    const legacy = normalizeFaceVisualFlags(saved);
    const useDefault =
      !saved.faceShowBox &&
      !saved.faceShowBlur &&
      (!saved.faceVisualMode || saved.faceVisualMode === 'pixelate');
    config.quickDetectorSettings = {
      ...saved,
      faceShowBox: useDefault || legacy.showBox,
      faceShowBlur: !useDefault && legacy.showBlur,
    };
    config.faceVisualModeDefaultV2 = true;
    storage.saveJson(STORAGE_KEY, config);
  }

  if (config.responsiveEditorDefaultsV1 !== true) {
    const image = { ...configObject(config.imageSettings) };
    if (!image.previewQuality || image.previewQuality === 'high')
      image.previewQuality = 'balanced';
    config.imageSettings = image;
    const effects = configObject(config.effectSettings);
    config.effectSettings = {
      ...effects,
      blob: {
        ...configObject(effects.blob),
        processScale: 0.45,
        processIntervalMs: 33,
      },
      face: {
        ...configObject(effects.face),
        processIntervalMs: 30,
        boxSmoothing: 0.5,
        detectionHoldMs: 120,
      },
      blink: {
        ...configObject(effects.blink),
        processIntervalMs: 30,
        minClosedFrames: 1,
        earSmoothing: 0.35,
      },
    };
    config.responsiveEditorDefaultsV1 = true;
    storage.saveJson(STORAGE_KEY, config);
  }

  return config;
}
