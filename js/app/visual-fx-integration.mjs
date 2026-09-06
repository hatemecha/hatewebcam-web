import {
  applySubjectPreset,
  createDefaultSubjectConfig,
  migrateProjectToV2,
  normalizeSubjectConfig,
} from '../visual-fx/config.mjs';
import { SUBJECT_PRESET_LABELS } from '../visual-fx/config.mjs';
import { resolveSubjectAssetUrls } from '../subject/mediapipe-paths.mjs';

/** @param {import('./controller.mjs').AppController} proto */
export function applySubjectFxIntegrationMixin(proto) {
  proto.ensureSubjectFxEffect = async function () {
    if (this.subjectFxEffect) return this.subjectFxEffect;
    if (this._subjectFxLoadPromise) return this._subjectFxLoadPromise;
    this._subjectFxLoadPromise = import('../visual-fx/effect.mjs')
      .then(({ VisualFxEffect }) => {
        this.subjectFxEffect = new VisualFxEffect({
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

  proto.getSubjectFxStatusMessage = function () {
    if (this.subjectFxBypass) return '';
    const effect = this.subjectFxEffect;
    if (!effect?.active) return '';

    return effect.getStatusLabel();
  };

  proto.toggleSubjectFxBypass = function () {
    this.subjectFxBypass = !this.subjectFxBypass;
    this.subjectFxEffect?.setBypass?.(this.subjectFxBypass);
    this.updateSubjectFxBypassUI?.();
    this.renderSubjectFxInspector?.();
    this.refreshPausedVideoPreview?.();
    if (!this.subjectFxBypass) {
      void this.syncVideoTimelineSubject(true);
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
      return;
    }

    const effect = await this.ensureSubjectFxEffect();
    if (syncRequestId !== this._subjectFxSyncRequestId) return;
    this.appliedTimelineSubjectId = nextId;
    effect.setBypass(!!this.subjectFxBypass);

    if (!item) {
      effect.setActive(false);
      effect.resetTemporalState();
      this.updateSubjectFxStatus('');
      return;
    }

    // Only a genuinely different clip resets the running simulation.
    // `force` re-applies the latest config on the *same* clip (a macro
    // commit, a bypass toggle, a paused-preview refresh) and must never
    // restart feedback state on its own - `effect.setConfig` below already
    // decides state-safety at the topology level.
    if (item.id !== effect.clipId) effect.onSeek();

    effect.setConfig(item.config || createDefaultSubjectConfig('recursive'));
    effect.setActive(true, item.id);
    effect.flipH = this.getEffectiveFlipH?.() ?? false;

    this.updateSubjectFxStatus(
      this.getSubjectFxStatusMessage?.() || effect.getStatusLabel(),
    );
  };

  proto.syncVideoTimelineSubject = async function (force = false) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    await this.syncVideoTimelineSubjectAt(this.videoEl.currentTime || 0, force);
    if (force) this.refreshPausedVideoPreview?.();
  };

  proto.resetSubjectFxTemporalState = function (options = {}) {
    this.subjectFxEffect?.resetTemporalState();
    this.subjectFxEffect?.analyzer?.reset({ hard: !!options.hard });
    this.appliedTimelineSubjectId = '';
    this._subjectFxSyncRequestId = (this._subjectFxSyncRequestId || 0) + 1;
  };

  // Discrete, manual "Reiniciar" action for the inspector: clears the
  // running feedback state without touching the saved config.
  proto.restartVisualFxSimulation = function () {
    this.subjectFxEffect?.resetTemporalState();
    this.refreshPausedVideoPreview?.();
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
    return createDefaultSubjectConfig('recursive');
  };

  proto.applySubjectPresetToSelection = function (systemId) {
    const item = this.getSelectedVideoEffectItem?.();
    if (!item || item.type !== 'subject') return;
    const next = applySubjectPreset(item.config, systemId);
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

  proto.commitSubjectFxConfig = function (partial = {}) {
    const item = this.getSelectedVideoEffectItem?.();
    if (!item || item.type !== 'subject') return;
    const merged = { ...item.config, ...partial };
    if (partial.macros && item.config?.macros) {
      merged.macros = { ...item.config.macros, ...partial.macros };
    }
    if (partial.tuning && item.config?.tuning) {
      merged.tuning = { ...item.config.tuning, ...partial.tuning };
    }
    const config = normalizeSubjectConfig(merged);
    this.pushTimelineHistory?.();
    this.videoTimeline.upsert({ ...item, config });
    // Applies immediately: `setConfig` only restarts the simulation for a
    // real topology change, so dragging a macro slider never resets it.
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

export { normalizeSubjectConfig, migrateProjectToV2, SUBJECT_PRESET_LABELS };
