/** Shared mapping from MediaPipe normalized coords to preview canvas space. */

export function getVideoDrawMetrics({
  canvasWidth,
  canvasHeight,
  sourceWidth,
  sourceHeight,
  effectiveRotation = 0,
  flipH = false,
  flipV = false,
  useCover = false,
}) {
  const rotated = effectiveRotation === 90 || effectiveRotation === 270;
  const orientedWidth = rotated ? sourceHeight : sourceWidth;
  const orientedHeight = rotated ? sourceWidth : sourceHeight;
  const scaleX = canvasWidth / Math.max(1, orientedWidth);
  const scaleY = canvasHeight / Math.max(1, orientedHeight);
  const frameScale = useCover
    ? Math.max(scaleX, scaleY)
    : Math.min(scaleX, scaleY);
  const drawWidth = Math.max(1, Math.round(sourceWidth * frameScale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * frameScale));
  return {
    canvasWidth,
    canvasHeight,
    sourceWidth,
    sourceHeight,
    orientedWidth,
    orientedHeight,
    effectiveRotation,
    flipH: !!flipH,
    flipV: !!flipV,
    drawWidth,
    drawHeight,
    frameScale,
  };
}

export function mapNormToOriented(normX, normY, metrics) {
  let x = metrics.flipH ? 1 - normX : normX;
  let y = metrics.flipV ? 1 - normY : normY;
  const rot = ((metrics.effectiveRotation % 360) + 360) % 360;
  if (rot === 90) return { x: 1 - y, y: x };
  if (rot === 180) return { x: 1 - x, y: 1 - y };
  if (rot === 270) return { x: y, y: 1 - x };
  return { x, y };
}

export function mapNormToCanvas(normX, normY, metrics) {
  let x = (normX - 0.5) * metrics.drawWidth;
  let y = (normY - 0.5) * metrics.drawHeight;
  if (metrics.flipH) x *= -1;
  if (metrics.flipV) y *= -1;
  const rot = ((metrics.effectiveRotation % 360) + 360) % 360;
  if (rot === 90) [x, y] = [-y, x];
  else if (rot === 180) [x, y] = [-x, -y];
  else if (rot === 270) [x, y] = [y, -x];
  return {
    x: metrics.canvasWidth / 2 + x,
    y: metrics.canvasHeight / 2 + y,
  };
}

export function mapNormToSubjectSpace(normX, normY, metrics) {
  return {
    x: (normX - 0.5) * metrics.drawWidth,
    y: (normY - 0.5) * metrics.drawHeight,
  };
}

export function withSubjectVideoTransform(ctx, metrics, drawFn) {
  ctx.save();
  ctx.translate(metrics.canvasWidth / 2, metrics.canvasHeight / 2);
  if (metrics.effectiveRotation !== 0) {
    ctx.rotate((metrics.effectiveRotation * Math.PI) / 180);
  }
  if (metrics.flipH || metrics.flipV) {
    ctx.scale(metrics.flipH ? -1 : 1, metrics.flipV ? -1 : 1);
  }
  drawFn(ctx, metrics);
  ctx.restore();
}

export function drawSubjectMask(
  ctx,
  mask,
  metrics,
  { offsetX = 0, offsetY = 0 } = {},
) {
  if (!mask?.data?.length || !metrics) return;
  const temp = document.createElement('canvas');
  temp.width = mask.width;
  temp.height = mask.height;
  const tempCtx = temp.getContext('2d');
  const imageData = tempCtx.createImageData(mask.width, mask.height);
  for (let index = 0; index < mask.data.length; index++) {
    imageData.data[index * 4 + 3] = mask.data[index];
  }
  tempCtx.putImageData(imageData, 0, 0);

  ctx.save();
  ctx.translate(
    metrics.canvasWidth / 2 + offsetX,
    metrics.canvasHeight / 2 + offsetY,
  );
  if (metrics.effectiveRotation !== 0) {
    ctx.rotate((metrics.effectiveRotation * Math.PI) / 180);
  }
  if (metrics.flipH || metrics.flipV) {
    ctx.scale(metrics.flipH ? -1 : 1, metrics.flipV ? -1 : 1);
  }
  ctx.drawImage(
    temp,
    -metrics.drawWidth / 2,
    -metrics.drawHeight / 2,
    metrics.drawWidth,
    metrics.drawHeight,
  );
  ctx.restore();
}

export function metricsFromApp(app, canvas, mode = 'preview') {
  const { sourceWidth, sourceHeight } = app.getSourceFrameDimensions();
  const effectiveRotation = app.getEffectiveRotationDegrees(
    sourceWidth,
    sourceHeight,
  );
  const useCover = mode === 'preview' && app.isMobileViewport?.();
  return getVideoDrawMetrics({
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    sourceWidth,
    sourceHeight,
    effectiveRotation,
    flipH: app.getEffectiveFlipH?.() ?? false,
    flipV: !!app.flipV,
    useCover,
  });
}
