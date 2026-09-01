import { SubjectAnalyzer } from '../../subject/subject-analyzer.mjs';
import {
  createDefaultSubjectConfig,
  normalizeSubjectConfig,
  scaleDensityByGlobal,
} from '../../subject/subject-config.mjs';
import { SUBJECT_PRESETS } from './subject-presets.mjs';
import { renderBodyMap } from './body-map.mjs';
import { FragmentEngine } from './fragments.mjs';
import { TrailEngine } from './trails.mjs';
import { SmearEngine } from '../../rendering/subject-webgl-renderer.mjs';
import { ScanEngine } from './scan.mjs';
import { PixelBodyEngine } from './pixel-body.mjs';
import { RgbBreakupEngine } from './rgb-breakup.mjs';
import { BackgroundMosaicEngine } from './background-mosaic.mjs';
import { renderHudAnnotations } from './hud-annotations.mjs';

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

const BEAT_ATTACK_MS = 40;
const BEAT_DECAY_MS = 220;

export class SubjectFxEffect {
  constructor(options = {}) {
    this.analyzer = new SubjectAnalyzer(options.analyzer || {});
    this.fragments = new FragmentEngine();
    this.trails = new TrailEngine();
    this.smear = new SmearEngine();
    this.scan = new ScanEngine();
    this.pixelBody = new PixelBodyEngine();
    this.rgb = new RgbBreakupEngine();
    this.backgroundMosaic = new BackgroundMosaicEngine();
    this.config = createDefaultSubjectConfig('anatomy');
    this.active = false;
    this.bypass = false;
    this.clipId = '';
    this.beatEnvelope = 0;
    this.lastBeatMediaMs = null;
    this.lastIntensityMediaMs = null;
    this._frameIntensity = 0;
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
    this.lastBeatMediaMs = null;
    this.lastIntensityMediaMs = null;
    this._frameIntensity = 0;
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

  setBeatPulse(strength = 0, mediaTimeMs = null) {
    const target = clamp01(strength);
    this.beatEnvelope = Math.max(this.beatEnvelope, target);
    if (mediaTimeMs != null && Number.isFinite(mediaTimeMs)) {
      this.lastBeatMediaMs = mediaTimeMs;
    }
  }

  /** Advance beat envelope using media time only (no wall clock). */
  tickBeatEnvelope(mediaTimeMs) {
    if (mediaTimeMs == null || !Number.isFinite(mediaTimeMs)) return;
    if (this.lastBeatMediaMs == null) {
      this.lastBeatMediaMs = mediaTimeMs;
      return;
    }
    const elapsed = mediaTimeMs - this.lastBeatMediaMs;
    if (elapsed < 0) {
      this.beatEnvelope = 0;
      this.lastBeatMediaMs = mediaTimeMs;
      return;
    }
    if (elapsed < BEAT_ATTACK_MS) return;
    const decayFactor = Math.exp(-(elapsed - BEAT_ATTACK_MS) / BEAT_DECAY_MS);
    this.beatEnvelope *= decayFactor;
    if (this.beatEnvelope < 0.01) this.beatEnvelope = 0;
  }

  /**
   * Pure intensity from current envelope + inputs.
   * Pass tick:true with mediaTimeMs to advance envelope once per media frame.
   */
  computeIntensity(frame, beatStrength = 0, options = {}) {
    const mediaTimeMs = options.mediaTimeMs;
    const shouldTick = options.tick !== false && mediaTimeMs != null;
    if (shouldTick) {
      if (
        this.lastIntensityMediaMs == null ||
        mediaTimeMs !== this.lastIntensityMediaMs
      ) {
        this.tickBeatEnvelope(mediaTimeMs);
        this.lastIntensityMediaMs = mediaTimeMs;
      }
    }
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

  adaptPreviewQuality(fps) {
    this.previewFps = fps;
    const now = performance.now();
    if (fps < 22 && now - this._qualityDowngradeTs > 1200) {
      this.previewQuality = Math.max(0.45, this.previewQuality * 0.85);
      this.analyzer.setRuntimeQuality(this.previewQuality);
      this._qualityDowngradeTs = now;
    } else if (
      fps > 28 &&
      this.previewQuality < 1 &&
      now - this._qualityDowngradeTs > 3000
    ) {
      this.previewQuality = Math.min(1, this.previewQuality + 0.08);
      this.analyzer.setRuntimeQuality(this.previewQuality);
      this._qualityDowngradeTs = now;
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

  #getPresetBaselineDensity() {
    const preset =
      SUBJECT_PRESETS[this.config.preset] || SUBJECT_PRESETS.anatomy;
    return preset.density ?? 0.55;
  }

  #scaledModuleConfig(moduleName) {
    const base = this.config.modules?.[moduleName];
    if (!base) return base;
    const presetDensity = this.#getPresetBaselineDensity();
    const scaled = { ...base };
    if (Object.prototype.hasOwnProperty.call(base, 'density')) {
      scaled.density = scaleDensityByGlobal(
        base.density,
        this.config.density,
        presetDensity,
      );
    }
    if (Object.prototype.hasOwnProperty.call(base, 'lineDensity')) {
      scaled.lineDensity = scaleDensityByGlobal(
        base.lineDensity,
        this.config.density,
        presetDensity,
      );
    }
    if (Object.prototype.hasOwnProperty.call(base, 'coverage')) {
      scaled.coverage = scaleDensityByGlobal(
        base.coverage,
        this.config.density,
        presetDensity,
      );
    }
    return scaled;
  }

  processFullFrame(ctx, canvas, video, renderProfile, options = {}) {
    if (!this.active || this.bypass || !video) return;
    const timestampMs = (options.mediaTime ?? video.currentTime ?? 0) * 1000;
    void this.analyzer
      .analyze(video, timestampMs, renderProfile)
      .catch(() => {});
    const frame = this.analyzer.lastFrame;
    const beatStrength = options.beatStrength || 0;
    this._frameIntensity = this.computeIntensity(frame, beatStrength, {
      mediaTimeMs: timestampMs,
      tick: true,
    });
    const intensity = this._frameIntensity;
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
    const mosaicConfig = this.#scaledModuleConfig('backgroundMosaic');
    if (mosaicConfig?.enabled) {
      ctx.save();
      this.backgroundMosaic.render(
        ctx,
        canvas,
        frame,
        mosaicConfig,
        intensity,
        this.config.seed,
        this.clipId,
        this._sourceSnapshot,
        options.drawMetrics,
        timestampMs,
      );
      ctx.restore();
    }

    if (modules.smear?.enabled) {
      this.smear.apply(
        ctx,
        canvas,
        frame,
        modules.smear,
        intensity,
        this._sourceSnapshot,
        options.drawMetrics,
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
      config: this.#scaledModuleConfig('fragments') || modules.fragments,
      intensity,
      seed: this.config.seed,
      clipId: this.clipId,
      drawMetrics: options.drawMetrics,
      sourceCanvas: this._sourceSnapshot,
      beatStrength,
      scale: this.config.scale,
      persistence: this.config.persistence,
      mediaTimeMs: timestampMs,
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
      mediaTimeMs: timestampMs,
    });
  }

  processOverlay(ctx, canvas, options = {}) {
    if (!this.active || this.bypass) return;
    const frame = this.analyzer.lastFrame;
    const mediaTimeMs =
      options.mediaTime != null ? options.mediaTime * 1000 : null;
    const intensity =
      this._frameIntensity ||
      this.computeIntensity(frame, options.beatStrength || 0, {
        mediaTimeMs,
        tick: false,
      });
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
      this.scan.render(
        ctx,
        canvas,
        frame,
        this.#scaledModuleConfig('scan') || modules.scan,
        intensity,
        drawMetrics,
      );
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
      renderBodyMap(
        ctx,
        canvas,
        frame,
        this.#scaledModuleConfig('bodyMap') || modules.bodyMap,
        intensity,
        drawMetrics,
      );
    }

    const hudConfig = this.#scaledModuleConfig('hudAnnotations');
    if (hudConfig?.enabled) {
      renderHudAnnotations(
        ctx,
        canvas,
        frame,
        hudConfig,
        intensity,
        this.config.seed,
        this.clipId,
        drawMetrics,
        mediaTimeMs ?? frame.timestamp ?? 0,
      );
    }
  }

  processFrame(ctx, canvas, video, renderProfile = null) {
    if (!this.active || this.bypass) return;
    if (renderProfile?.overlayOnly) {
      this.processOverlay(ctx, canvas, renderProfile);
      return;
    }
    const mediaTime = video?.currentTime;
    this.processFullFrame(ctx, canvas, video, renderProfile, {
      mediaTime,
    });
    this.processOverlay(ctx, canvas, {
      mediaTime,
      drawMetrics: renderProfile?.drawMetrics,
      beatStrength: renderProfile?.beatStrength,
    });
  }
}
