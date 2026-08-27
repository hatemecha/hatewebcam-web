import { seededRange } from '../../subject/subject-prng.mjs';
import { mapNormToCanvas } from '../../subject/subject-frame-map.mjs';

export class PixelBodyEngine {
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
      const grid = Math.max(6, Math.round(config.gridSize * (1.1 - dissolve * 0.25)));
      const mask = frame.mask;
      const subjectAlpha = Math.max(0, 1 - dissolve * 1.05);
      const digitalAlpha = dissolve;

      const work = document.createElement('canvas');
      work.width = width;
      work.height = height;
      const wctx = work.getContext('2d');
      wctx.drawImage(sourceCanvas, 0, 0, width, height);

      wctx.save();
      wctx.globalAlpha = subjectAlpha;
      this.#drawMaskedSource(wctx, drawMetrics, frame, sourceCanvas);
      wctx.restore();

      wctx.save();
      wctx.globalAlpha = digitalAlpha;
      for (let gy = 0; gy < mask.height; gy += 2) {
        for (let gx = 0; gx < mask.width; gx += 2) {
          if (mask.data[gy * mask.width + gx] < 128) continue;
          const mapped = mapNormToCanvas(gx / mask.width, gy / mask.height, drawMetrics);
          const noise = seededRange(seed, 0, 1, clipId, gx, gy, 'dissolve');
          if (noise > dissolve) continue;
          const cell = grid * (0.7 + noise * 0.6);
          wctx.fillStyle = `rgba(240,240,236,${0.06 + noise * 0.28})`;
          wctx.fillRect(mapped.x, mapped.y, cell, cell);
          if (noise < dissolve * 0.55) {
            wctx.clearRect(mapped.x, mapped.y, cell, cell);
          }
        }
      }
      wctx.restore();

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

  #drawMaskedSource(ctx, drawMetrics, frame, sourceCanvas) {
    const mask = frame.mask;
    const overlay = document.createElement('canvas');
    overlay.width = sourceCanvas.width;
    overlay.height = sourceCanvas.height;
    const octx = overlay.getContext('2d');
    const step = 2;
    for (let gy = 0; gy < mask.height; gy += step) {
      for (let gx = 0; gx < mask.width; gx += step) {
        if (mask.data[gy * mask.width + gx] < 128) continue;
        const mapped = mapNormToCanvas(gx / mask.width, gy / mask.height, drawMetrics);
        octx.fillRect(mapped.x, mapped.y, step + 1, step + 1);
      }
    }
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(overlay, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
}
