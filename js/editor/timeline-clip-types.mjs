export const VISUAL_FX_CLIP_TYPE = 'visual-fx';
/** @deprecated Saved projects may still use this value. */
export const LEGACY_VISUAL_FX_CLIP_TYPE = 'subject';

export function normalizeTimelineClipType(type) {
  return type === LEGACY_VISUAL_FX_CLIP_TYPE ? VISUAL_FX_CLIP_TYPE : type;
}

export function isVisualFxClipType(type) {
  return type === VISUAL_FX_CLIP_TYPE || type === LEGACY_VISUAL_FX_CLIP_TYPE;
}
