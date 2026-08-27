import { mapNormToCanvas } from '../../subject/subject-frame-map.mjs';

export class ScanEngine {
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
    ctx.beginPath();
    if (frame.mask?.contour?.length > 8) {
      frame.mask.contour.forEach((point, index) => {
        const mapped = mapNormToCanvas(point.x, point.y, drawMetrics);
        if (index === 0) ctx.moveTo(mapped.x, mapped.y);
        else ctx.lineTo(mapped.x, mapped.y);
      });
      ctx.closePath();
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.clip();

    if (config.outline) {
      ctx.strokeStyle = `rgba(240,240,236,${alpha * 0.5})`;
      ctx.lineWidth = 1;
      if (frame.mask?.contour?.length > 8) {
        ctx.beginPath();
        frame.mask.contour.forEach((point, index) => {
          const mapped = mapNormToCanvas(point.x, point.y, drawMetrics);
          if (index === 0) ctx.moveTo(mapped.x, mapped.y);
          else ctx.lineTo(mapped.x, mapped.y);
        });
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }

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

    ctx.restore();
  }
}
