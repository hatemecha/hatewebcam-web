export interface PreviewMetrics {
  resolution: string;
  fps: string;
}

let metrics: PreviewMetrics = { resolution: '-', fps: '-' };
const listeners = new Set<(value: PreviewMetrics) => void>();

export function getPreviewMetrics(): PreviewMetrics {
  return { ...metrics };
}

export function updatePreviewMetrics(patch: Partial<PreviewMetrics>): void {
  const next = { ...metrics, ...patch };
  if (next.resolution === metrics.resolution && next.fps === metrics.fps)
    return;
  metrics = next;
  const snapshot = getPreviewMetrics();
  for (const listener of listeners) listener(snapshot);
}

export function subscribePreviewMetrics(
  listener: (value: PreviewMetrics) => void,
): () => void {
  listeners.add(listener);
  listener(getPreviewMetrics());
  return () => listeners.delete(listener);
}

export function resetPreviewMetrics(): void {
  metrics = { resolution: '-', fps: '-' };
  const snapshot = getPreviewMetrics();
  for (const listener of listeners) listener(snapshot);
}
