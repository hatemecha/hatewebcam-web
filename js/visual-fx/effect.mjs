import { SubjectAnalyzer } from '../subject/subject-analyzer.mjs';
import {
  drawSubjectMask,
  getVideoDrawMetrics,
} from '../subject/subject-frame-map.mjs';
import { normalizeVisualConfig } from './config.mjs';
import { VisualRenderer } from './renderer.mjs';

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
    if (JSON.stringify(next) !== JSON.stringify(this.config))
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
  adaptPreviewQuality(fps) {
    this.analyzer.setRuntimeQuality(fps < 22 ? 0.6 : 1);
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
    if (!this.active || this.bypass || !video || this.config.amount === 0)
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
    if (!mask || this.maskTime === null || Math.abs(time - this.maskTime) > 0.2)
      return;
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
