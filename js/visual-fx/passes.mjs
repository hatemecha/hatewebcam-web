// Fragment shaders for the fixed part of the pipeline: downsample into the
// working "pixel space", derive a control-field signal (luma/edges/motion),
// evolve a persistent drift field, quantize into a palette, and upscale.
// The only *variable* part of the graph is the per-system state pass,
// defined in systems.mjs.
import { GLSL_LIB } from './glsl.mjs';

// SOURCE -> INGEST. A supersampled box downsample into working resolution;
// this is the GPU doing real anti-aliased minification, not a naive nearest
// grab, so low internal resolutions stay coherent instead of noisy.
export const INGEST_FRAGMENT = `${GLSL_LIB}
varying vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uSourceTexel;
void main() {
  vec3 sum = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y)) * uSourceTexel;
      sum += texture2D(uSource, clamp(vUv + offset, 0.0, 1.0)).rgb;
    }
  }
  gl_FragColor = vec4(sum / 9.0, 1.0);
}`;

// INGEST (+ its own last frame) -> CONTROL FIELD.
// R = luma, G = edge magnitude, B = instant frame difference,
// A = leaky-integrated motion accumulator (a real "has this settled or is
// it moving" signal, not a per-frame flicker).
export const CONTROL_FIELD_FRAGMENT = `${GLSL_LIB}
varying vec2 vUv;
uniform sampler2D uIngestNow, uIngestPrev, uControlPrev;
uniform vec2 uTexel;
void main() {
  vec3 now = texture2D(uIngestNow, vUv).rgb;
  vec3 prev = texture2D(uIngestPrev, vUv).rgb;
  float lNow = luma(now);
  float lPrev = luma(prev);
  float diff = abs(lNow - lPrev);

  float n = luma(texture2D(uIngestNow, vUv + vec2(0.0, uTexel.y)).rgb);
  float s = luma(texture2D(uIngestNow, vUv - vec2(0.0, uTexel.y)).rgb);
  float e = luma(texture2D(uIngestNow, vUv + vec2(uTexel.x, 0.0)).rgb);
  float w = luma(texture2D(uIngestNow, vUv - vec2(uTexel.x, 0.0)).rgb);
  float ne = luma(texture2D(uIngestNow, vUv + uTexel).rgb);
  float sw = luma(texture2D(uIngestNow, vUv - uTexel).rgb);
  float nw = luma(texture2D(uIngestNow, vUv + vec2(uTexel.x, -uTexel.y)).rgb);
  float se = luma(texture2D(uIngestNow, vUv + vec2(-uTexel.x, uTexel.y)).rgb);
  float gx = (e + ne + se) - (w + nw + sw);
  float gy = (n + ne + nw) - (s + se + sw);
  float edge = clamp(length(vec2(gx, gy)) * 1.5, 0.0, 1.0);

  float prevMotion = texture2D(uControlPrev, vUv).a;
  float motion = mix(prevMotion, clamp(diff * 6.0, 0.0, 1.0), 0.18);

  gl_FragColor = vec4(lNow, edge, diff, motion);
}`;

// CONTROL FIELD (+ its own last state) -> DRIFT FIELD.
// A vector field with inertia: it eases toward a curl-noise target instead
// of snapping to it, so the field itself has memory and evolves smoothly
// rather than being a pure function of time.
export const FIELD_FRAGMENT = `${GLSL_LIB}
varying vec2 vUv;
uniform sampler2D uFieldPrev, uControl;
uniform float uTime, uSeed, uSpeed, uReactivity, uAdaptRate, uScaleFreq;
void main() {
  vec2 p = vUv * uScaleFreq + vec2(uSeed * 13.7, uSeed * 7.1);
  vec2 target = curlField(p + uTime * uSpeed);
  vec4 control = texture2D(uControl, vUv);
  float energize = 1.0 + (control.g * 1.6 + control.a * 1.1) * uReactivity;
  target *= energize;
  vec2 prevField = texture2D(uFieldPrev, vUv).xy;
  vec2 nextField = mix(prevField, target, clamp(uAdaptRate, 0.001, 1.0));
  gl_FragColor = vec4(nextField, control.r, 1.0);
}`;

// HISTORY -> QUANTIZE/PALETTE. Quantization only ever happens here, on the
// way to the screen - the feedback state itself stays continuous so error
// never compounds into mud across hundreds of frames.
export const PALETTE_FRAGMENT = `${GLSL_LIB}
varying vec2 vUv;
uniform sampler2D uHistory;
uniform float uLevels, uDither, uPaletteMode, uCurve;
uniform vec3 uToneA, uToneB;
void main() {
  vec3 c = texture2D(uHistory, vUv).rgb;
  float l = clamp(luma(c), 0.0, 1.0);
  float shaped = pow(l, uCurve);
  float d = ditherJitter(gl_FragCoord.xy, shaped) / max(2.0, uLevels);
  shaped = clamp(shaped + d * uDither, 0.0, 1.0);
  float q = floor(shaped * uLevels + 0.5) / uLevels;
  vec3 outc = paletteMap(c, q, uPaletteMode, uToneA, uToneB);
  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}`;

// PALETTE OUTPUT -> SCREEN. Deliberate nearest-neighbour upscale: the low
// working resolution is part of the aesthetic, not hidden by a blur, and it
// is blended against the full-resolution source by the intensity macro.
export const BLIT_FRAGMENT = `${GLSL_LIB}
varying vec2 vUv;
uniform sampler2D uPalette, uSourceFull;
uniform float uAmount;
void main() {
  vec3 processed = texture2D(uPalette, vUv).rgb;
  vec3 source = texture2D(uSourceFull, vUv).rgb;
  gl_FragColor = vec4(mix(source, processed, uAmount), 1.0);
}`;
