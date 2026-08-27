/** Compact temporal cache for subject analysis samples. */

const ANALYSIS_VERSION = 2;
const DEFAULT_SAMPLE_HZ = 12;
const MAX_SAMPLES = 9000;

function clampRange(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class SubjectAnalysisCache {
  constructor(options = {}) {
    this.sourceKey = options.sourceKey || '';
    this.duration = options.duration || 0;
    this.sampleHz = options.sampleHz || DEFAULT_SAMPLE_HZ;
    this.samples = [];
    this.progress = 0;
    this.ready = false;
    this.running = false;
    this.version = ANALYSIS_VERSION;
  }

  invalidate(sourceKey = '') {
    if (sourceKey && sourceKey !== this.sourceKey) {
      this.samples = [];
      this.progress = 0;
      this.ready = false;
      this.running = false;
    }
    this.sourceKey = sourceKey || this.sourceKey;
  }

  isValidFor(sourceKey, duration) {
    return (
      this.sourceKey === sourceKey &&
      Math.abs(this.duration - duration) < 0.5 &&
      this.samples.length > 0
    );
  }

  addSample(sample) {
    if (!sample || !Number.isFinite(sample.timestamp)) return;
    const last = this.samples[this.samples.length - 1];
    const minGap = 1 / this.sampleHz;
    if (last && sample.timestamp - last.timestamp < minGap * 0.5) {
      this.samples[this.samples.length - 1] = sample;
    } else {
      this.samples.push(sample);
    }
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.shift();
    }
    if (this.duration > 0) {
      this.progress = clampRange(sample.timestamp / this.duration, 0, 1);
    }
  }

  markReady() {
    this.ready = true;
    this.running = false;
    this.progress = 1;
  }

  getProgressLabel() {
    if (this.ready) return 'Análisis listo';
    if (this.running) {
      return `Analizando sujeto… ${Math.round(this.progress * 100)}%`;
    }
    return '';
  }

  getAt(timestampSec) {
    if (!this.samples.length) return null;
    const t = timestampSec * 1000;
    if (t <= this.samples[0].timestamp) return this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (t >= last.timestamp) return last;

    let left = 0;
    let right = this.samples.length - 1;
    while (left < right - 1) {
      const mid = Math.floor((left + right) / 2);
      if (this.samples[mid].timestamp <= t) left = mid;
      else right = mid;
    }
    const a = this.samples[left];
    const b = this.samples[right];
    const span = Math.max(1, b.timestamp - a.timestamp);
    const alpha = (t - a.timestamp) / span;
    return interpolateSamples(a, b, alpha);
  }

  toJSON() {
    return {
      version: this.version,
      sourceKey: this.sourceKey,
      duration: this.duration,
      sampleHz: this.sampleHz,
      samples: this.samples,
    };
  }

  static fromJSON(payload) {
    const cache = new SubjectAnalysisCache(payload);
    cache.samples = Array.isArray(payload?.samples) ? payload.samples : [];
    cache.ready = cache.samples.length > 0;
    cache.progress = cache.ready ? 1 : 0;
    return cache;
  }
}

function interpolateSamples(a, b, alpha) {
  if (!a) return b;
  if (!b) return a;
  const landmarks = (a.landmarks || []).map((point, index) => {
    const next = b.landmarks?.[index] || point;
    return {
      x: lerp(point.x, next.x, alpha),
      y: lerp(point.y, next.y, alpha),
      z: lerp(point.z || 0, next.z || 0, alpha),
      visibility: lerp(point.visibility ?? 1, next.visibility ?? 1, alpha),
    };
  });
  return {
    ...a,
    ...b,
    landmarks,
    center: {
      x: lerp(a.center?.x || 0.5, b.center?.x || 0.5, alpha),
      y: lerp(a.center?.y || 0.5, b.center?.y || 0.5, alpha),
    },
    motionEnergy: lerp(a.motionEnergy || 0, b.motionEnergy || 0, alpha),
    timestamp: lerp(a.timestamp, b.timestamp, alpha),
    held: false,
    interpolated: true,
  };
}

export { ANALYSIS_VERSION, DEFAULT_SAMPLE_HZ };
