/** Shared mapping from MediaPipe normalized coords to preview canvas space. */
import type { SubjectMask } from './subject-mask.ts';

interface VideoDrawOptions {
  canvasWidth: number;
  canvasHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  effectiveRotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  useCover?: boolean;
}

export function getVideoDrawMetrics({
  canvasWidth,
  canvasHeight,
  sourceWidth,
  sourceHeight,
  effectiveRotation = 0,
  flipH = false,
  flipV = false,
  useCover = false,
}: VideoDrawOptions) {
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

export type VideoDrawMetrics = ReturnType<typeof getVideoDrawMetrics>;

export function mapNormToOriented(
  normX: number,
  normY: number,
  metrics: VideoDrawMetrics,
) {
  const x = metrics.flipH ? 1 - normX : normX;
  const y = metrics.flipV ? 1 - normY : normY;
  const rot = ((metrics.effectiveRotation % 360) + 360) % 360;
  if (rot === 90) return { x: 1 - y, y: x };
  if (rot === 180) return { x: 1 - x, y: 1 - y };
  if (rot === 270) return { x: y, y: 1 - x };
  return { x, y };
}

export function mapNormToCanvas(
  normX: number,
  normY: number,
  metrics: VideoDrawMetrics,
) {
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

export function mapNormToSubjectSpace(
  normX: number,
  normY: number,
  metrics: VideoDrawMetrics,
) {
  return {
    x: (normX - 0.5) * metrics.drawWidth,
    y: (normY - 0.5) * metrics.drawHeight,
  };
}

export function withSubjectVideoTransform(
  ctx: CanvasRenderingContext2D,
  metrics: VideoDrawMetrics,
  drawFn: (
    context: CanvasRenderingContext2D,
    metrics: VideoDrawMetrics,
  ) => void,
) {
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

let _maskScratch: HTMLCanvasElement | null = null;
let _maskScratchCtx: CanvasRenderingContext2D | null = null;
let _maskScratchImageData: ImageData | null = null;

function ensureMaskScratch(width: number, height: number) {
  if (typeof document === 'undefined') return null;
  if (!_maskScratch) {
    _maskScratch = document.createElement('canvas');
    _maskScratchCtx = _maskScratch.getContext('2d');
  }
  if (!_maskScratchCtx) return null;
  if (
    !_maskScratchImageData ||
    _maskScratch.width !== width ||
    _maskScratch.height !== height
  ) {
    _maskScratch.width = width;
    _maskScratch.height = height;
    // Reallocated only when the mask's own resolution changes (rare - it
    // tracks the analyzer's fixed mask width), not once per rendered frame.
    _maskScratchImageData = _maskScratchCtx.createImageData(width, height);
  }
  return _maskScratch;
}

export function drawSubjectMask(
  ctx: CanvasRenderingContext2D,
  mask: Pick<SubjectMask, 'data' | 'width' | 'height'> | null,
  metrics: VideoDrawMetrics | null,
  { offsetX = 0, offsetY = 0 } = {},
) {
  if (!mask?.data?.length || !metrics) return;
  const temp = ensureMaskScratch(mask.width, mask.height);
  if (!temp || !_maskScratchCtx || !_maskScratchImageData) return;
  const tempCtx = _maskScratchCtx;
  const imageData = _maskScratchImageData;
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
