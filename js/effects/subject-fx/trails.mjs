import { getStrongestMotionRegion } from '../../subject/subject-local-motion.mjs';
import { mapNormToCanvas } from '../../subject/subject-frame-map.mjs';

export class TrailEngine {
  constructor() {
    this.history = [];
    this.maxHistory = 10;
  }

  reset() {
    this.history = [];
  }

  update({ frame, config, intensity, width, height, sourceCanvas }) {
    if (!config?.enabled || !frame) return;
    const copies = Math.max(1, Math.round(config.copies * intensity));
    this.maxHistory = Math.min(14, copies + 3);
    const snapshot = {
      timestamp: frame.timestamp || 0,
      center: frame.center ? { ...frame.center } : null,
      bbox: frame.boundingBox,
      mask: frame.mask
        ? {
            width: frame.mask.width,
            height: frame.mask.height,
            data: new Uint8Array(frame.mask.data),
            bounds: frame.mask.bounds,
          }
        : null,
      landmarks: frame.landmarks?.map((point) => ({ x: point.x, y: point.y })),
      motion: frame.motionEnergy || 0,
      strongest: getStrongestMotionRegion(frame.regions || {}),
      sourceCanvas,
      width,
      height,
    };
    this.history.unshift(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.length = this.maxHistory;
    }
  }

  render(ctx, canvas, config, intensity = 1, _flipH = false, sourceCanvas = null, drawMetrics = null) {
    if (!config?.enabled || this.history.length < 2 || !drawMetrics) return;
    const mode = config.mode || 'silhouette';
    ctx.save();

    this.history.forEach((snapshot, index) => {
      if (index === 0) return;
      const spacing = Math.max(1, Math.round(index * config.spacing * 8));
      if (index % spacing !== 0) return;
      const alpha =
        config.opacity *
        intensity *
        Math.pow(config.decay, index) *
        (0.28 + snapshot.motion * config.motionInfluence);
      if (alpha < 0.02) return;

      const offset = snapshot.strongest
        ? {
            x:
              (snapshot.strongest.velocity?.x || 0) *
              drawMetrics.drawWidth *
              index *
              0.08 *
              config.motionInfluence,
            y:
              (snapshot.strongest.velocity?.y || 0) *
              drawMetrics.drawHeight *
              index *
              0.08 *
              config.motionInfluence,
          }
        : { x: 0, y: 0 };

      if ((mode === 'body' || mode === 'ghost' || mode === 'silhouette') && snapshot.mask) {
        this.#renderMaskEcho(
          ctx,
          canvas,
          snapshot,
          alpha,
          offset,
          sourceCanvas,
          mode,
          drawMetrics,
        );
      } else if (mode === 'skeleton' || mode === 'landmark') {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#f0f0ec';
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
    });
    ctx.restore();
  }

  #renderMaskEcho(ctx, canvas, snapshot, alpha, offset, sourceCanvas, mode, drawMetrics) {
    if (!snapshot.mask?.data || !sourceCanvas) return;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskCtx = maskCanvas.getContext('2d');
    const { width: mw, height: mh, data } = snapshot.mask;
    const contentX = (canvas.width - drawMetrics.drawWidth) / 2 + offset.x;
    const contentY = (canvas.height - drawMetrics.drawHeight) / 2 + offset.y;

    const imageData = maskCtx.createImageData(mw, mh);
    for (let i = 0; i < data.length; i++) {
      imageData.data[i * 4 + 3] = data[i];
    }
    const temp = document.createElement('canvas');
    temp.width = mw;
    temp.height = mh;
    temp.getContext('2d').putImageData(imageData, 0, 0);

    maskCtx.save();
    maskCtx.globalAlpha = alpha;
    maskCtx.drawImage(
      temp,
      0,
      0,
      mw,
      mh,
      contentX,
      contentY,
      drawMetrics.drawWidth,
      drawMetrics.drawHeight,
    );
    maskCtx.globalCompositeOperation = 'source-in';
    maskCtx.drawImage(sourceCanvas, 0, 0);
    maskCtx.restore();

    ctx.save();
    ctx.globalAlpha = mode === 'ghost' ? alpha * 0.55 : alpha * 0.72;
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.restore();
  }
}
