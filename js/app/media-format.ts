export function normalizeVideoFps(value: unknown): number | null {
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) return null;
  return Math.min(240, Math.max(1, Math.round(fps * 1000) / 1000));
}

export function snapVideoSourceFps(
  value: unknown,
  commonFps: readonly number[],
): number | null {
  const fps = normalizeVideoFps(value);
  if (!fps) return null;
  let best = fps;
  let bestDiff = Infinity;
  for (const candidate of commonFps) {
    const diff = Math.abs(fps - candidate);
    if (diff < bestDiff && diff <= 0.08) {
      bestDiff = diff;
      best = candidate;
    }
  }
  return best;
}

export function formatVideoFps(value: unknown): string {
  const fps = normalizeVideoFps(value);
  if (!fps) return '-';
  return Number.isInteger(fps)
    ? String(fps)
    : fps.toFixed(3).replace(/\.?0+$/, '');
}

export function formatVideoBitrate(value: unknown): string {
  return `${(Math.max(0, Number(value) || 0) / 1_000_000).toFixed(1)} Mbps`;
}

export function formatBytes(bytes: unknown): string {
  const size = Number(bytes);
  if (!size || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  const value = size / 1024 ** exp;
  const digits = exp === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[exp]}`;
}

export function formatDurationDetailed(seconds: unknown): string {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(seconds: unknown): string {
  const safe = Number(seconds) || 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function timestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export function pickSupportedMimeType(
  list: readonly string[],
  isSupported: (type: string) => boolean,
): string {
  for (const type of list) {
    if (isSupported(type)) return type;
  }
  return '';
}

export interface RecommendedBitrateInput {
  width: number;
  height: number;
  fps: unknown;
  qualityEnhancer: boolean;
  sourceAverageBitrate: number;
  defaultFps?: number;
}

export function getRecommendedVideoBitrate({
  width,
  height,
  fps,
  qualityEnhancer,
  sourceAverageBitrate,
  defaultFps = 30,
}: RecommendedBitrateInput): number {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeFps = Math.min(
    240,
    Math.max(1, normalizeVideoFps(fps) || defaultFps),
  );
  const bitsPerPixelFrame = qualityEnhancer ? 0.22 : 0.18;
  const estimate = Math.round(
    safeWidth * safeHeight * safeFps * bitsPerPixelFrame,
  );
  return Math.max(
    Math.max(0, Number(sourceAverageBitrate) || 0),
    Math.min(80_000_000, Math.max(8_000_000, estimate)),
  );
}
