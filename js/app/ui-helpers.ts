export function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isExportDebugVisible() {
  try {
    if (localStorage.getItem('hatewebcam-export-debug') === '1') return true;
  } catch {
    // Storage can be disabled while the URL preference remains available.
  }
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('exportdebug') === '1'
  );
}
