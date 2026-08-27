import { SUBJECT_PRESETS, SUBJECT_PRESET_IDS } from '../effects/subject-fx/subject-presets.mjs';

export const SUBJECT_REACTIVITY_MODES = Object.freeze([
  'fixed',
  'motion',
  'beat',
  'motion-beat',
]);

const MODULE_DEFAULTS = Object.freeze({
  bodyMap: Object.freeze({
    showSkeleton: true,
    showJoints: true,
    showLabels: true,
    showCoordinates: true,
    showVelocity: false,
    showBoundingBox: false,
    showCenter: true,
    connectionOpacity: 0.55,
    lineThickness: 1,
    labelSize: 9,
    density: 0.65,
    color: '#f0f0ec',
  }),
  fragments: Object.freeze({
    enabled: true,
    density: 0.55,
    spread: 0.45,
    sizeMin: 10,
    sizeMax: 42,
    persistence: 0.55,
    motionInfluence: 0.75,
    beatInfluence: 0.35,
  }),
  trails: Object.freeze({
    enabled: false,
    mode: 'silhouette',
    copies: 5,
    spacing: 0.08,
    decay: 0.72,
    opacity: 0.35,
    motionInfluence: 0.6,
  }),
  smear: Object.freeze({
    enabled: false,
    direction: 1,
    spread: 0.35,
    decay: 0.82,
    threshold: 0.12,
    motionInfluence: 0.85,
    beatInfluence: 0.25,
    subjectOnly: true,
  }),
  scan: Object.freeze({
    enabled: false,
    lineDensity: 0.45,
    threshold: 0.42,
    posterize: 4,
    outline: true,
    blocks: true,
  }),
  pixelBody: Object.freeze({
    enabled: false,
    gridSize: 18,
    threshold: 0.35,
    dissolve: 0.5,
  }),
  rgb: Object.freeze({
    enabled: false,
    split: 2,
    jitter: 0.25,
    slices: 6,
    displacement: 0.2,
  }),
});

function clamp01(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1, Math.max(0, num));
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeHex(value, fallback = '#ffffff') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function mergeModule(name, source = {}) {
  const defaults = MODULE_DEFAULTS[name] || {};
  const merged = { ...defaults, ...(source || {}) };
  if (name === 'bodyMap') {
    merged.connectionOpacity = clamp01(merged.connectionOpacity, defaults.connectionOpacity);
    merged.density = clamp01(merged.density, defaults.density);
    merged.color = normalizeHex(merged.color, defaults.color);
    merged.lineThickness = clampNumber(merged.lineThickness, 0.5, 6, defaults.lineThickness);
    merged.labelSize = clampNumber(merged.labelSize, 7, 18, defaults.labelSize);
  }
  if (name === 'fragments') {
    merged.density = clamp01(merged.density, defaults.density);
    merged.spread = clamp01(merged.spread, defaults.spread);
    merged.persistence = clamp01(merged.persistence, defaults.persistence);
    merged.motionInfluence = clamp01(merged.motionInfluence, defaults.motionInfluence);
    merged.beatInfluence = clamp01(merged.beatInfluence, defaults.beatInfluence);
  }
  if (name === 'trails') {
    merged.copies = clampNumber(merged.copies, 1, 16, defaults.copies);
    merged.spacing = clamp01(merged.spacing, defaults.spacing);
    merged.decay = clamp01(merged.decay, defaults.decay);
    merged.opacity = clamp01(merged.opacity, defaults.opacity);
  }
  if (name === 'smear') {
    merged.spread = clamp01(merged.spread, defaults.spread);
    merged.decay = clamp01(merged.decay, defaults.decay);
    merged.threshold = clamp01(merged.threshold, defaults.threshold);
  }
  if (name === 'pixelBody') {
    merged.gridSize = clampNumber(merged.gridSize, 6, 48, defaults.gridSize);
    merged.dissolve = clamp01(merged.dissolve, defaults.dissolve);
  }
  if (name === 'rgb') {
    merged.split = clampNumber(merged.split, 0, 12, defaults.split);
    merged.jitter = clamp01(merged.jitter, defaults.jitter);
  }
  return merged;
}

export function createDefaultSubjectConfig(preset = 'anatomy') {
  const presetId = SUBJECT_PRESET_IDS.includes(preset) ? preset : 'anatomy';
  const presetConfig = SUBJECT_PRESETS[presetId] || SUBJECT_PRESETS.anatomy;
  return normalizeSubjectConfig({
    preset: presetId,
    amount: presetConfig.amount ?? 0.65,
    reactivity: presetConfig.reactivity ?? 'motion',
    density: presetConfig.density ?? 0.55,
    persistence: presetConfig.persistence ?? 0.5,
    scale: presetConfig.scale ?? 1,
    color: presetConfig.color ?? '#f0f0ec',
    seed: presetConfig.seed ?? 18412,
    motionInfluence: presetConfig.motionInfluence ?? 0.75,
    beatInfluence: presetConfig.beatInfluence ?? 0.55,
    modules: presetConfig.modules,
  });
}

export function normalizeSubjectConfig(raw = {}) {
  const preset = SUBJECT_PRESET_IDS.includes(raw.preset)
    ? raw.preset
    : 'anatomy';
  const presetDefaults = SUBJECT_PRESETS[preset] || SUBJECT_PRESETS.anatomy;
  const modules = {};
  Object.keys(MODULE_DEFAULTS).forEach((name) => {
    modules[name] = mergeModule(name, {
      ...presetDefaults.modules?.[name],
      ...raw.modules?.[name],
    });
  });
  const reactivity = SUBJECT_REACTIVITY_MODES.includes(raw.reactivity)
    ? raw.reactivity
    : presetDefaults.reactivity || 'motion';

  return {
    preset,
    amount: clamp01(raw.amount, presetDefaults.amount ?? 0.65),
    reactivity,
    density: clamp01(raw.density, presetDefaults.density ?? 0.55),
    persistence: clamp01(raw.persistence, presetDefaults.persistence ?? 0.5),
    scale: clampNumber(raw.scale, 0.25, 2.5, presetDefaults.scale ?? 1),
    color: normalizeHex(raw.color, presetDefaults.color ?? '#f0f0ec'),
    seed: clampNumber(raw.seed, 0, 999999, raw.seed ?? presetDefaults.seed ?? 18412),
    motionInfluence: clamp01(
      raw.motionInfluence,
      presetDefaults.motionInfluence ?? 0.75,
    ),
    beatInfluence: clamp01(
      raw.beatInfluence,
      presetDefaults.beatInfluence ?? 0.55,
    ),
    modules,
  };
}

export function applySubjectPreset(config, presetId) {
  const next = createDefaultSubjectConfig(presetId);
  return normalizeSubjectConfig({
    ...next,
    seed: config?.seed ?? next.seed,
    amount: config?.amount ?? next.amount,
    reactivity: config?.reactivity ?? next.reactivity,
  });
}

export function migrateProjectToV2(project) {
  if (!project || typeof project !== 'object') {
    throw new Error('invalid_project');
  }
  if (project.version === 2) return project;
  if (project.version !== 1) throw new Error('invalid_project');
  return {
    ...project,
    version: 2,
  };
}
