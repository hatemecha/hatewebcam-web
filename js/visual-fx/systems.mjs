// Rendering specifics for each of the four systems: the state-pass shader
// (the actual TOP-network-equivalent for that system) and the curated,
// non-linear mapping from macros/tuning onto its internal uniforms.
// This is the only place "creative direction" and "shader code" meet.
import { GLSL_LIB } from './glsl.mjs';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);

// Shared by every state-pass shader: a cheap 5-tap blur used as "erosion" -
// each feedback iteration can soften the carried image instead of ever
// staying razor sharp, which is what actually reads as decay over time.
const STATE_LIB = `${GLSL_LIB}
vec3 blurSample(sampler2D tex, vec2 uv, vec2 texel, float amount) {
  vec3 c = texture2D(tex, uv).rgb;
  if (amount <= 0.001) return c;
  vec3 sum = c;
  sum += texture2D(tex, clamp(uv + vec2(texel.x, 0.0), 0.0, 1.0)).rgb;
  sum += texture2D(tex, clamp(uv - vec2(texel.x, 0.0), 0.0, 1.0)).rgb;
  sum += texture2D(tex, clamp(uv + vec2(0.0, texel.y), 0.0, 1.0)).rgb;
  sum += texture2D(tex, clamp(uv - vec2(0.0, texel.y), 0.0, 1.0)).rgb;
  return mix(c, sum / 5.0, clamp(amount, 0.0, 1.0));
}
uniform sampler2D uIngestNow, uHistoryPrev, uField, uControl;
uniform vec2 uTexel;
uniform float uTime, uDelta, uHasHistory, uSeed;
uniform float uInjection, uMemory, uErosion, uDisplace, uStructure;
varying vec2 vUv;
`;

// Resolution tiers, low to high. `grain` tuning (0..1) indexes into these;
// changing tier is a topology change (buffers must be reallocated).
const TIERS = [
  [96, 54],
  [128, 72],
  [176, 99],
  [224, 126],
];
const PIXEL_TIERS = [
  [48, 27],
  [64, 36],
  [96, 54],
  [128, 72],
];

function tierFor(list, grain) {
  const index = Math.round(clamp01(grain) * (list.length - 1));
  return list[index];
}

export const SYSTEM_RENDER = Object.freeze({
  recursive: {
    resolutionTiers: TIERS,
    historyFilter: 'LINEAR',
    fieldScaleFreq: 2.1,
    fragment: `${STATE_LIB}
uniform float uSpin;
void main() {
  vec3 field = texture2D(uField, vUv).xyz;
  vec2 center = vUv - 0.5;
  float ang = uSpin * 0.012 * uDelta * (0.25 + field.z * 0.9);
  float zoom = 1.0 - uErosion * 0.006 * uDelta;
  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 warped = rot * (center * zoom) + 0.5;
  warped = clamp(warped + field.xy * uDisplace * 0.06, 0.0, 1.0);
  vec3 carried = blurSample(uHistoryPrev, warped, uTexel, uErosion * 0.5);
  vec3 src = texture2D(uIngestNow, vUv).rgb;
  vec3 injected = mix(carried, src, uInjection);
  float mem = pow(clamp(uMemory, 0.0, 0.995), max(0.02, uDelta));
  vec3 outc = mix(src, injected, mem * uHasHistory);
  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}`,
    tuningToUniforms(macros, tuning) {
      return {
        uSpin: lerp(0.35, 2.1, macros.movement) * lerp(0.5, 1.6, tuning.spin),
      };
    },
  },
  flow: {
    resolutionTiers: TIERS,
    historyFilter: 'LINEAR',
    fieldScaleFreq: 3.2,
    fragment: `${STATE_LIB}
uniform float uTurbulence;
void main() {
  vec3 field = texture2D(uField, vUv).xyz;
  vec2 flow = field.xy * uDisplace * 0.16 * (0.55 + uTurbulence);
  vec2 warpedHist = clamp(vUv + flow, 0.0, 1.0);
  vec2 warpedSrc = clamp(vUv + flow * 0.35, 0.0, 1.0);
  vec3 carried = blurSample(uHistoryPrev, warpedHist, uTexel, uErosion * 0.7);
  vec3 src = mix(texture2D(uIngestNow, vUv).rgb, texture2D(uIngestNow, warpedSrc).rgb, 0.6);
  float lumaC = luma(carried);
  vec3 collapsed = mix(carried, vec3(lumaC), uStructure * 0.55);
  vec3 merged = mix(collapsed, src, uInjection);
  float mem = pow(clamp(uMemory, 0.0, 0.99), max(0.02, uDelta));
  vec3 outc = mix(src, merged, mem * uHasHistory);
  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}`,
    tuningToUniforms(macros, tuning) {
      return { uTurbulence: lerp(0.2, 1.3, tuning.turbulence) };
    },
  },
  pixelfield: {
    resolutionTiers: PIXEL_TIERS,
    historyFilter: 'NEAREST',
    fieldScaleFreq: 1.8,
    fragment: `${STATE_LIB}
uniform float uJitter;
void main() {
  vec3 field = texture2D(uField, vUv).xyz;
  vec2 cellId = floor(vUv / uTexel + 0.5);
  vec2 jitter = (hash22(cellId + uSeed) - 0.5) * uJitter * uTexel * 3.0;
  vec2 warped = clamp(vUv + field.xy * uDisplace * 0.09 + jitter * uErosion, 0.0, 1.0);
  vec3 hist = texture2D(uHistoryPrev, warped).rgb;
  vec3 src = texture2D(uIngestNow, vUv).rgb;
  float motionHere = texture2D(uControl, vUv).a;
  float inj = clamp(uInjection + motionHere * 0.7, 0.0, 1.0);
  vec3 merged = mix(hist, src, inj);
  float mem = pow(clamp(uMemory, 0.0, 0.99), max(0.02, uDelta));
  vec3 outc = mix(src, merged, mem * uHasHistory);
  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}`,
    tuningToUniforms(macros, tuning) {
      return { uJitter: lerp(0.15, 1.4, tuning.jitter) };
    },
  },
  trace: {
    resolutionTiers: TIERS,
    historyFilter: 'LINEAR',
    fieldScaleFreq: 2.6,
    fragment: `${STATE_LIB}
uniform float uPersistBias;
void main() {
  vec3 field = texture2D(uField, vUv).xyz;
  vec4 control = texture2D(uControl, vUv);
  vec3 structureSignal = vec3(clamp(control.g * 0.85 + control.b * 0.65, 0.0, 1.0));
  vec2 warped = clamp(vUv + field.xy * uDisplace * 0.04, 0.0, 1.0);
  // Light erosion only - Trace's whole point is that structure should
  // *outlive* the source, so history is displaced but barely blurred.
  vec3 hist = blurSample(uHistoryPrev, warped, uTexel, uErosion * 0.12);
  // Afterimage decay (Level-TOP style: fade old material, then let fresh
  // structure stamp on top) rather than an averaging blend - averaging a
  // constant small signal into itself for hundreds of frames washes flat;
  // decay-then-max keeps edges legible for as long as they keep recurring.
  float localMem = mix(uMemory * (1.0 - uPersistBias * 0.4), uMemory, control.g);
  float mem = pow(clamp(localMem, 0.0, 0.985), max(0.02, uDelta));
  vec3 decayed = hist * mem * uHasHistory;
  vec3 traceAccum = max(decayed, structureSignal);
  vec3 src = texture2D(uIngestNow, vUv).rgb;
  vec3 outc = mix(traceAccum, src, uInjection * 0.6);
  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}`,
    tuningToUniforms(macros, tuning) {
      return { uPersistBias: lerp(0.3, 1.3, tuning.persistBias) };
    },
  },
});

export function getWorkingResolution(
  system,
  tuning,
  sourceWidth,
  sourceHeight,
) {
  const render = SYSTEM_RENDER[system];
  const [baseW] = tierFor(render.resolutionTiers, tuning.grain);
  const aspect = Math.max(0.05, sourceWidth / Math.max(1, sourceHeight));
  let width = baseW;
  let height = Math.max(4, Math.round(width / aspect));
  if (height > baseW) {
    height = baseW;
    width = Math.max(4, Math.round(height * aspect));
  }
  return { width: Math.max(4, width), height: Math.max(4, height) };
}

// The shared, non-topology part of the macro mapping: injection/memory/
// erosion/displace mean the same conceptual thing in every system, only
// their exact curve differs slightly per system's character.
export function computeSharedUniforms(system, macros) {
  const memoryCeil =
    system === 'flow' || system === 'pixelfield' ? 0.985 : 0.994;
  return {
    uInjection: clamp01(
      lerp(0.32, 0.05, macros.memory) + macros.movement * 0.08,
    ),
    uMemory: lerp(0.85, memoryCeil, macros.memory),
    uErosion: lerp(0.05, 1.0, macros.structure),
    uDisplace: lerp(0.12, 1.6, macros.movement),
  };
}

export function computeFieldUniforms(system, macros) {
  const render = SYSTEM_RENDER[system];
  return {
    uSpeed: lerp(0.02, 0.14, macros.movement),
    uAdaptRate: clamp01(
      lerp(0.02, 0.16, macros.movement) * lerp(1.3, 0.55, macros.memory),
    ),
    uReactivity: lerp(0.35, 1.7, macros.structure),
    uScaleFreq: render.fieldScaleFreq,
  };
}

// Palette pass uniforms. `tuning.palette` (0..4) overrides the system's
// curated default when the user opens Tuning; levels/curve/dither follow
// the `structure` macro so "structure" reliably means "more defined".
const DEFAULT_TONES = {
  recursive: [
    [0.02, 0.02, 0.03],
    [0.94, 0.93, 0.9],
  ],
  flow: [
    [0.015, 0.02, 0.03],
    [0.66, 0.82, 0.92],
  ],
  pixelfield: [
    [0.03, 0.02, 0.02],
    [0.95, 0.9, 0.82],
  ],
  trace: [
    [0.03, 0.02, 0.02],
    [0.98, 0.78, 0.55],
  ],
};

export function computePaletteUniforms(system, macros, tuning) {
  const levelsFloor = system === 'pixelfield' ? 2.5 : 3;
  const levelsCeil = system === 'pixelfield' ? 9 : 15;
  const [toneA, toneB] = DEFAULT_TONES[system];
  return {
    uLevels: lerp(levelsFloor, levelsCeil, macros.structure),
    uCurve: lerp(0.85, 1.75, macros.structure),
    uDither: lerp(0.95, 0.25, macros.structure),
    uPaletteMode: tuning.palette,
    uToneA: toneA,
    uToneB: toneB,
  };
}
