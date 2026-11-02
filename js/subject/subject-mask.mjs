/** Person mask processing at reduced resolution (typically 256–320px wide). */

const DEFAULT_MASK_OPTIONS = Object.freeze({
  threshold: 0.42,
  feather: 0.08,
  dilate: 1,
  erode: 0,
  smoothAlpha: 0.55,
});

function clampRange(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class SubjectMask {
  constructor(width, height, data) {
    this.width = width;
    this.height = height;
    this.data =
      data instanceof Uint8Array
        ? data
        : new Uint8Array(data || width * height);
    this.coverage = 0;
    this.bounds = null;
    this.contour = [];
    this.#recomputeMeta();
  }

  #recomputeMeta() {
    const { width, height, data } = this;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let sum = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = data[y * width + x];
        sum += value;
        if (value < 64) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    this.coverage = sum / (width * height * 255);
    this.bounds =
      maxX >= minX
        ? {
            minX: minX / width,
            minY: minY / height,
            maxX: (maxX + 1) / width,
            maxY: (maxY + 1) / height,
            width: (maxX - minX + 1) / width,
            height: (maxY - minY + 1) / height,
          }
        : null;
    this.contour = extractContour(data, width, height);
  }

  sampleMask(nx, ny) {
    const x = clampRange(Math.floor(nx * this.width), 0, this.width - 1);
    const y = clampRange(Math.floor(ny * this.height), 0, this.height - 1);
    return this.data[y * this.width + x] / 255;
  }

  getMaskCoverage() {
    return this.coverage;
  }

  getSubjectBounds() {
    return this.bounds;
  }

  toCanvas(targetCanvas = null) {
    const canvas = targetCanvas || document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(this.width, this.height);
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      imageData.data[i * 4] = v;
      imageData.data[i * 4 + 1] = v;
      imageData.data[i * 4 + 2] = v;
      imageData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
}

export function normalizeMaskBuffer(raw, width, height, options = {}) {
  const opts = { ...DEFAULT_MASK_OPTIONS, ...options };
  const size = width * height;
  const out = new Uint8Array(size);
  if (!raw || !size) return new SubjectMask(width, height, out);

  for (let i = 0; i < size; i++) {
    const value = raw[i] ?? 0;
    out[i] = value > opts.threshold * 255 ? 255 : 0;
  }

  if (opts.erode > 0) erodeMask(out, width, height, opts.erode);
  if (opts.dilate > 0) dilateMask(out, width, height, opts.dilate);
  if (opts.feather > 0) featherMask(out, width, height, opts.feather);

  return new SubjectMask(width, height, out);
}

export function smoothMaskTemporal(current, previous, alpha = 0.55) {
  if (!current?.data?.length) return previous || current;
  if (!previous?.data?.length || previous.width !== current.width) {
    return current;
  }
  const blend = clampRange(alpha, 0.1, 0.95);
  const data = new Uint8Array(current.data.length);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.round(
      previous.data[i] * (1 - blend) + current.data[i] * blend,
    );
  }
  return new SubjectMask(current.width, current.height, data);
}

export function packMaskFromMediaPipe(mask, targetWidth = 256) {
  if (!mask) return null;
  const srcW = mask.width || 0;
  const srcH = mask.height || 0;
  if (!srcW || !srcH) return null;
  const targetH = Math.max(1, Math.round((targetWidth * srcH) / srcW));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    ctx.drawImage(mask, 0, 0, targetWidth, targetH);
  } catch {
    return null;
  }
  const { data } = ctx.getImageData(0, 0, targetWidth, targetH);
  const out = new Uint8Array(targetWidth * targetH);
  for (let i = 0; i < out.length; i++) {
    out[i] = data[i * 4];
  }
  return normalizeMaskBuffer(out, targetWidth, targetH);
}

export function pickRandomMaskPoint(mask, seed, clipId, index, rng) {
  if (!mask?.data?.length || !mask.bounds) return null;
  const random = rng || (() => Math.random());
  const bounds = mask.bounds;
  for (let attempt = 0; attempt < 24; attempt++) {
    const nx =
      bounds.minX + random(seed, clipId, index, attempt, 'x') * bounds.width;
    const ny =
      bounds.minY + random(seed, clipId, index, attempt, 'y') * bounds.height;
    if (mask.sampleMask(nx, ny) > 0.45) {
      return { x: nx, y: ny };
    }
  }
  return mask.bounds
    ? {
        x: (bounds.minX + bounds.maxX) * 0.5,
        y: (bounds.minY + bounds.maxY) * 0.5,
      }
    : null;
}

function dilateMask(data, width, height, radius = 1) {
  const copy = new Uint8Array(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (copy[y * width + x] < 128) continue;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          data[py * width + px] = 255;
        }
      }
    }
  }
}

function erodeMask(data, width, height, radius = 1) {
  const copy = new Uint8Array(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let keep = true;
      for (let dy = -radius; dy <= radius && keep; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height) {
            keep = false;
            break;
          }
          if (copy[py * width + px] < 128) {
            keep = false;
            break;
          }
        }
      }
      data[y * width + x] = keep ? 255 : 0;
    }
  }
}

function featherMask(data, width, height, amount = 0.08) {
  const radius = Math.max(1, Math.round(amount * 10));
  const blurred = boxBlur(data, width, height, radius);
  for (let i = 0; i < data.length; i++) {
    data[i] = blurred[i];
  }
}

function boxBlur(data, width, height, radius) {
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const px = clampRange(x + dx, 0, width - 1);
          const py = clampRange(y + dy, 0, height - 1);
          sum += data[py * width + px];
          count++;
        }
      }
      out[y * width + x] = Math.round(sum / count);
    }
  }
  return out;
}

function extractContour(data, width, height) {
  const points = [];
  const step = Math.max(2, Math.round(Math.min(width, height) / 64));
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const idx = y * width + x;
      if (data[idx] < 128) continue;
      const edge =
        data[idx - 1] < 128 ||
        data[idx + 1] < 128 ||
        data[idx - width] < 128 ||
        data[idx + width] < 128;
      if (edge) points.push({ x: x / width, y: y / height });
    }
  }
  return points.slice(0, 120);
}

export { DEFAULT_MASK_OPTIONS };
