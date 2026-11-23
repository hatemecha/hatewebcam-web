// Visual FX v4 configuration: schema, defaults, normalization and legacy
// migration. Framework-free on purpose (no GL, no DOM) so it stays testable
// in plain Node and importable by the UI, the timeline and the renderer.
//
// A config is a system (which internal graph runs), a target (external
// mask compositing, unrelated to the system's own state), four macro dials
// that always mean the same thing, and a small per-system tuning set that
// the "Tuning" drawer reveals. Everything here is intentionally small: the
// renderer maps macros/tuning onto many internal uniforms (see systems.ts),
// but the saved/serialized shape stays flat and readable.

const clamp01 = (v: number) =>
  Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));

// Four systems. No "gallery of filters" - each is a distinct signal graph.
// Labels/hints are the only UI-facing strings; everything else is internal.
export const VISUAL_SYSTEMS = Object.freeze({
  recursive: Object.freeze({
    label: 'Recursive',
    hint: 'Memoria de imagen que gira, se acerca y se erosiona.',
  }),
  flow: Object.freeze({
    label: 'Flow',
    hint: 'La imagen fluye a lo largo de un campo y colapsa en masas.',
  }),
  pixelfield: Object.freeze({
    label: 'Pixel Field',
    hint: 'El píxel es material: una grilla que retiene y libera.',
  }),
  trace: Object.freeze({
    label: 'Trace',
    hint: 'Bordes y movimiento quedan como rastro cuando la imagen se va.',
  }),
});
export type VisualSystem = keyof typeof VISUAL_SYSTEMS;
export type VisualTarget = 'all' | 'person' | 'background';
export const VISUAL_SYSTEM_IDS = Object.freeze(
  Object.keys(VISUAL_SYSTEMS) as VisualSystem[],
);

interface TuningField {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
  topology?: boolean;
}

// Curated per-system starting points. These are NOT 0.5 everywhere - a
// system should already feel intentional at its defaults.
const DEFAULT_MACROS = Object.freeze({
  recursive: Object.freeze({
    intensity: 0.85,
    memory: 0.62,
    structure: 0.4,
    movement: 0.35,
  }),
  flow: Object.freeze({
    intensity: 0.85,
    memory: 0.5,
    structure: 0.55,
    movement: 0.5,
  }),
  pixelfield: Object.freeze({
    intensity: 0.9,
    memory: 0.55,
    structure: 0.6,
    movement: 0.4,
  }),
  trace: Object.freeze({
    intensity: 0.85,
    memory: 0.7,
    structure: 0.5,
    movement: 0.3,
  }),
});

// Per-system tuning schema: only the parameters that make sense for that
// system reach the "Tuning" drawer. `topology: true` means changing this
// value changes buffer shape/graph and must reset the running simulation;
// everything else (macros, and non-topology tuning) is state-safe.
export const TUNING_SCHEMA: Readonly<
  Record<VisualSystem, readonly TuningField[]>
> = Object.freeze({
  recursive: Object.freeze([
    {
      key: 'grain',
      label: 'Resolución',
      min: 0,
      max: 1,
      default: 0.55,
      topology: true,
    },
    { key: 'spin', label: 'Carácter del giro', min: 0, max: 1, default: 0.5 },
    { key: 'palette', label: 'Paleta', min: 0, max: 4, step: 1, default: 1 },
  ]),
  flow: Object.freeze([
    {
      key: 'grain',
      label: 'Resolución',
      min: 0,
      max: 1,
      default: 0.5,
      topology: true,
    },
    { key: 'turbulence', label: 'Turbulencia', min: 0, max: 1, default: 0.4 },
    { key: 'palette', label: 'Paleta', min: 0, max: 4, step: 1, default: 3 },
  ]),
  pixelfield: Object.freeze([
    {
      key: 'grain',
      label: 'Resolución',
      min: 0,
      max: 1,
      default: 0.35,
      topology: true,
    },
    { key: 'jitter', label: 'Inquietud', min: 0, max: 1, default: 0.45 },
    { key: 'palette', label: 'Paleta', min: 0, max: 4, step: 1, default: 4 },
  ]),
  trace: Object.freeze([
    {
      key: 'grain',
      label: 'Resolución',
      min: 0,
      max: 1,
      default: 0.6,
      topology: true,
    },
    {
      key: 'persistBias',
      label: 'Persistencia de bordes',
      min: 0,
      max: 1,
      default: 0.55,
    },
    { key: 'palette', label: 'Paleta', min: 0, max: 4, step: 1, default: 2 },
  ]),
});

export const PALETTE_OPTIONS = Object.freeze([
  { id: 0, label: 'Restringida' },
  { id: 1, label: 'Monocromo' },
  { id: 2, label: 'Monocromo cálido' },
  { id: 3, label: 'Monocromo frío' },
  { id: 4, label: 'Duotono' },
]);

const MACRO_KEYS = Object.freeze([
  'intensity',
  'memory',
  'structure',
  'movement',
] as const);
export const MACRO_LABELS = Object.freeze({
  intensity: 'Intensidad',
  memory: 'Memoria',
  structure: 'Estructura',
  movement: 'Movimiento',
});

export type VisualMacros = Record<(typeof MACRO_KEYS)[number], number>;
export type VisualTuning = Record<string, number>;

export interface VisualConfig {
  version: 4;
  system: VisualSystem;
  target: VisualTarget;
  seed: number;
  macros: VisualMacros;
  tuning: VisualTuning;
}

const legacySystemMap: Readonly<Record<string, VisualSystem>> = Object.freeze({
  feedback: 'recursive',
  echo: 'recursive',
  ghost: 'recursive',
  melt: 'flow',
  fragment: 'flow',
  decay: 'pixelfield',
  noise: 'pixelfield',
  signal: 'trace',
  scan: 'trace',
  // pre-v3 ids, kept for older saved projects
  anatomy: 'trace',
  'data-body': 'trace',
  smear: 'flow',
  dissolve: 'pixelfield',
  'signal-map': 'trace',
});

function resolveSystem(raw: unknown): VisualSystem {
  if (typeof raw !== 'string') return 'recursive';
  if (Object.hasOwn(VISUAL_SYSTEMS, raw)) return raw as VisualSystem;
  if (Object.hasOwn(legacySystemMap, raw)) return legacySystemMap[raw];
  return 'recursive';
}

function normalizeMacros(system: VisualSystem, raw: unknown): VisualMacros {
  const defaults = DEFAULT_MACROS[system];
  const out: VisualMacros = { ...defaults };
  const values = configRecord(raw);
  for (const key of MACRO_KEYS) {
    const value = values[key];
    out[key] = clamp01(typeof value === 'number' ? value : defaults[key]);
  }
  return out;
}

function normalizeTuning(system: VisualSystem, raw: unknown): VisualTuning {
  const schema = TUNING_SCHEMA[system];
  const out: VisualTuning = {};
  const values = configRecord(raw);
  for (const field of schema) {
    const value = values[field.key];
    const step = field.step || 0;
    let v =
      typeof value === 'number' && Number.isFinite(value)
        ? value
        : field.default;
    v = clamp(v, field.min, field.max);
    if (step) v = Math.round(v / step) * step;
    out[field.key] = v;
  }
  return out;
}

// A compact key describing everything that requires a fresh simulation.
// Target is intentionally excluded: masking is external compositing and
// must not disturb the running system underneath it.
export function visualConfigTopologyKey(
  config: Pick<VisualConfig, 'system' | 'tuning'>,
) {
  const schema = TUNING_SCHEMA[config.system] || [];
  const topo = schema
    .filter((field) => field.topology)
    .map((field) => `${field.key}:${config.tuning[field.key]}`)
    .join(',');
  return `${config.system}|${topo}`;
}

function configRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

export function normalizeVisualConfig(value?: unknown): VisualConfig {
  const raw = configRecord(value);
  const system = resolveSystem(raw.system ?? raw.preset);
  const target =
    raw.target === 'person' || raw.target === 'background' ? raw.target : 'all';
  const seed = Math.round(
    clamp(
      Number.isFinite(Number(raw.seed)) ? Number(raw.seed) : 18412,
      0,
      999999,
    ),
  );

  // v3 compatibility: map amount/movement/persistence onto the new macros
  // when a legacy config is fed in without its own `macros` block.
  const legacyMacroSeed =
    raw.macros && typeof raw.macros === 'object'
      ? raw.macros
      : {
          intensity: raw.amount,
          movement: raw.movement,
          memory: raw.persistence,
        };
  const macros = normalizeMacros(system, legacyMacroSeed);
  const tuning = normalizeTuning(system, raw.tuning);

  return { version: 4, system, target, seed, macros, tuning };
}

export const createDefaultVisualConfig = (system = 'recursive') =>
  normalizeVisualConfig({ system });

export function applyVisualSystem(
  config: Pick<VisualConfig, 'seed' | 'target'> | null,
  system: unknown,
) {
  return normalizeVisualConfig({
    system,
    seed: config?.seed,
    target: config?.target,
  });
}

export const VISUAL_SYSTEM_LABELS = Object.fromEntries(
  Object.entries(VISUAL_SYSTEMS).map(([id, s]) => [id, s.label]),
);

export function migrateProjectToV2<
  T extends { version?: unknown; timeline?: object },
>(project: T | null) {
  if (!project || (project.version !== 1 && project.version !== 2))
    throw new Error('invalid_project');
  return { ...project, version: 2 as const, timeline: { ...project.timeline } };
}
