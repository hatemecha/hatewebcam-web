// Bounded CPU mode for browsers without WebGL. This is a deliberately
// reduced approximation of the GPU graph (no separate control-field/drift
// buffers), built from the same macro language so a system still reads as
// "the same instrument, less detailed" rather than a different effect.
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);

function hash(x, y, seed) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
  return s - Math.floor(s);
}

const SYSTEM_SPIN = { recursive: 1, flow: 0, pixelfield: 0, trace: 0.3 };
const SYSTEM_GRID = { recursive: 0, flow: 0.3, pixelfield: 1, trace: 0.2 };

export function processCompatiblePixels(
  source,
  config,
  time,
  delta,
  hasHistory,
  work,
  previous,
) {
  const { system, macros, seed } = config;
  const maxWidth = system === 'pixelfield' ? 160 : 240;
  work.width = Math.max(1, Math.min(maxWidth, source.width));
  work.height = Math.max(
    1,
    Math.round((work.width * source.height) / source.width),
  );
  const ctx = work.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = work;

  const cellBase =
    lerp(1, 10, macros.structure) * lerp(1, 3, SYSTEM_GRID[system]);
  const cell = Math.max(1, Math.round(cellBase));
  const flowAmt = lerp(0.002, 0.03, macros.movement) * w;

  ctx.drawImage(source, 0, 0, w, h);
  if (cell > 1 || flowAmt > 0.5) {
    const input = ctx.getImageData(0, 0, w, h);
    const output = ctx.createImageData(w, h);
    const t = time * lerp(0.1, 1.2, macros.movement);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bandPhase =
          hash(Math.floor(y / 6), Math.floor(t * 2), seed) - 0.5;
        let sx = Math.floor(x / cell) * cell + bandPhase * flowAmt;
        let sy = Math.floor(y / cell) * cell;
        sx = Math.max(0, Math.min(w - 1, Math.round(sx)));
        sy = Math.max(0, Math.min(h - 1, Math.round(sy)));
        const srcIdx = (sy * w + sx) * 4;
        const dstIdx = (y * w + x) * 4;
        output.data[dstIdx] = input.data[srcIdx];
        output.data[dstIdx + 1] = input.data[srcIdx + 1];
        output.data[dstIdx + 2] = input.data[srcIdx + 2];
        output.data[dstIdx + 3] = 255;
      }
    }
    ctx.putImageData(output, 0, 0);
  }

  if (macros.structure > 0.05) {
    const levels = Math.max(2, Math.round(lerp(3, 12, macros.structure)));
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = data[i + c] / 255;
        data[i + c] = Math.round((Math.round(v * levels) / levels) * 255);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  const memory = lerp(0.0, 0.94, macros.memory);
  if (hasHistory && memory > 0.01 && previous?.width === work.width) {
    ctx.save();
    ctx.globalAlpha =
      Math.pow(memory, Math.max(0.01, delta)) * macros.intensity;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(SYSTEM_SPIN[system] * 0.01 * delta * macros.movement);
    ctx.scale(
      1 - macros.structure * 0.002 * delta,
      1 - macros.structure * 0.002 * delta,
    );
    ctx.drawImage(previous, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  return work;
}
