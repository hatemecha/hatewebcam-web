// Dev-only performance instrumentation. Disabled by default; every method
// is a no-op unless enabled, so normal users never pay for this. Enable
// with `?perf=1` in the URL or `localStorage.setItem('hatewebcam-perf','1')`.
//
// This exists to measure BEFORE/AFTER, not to ship a permanent UI: a small
// on-page overlay plus `console.table` on an interval, both dev-only.

function detectEnabled() {
  try {
    if (new URLSearchParams(window.location.search).get('perf') === '1')
      return true;
    if (localStorage.getItem('hatewebcam-perf') === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

export const PERF_DEV_ENABLED =
  typeof window !== 'undefined' && detectEnabled();

class RollingWindow {
  constructor(capacity = 180) {
    this.capacity = capacity;
    this.values = [];
  }
  push(value) {
    if (!Number.isFinite(value)) return;
    this.values.push(value);
    if (this.values.length > this.capacity) this.values.shift();
  }
  percentile(p) {
    if (!this.values.length) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
    return sorted[idx];
  }
  median() {
    return this.percentile(0.5);
  }
  count() {
    return this.values.length;
  }
}

class PerfDev {
  constructor(enabled) {
    this.enabled = enabled;
    this.metrics = new Map();
    this.gauges = new Map();
    this.counters = new Map();
    this._counterWindowStart = performance.now();
    if (!enabled) return;
    this._installOverlay();
    this._installLongTaskObserver();
    this._reportTimer = setInterval(() => this._report(), 2000);
    // Lets a stress-test/dev script read exact numbers instead of scraping
    // the console/overlay text.
    window.__hatewebcamPerfSnapshot = () => this.snapshot();
  }

  snapshot() {
    const metrics = {};
    for (const [name, window_] of this.metrics) {
      metrics[name] = {
        median: window_.median(),
        p95: window_.percentile(0.95),
        n: window_.count(),
      };
    }
    return {
      metrics,
      gauges: Object.fromEntries(this.gauges),
      counters: Object.fromEntries(this.counters),
    };
  }

  // Returns a start timestamp to pass to `record`, or 0 when disabled -
  // callers can unconditionally do `const t = perfDev.mark(); ...;
  // perfDev.record('name', performance.now() - t)` without branching.
  mark() {
    return this.enabled ? performance.now() : 0;
  }

  record(name, ms) {
    if (!this.enabled) return;
    if (!this.metrics.has(name)) this.metrics.set(name, new RollingWindow());
    this.metrics.get(name).push(ms);
  }

  gauge(name, value) {
    if (!this.enabled) return;
    this.gauges.set(name, value);
  }

  count(name, n = 1) {
    if (!this.enabled) return;
    this.counters.set(name, (this.counters.get(name) || 0) + n);
  }

  _installLongTaskObserver() {
    try {
      if (typeof PerformanceObserver === 'undefined') return;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.record('longTaskMs', entry.duration);
          this.count('longTasks');
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
      this._longTaskObserver = observer;
    } catch {
      /* longtask not supported everywhere - fine, this is best-effort */
    }
  }

  _installOverlay() {
    const el = document.createElement('pre');
    el.id = 'perfDevOverlay';
    el.style.cssText =
      'position:fixed;right:8px;bottom:8px;z-index:99999;max-width:340px;' +
      'max-height:60vh;overflow:auto;margin:0;padding:8px 10px;' +
      'background:rgba(10,11,12,0.88);color:#c8ffcf;' +
      'font:10px/1.4 "Cascadia Mono","Segoe UI Mono",monospace;' +
      'border:1px solid rgba(255,255,255,0.15);pointer-events:none;white-space:pre;';
    document.addEventListener('DOMContentLoaded', () => {
      document.body?.appendChild(el);
    });
    if (document.body) document.body.appendChild(el);
    this._overlayEl = el;
  }

  _report() {
    const now = performance.now();
    const windowSec = Math.max(0.001, (now - this._counterWindowStart) / 1000);
    const rows = {};
    for (const [name, window_] of this.metrics) {
      rows[name] = {
        median: round2(window_.median()),
        p95: round2(window_.percentile(0.95)),
        n: window_.count(),
      };
    }
    const rates = {};
    for (const [name, value] of this.counters) {
      rates[`${name}/s`] = round2(value / windowSec);
    }
    this.counters.clear();
    this._counterWindowStart = now;

    const lines = ['Visual FX / detector perf (median, p95, ms)'];
    for (const [name, row] of Object.entries(rows)) {
      lines.push(`  ${name}: ${row.median} / ${row.p95} (n=${row.n})`);
    }
    lines.push('gauges:');
    for (const [name, value] of this.gauges) {
      lines.push(
        `  ${name}: ${typeof value === 'number' ? round2(value) : value}`,
      );
    }
    lines.push('rates:');
    for (const [name, value] of Object.entries(rates)) {
      lines.push(`  ${name}: ${value}`);
    }
    if (this._overlayEl) this._overlayEl.textContent = lines.join('\n');
    // eslint-disable-next-line no-console
    console.table({ ...rows, ...Object.fromEntries(this.gauges), ...rates });
  }
}

function round2(value) {
  return Math.round((value || 0) * 100) / 100;
}

export const perfDev = new PerfDev(PERF_DEV_ENABLED);
