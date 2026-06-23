const TICK_STEPS = Object.freeze([0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]);

export function calculateTimelineTickInterval(duration, width, minLabelPx = 72) {
  const safeDuration = Math.max(0.001, Number(duration) || 0.001);
  const safeWidth = Math.max(1, Number(width) || 1);
  const labelWidth = Math.max(24, Number(minLabelPx) || 72);
  const maxTicks = Math.max(2, Math.floor(safeWidth / labelWidth));
  const rawInterval = safeDuration / maxTicks;
  return TICK_STEPS.find((step) => step >= rawInterval) || TICK_STEPS.at(-1);
}

export class TimelineView {
  constructor({ formatTime, documentRef = globalThis.document } = {}) {
    this.formatTime = formatTime || ((seconds) => `${Number(seconds || 0).toFixed(2)}s`);
    this.document = documentRef;
    this.dragGhost = null;
  }

  renderRuler({ ruler, duration, width }) {
    if (!ruler || !this.document) return;
    const safeDuration = Math.max(0.001, Number(duration) || 0.001);
    const safeWidth = Math.max(1, Number(width) || 1);
    const interval = calculateTimelineTickInterval(safeDuration, safeWidth);
    ruler.style.width = `${safeWidth}px`;
    ruler.innerHTML = '';
    for (let time = 0; time <= safeDuration + 0.001; time += interval) {
      const left = `${Math.min(100, (time / safeDuration) * 100)}%`;
      const tick = this.document.createElement('div');
      tick.className = 'timeline-time-tick';
      tick.style.left = left;
      ruler.appendChild(tick);

      const label = this.document.createElement('div');
      label.className = 'timeline-time-label';
      label.style.left = left;
      label.textContent = this.formatTime(time);
      ruler.appendChild(label);
    }
  }

  ensureDragGhost(parent = this.document?.body) {
    if (!this.dragGhost && this.document) {
      this.dragGhost = this.document.createElement('div');
      this.dragGhost.className = 'timeline-drag-ghost';
      parent?.appendChild(this.dragGhost);
    }
    return this.dragGhost;
  }

  removeDragGhost() {
    this.dragGhost?.remove();
    this.dragGhost = null;
  }
}
