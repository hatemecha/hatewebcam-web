import {
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_QUICK_DETECTOR_SETTINGS,
  normalizePerformanceMode,
  normalizePreviewQuality,
  STORAGE_KEY,
  type ImageSettings,
} from './constants.ts';
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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toFiniteInt(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeHexColor(
  value: unknown,
  fallback = '#ffffff',
): string {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export function normalizeFaceLabel(value: unknown): string {
  const label = String(value || '').trim();
  return label ? label.slice(0, 28) : 'CARA';
}

export function normalizeCaptureTimerSeconds(value: unknown): number {
  const seconds = toFiniteInt(value, 0);
  return [0, 5, 10].includes(seconds) ? seconds : 0;
}

export function oneOf<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
): T {
  return choices.find((candidate) => candidate === value) ?? fallback;
}

export function configObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readImageSettings(value: unknown): ImageSettings {
  const saved = configObject(value);
  const defaults = DEFAULT_IMAGE_SETTINGS;
  const previewQuality = normalizePreviewQuality(saved.previewQuality);
  const legacyMode =
    previewQuality === 'draft'
      ? 'performance'
      : previewQuality === 'balanced'
        ? 'normal'
        : 'quality';
  const performanceMode = normalizePerformanceMode(
    saved.performanceMode ?? legacyMode,
  );
  const experimentalExportFeatures = Boolean(saved.experimentalExportFeatures);

  return {
    blackAndWhite: Boolean(saved.blackAndWhite),
    exposure: clamp(toFiniteInt(saved.exposure), -100, 100),
    shadows: clamp(toFiniteInt(saved.shadows), -100, 100),
    highlights: clamp(toFiniteInt(saved.highlights), -100, 100),
    contrast: clamp(toFiniteInt(saved.contrast) || defaults.contrast, 50, 180),
    saturation: clamp(
      toFiniteInt(saved.saturation, defaults.saturation),
      0,
      200,
    ),
    temperature: clamp(toFiniteInt(saved.temperature), -100, 100),
    detail: clamp(toFiniteInt(saved.detail), -100, 100),
    sharpness: clamp(toFiniteInt(saved.sharpness), 0, 100),
    jpegQuality: clamp(
      toFiniteInt(saved.jpegQuality) || defaults.jpegQuality,
      60,
      100,
    ),
    videoFormat: oneOf(saved.videoFormat, ['auto', 'mp4', 'webm'], 'auto'),
    editorExportPreset: oneOf(
      saved.editorExportPreset,
      ['fast', 'balanced', 'high', 'chroma', 'experimental-mp4'],
      'balanced',
    ),
    editorExportFormat: experimentalExportFeatures
      ? oneOf(saved.editorExportFormat, ['auto', 'mp4', 'webm'], 'webm')
      : 'webm',
    editorExportMode: oneOf(
      saved.editorExportMode,
      ['full', 'effects-chroma'],
      'full',
    ),
    experimentalExportFeatures,
    editorCopyAudio:
      experimentalExportFeatures &&
      (Object.hasOwn(saved, 'editorCopyAudio')
        ? saved.editorCopyAudio
        : defaults.editorCopyAudio) !== false,
    effectsExportChroma: oneOf(
      saved.effectsExportChroma,
      ['green', 'blue'],
      'green',
    ),
    previewQuality,
    performanceMode,
    captureTimerSeconds: normalizeCaptureTimerSeconds(
      saved.captureTimerSeconds,
    ),
    shutterSound: saved.shutterSound !== false,
    qualityEnhancer: Boolean(saved.qualityEnhancer),
    qualityEnhancerStrength: clamp(
      toFiniteInt(
        saved.qualityEnhancerStrength,
        defaults.qualityEnhancerStrength,
      ),
      0,
      100,
    ),
  };
}

export type QuickDetectorSettings = typeof DEFAULT_QUICK_DETECTOR_SETTINGS;

export function readQuickDetectorSettings(
  value: unknown,
): QuickDetectorSettings {
  const defaults = DEFAULT_QUICK_DETECTOR_SETTINGS;
  const saved = configObject(value);
  const face = normalizeFaceVisualFlags(saved);
  return {
    blobBoxColor: normalizeHexColor(saved.blobBoxColor, defaults.blobBoxColor),
    faceBoxColor: normalizeHexColor(saved.faceBoxColor, defaults.faceBoxColor),
    faceLabelText: normalizeFaceLabel(saved.faceLabelText),
    faceShowBox: face.showBox,
    faceShowBlur: face.showBlur,
    facePixelationCellSize: clamp(
      toFiniteInt(saved.facePixelationCellSize) ||
        defaults.facePixelationCellSize,
      4,
      48,
    ),
    faceCensorPaddingPercent: clamp(
      toFiniteInt(
        saved.faceCensorPaddingPercent,
        defaults.faceCensorPaddingPercent,
      ),
      0,
      48,
    ),
  };
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
