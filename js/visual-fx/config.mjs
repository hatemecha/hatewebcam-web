// Versioned image-processing recipes. The timeline's `subject` type is a wire-format adapter.
const recipe = (label, hint, modules) =>
  Object.freeze({ label, hint, modules });
export const VISUAL_PRESETS = Object.freeze({
  feedback: recipe('Feedback', 'La imagen deja rastros que giran y crecen.', {
    feedback: 0.97,
    recursion: 0.5,
    flow: 0.15,
    rgb: 0.12,
  }),
  melt: recipe(
    'Digital Melt',
    'Corrientes de píxeles que arrastran el color.',
    { feedback: 0.96, flow: 0.8, sorting: 0.65, posterize: 0.25 },
  ),
  echo: recipe('Echo', 'Ecos suaves que se expanden en el tiempo.', {
    feedback: 0.99,
    recursion: 0.25,
    rgb: 0.28,
  }),
  decay: recipe(
    'Pixel Decay',
    'Bloques, grano y restos de imágenes anteriores.',
    { feedback: 0.72, pixel: 0.6, dither: 0.6, posterize: 0.7, flow: 0.25 },
  ),
  signal: recipe(
    'Signal Loss',
    'Cortes de señal, canales separados y barridos.',
    { fragments: 0.8, rgb: 0.8, scan: 0.65, posterize: 0.25 },
  ),
  fragment: recipe(
    'Fragment',
    'La imagen se rompe en piezas que siguen fluyendo.',
    { tiles: 0.8, pixel: 0.25, flow: 0.35, feedback: 0.55 },
  ),
  scan: recipe('Scan', 'Contornos luminosos entre líneas de señal.', {
    edges: 0.8,
    scan: 0.7,
    threshold: 0.35,
    rgb: 0.25,
  }),
  ghost: recipe('Ghost', 'Memoria de luz, contraste y siluetas espectrales.', {
    feedback: 0.98,
    monochrome: 1,
    edges: 0.35,
    recursion: 0.4,
  }),
  noise: recipe('Mono Noise', 'Textura tramada en blanco y negro.', {
    monochrome: 1,
    dither: 0.9,
    threshold: 0.65,
    pixel: 0.2,
    flow: 0.15,
  }),
});
export const VISUAL_MODULES = Object.freeze({
  feedback: 'Eco',
  recursion: 'Expansión del eco',
  flow: 'Distorsión',
  sorting: 'Arrastre',
  pixel: 'Píxel',
  posterize: 'Paleta',
  dither: 'Trama',
  threshold: 'Contraste',
  edges: 'Contornos',
  rgb: 'Separación de color',
  fragments: 'Cortes',
  tiles: 'Fragmentos',
  scan: 'Barrido',
  monochrome: 'Blanco y negro',
});
const legacy = {
  anatomy: 'scan',
  'data-body': 'scan',
  smear: 'melt',
  dissolve: 'decay',
  'signal-map': 'signal',
};
const number = (value, fallback, min = 0, max = 1) =>
  Number.isFinite(Number(value))
    ? Math.max(min, Math.min(max, Number(value)))
    : fallback;
export function normalizeVisualConfig(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const preset = Object.hasOwn(VISUAL_PRESETS, raw.preset)
    ? raw.preset
    : Object.hasOwn(legacy, raw.preset)
      ? legacy[raw.preset]
      : 'feedback';
  const defaults = VISUAL_PRESETS[preset].modules;
  const modules = Object.fromEntries(
    Object.keys(VISUAL_MODULES).map((key) => [
      key,
      number(
        typeof raw.modules?.[key] === 'number' ? raw.modules[key] : undefined,
        defaults[key] || 0,
      ),
    ]),
  );
  return {
    version: 3,
    preset,
    target: ['all', 'person', 'background'].includes(raw.target)
      ? raw.target
      : 'all',
    amount: number(raw.amount, 1),
    movement: number(raw.movement, 0.5),
    persistence: number(raw.persistence, 0.65),
    scale: number(raw.scale, 1, 0.25, 2.5),
    seed: Math.round(number(raw.seed, 18412, 0, 999999)),
    modules,
  };
}
export const createDefaultVisualConfig = (preset = 'feedback') =>
  normalizeVisualConfig({ preset });
export function applyVisualPreset(config, preset) {
  return normalizeVisualConfig({
    preset,
    seed: config?.seed,
    target: config?.target,
  });
}

// Narrow compatibility names for the existing timeline/project adapter.
export const createDefaultSubjectConfig = createDefaultVisualConfig;
export const normalizeSubjectConfig = normalizeVisualConfig;
export const applySubjectPreset = applyVisualPreset;
export const SUBJECT_PRESET_LABELS = Object.fromEntries(
  Object.entries(VISUAL_PRESETS).map(([id, p]) => [id, p.label]),
);
export function migrateProjectToV2(project) {
  if (!project || ![1, 2].includes(project.version))
    throw new Error('invalid_project');
  return { ...project, version: 2, timeline: { ...project.timeline } };
}
