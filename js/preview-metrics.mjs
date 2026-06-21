/**
 * Pure helpers for preview vs processing canvas dimensions (unit tests).
 */
const PREVIEW_MIN_WIDTH = 320;
const PREVIEW_MIN_HEIGHT = 180;
const PREVIEW_QUALITY_PRESETS = Object.freeze({
  draft: { label: 'Borrador', maxPixels: 432 * 243, maxScale: 0.45 },
  balanced: { label: 'Balanceada', maxPixels: 640 * 360, maxScale: 0.66 },
  high: { label: 'Alta', maxPixels: 1600 * 900, maxScale: 0.9 },
  full: { label: 'Exacta', maxPixels: Number.POSITIVE_INFINITY, maxScale: 1 },
});

function normalizePreviewQuality(value) {
  return Object.prototype.hasOwnProperty.call(PREVIEW_QUALITY_PRESETS, value)
    ? value
    : 'balanced';
}

function getEffectiveFrameDimensions(sourceWidth, sourceHeight, rotationDeg = 0) {
  const normalized = ((rotationDeg % 360) + 360) % 360;
  const rotated = normalized === 90 || normalized === 270;
  return {
    width: rotated ? sourceHeight : sourceWidth,
    height: rotated ? sourceWidth : sourceHeight,
  };
}

function getProcessingFrameDimensions(sourceWidth, sourceHeight, rotationDeg = 0) {
  return getEffectiveFrameDimensions(sourceWidth, sourceHeight, rotationDeg);
}

function getPreviewFrameDimensions(sourceWidth, sourceHeight, previewQuality, rotationDeg = 0) {
  const { width: effectiveWidth, height: effectiveHeight } = getEffectiveFrameDimensions(
    sourceWidth,
    sourceHeight,
    rotationDeg
  );
  const previewPreset = PREVIEW_QUALITY_PRESETS[normalizePreviewQuality(previewQuality)];
  const sourcePixels = Math.max(1, effectiveWidth * effectiveHeight);
  const pixelScale = sourcePixels > previewPreset.maxPixels
    ? Math.sqrt(previewPreset.maxPixels / sourcePixels)
    : 1;
  const baseScale = Math.min(1, pixelScale, previewPreset.maxScale);

  const aspect = Math.max(0.0001, effectiveWidth / effectiveHeight);
  let width = Math.max(1, Math.round(effectiveWidth * baseScale));
  let height = Math.max(1, Math.round(effectiveHeight * baseScale));

  if (width < PREVIEW_MIN_WIDTH) {
    width = PREVIEW_MIN_WIDTH;
    height = Math.max(1, Math.round(width / aspect));
  }
  if (height < PREVIEW_MIN_HEIGHT) {
    height = PREVIEW_MIN_HEIGHT;
    width = Math.max(1, Math.round(height * aspect));
  }

  return { width, height, scale: width / Math.max(1, effectiveWidth) };
}

export {
  PREVIEW_MIN_WIDTH,
  PREVIEW_MIN_HEIGHT,
  PREVIEW_QUALITY_PRESETS,
  getEffectiveFrameDimensions,
  getProcessingFrameDimensions,
  getPreviewFrameDimensions,
  normalizePreviewQuality,
};
