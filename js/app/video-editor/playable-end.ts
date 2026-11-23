const VIDEO_END_EPSILON = 0.001;

export function getVideoPlayableEnd(duration: number, end = duration) {
  const safeEnd = Number.isFinite(end) ? end : duration;
  return duration > 0 && safeEnd >= duration
    ? Math.max(0, duration - VIDEO_END_EPSILON)
    : Math.max(0, safeEnd);
}
