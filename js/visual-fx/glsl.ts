// Shared GLSL ES 1.00 function library, spliced into every pass shader.
// Kept deliberately small: hashing/noise/fbm/curl for coherent fields,
// luma/sobel for structural signal, and palette/dither for the final look.
// No sin(y*n+time) motion anywhere - deformation is driven by these fields.

export const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

export const GLSL_LIB = `
precision highp float;

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453123);
}
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
vec2 hash22(vec2 p) {
  float n = dot(p, vec2(127.1, 311.7));
  return fract(sin(vec2(n, n + 41.13)) * vec2(43758.5453123, 22578.1459123));
}

// Value noise: smooth, coherent, no directional bias.
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 4-octave fractal brownian motion - the base of every coherent field below.
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    sum += valueNoise(p * freq) * amp;
    freq *= 2.02;
    amp *= 0.55;
  }
  return sum;
}

// Curl of an fbm potential: a divergence-free-ish vector field. This is
// what actually pushes pixels around - never a raw sine wave.
vec2 curlField(vec2 p) {
  float eps = 0.15;
  float n1 = fbm(p + vec2(0.0, eps));
  float n2 = fbm(p - vec2(0.0, eps));
  float n3 = fbm(p + vec2(eps, 0.0));
  float n4 = fbm(p - vec2(eps, 0.0));
  float dx = (n1 - n2) / (2.0 * eps);
  float dy = (n3 - n4) / (2.0 * eps);
  return vec2(dy, -dx);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// Per-texel hash jitter for dequantizing, weighted toward the middle of the
// 0..1 range so flat blacks/whites (most of a restrained palette) stay
// clean instead of speckling into a screentone/halftone pattern.
float ditherJitter(vec2 fragCoord, float shaped) {
  float n = hash21(fragCoord + 0.5) - 0.5;
  float weight = 4.0 * shaped * (1.0 - shaped);
  return n * weight;
}

// Curated tone ramps. mode: 0 source-restrained, 1 mono, 2 warm mono,
// 3 cold mono, 4 duotone (toneA -> toneB). Never a full-spectrum LUT.
vec3 paletteMap(vec3 src, float q, float mode, vec3 toneA, vec3 toneB) {
  vec3 mono = vec3(q);
  vec3 warm = mix(vec3(0.03, 0.02, 0.02), vec3(0.98, 0.78, 0.55), q);
  vec3 cold = mix(vec3(0.015, 0.02, 0.03), vec3(0.66, 0.82, 0.92), q);
  vec3 duo = mix(toneA, toneB, q);
  vec3 restrained = mix(src, mono, 0.55);
  vec3 outc = restrained;
  outc = mix(outc, mono, step(0.5, mode) * step(mode, 1.5));
  outc = mix(outc, warm, step(1.5, mode) * step(mode, 2.5));
  outc = mix(outc, cold, step(2.5, mode) * step(mode, 3.5));
  outc = mix(outc, duo, step(3.5, mode));
  return outc;
}
`;
