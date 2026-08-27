import { seededRange } from '../../subject/subject-prng.mjs';
import {
  drawSubjectMask,
  mapNormToCanvas,
} from '../../subject/subject-frame-map.mjs';

export class PixelBodyEngine {
  constructor() {
    this._workCanvas = null;
    this._workCtx = null;
    this._maskCanvas = null;
    this._maskCtx = null;
  }

  render(
    ctx,
    canvas,
    frame,
    config,
    intensity = 1,
    seed = 0,
    clipId = '',
    drawMetrics = null,
    sourceCanvas = null,
  ) {
    if (!config?.enabled || !frame || !drawMetrics) return;
    const dissolve = config.dissolve * intensity;
    if (dissolve <= 0.01) return;

    const { width, height } = canvas;
    ctx.save();

    if (frame.mask && sourceCanvas && !frame.simplified) {
      const grid = Math.max(
        6,
        Math.round(config.gridSize * (1.1 - dissolve * 0.25)),
      );
      const mask = frame.mask;

      const work = this.#ensureWork(width, height);
      const wctx = this._workCtx;
      wctx.clearRect(0, 0, width, height);

      // Build opaque pixel/block replacement for subject pixels only.
      // Do not clear to "reveal" an underlying original subject.
      for (let gy = 0; gy < mask.height; gy += 2) {
        for (let gx = 0; gx < mask.width; gx += 2) {
          if (mask.data[gy * mask.width + gx] < 128) continue;
          const mapped = mapNormToCanvas(
            gx / mask.width,
            gy / mask.height,
            drawMetrics,
          );
          const noise = seededRange(seed, 0, 1, clipId, gx, gy, 'dissolve');
          if (noise > dissolve) continue;

          const cell = Math.max(2, grid * (0.7 + noise * 0.6));
          const sx = Math.max(
            0,
            Math.min(sourceCanvas.width - 1, Math.floor(mapped.x)),
          );
          const sy = Math.max(
            0,
            Math.min(sourceCanvas.height - 1, Math.floor(mapped.y)),
          );

          // Sample a block from the subject and draw it as a solid cell —
          // progressively replacing original subject appearance.
          const sample = Math.max(1, Math.floor(cell));
          wctx.globalAlpha = Math.min(1, 0.35 + dissolve * 0.75);
          try {
            wctx.drawImage(
              sourceCanvas,
              sx,
              sy,
              sample,
              sample,
              mapped.x,
              mapped.y,
              cell,
              cell,
            );
          } catch {
            wctx.fillStyle = `rgba(200,200,196,${0.45 + noise * 0.4})`;
            wctx.fillRect(mapped.x, mapped.y, cell, cell);
          }
          if (noise < dissolve * 0.7) {
            wctx.fillStyle = `rgba(240,240,236,${0.08 + noise * 0.22})`;
            wctx.fillRect(mapped.x, mapped.y, cell, cell);
          }
        }
      }

      // Restrict replacement to the subject mask, leave background untouched.
      const maskCanvas = this.#ensureMask(width, height);
      const mctx = this._maskCtx;
      mctx.clearRect(0, 0, width, height);
      drawSubjectMask(mctx, frame.mask, drawMetrics);
      wctx.globalCompositeOperation = 'destination-in';
      wctx.drawImage(maskCanvas, 0, 0);
      wctx.globalCompositeOperation = 'source-over';
      wctx.globalAlpha = 1;

      ctx.drawImage(work, 0, 0);
      ctx.restore();
      return;
    }

    if (frame.boundingBox) {
      const box = frame.boundingBox;
      const tl = mapNormToCanvas(box.minX, box.minY, drawMetrics);
      const br = mapNormToCanvas(box.maxX, box.maxY, drawMetrics);
      const x = Math.min(tl.x, br.x);
      const y = Math.min(tl.y, br.y);
      const w = Math.abs(br.x - tl.x);
      const h = Math.abs(br.y - tl.y);
      const grid = Math.max(8, config.gridSize);
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.globalAlpha = dissolve;
      for (let gx = 0; gx < w; gx += grid) {
        for (let gy = 0; gy < h; gy += grid) {
          const noise = seededRange(seed, 0, 1, clipId, gx, gy);
          if (noise > dissolve) continue;
          ctx.fillStyle = `rgba(240,240,236,${0.08 + noise * 0.3})`;
          ctx.fillRect(x + gx, y + gy, grid - 1, grid - 1);
        }
      }
    }
    ctx.restore();
  }

  #ensureWork(width, height) {
    if (!this._workCanvas) {
      this._workCanvas = document.createElement('canvas');
      this._workCtx = this._workCanvas.getContext('2d');
    }
    if (
      this._workCanvas.width !== width ||
      this._workCanvas.height !== height
    ) {
      this._workCanvas.width = width;
      this._workCanvas.height = height;
    }
    return this._workCanvas;
  }

  #ensureMask(width, height) {
    if (!this._maskCanvas) {
      this._maskCanvas = document.createElement('canvas');
      this._maskCtx = this._maskCanvas.getContext('2d');
    }
    if (
      this._maskCanvas.width !== width ||
      this._maskCanvas.height !== height
    ) {
      this._maskCanvas.width = width;
      this._maskCanvas.height = height;
    }
    return this._maskCanvas;
  }
}
