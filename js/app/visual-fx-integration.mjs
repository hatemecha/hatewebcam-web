import {
  applyVisualSystem,
  createDefaultVisualConfig,
  migrateProjectToV2,
  normalizeVisualConfig,
} from '../visual-fx/config.mjs';
import { VISUAL_SYSTEM_LABELS } from '../visual-fx/config.mjs';
import { resolveSubjectAssetUrls } from '../subject/mediapipe-paths.mjs';

/** @param {import('./controller.mjs').AppController} proto */
export function applyVisualFxIntegrationMixin(proto) {
  proto.ensureVisualFxEffect = async function () {
    if (this.visualFxEffect) return this.visualFxEffect;
    if (this._visualFxLoadPromise) return this._visualFxLoadPromise;
    this._visualFxLoadPromise = import('../visual-fx/effect.mjs')
      .then(({ VisualFxEffect }) => {
        this.visualFxEffect = new VisualFxEffect({
          analyzer: {
            assetUrls: resolveSubjectAssetUrls(document.baseURI),
          },
        });
        return this.visualFxEffect;
      })
      .finally(() => {
        this._visualFxLoadPromise = null;
      });
    return this._visualFxLoadPromise;
  };

  proto.getVisualFxStatusMessage = function () {
    if (this.visualFxBypass) return '';
    const effect = this.visualFxEffect;
    if (!effect?.active) return '';

    return effect.getStatusLabel();
  };

  proto.toggleVisualFxBypass = function () {
    this.visualFxBypass = !this.visualFxBypass;
    this.visualFxEffect?.setBypass?.(this.visualFxBypass);
    this.updateVisualFxBypassUI?.();
    this.renderVisualFxInspector?.();
    this.refreshPausedVideoPreview?.();
    if (!this.visualFxBypass) {
      void this.syncVideoTimelineVisualFx(true);
    }
  };

  proto.syncVideoTimelineVisualFxAt = async function (mediaTime, force = false) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    const syncRequestId = (this._visualFxSyncRequestId || 0) + 1;
    this._visualFxSyncRequestId = syncRequestId;
    const active = this.videoTimeline.activeAt(mediaTime);
    const item = active.find((entry) => entry.type === 'subject');
    const nextId = item?.id || '';
    if (!force && this.appliedVisualFxClipId === nextId) {
      return;
    }

    const effect = await this.ensureVisualFxEffect();
    if (syncRequestId !== this._visualFxSyncRequestId) return;
    this.appliedVisualFxClipId = nextId;
    effect.setBypass(!!this.visualFxBypass);

    if (!item) {
      effect.setActive(false);
      effect.resetTemporalState();
      this.updateVisualFxStatus('');
      return;
    }

    // Only a genuinely different clip resets the running simulation.
    // `force` re-applies the latest config on the *same* clip (a macro
    // commit, a bypass toggle, a paused-preview refresh) and must never
    // restart feedback state on its own - `effect.setConfig` below already
    // decides state-safety at the topology level.
    if (item.id !== effect.clipId) effect.onSeek();

    effect.setConfig(item.config || createDefaultVisualConfig('recursive'));
    effect.setActive(true, item.id);
    effect.flipH = this.getEffectiveFlipH?.() ?? false;

    this.updateVisualFxStatus(
      this.getVisualFxStatusMessage?.() || effect.getStatusLabel(),
    );
  };

  proto.syncVideoTimelineVisualFx = async function (force = false) {
    if (this.sourceMode !== 'video' || !this.videoSourceFile) return;
    await this.syncVideoTimelineVisualFxAt(this.videoEl.currentTime || 0, force);
    if (force) this.refreshPausedVideoPreview?.();
  };

  proto.resetVisualFxTemporalState = function (options = {}) {
    this.visualFxEffect?.resetTemporalState();
    this.visualFxEffect?.analyzer?.reset({ hard: !!options.hard });
    this.appliedVisualFxClipId = '';
    this._visualFxSyncRequestId = (this._visualFxSyncRequestId || 0) + 1;
  };

  // Discrete, manual "Reiniciar" action for the inspector: clears the
  // running feedback state without touching the saved config.
  proto.restartVisualFxSimulation = function () {
    this.visualFxEffect?.resetTemporalState();
    this.refreshPausedVideoPreview?.();
  };

  proto.updateVisualFxStatus = function (message = '') {
    if (this.visualFxStatus) {
      this.visualFxStatus.textContent = message;
      this.visualFxStatus.classList.toggle('is-active', !!message);
    }
    const inline = this.visualFxInspectorHost?.querySelector(
      '#visualFxInlineStatus',
    );
    if (inline) {
      inline.textContent = message;
      inline.classList.toggle('is-active', !!message);
    }
  };

  proto.updateVisualFxBypassUI = function () {
    const bypass = !!this.visualFxBypass;
    if (this.btnVisualFxBypass) {
      this.btnVisualFxBypass.checked = !bypass;
      this.btnVisualFxBypass.setAttribute('aria-checked', String(!bypass));
    }
  };

  proto.snapshotVisualFxConfig = function () {
    if (this.visualFxEffect?.active) {
      return this.visualFxEffect.getConfig();
    }
    return createDefaultVisualConfig('recursive');
  };

  proto.applyVisualSystemToSelection = function (systemId) {
    const item = this.getSelectedVideoEffectItem?.();
    if (!item || item.type !== 'subject') return;
    const next = applyVisualSystem(item.config, systemId);
    this.pushTimelineHistory?.();
    this.videoTimeline.upsert({ ...item, config: next });
    this.visualFxEffect?.setConfig(next);
    this.renderVisualFxInspector?.();
    this.renderVideoTimeline?.();
    void this.syncVideoTimelineVisualFx(true);
  };

  proto.stepVisualFxVariation = function (delta = 1) {
    const item = this.getSelectedVideoEffectItem?.();
    if (!item || item.type !== 'subject') return;
    const live =
      this.videoTimeline?.items?.find((entry) => entry.id === item.id) || item;
    const current = live.config?.seed ?? 18412;
    const seed = (current + delta * 137 + 999983) % 999999;
    const config = normalizeVisualConfig({ ...live.config, seed });
    this.pushTimelineHistory?.();
    this.videoTimeline.upsert({ ...live, config });
    this.visualFxEffect?.setConfig(config);
    this.renderVisualFxInspector?.();
    void this.syncVideoTimelineVisualFx(true);
  };

  proto.commitVisualFxConfig = function (partial = {}) {
    const item = this.getSelectedVideoEffectItem?.();
    if (!item || item.type !== 'subject') return;
    const merged = { ...item.config, ...partial };
    if (partial.macros && item.config?.macros) {
      merged.macros = { ...item.config.macros, ...partial.macros };
    }
    if (partial.tuning && item.config?.tuning) {
      merged.tuning = { ...item.config.tuning, ...partial.tuning };
    }
    const config = normalizeVisualConfig(merged);
    this.pushTimelineHistory?.();
    this.videoTimeline.upsert({ ...item, config });
    // Applies immediately: `setConfig` only restarts the simulation for a
    // real topology change, so dragging a macro slider never resets it.
    this.visualFxEffect?.setConfig(config);
    void this.syncVideoTimelineVisualFx(true);
  };

  proto.normalizeEditorProjectV2 = function (project) {
    const migrated = migrateProjectToV2(project);
    migrated.timeline.items = (migrated.timeline.items || []).map((item) => {
      if (item.type !== 'subject') return item;
      return {
        ...item,
        config: normalizeVisualConfig(item.config || {}),
      };
    });
    return migrated;
  };
}

export { normalizeVisualConfig, migrateProjectToV2, VISUAL_SYSTEM_LABELS };
