import {
  drawSubjectMask,
  mapNormToCanvas,
} from '../../subject/subject-frame-map.mjs';

export class ScanEngine {
  constructor() {
    this._clipCanvas = null;
    this._clipCtx = null;
  }

  render(ctx, canvas, frame, config, intensity = 1, drawMetrics = null) {
    if (!config?.enabled || !frame || !drawMetrics) return;
    const alpha = Math.min(1, intensity * 0.72);
    const bounds = frame.mask?.bounds || frame.boundingBox;
    if (!bounds) return;

    const tl = mapNormToCanvas(bounds.minX, bounds.minY, drawMetrics);
    const br = mapNormToCanvas(bounds.maxX, bounds.maxY, drawMetrics);
    const x = Math.min(tl.x, br.x);
    const y = Math.min(tl.y, br.y);
    const w = Math.abs(br.x - tl.x);
    const h = Math.abs(br.y - tl.y);

    ctx.save();

    if (frame.mask && !frame.simplified) {
      if (!this._clipCanvas) {
        this._clipCanvas = document.createElement('canvas');
        this._clipCtx = this._clipCanvas.getContext('2d');
      }
      if (
        this._clipCanvas.width !== canvas.width ||
        this._clipCanvas.height !== canvas.height
      ) {
        this._clipCanvas.width = canvas.width;
        this._clipCanvas.height = canvas.height;
      }
      const cctx = this._clipCtx;
      cctx.clearRect(0, 0, canvas.width, canvas.height);
      this.#renderScanContent(cctx, x, y, w, h, config, alpha);
      cctx.globalCompositeOperation = 'destination-in';
      drawSubjectMask(cctx, frame.mask, drawMetrics);
      cctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this._clipCanvas, 0, 0);

      if (config.outline && frame.mask.contour?.length) {
        ctx.fillStyle = `rgba(240,240,236,${alpha * 0.35})`;
        const step = Math.max(1, Math.floor(frame.mask.contour.length / 48));
        for (let i = 0; i < frame.mask.contour.length; i += step) {
          const point = frame.mask.contour[i];
          const mapped = mapNormToCanvas(point.x, point.y, drawMetrics);
          ctx.fillRect(mapped.x - 0.5, mapped.y - 0.5, 1.5, 1.5);
        }
      }
    } else {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      this.#renderScanContent(ctx, x, y, w, h, config, alpha);
      if (config.outline) {
        ctx.strokeStyle = `rgba(240,240,236,${alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }

    ctx.restore();
  }

  #renderScanContent(ctx, x, y, w, h, config, alpha) {
    const lineStep = Math.max(
      5,
      Math.round(16 / Math.max(0.15, config.lineDensity)),
    );
    ctx.strokeStyle = `rgba(240,240,236,${alpha * 0.14})`;
    ctx.lineWidth = 1;
    for (let row = y; row < y + h; row += lineStep) {
      ctx.beginPath();
      ctx.moveTo(x, row);
      ctx.lineTo(x + w, row);
      ctx.stroke();
    }

    if (config.blocks) {
      const block = Math.max(6, Math.round(w / 14));
      ctx.fillStyle = `rgba(240,240,236,${alpha * 0.06})`;
      for (let bx = x; bx < x + w; bx += block * 2) {
        for (let by = y; by < y + h; by += block * 2) {
          ctx.fillRect(bx, by, block, block);
        }
      }
    }
  }
}
