import { SubjectAnalyzer } from '../../subject/subject-analyzer.mjs';
import {
  createDefaultSubjectConfig,
  normalizeSubjectConfig,
} from '../../subject/subject-config.mjs';
import { renderBodyMap } from './body-map.mjs';
import { FragmentEngine } from './fragments.mjs';
import { TrailEngine } from './trails.mjs';
import { SmearEngine } from '../../rendering/subject-webgl-renderer.mjs';
import { ScanEngine } from './scan.mjs';
import { PixelBodyEngine } from './pixel-body.mjs';
import { RgbBreakupEngine } from './rgb-breakup.mjs';

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export class SubjectFxEffect {
  constructor() {
    this.analyzer = new SubjectAnalyzer();
    this.fragments = new FragmentEngine();
    this.trails = new TrailEngine();
    this.smear = new SmearEngine();
    this.scan = new ScanEngine();
    this.pixelBody = new PixelBodyEngine();
    this.rgb = new RgbBreakupEngine();
    this.config = createDefaultSubjectConfig('anatomy');
    this.active = false;
    this.bypass = false;
    this.clipId = '';
    this.beatEnvelope = 0;
    this.lastBeatTs = 0;
    this.flipH = false;
    this._sourceSnapshot = null;
    this.previewFps = 30;
    this.previewQuality = 1;
    this._qualityDowngradeTs = 0;
  }

  getName() {
    return 'SubjectFx';
  }

  setConfig(raw = {}) {
    this.config = normalizeSubjectConfig({ ...this.config, ...raw });
  }

  getConfig() {
    return normalizeSubjectConfig(this.config);
  }

  setActive(active, clipId = '') {
    const changed = this.active !== !!active || this.clipId !== clipId;
    this.active = !!active;
    this.clipId = clipId || '';
    if (changed && !active) {
      this.resetTemporalState();
    }
  }

  setBypass(value) {
    this.bypass = !!value;
    if (this.bypass) this.resetTemporalState();
  }

  resetTemporalState() {
    this.fragments.reset({ hard: true });
    this.trails.reset();
    this.smear.reset();
    this.beatEnvelope = 0;
    this._sourceSnapshot = null;
  }

  onSeek() {
    this.resetTemporalState();
  }

  onSourceChanged() {
    this.resetTemporalState();
    this.analyzer.reset({ hard: true });
  }

  dispose() {
    this.resetTemporalState();
    this.analyzer.dispose();
    this.smear.dispose();
  }

  setBeatPulse(strength = 0) {
    const target = clamp01(strength);
    this.beatEnvelope = Math.max(this.beatEnvelope, target);
    this.lastBeatTs = performance.now();
  }

  tickBeatEnvelope() {
    const elapsed = performance.now() - this.lastBeatTs;
    const attack = 40;
    const decay = 220;
    if (elapsed < attack) return;
    const decayFactor = Math.exp(-(elapsed - attack) / decay);
    this.beatEnvelope *= decayFactor;
    if (this.beatEnvelope < 0.01) this.beatEnvelope = 0;
  }

  adaptPreviewQuality(fps) {
    this.previewFps = fps;
    const now = performance.now();
    if (fps < 22 && now - this._qualityDowngradeTs > 1200) {
      this.previewQuality = Math.max(0.45, this.previewQuality * 0.85);
      this.analyzer.setRuntimeQuality(this.previewQuality);
      this._qualityDowngradeTs = now;
    } else if (fps > 28 && this.previewQuality < 1 && now - this._qualityDowngradeTs > 3000) {
      this.previewQuality = Math.min(1, this.previewQuality + 0.08);
      this.analyzer.setRuntimeQuality(this.previewQuality);
      this._qualityDowngradeTs = now;
    }
  }

  computeIntensity(frame, beatStrength = 0) {
    this.tickBeatEnvelope();
    const base = this.config.amount;
    const motion = frame?.motionEnergy || 0;
    const beat = Math.max(this.beatEnvelope, beatStrength);
    switch (this.config.reactivity) {
      case 'motion':
        return clamp01(base * (0.42 + motion * this.config.motionInfluence));
      case 'beat':
        return clamp01(base * (0.32 + beat * this.config.beatInfluence));
      case 'motion-beat':
        return clamp01(
          base *
            (0.28 +
              motion * this.config.motionInfluence +
              beat * this.config.beatInfluence),
        );
      default:
        return clamp01(base);
    }
  }

  async analyze(video, timestampMs, renderProfile) {
    if (!this.active || this.bypass) return null;
    return this.analyzer.analyze(video, timestampMs, renderProfile);
  }

  getStatusLabel() {
    if (!this.active) return '';
    return this.analyzer.getStatusLabel();
  }

  processFullFrame(ctx, canvas, video, renderProfile, options = {}) {
    if (!this.active || this.bypass || !video) return;
    const timestampMs = (options.mediaTime ?? video.currentTime ?? 0) * 1000;
    void this.analyzer.analyze(video, timestampMs, renderProfile);
    const frame = this.analyzer.lastFrame;
    const beatStrength = options.beatStrength || 0;
    const intensity = this.computeIntensity(frame, beatStrength);
    if (!frame || intensity <= 0.01) return;

    if (!this._sourceSnapshot) {
      this._sourceSnapshot = document.createElement('canvas');
    }
    if (
      this._sourceSnapshot.width !== canvas.width ||
      this._sourceSnapshot.height !== canvas.height
    ) {
      this._sourceSnapshot.width = canvas.width;
      this._sourceSnapshot.height = canvas.height;
    }
    this._sourceSnapshot.getContext('2d').drawImage(canvas, 0, 0);

    const modules = this.config.modules;
    if (modules.smear?.enabled) {
      this.smear.apply(
        ctx,
        canvas,
        frame,
        modules.smear,
        intensity,
        this._sourceSnapshot,
      );
    }

    if (modules.rgb?.enabled) {
      this.rgb.render(
        ctx,
        canvas,
        frame,
        modules.rgb,
        intensity * 0.85,
        this.config.seed,
        this.clipId,
        this._sourceSnapshot,
      );
    }

    this.fragments.update({
      frame,
      config: modules.fragments,
      intensity,
      seed: this.config.seed,
      clipId: this.clipId,
      drawMetrics: options.drawMetrics,
      sourceCanvas: this._sourceSnapshot,
      beatStrength,
      scale: this.config.scale,
      persistence: this.config.persistence,
    });
    if (modules.fragments?.enabled) {
      this.fragments.render(ctx, this._sourceSnapshot, frame);
    }

    this.trails.update({
      frame,
      config: modules.trails,
      intensity,
      width: canvas.width,
      height: canvas.height,
      sourceCanvas: this._sourceSnapshot,
    });
  }

  processOverlay(ctx, canvas, renderProfile, options = {}) {
    if (!this.active || this.bypass) return;
    const frame = this.analyzer.lastFrame;
    const intensity = this.computeIntensity(frame, options.beatStrength || 0);
    if (!frame) return;

    const drawMetrics = options.drawMetrics;
    const modules = this.config.modules;

    if (modules.trails?.enabled) {
      this.trails.render(
        ctx,
        canvas,
        modules.trails,
        intensity,
        this.flipH,
        this._sourceSnapshot,
        drawMetrics,
      );
    }
    if (modules.scan?.enabled) {
      this.scan.render(ctx, canvas, frame, modules.scan, intensity, drawMetrics);
    }
    if (modules.pixelBody?.enabled) {
      this.pixelBody.render(
        ctx,
        canvas,
        frame,
        modules.pixelBody,
        intensity,
        this.config.seed,
        this.clipId,
        drawMetrics,
        this._sourceSnapshot,
      );
    }
    if (
      modules.bodyMap?.showSkeleton ||
      modules.bodyMap?.showJoints ||
      modules.bodyMap?.showLabels
    ) {
      renderBodyMap(ctx, canvas, frame, modules.bodyMap, intensity, drawMetrics);
    }
  }

  processFrame(ctx, canvas, video, renderProfile = null) {
    if (!this.active || this.bypass) return;
    if (renderProfile?.overlayOnly) {
      this.processOverlay(ctx, canvas, renderProfile);
      return;
    }
    this.processFullFrame(ctx, canvas, video, renderProfile, {
      mediaTime: video?.currentTime,
    });
    this.processOverlay(ctx, canvas, renderProfile);
  }
}
