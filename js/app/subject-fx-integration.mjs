import {
  applySubjectPreset,
  createDefaultSubjectConfig,
  migrateProjectToV2,
  normalizeSubjectConfig,
} from '../subject/subject-config.mjs';
import { SUBJECT_PRESET_LABELS } from '../effects/subject-fx/subject-presets.mjs';
import { SUBJECT_ANALYSIS_STATUS } from '../subject/subject-analyzer.mjs';
import { resolveSubjectAssetUrls } from '../subject/mediapipe-paths.mjs';

/** @param {import('./controller.mjs').AppController} proto */
export function applySubjectFxIntegrationMixin(proto) {
  proto.ensureSubjectFxEffect = async function () {
    if (this.subjectFxEffect) return this.subjectFxEffect;
    if (this._subjectFxLoadPromise) return this._subjectFxLoadPromise;
    this._subjectFxLoadPromise =
      import('../effects/subject-fx/subject-effect.mjs')
        .then(({ SubjectFxEffect }) => {
          this.subjectFxEffect = new SubjectFxEffect({
            analyzer: {
              assetUrls: resolveSubjectAssetUrls(document.baseURI),
            },
          });
          return this.subjectFxEffect;
        })
        .finally(() => {
          this._subjectFxLoadPromise = null;
        });
    return this._subjectFxLoadPromise;
  };

  proto.getSubjectSourceKey = function () {
    const file = this.videoSourceFile;
    if (!file) return '';
    return `${file.name}:${file.size}:${this.videoTimeline?.duration || 0}`;
  };

  proto.getSubjectBeatStrength = function (mediaTime) {
    const markers = (this.videoTimeline?.markers || []).filter(
      (marker) =>
        marker.source === 'edit-assist' &&
        (marker.kind === 'beat' || marker.kind === 'bar'),
    );
    let best = 0;
    markers.forEach((marker) => {
      const delta = Math.abs(marker.time - mediaTime);
      if (delta > 0.18) return;
      const strength = clamp01(
        marker.strength ?? (marker.kind === 'bar' ? 0.9 : 0.65),
      );
      const envelope = clamp01(1 - delta / 0.18);
      best = Math.max(best, strength * envelope);
    });
    return best;
  };

  proto.getSubjectFxStatusMessage = function () {
    if (this.subjectFxBypass) return '';
    const effect = this.subjectFxEffect;
    if (!effect?.active) return '';
    if (effect.analyzer?.status === SUBJECT_ANALYSIS_STATUS.error) {
      return effect.analyzer.statusMessage || 'No se pudo detectar el sujeto.';
    }
    return effect.getStatusLabel();
  };

  proto.toggleSubjectFxBypass = function () {
    this.subjectFxBypass = !this.subjectFxBypass;
    this.subjectFxEffect?.setBypass?.(this.subjectFxBypass);
    this.updateSubjectFxBypassUI?.();
    this.renderSubjectFxInspector?.();
    if (!this.subjectFxBypass) {
      void this.syncVideoTimelineSubject(true);
    }
  };

  proto.startSubjectPreAnalysis = async function () {
    if (!this.videoSourceFile || this.subjectPreAnalysisRunning) return;
    const effect = await this.ensureSubjectFxEffect();
    await effect.analyzer.ensureReady();
    const cache = effect.analyzer.cache;
    const sourceKey = this.getSubjectSourceKey();
    cache.invalidate(sourceKey);
    cache.duration = this.videoTimeline.duration;
    cache.sourceKey = sourceKey;
    cache.running = true;
    cache.ready = false;
    cache.progress = 0;
    cache.samples = [];

    this.subjectPreAnalysisRunning = true;
    this.updateSubjectFxStatus(cache.getProgressLabel());

    const trimStart = this.videoTimeline.trimStart;
    const trimEnd = this.videoTimeline.trimEnd;
    const step = 1 / 12;
    const originalTime = this.videoEl.currentTime;

    try {
      for (let time = trimStart; time <= trimEnd; time += step) {
        if (!this.subjectPreAnalysisRunning) break;
        await this.seekVideoForExport(time);
        await effect.analyzer.analyze(this.videoEl, time * 1000, {
          detectorIntervalMs: 0,
          quality: 'best',
        });
        const frame = effect.analyzer.lastFrame;
        if (frame) {
          cache.addSample({
            timestamp: time * 1000,
            landmarks: frame.landmarks,
            center: frame.center,
            boundingBox: frame.boundingBox,
            motionEnergy: frame.motionEnergy,
            movementDirection: frame.movementDirection,
            jointVelocities: frame.jointVelocities,
            wristVelocities: frame.wristVelocities,
            confidence: frame.confidence,
            regions: frame.regions,
          });
        }
        cache.progress =
          (time - trimStart) / Math.max(0.001, trimEnd - trimStart);
        this.updateSubjectFxStatus(cache.getProgressLabel());
      }
      cache.markReady();
      this.updateSubjectFxStatus('✓ Sujeto analizado');
    } catch (error) {
      console.error('Subject pre-analysis failed:', error);
      this.updateSubjectFxStatus('No se pudo completar el análisis.');
    } finally {
      this.subjectPreAnalysisRunning = false;
      this.videoEl.currentTime = originalTime;
    }
  };

  proto.syncVideoTimelineSubjectAt = async function (mediaTime, force = false) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    const syncRequestId = (this._subjectFxSyncRequestId || 0) + 1;
    this._subjectFxSyncRequestId = syncRequestId;
    const active = this.videoTimeline.activeAt(mediaTime);
    const item = active.find((entry) => entry.type === 'subject');
    const nextId = item?.id || '';
    if (!force && this.appliedTimelineSubjectId === nextId) {
      if (item && this.subjectFxEffect?.active && !this.subjectFxBypass) {
        const beat = this.getSubjectBeatStrength(mediaTime);
        if (beat > 0) this.subjectFxEffect.setBeatPulse(beat, mediaTime * 1000);
      }
      return;
    }

    this.appliedTimelineSubjectId = nextId;
    const effect = await this.ensureSubjectFxEffect();
    if (syncRequestId !== this._subjectFxSyncRequestId) return;
    effect.setBypass(!!this.subjectFxBypass);

    if (!item) {
      effect.setActive(false);
      effect.resetTemporalState();
      this.updateSubjectFxStatus('');
      return;
    }

    if (force || item.id !== effect.clipId) {
      effect.onSeek();
    }

    effect.setActive(false);
    try {
      await effect.analyzer.ensureReady();
    } catch (error) {
      console.warn('Subject FX preload failed:', error);
      if (syncRequestId === this._subjectFxSyncRequestId) {
        effect.setActive(false);
        this.updateSubjectFxStatus(
          effect.analyzer.statusMessage || 'No se pudo iniciar Subject FX.',
        );
      }
      return;
    }
    if (syncRequestId !== this._subjectFxSyncRequestId) return;

    effect.setConfig(item.config || createDefaultSubjectConfig('anatomy'));
    effect.setActive(true, item.id);
    effect.flipH = this.getEffectiveFlipH?.() ?? false;

    const beat = this.getSubjectBeatStrength(mediaTime);
    if (beat > 0) effect.setBeatPulse(beat, mediaTime * 1000);

    this.updateSubjectFxStatus(
      this.getSubjectFxStatusMessage?.() || effect.getStatusLabel(),
    );
  };

  proto.syncVideoTimelineSubject = async function (force = false) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    await this.syncVideoTimelineSubjectAt(this.videoEl.currentTime || 0, force);
  };

  proto.resetSubjectFxTemporalState = function (options = {}) {
    this.subjectFxEffect?.resetTemporalState();
    this.subjectFxEffect?.analyzer?.reset({ hard: !!options.hard });
    this.appliedTimelineSubjectId = '';
    this._subjectFxSyncRequestId = (this._subjectFxSyncRequestId || 0) + 1;
    this._subjectAutoAnalysisStarted = false;
    this.subjectPreAnalysisRunning = false;
  };

  proto.updateSubjectFxStatus = function (message = '') {
    if (this.subjectFxStatus) {
      this.subjectFxStatus.textContent = message;
      this.subjectFxStatus.classList.toggle('is-active', !!message);
    }
    const inline = this.subjectFxInspectorHost?.querySelector(
      '#subjectFxInlineStatus',
    );
    if (inline) {
      inline.textContent = message;
      inline.classList.toggle('is-active', !!message);
    }
  };

  proto.updateSubjectFxBypassUI = function () {
    const bypass = !!this.subjectFxBypass;
    if (this.btnSubjectBypass) {
      this.btnSubjectBypass.checked = !bypass;
      this.btnSubjectBypass.setAttribute('aria-checked', String(!bypass));
    }
  };

  proto.snapshotSubjectFxConfig = function () {
    if (this.subjectFxEffect?.active) {
      return this.subjectFxEffect.getConfig();
    }
    return createDefaultSubjectConfig('anatomy');
  };

  proto.applySubjectPresetToSelection = function (presetId) {
    const item = this.getSelectedVideoEffectItem?.();
    if (!item || item.type !== 'subject') return;
    const next = applySubjectPreset(item.config, presetId);
    this.pushTimelineHistory?.();
    this.videoTimeline.upsert({ ...item, config: next });
    this.subjectFxEffect?.setConfig(next);
    this.renderSubjectFxInspector?.();
    this.renderVideoTimeline?.();
    void this.syncVideoTimelineSubject(true);
  };

  proto.stepSubjectVariation = function (delta = 1) {
    const item = this.getSelectedVideoEffectItem?.();
    if (!item || item.type !== 'subject') return;
    const live =
      this.videoTimeline?.items?.find((entry) => entry.id === item.id) || item;
    const current = live.config?.seed ?? 18412;
    const seed = (current + delta * 137 + 999983) % 999999;
    const config = normalizeSubjectConfig({ ...live.config, seed });
    this.pushTimelineHistory?.();
    this.videoTimeline.upsert({ ...live, config });
    this.subjectFxEffect?.setConfig(config);
    this.renderSubjectFxInspector?.();
    void this.syncVideoTimelineSubject(true);
  };

  proto.randomizeSubjectSeed = function () {
    const item = this.getSelectedVideoEffectItem?.();
    if (!item || item.type !== 'subject') return;
    const seed = Math.floor(Math.random() * 999999);
    const config = normalizeSubjectConfig({ ...item.config, seed });
    this.pushTimelineHistory?.();
    this.videoTimeline.upsert({ ...item, config });
    this.subjectFxEffect?.setConfig(config);
    this.renderSubjectFxInspector?.();
    void this.syncVideoTimelineSubject(true);
  };

  proto.commitSubjectFxConfig = function (partial = {}) {
    const item = this.getSelectedVideoEffectItem?.();
    if (!item || item.type !== 'subject') return;
    const merged = { ...item.config, ...partial };
    if (partial.modules && item.config?.modules) {
      merged.modules = { ...item.config.modules };
      for (const [moduleName, modulePatch] of Object.entries(partial.modules)) {
        merged.modules[moduleName] = {
          ...item.config.modules[moduleName],
          ...modulePatch,
        };
      }
    }
    const config = normalizeSubjectConfig(merged);
    this.pushTimelineHistory?.();
    this.videoTimeline.upsert({ ...item, config });
    this.subjectFxEffect?.setConfig(config);
    void this.syncVideoTimelineSubject(true);
  };

  proto.normalizeEditorProjectV2 = function (project) {
    const migrated = migrateProjectToV2(project);
    migrated.timeline.items = (migrated.timeline.items || []).map((item) => {
      if (item.type !== 'subject') return item;
      return {
        ...item,
        config: normalizeSubjectConfig(item.config || {}),
      };
    });
    return migrated;
  };
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

export { normalizeSubjectConfig, migrateProjectToV2, SUBJECT_PRESET_LABELS };
