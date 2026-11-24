import { readonly, writable } from 'svelte/store';
import { isVisualFxClipType } from '../../editor/timeline-clip-types.ts';
import type {
  TimelineItem,
  VideoTimeline,
} from '../../editor/video-timeline.ts';
import { resolveSubjectAssetUrls } from '../../subject/mediapipe-paths.ts';
import {
  applyVisualSystem,
  normalizeVisualConfig,
  type VisualConfig,
  type VisualSystem,
} from '../../visual-fx/config.ts';
import type { VisualFxEffect } from '../../visual-fx/effect.ts';

type VisualFxStatus = ReturnType<VisualFxEffect['getStatusLabel']>;

export interface VisualFxInspectorState {
  config: VisualConfig | null;
  bypass: boolean;
  inside: boolean;
  status: VisualFxStatus;
}

export interface VisualFxOptions {
  getTimeline: () => VideoTimeline;
  getSelection: () => TimelineItem | null;
  getTime: () => number;
  hasSource: () => boolean;
  pushHistory: () => void;
  renderTimeline: () => void;
  refreshPreview: () => void;
  seek: (time: number) => void;
  publishVisibility: (visible: boolean, status: VisualFxStatus) => void;
}

type VisualConfigPatch = Omit<Partial<VisualConfig>, 'macros' | 'tuning'> & {
  macros?: Partial<VisualConfig['macros']>;
  tuning?: Partial<VisualConfig['tuning']>;
};

async function loadEffect(): Promise<VisualFxEffect> {
  const { VisualFxEffect } = await import('../../visual-fx/effect.ts');
  return new VisualFxEffect({
    analyzer: { assetUrls: resolveSubjectAssetUrls(document.baseURI) },
  });
}

export class VisualFxSession {
  private engine: VisualFxEffect | null = null;
  private loadPromise: Promise<VisualFxEffect | null> | null = null;
  private disposed = false;
  private syncRequest = 0;
  private appliedClipId = '';
  private bypassed = false;
  private selectedId = '';
  private panel: VisualFxInspectorState = {
    config: null,
    bypass: false,
    inside: false,
    status: '',
  };
  private readonly panelStore = writable(this.panel);
  readonly inspector = readonly(this.panelStore);

  constructor(
    private readonly options: VisualFxOptions,
    private readonly load: () => Promise<VisualFxEffect> = loadEffect,
  ) {}

  get effect(): VisualFxEffect | null {
    return this.engine;
  }

  get activeEffect(): VisualFxEffect | null {
    return this.engine?.active && !this.bypassed ? this.engine : null;
  }

  setEffectConfig(config: unknown): void {
    this.engine?.setConfig(config);
  }

  ensureEffect(): Promise<VisualFxEffect | null> {
    if (this.disposed) return Promise.resolve(null);
    if (this.engine) return Promise.resolve(this.engine);
    if (!this.loadPromise) {
      this.loadPromise = this.load()
        .then((effect) => {
          if (this.disposed) {
            effect.dispose();
            return null;
          }
          this.engine = effect;
          return effect;
        })
        .finally(() => {
          this.loadPromise = null;
        });
    }
    return this.loadPromise;
  }

  async syncAt(time: number, force = false): Promise<void> {
    if (!this.options.hasSource()) return;
    const request = ++this.syncRequest;
    const item = this.options
      .getTimeline()
      .activeAt(time)
      .find((entry) => isVisualFxClipType(entry.type));
    const nextId = item?.id ?? '';
    if (!force && this.appliedClipId === nextId) return;
    if (!item && !this.engine) return;
    const effect = await this.ensureEffect();
    if (!effect || request !== this.syncRequest) return;
    this.appliedClipId = nextId;
    effect.setBypass(this.bypassed);
    if (item) {
      // Config changes on the same clip preserve temporal feedback.
      if (item.id !== effect.clipId) effect.onSeek();
      effect.setConfig(item.config);
      effect.setActive(true, item.id);
    } else {
      effect.setActive(false);
      effect.resetTemporalState();
    }
    this.updatePosition();
  }

  async sync(force = false): Promise<void> {
    if (!this.options.hasSource()) return;
    await this.syncAt(this.options.getTime(), force);
    if (force) this.options.refreshPreview();
  }

  reset(hard = false): void {
    this.syncRequest += 1;
    this.appliedClipId = '';
    this.engine?.resetTemporalState();
    this.engine?.analyzer.reset({ hard });
    if (hard) this.engine?.setActive(false);
    this.updateInspector();
  }

  dispose(): void {
    this.disposed = true;
    this.syncRequest += 1;
    this.engine?.dispose();
    this.engine = null;
  }

  restart(): void {
    this.engine?.resetTemporalState();
    this.options.refreshPreview();
  }

  toggleBypass(): void {
    this.bypassed = !this.bypassed;
    this.engine?.setBypass(this.bypassed);
    this.updateInspector();
    this.options.refreshPreview();
    if (!this.bypassed) void this.sync(true);
  }

  setSystem(system: VisualSystem): void {
    const item = this.selection();
    if (!item) return;
    this.edit(
      item,
      applyVisualSystem(normalizeVisualConfig(item.config), system),
    );
    this.options.renderTimeline();
  }

  vary(): void {
    const item = this.selection();
    if (!item) return;
    const config = normalizeVisualConfig(item.config);
    this.edit(item, { ...config, seed: (config.seed + 137 + 999983) % 999999 });
  }

  commit(patch: VisualConfigPatch): void {
    const item = this.selection();
    if (!item) return;
    const config = normalizeVisualConfig(item.config);
    this.edit(
      item,
      normalizeVisualConfig({
        ...config,
        ...patch,
        macros: { ...config.macros, ...patch.macros },
        tuning: { ...config.tuning, ...patch.tuning },
      }),
    );
  }

  goToClip(): void {
    const item = this.selection();
    if (item) this.options.seek(item.startTime);
  }

  updateInspector(): void {
    const item = this.selection();
    this.selectedId = item?.id ?? '';
    this.publish(item ? normalizeVisualConfig(item.config) : null, item);
  }

  updatePosition(): void {
    const item = this.selection();
    if ((item?.id ?? '') !== this.selectedId) {
      this.updateInspector();
    } else {
      this.publish(this.panel.config, item);
    }
  }

  private selection(): TimelineItem | null {
    const chosen = this.options.getSelection();
    if (!chosen || !isVisualFxClipType(chosen.type)) return null;
    return chosen;
  }

  private edit(item: TimelineItem, config: VisualConfig): void {
    this.options.pushHistory();
    this.options.getTimeline().upsert({ ...item, config: { ...config } });
    this.setEffectConfig(config);
    this.updateInspector();
    void this.sync(true);
  }

  private publish(
    config: VisualConfig | null,
    item: TimelineItem | null,
  ): void {
    const currentTime = this.options.getTime();
    const inside =
      item !== null &&
      currentTime >= item.startTime &&
      currentTime < item.endTime;
    const status =
      this.engine?.active && !this.bypassed ? this.engine.getStatusLabel() : '';
    if (
      this.panel.config === config &&
      this.panel.inside === inside &&
      this.panel.bypass === this.bypassed &&
      this.panel.status === status
    )
      return;
    this.panel = { config, inside, bypass: this.bypassed, status };
    this.options.publishVisibility(config !== null, status);
    this.panelStore.set(this.panel);
  }
}
