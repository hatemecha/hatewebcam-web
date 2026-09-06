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

    if (force || item.id !== effect.clipId) {
      effect.onSeek();
    }

    effect.setConfig(item.config || createDefaultSubjectConfig('feedback'));
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
    return createDefaultSubjectConfig('feedback');
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

  proto.commitSubjectFxConfig = function (partial = {}) {
    const item = this.getSelectedVideoEffectItem?.();
    if (!item || item.type !== 'subject') return;
    const merged = { ...item.config, ...partial };
    if (partial.modules && item.config?.modules) {
      merged.modules = { ...item.config.modules };
      for (const [moduleName, modulePatch] of Object.entries(partial.modules)) {
        merged.modules[moduleName] = modulePatch;
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

export { normalizeSubjectConfig, migrateProjectToV2, SUBJECT_PRESET_LABELS };
