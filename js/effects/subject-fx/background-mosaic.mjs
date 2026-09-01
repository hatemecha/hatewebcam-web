import { seededRange } from '../../subject/subject-prng.mjs';
import {
  drawSubjectMask,
  mapNormToCanvas,
} from '../../subject/subject-frame-map.mjs';

/** Quantized media-time bucket for deterministic pattern evolution. */
export function mosaicTimeBucket(mediaTimeMs, holdMs = 420, speed = 1) {
  const hold = Math.max(80, holdMs);
  const rate = Math.max(0.1, speed);
  return Math.floor((Math.max(0, mediaTimeMs) * rate) / hold);
}

/** Pure cell gate — same seed/clip/time/cell always yields same decision. */
export function shouldMosaicCell(
  seed,
  clipId,
  timeBucket,
  cellX,
  cellY,
  coverage,
) {
  const roll = seededRange(seed, 0, 1, clipId, 'mosaic', timeBucket, cellX, cellY);
  return roll < Math.min(1, Math.max(0, coverage));
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export class BackgroundMosaicEngine {
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
    sourceCanvas = null,
    drawMetrics = null,
    mediaTimeMs = 0,
  ) {
    if (!config?.enabled || !sourceCanvas || !drawMetrics) return;
    const coverage = clamp01(config.coverage ?? 0.35) * clamp01(intensity);
    const opacity = clamp01(config.opacity ?? 0.55) * clamp01(intensity);
    if (coverage <= 0.01 || opacity <= 0.01) return;

    const { width, height } = canvas;
    const gridSize = Math.max(6, Math.round(config.gridSize ?? 18));
    const timeBucket = mosaicTimeBucket(
      mediaTimeMs,
      config.hold ?? 420,
      config.speed ?? 1,
    );

    const work = this.#ensureWork(width, height);
    const wctx = this._workCtx;
    wctx.clearRect(0, 0, width, height);

    for (let gy = 0; gy < height; gy += gridSize) {
      for (let gx = 0; gx < width; gx += gridSize) {
        const cellX = Math.floor(gx / gridSize);
        const cellY = Math.floor(gy / gridSize);
        if (
          !shouldMosaicCell(seed, clipId, timeBucket, cellX, cellY, coverage)
        ) {
          continue;
        }

        const sampleX = Math.min(
          sourceCanvas.width - 1,
          Math.max(0, Math.floor(gx + gridSize * 0.5)),
        );
        const sampleY = Math.min(
          sourceCanvas.height - 1,
          Math.max(0, Math.floor(gy + gridSize * 0.5)),
        );
        const block = Math.max(2, Math.round(gridSize * 0.92));
        const tone = seededRange(seed, 0.55, 1, clipId, 'tone', cellX, cellY);
        wctx.globalAlpha = opacity * tone;
        try {
          wctx.drawImage(
            sourceCanvas,
            sampleX,
            sampleY,
            block,
            block,
            gx,
            gy,
            gridSize,
            gridSize,
          );
        } catch {
          wctx.fillStyle = `rgba(210,210,206,${opacity * 0.4})`;
          wctx.fillRect(gx, gy, gridSize, gridSize);
        }
      }
    }

    this.#excludeSubject(wctx, width, height, frame, drawMetrics);
    ctx.drawImage(work, 0, 0);
  }

  #excludeSubject(wctx, width, height, frame, drawMetrics) {
    if (frame?.mask?.data?.length && !frame.simplified) {
      const maskCanvas = this.#ensureMask(width, height);
      const mctx = this._maskCtx;
      mctx.clearRect(0, 0, width, height);
      mctx.fillStyle = '#fff';
      mctx.fillRect(0, 0, width, height);
      drawSubjectMask(mctx, frame.mask, drawMetrics);
      wctx.globalCompositeOperation = 'destination-out';
      wctx.drawImage(maskCanvas, 0, 0);
      wctx.globalCompositeOperation = 'source-over';
      wctx.globalAlpha = 1;
      return;
    }

    if (frame?.boundingBox) {
      const box = frame.boundingBox;
      const tl = mapNormToCanvas(box.minX, box.minY, drawMetrics);
      const br = mapNormToCanvas(box.maxX, box.maxY, drawMetrics);
      const x = Math.min(tl.x, br.x);
      const y = Math.min(tl.y, br.y);
      const w = Math.abs(br.x - tl.x);
      const h = Math.abs(br.y - tl.y);
      const pad = Math.max(4, Math.min(w, h) * 0.04);
      wctx.save();
      wctx.globalCompositeOperation = 'destination-out';
      wctx.fillStyle = 'rgba(0,0,0,1)';
      wctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
      wctx.restore();
      wctx.globalAlpha = 1;
    }
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
