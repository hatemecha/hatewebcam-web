import { getStrongestMotionRegion } from '../../subject/subject-local-motion.mjs';
import {
  drawSubjectMask,
  mapNormToCanvas,
} from '../../subject/subject-frame-map.mjs';

const HISTORY_MAX_WIDTH = 400;

/** Simulation is authored against a 30fps media clock. */
const MEDIA_FRAME_MS = 1000 / 30;

export class TrailEngine {
  constructor() {
    this.history = [];
    this.maxHistory = 10;
    this._pool = [];
    this._echoCanvas = null;
    this._echoCtx = null;
    this.lastMediaMs = null;
    this.lastMediaBucket = null;
  }

  reset() {
    for (const entry of this.history) {
      this.#releaseSnapshot(entry);
    }
    this.history = [];
    this.lastMediaMs = null;
    this.lastMediaBucket = null;
  }

  update({
    frame,
    config,
    intensity,
    width,
    height,
    sourceCanvas,
    mediaTimeMs,
  }) {
    if (!config?.enabled || !frame || !sourceCanvas) return;
    const copies = Math.max(1, Math.round(config.copies * intensity));
    this.maxHistory = Math.min(14, copies + 3);

    const mediaMs =
      mediaTimeMs != null && Number.isFinite(mediaTimeMs)
        ? mediaTimeMs
        : frame.timestamp || 0;
    if (this.lastMediaMs != null && mediaMs + 40 < this.lastMediaMs) {
      this.reset();
    }
    this.lastMediaMs = mediaMs;

    const mediaBucket = Math.floor(mediaMs / MEDIA_FRAME_MS);
    if (this.lastMediaBucket === mediaBucket && this.history.length > 0) {
      return;
    }
    this.lastMediaBucket = mediaBucket;

    const snapshot = this.#captureSnapshot(
      sourceCanvas,
      frame,
      width,
      height,
      mediaMs,
    );
    this.history.unshift(snapshot);
    while (this.history.length > this.maxHistory) {
      this.#releaseSnapshot(this.history.pop());
    }
  }

  render(
    ctx,
    canvas,
    config,
    intensity = 1,
    _flipH = false,
    _sourceCanvas = null,
    drawMetrics = null,
  ) {
    if (!config?.enabled || this.history.length < 2 || !drawMetrics) return;
    const mode = config.mode || 'silhouette';
    // Explicit temporal stride: spacing 0 → every frame, 1 → every ~4th.
    const stride = Math.max(1, Math.round(1 + (config.spacing || 0) * 4));
    ctx.save();

    for (let index = stride; index < this.history.length; index += stride) {
      const snapshot = this.history[index];
      const alpha =
        config.opacity *
        intensity *
        Math.pow(config.decay, index / stride) *
        (0.28 + snapshot.motion * config.motionInfluence);
      if (alpha < 0.02) continue;

      const offset = snapshot.strongest
        ? {
            x:
              (snapshot.strongest.velocity?.x || 0) *
              drawMetrics.drawWidth *
              (index / stride) *
              0.08 *
              config.motionInfluence,
            y:
              (snapshot.strongest.velocity?.y || 0) *
              drawMetrics.drawHeight *
              (index / stride) *
              0.08 *
              config.motionInfluence,
          }
        : { x: 0, y: 0 };

      if (
        (mode === 'body' || mode === 'ghost' || mode === 'silhouette') &&
        snapshot.mask
      ) {
        this.#renderMaskEcho(
          ctx,
          canvas,
          snapshot,
          alpha,
          offset,
          mode,
          drawMetrics,
        );
      } else if (mode === 'skeleton' || mode === 'landmark') {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#f0f0ec';
        ctx.fillStyle = '#f0f0ec';
        ctx.lineWidth = 1;
        snapshot.landmarks?.forEach((point) => {
          const mapped = mapNormToCanvas(point.x, point.y, drawMetrics);
          const x = mapped.x + offset.x;
          const y = mapped.y + offset.y;
          ctx.beginPath();
          ctx.arc(x, y, mode === 'ghost' ? 2.5 : 1.2, 0, Math.PI * 2);
          if (mode === 'ghost') ctx.fill();
          else ctx.stroke();
        });
      }
    }
    ctx.restore();
  }

  #captureSnapshot(sourceCanvas, frame, width, height, mediaMs) {
    const entry = this.#acquireSnapshot();
    const scale = Math.min(1, HISTORY_MAX_WIDTH / Math.max(1, width));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (entry.canvas.width !== w || entry.canvas.height !== h) {
      entry.canvas.width = w;
      entry.canvas.height = h;
    }
    entry.ctx.clearRect(0, 0, w, h);
    entry.ctx.drawImage(sourceCanvas, 0, 0, w, h);

    entry.timestamp = mediaMs;
    entry.center = frame.center ? { ...frame.center } : null;
    entry.bbox = frame.boundingBox;
    entry.mask = frame.mask
      ? {
          width: frame.mask.width,
          height: frame.mask.height,
          data: new Uint8Array(frame.mask.data),
          bounds: frame.mask.bounds,
        }
      : null;
    entry.landmarks = frame.landmarks?.map((point) => ({
      x: point.x,
      y: point.y,
    }));
    entry.motion = frame.motionEnergy || 0;
    entry.strongest = getStrongestMotionRegion(frame.regions || {});
    entry.width = width;
    entry.height = height;
    entry.ownsCanvas = true;
    return entry;
  }

  #acquireSnapshot() {
    const recycled = this._pool.pop();
    if (recycled) return recycled;
    const canvas = document.createElement('canvas');
    return {
      canvas,
      ctx: canvas.getContext('2d'),
      ownsCanvas: true,
    };
  }

  #releaseSnapshot(entry) {
    if (!entry?.ownsCanvas) return;
    entry.mask = null;
    entry.landmarks = null;
    entry.strongest = null;
    this._pool.push(entry);
  }

  #renderMaskEcho(ctx, canvas, snapshot, alpha, offset, mode, drawMetrics) {
    if (!snapshot.mask?.data || !snapshot.canvas) return;
    if (!this._echoCanvas) {
      this._echoCanvas = document.createElement('canvas');
      this._echoCtx = this._echoCanvas.getContext('2d');
    }
    if (
      this._echoCanvas.width !== canvas.width ||
      this._echoCanvas.height !== canvas.height
    ) {
      this._echoCanvas.width = canvas.width;
      this._echoCanvas.height = canvas.height;
    }
    const maskCtx = this._echoCtx;
    maskCtx.clearRect(0, 0, canvas.width, canvas.height);
    maskCtx.save();
    maskCtx.globalAlpha = alpha;
    drawSubjectMask(maskCtx, snapshot.mask, drawMetrics, {
      offsetX: offset.x,
      offsetY: offset.y,
    });
    maskCtx.globalCompositeOperation = 'source-in';
    maskCtx.drawImage(snapshot.canvas, 0, 0, canvas.width, canvas.height);
    maskCtx.restore();

    ctx.save();
    ctx.globalAlpha = mode === 'ghost' ? alpha * 0.55 : alpha * 0.72;
    ctx.drawImage(this._echoCanvas, 0, 0);
    ctx.restore();
  }
}
