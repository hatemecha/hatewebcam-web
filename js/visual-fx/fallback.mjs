// Bounded CPU mode for browsers without WebGL. Same recipes, reduced spatial detail.
export function processCompatiblePixels(source, config, time, work) {
  const m = config.modules;
  work.width = Math.max(1, Math.min(320, source.width));
  work.height = Math.max(
    1,
    Math.round((work.width * source.height) / source.width),
  );
  const ctx = work.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, work.width, work.height);
  const { width: w, height: h } = work;
  const input = ctx.getImageData(0, 0, w, h),
    output = ctx.createImageData(w, h);
  const t = time * (0.15 + config.movement * 1.8);
  const sample = (x, y, c) =>
    input.data[
      (Math.max(0, Math.min(h - 1, Math.floor(y))) * w +
        Math.max(0, Math.min(w - 1, Math.floor(x)))) *
        4 +
        c
    ];
  const cell = Math.max(
    1,
    Math.round(((1 + m.pixel * 28 * config.scale) * w) / 640),
  );
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const band = Math.floor((y / h) * 32),
        phase =
          Math.sin(band * 127.1 + Math.floor(t * 7) * 311.7 + config.seed) *
          43758.5453;
      let px =
        Math.floor(x / cell) * cell +
        m.flow * w * 0.035 * Math.sin((y / h) * 19 + t * 1.7) +
        m.fragments * (phase - Math.floor(phase) - 0.5) * w * 0.24;
      const tile = Math.sin(
        Math.floor((x / w) * 10) * 127 +
          Math.floor((y / h) * 7) * 311 +
          Math.floor(t * 2) +
          config.seed,
      );
      px += m.tiles * w * 0.12 * tile;
      const py = Math.floor(y / cell) * cell + m.tiles * h * 0.12 * tile;
      px += m.sorting * w * 0.04 * (sample(px, py, 0) / 255);
      const r = sample(px + m.rgb * w * 0.012, py, 0),
        g = sample(px, py, 1),
        b = sample(px - m.rgb * w * 0.012, py, 2);
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const edge =
        Math.abs(sample(px + 1, py + 1, 1) - sample(px - 1, py - 1, 1)) * 4;
      for (let c = 0; c < 3; c++) {
        let v = [r, g, b][c] * (1 - m.monochrome) + gray * m.monochrome;
        v = v * (1 - m.edges) + edge * m.edges;
        v += (((x % 2) + 2 * (y % 2)) / 4 - 0.375) * m.dither * 127;
        v = v * (1 - m.threshold) + (v >= 122 ? 255 : 0) * m.threshold;
        if (m.posterize > 0) {
          const levels = Math.max(2, 16 - m.posterize * 14);
          v = (Math.round((v / 255) * levels) / levels) * 255;
        }
        v *= 1 - m.scan * 0.3 * (0.5 + 0.5 * Math.sin(y * Math.PI - t * 3));
        output.data[(y * w + x) * 4 + c] = v;
      }
      output.data[(y * w + x) * 4 + 3] = 255;
    }
  ctx.putImageData(output, 0, 0);
  return work;
}
