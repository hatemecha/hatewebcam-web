import { seededRange } from '../../subject/subject-prng.mjs';

export class RgbBreakupEngine {
  render(
    ctx,
    canvas,
    frame,
    config,
    intensity = 1,
    seed = 0,
    clipId = '',
    sourceCanvas = null,
  ) {
    if (!config?.enabled || !sourceCanvas) return;
    const split = config.split * intensity;
    if (split < 0.25) return;

    const slices = Math.max(2, Math.round(config.slices));
    const sliceHeight = Math.ceil(canvas.height / slices);
    ctx.save();
    for (let index = 0; index < slices; index++) {
      const y = index * sliceHeight;
      const h = Math.min(sliceHeight, canvas.height - y);
      const jitter =
        seededRange(seed, -1, 1, clipId, 'rgb', index) *
        config.jitter *
        split *
        6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45;
      ctx.drawImage(
        sourceCanvas,
        jitter,
        y,
        canvas.width,
        h,
        jitter,
        y,
        canvas.width,
        h,
      );
      ctx.globalAlpha = 0.35;
      ctx.drawImage(
        sourceCanvas,
        -jitter * 0.6,
        y,
        canvas.width,
        h,
        -jitter * 0.6,
        y,
        canvas.width,
        h,
      );
    }
    ctx.restore();
  }
}
