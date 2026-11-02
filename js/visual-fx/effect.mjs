import { SubjectAnalyzer } from '../subject/subject-analyzer.mjs';
import {
  drawSubjectMask,
  getVideoDrawMetrics,
} from '../subject/subject-frame-map.mjs';
import { normalizeVisualConfig, visualConfigTopologyKey } from './config.mjs';
import { VisualRenderer } from './renderer.mjs';
import { perfDev } from '../app/perf-dev.mjs';

// Never below 0.6 here: the analyzer's own floor (0.35) exists for other
// callers, but this preview-quality ladder keeps enough resolution that
// MediaPipe keeps finding the person even under sustained load.
const QUALITY_LEVELS = Object.freeze([1, 0.85, 0.7, 0.6]);
const QUALITY_COOLDOWN_MS = 2500;

// A mask is unusable after a real seek/source change (handled separately -
// those null out `maskTime`, which always short-circuits below). Short of
// that, this is the only budget for "the inference is a little behind the
// playhead", so it should track how slow inference is currently allowed to
// run rather than being one fixed number: a detector intentionally sampling
// every ~120ms under load must not have its result thrown away every frame.
export function maskStaleBudgetSec(analyzer) {
  const intervalMs = analyzer?.inferenceIntervalMs || 80;
  return Math.max(0.2, Math.min(0.9, (intervalMs * 4) / 1000));
}

export class VisualFxEffect {
  constructor(options = {}) {
    this.analyzer =
      options.analysisAdapter || new SubjectAnalyzer(options.analyzer || {});
    this.renderer = options.renderer || new VisualRenderer();
    this.config = normalizeVisualConfig();
    this.active = false;
    this.bypass = false;
    this.clipId = '';
    this.analysisEpoch = 0;
  }
  getName() {
    return 'VisualFx';
  }
  setConfig(raw) {
    const next = normalizeVisualConfig(raw);
    // Only a topology change (system, or a topology-flagged tuning value
    // such as internal resolution) restarts the simulation. Macros, target
    // and every other tuning value are state-safe: the running feedback
    // loop keeps evolving while the user drags a slider.
    if (visualConfigTopologyKey(next) !== visualConfigTopologyKey(this.config))
      this.resetTemporalState();
    this.config = next;
  }
  getConfig() {
    return normalizeVisualConfig(this.config);
  }
  setActive(active, clipId = '') {
    if (this.active !== !!active || this.clipId !== clipId)
      this.resetTemporalState();
    this.active = !!active;
    this.clipId = clipId;
  }
  setBypass(value) {
    if (this.bypass !== !!value) this.resetTemporalState();
    this.bypass = !!value;
  }
  resetTemporalState() {
    this.renderer.reset();
    this.analysisEpoch++;
    this.maskTime = null;
    this.pendingAnalysis = null;
  }
  onSeek() {
    this.resetTemporalState();
    this.analyzer.reset();
  }
  onSourceChanged() {
    this.onSeek();
  }
  dispose() {
    this.resetTemporalState();
    this.renderer.dispose();
    this.analyzer.dispose();
    this.source = null;
    this.composite = null;
  }
  // Kept as timeline integration hooks; image motion comes from media time.
  // Gradual, hysteretic quality steps rather than a single-sample binary
  // switch: a lone low-FPS second must not immediately shrink the analysis
  // image (that can make MediaPipe lose the person outright), and quality
  // must not flip high/low every second once it changes. Two consecutive
  // low samples are required to step down; three consecutive good samples
  // to step back up; and any change is followed by a cooldown.
  adaptPreviewQuality(fps, now = performance.now()) {
    const state = (this._qualityAdaptState ||= {
      level: 0,
      lowStreak: 0,
      highStreak: 0,
      lastChangeTs: -Infinity,
    });
    const levels = QUALITY_LEVELS;
    if (fps < 20) state.lowStreak++;
    else state.lowStreak = 0;
    if (fps >= 27) state.highStreak++;
    else state.highStreak = 0;
    const cooledDown = now - state.lastChangeTs > QUALITY_COOLDOWN_MS;
    if (cooledDown && state.lowStreak >= 2 && state.level < levels.length - 1) {
      state.level++;
      state.lastChangeTs = now;
      state.lowStreak = 0;
      state.highStreak = 0;
    } else if (cooledDown && state.highStreak >= 3 && state.level > 0) {
      state.level--;
      state.lastChangeTs = now;
      state.lowStreak = 0;
      state.highStreak = 0;
    }
    this.analyzer.setRuntimeQuality(levels[state.level]);
  }
  async analyze(video, timestamp, profile) {
    if (!this.active || this.bypass || this.config.target === 'all')
      return null;
    const epoch = this.analysisEpoch;
    try {
      if (profile?.detectorIntervalMs === 0) await this.analyzer.ensureReady();
      const frame = await this.analyzer.analyze(video, timestamp, profile);
      if (epoch === this.analysisEpoch)
        this.maskTime =
          (this.analyzer.lastFrame?.timestamp ?? timestamp) / 1000;
      return frame;
    } catch {
      return null;
    }
  }
  getStatusLabel() {
    if (!this.active || this.bypass) return '';
    if (this.config.target !== 'all') {
      if (this.analyzer.status === 'error')
        return 'No se pudo detectar una persona. Podés usar Todo.';
      if (!this.analyzer.lastMask || this.maskTime === null)
        return 'Buscando persona. Podés usar Todo.';
    }
    return this.renderer.failed ? 'Modo compatible: detalle reducido.' : '';
  }
  processFullFrame(ctx, canvas, video, profile, options = {}) {
    if (
      !this.active ||
      this.bypass ||
      !video ||
      this.config.macros.intensity === 0
    )
      return;
    const time = options.mediaTime ?? video.currentTime ?? 0;
    if (
      this.config.target !== 'all' &&
      this.maskTime !== time &&
      !this.pendingAnalysis
    ) {
      const epoch = this.analysisEpoch;
      const analysisProfile = video.paused
        ? { ...profile, detectorIntervalMs: 0 }
        : profile;
      this.pendingAnalysis = this.analyze(
        video,
        time * 1000,
        analysisProfile,
      ).finally(() => {
        if (epoch !== this.analysisEpoch) return;
        this.pendingAnalysis = null;
        if (video.paused && this.maskTime === time) options.invalidate?.();
      });
    }
    this.source ||= document.createElement('canvas');
    if (
      this.source.width !== canvas.width ||
      this.source.height !== canvas.height
    ) {
      this.source.width = canvas.width;
      this.source.height = canvas.height;
    }
    this.source.getContext('2d').drawImage(canvas, 0, 0);
    const output = this.renderer.render(
      this.source,
      this.config,
      time,
      `${this.clipId}:${options.mode || 'preview'}`,
    );
    if (this.config.target === 'all') {
      ctx.drawImage(output, 0, 0);
      return;
    }
    const mask = this.analyzer.lastMask;
    const maskAgeSec =
      this.maskTime === null ? -1 : Math.abs(time - this.maskTime);
    perfDev.gauge('subjectMaskAgeMs', maskAgeSec < 0 ? -1 : maskAgeSec * 1000);
    if (
      !mask ||
      this.maskTime === null ||
      maskAgeSec > maskStaleBudgetSec(this.analyzer)
    ) {
      if (mask && this.maskTime !== null)
        perfDev.count('subjectMaskDiscardedStale');
      return;
    }
    this.composite ||= document.createElement('canvas');
    if (
      this.composite.width !== canvas.width ||
      this.composite.height !== canvas.height
    ) {
      this.composite.width = canvas.width;
      this.composite.height = canvas.height;
    }
    const layer = this.composite.getContext('2d');
    layer.clearRect(0, 0, canvas.width, canvas.height);
    layer.drawImage(output, 0, 0);
    const metrics =
      options.drawMetrics ||
      getVideoDrawMetrics({
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        sourceWidth: canvas.width,
        sourceHeight: canvas.height,
      });
    layer.save();
    layer.globalCompositeOperation =
      this.config.target === 'person' ? 'destination-in' : 'destination-out';
    drawSubjectMask(layer, mask, metrics);
    layer.restore();
    ctx.drawImage(this.composite, 0, 0);
  }
  processFrame(ctx, canvas, video, profile = {}) {
    if (!profile?.overlayOnly)
      this.processFullFrame(ctx, canvas, video, profile, profile || {});
  }
}
