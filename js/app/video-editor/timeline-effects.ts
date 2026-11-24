import type { WebcamPreferences } from '../webcam-preferences.ts';
import type {
  TimelineItem,
  VideoTimeline,
} from '../../editor/video-timeline.ts';
import type { DetectorKind } from '../../../src/lib/webcam/types.ts';
import { DEFAULT_IMAGE_SETTINGS, type ImageSettings } from '../constants.ts';
import type { Detectors } from '../detectors.ts';
import {
  lookControls,
  normalizeClipAutomation,
  normalizeLookClipConfig,
  type LookConfig,
} from './look-config.ts';
import type { VideoEditorSession } from './session.ts';

type AutomationClip = Pick<TimelineItem, 'startTime' | 'endTime' | 'config'>;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function automationIntensity(
  timeline: VideoTimeline,
  item: AutomationClip,
  time: number,
): number {
  const mode = normalizeClipAutomation(item.config.automation);
  if (mode === 'fixed') return 1;
  const width = Math.max(0.001, item.endTime - item.startTime);
  if (mode === 'fade-in') return clamp01((time - item.startTime) / width);
  if (mode === 'fade-out') return clamp01((item.endTime - time) / width);

  let beat = -1;
  let nearest = Infinity;
  for (const marker of timeline.markers) {
    if (
      marker.source !== 'edit-assist' ||
      (marker.kind !== 'beat' && marker.kind !== 'bar')
    )
      continue;
    if (marker.time <= time) beat += 1;
    nearest = Math.min(nearest, Math.abs(marker.time - time));
  }
  if (mode === 'alternate-beat') return beat === -1 || beat % 2 === 0 ? 1 : 0;
  return Number.isFinite(nearest) ? clamp01(1 - nearest / 0.22) : 1;
}

export function blendLook(
  base: ImageSettings,
  look: LookConfig,
  intensity: number,
): LookConfig {
  const automated = { ...look };
  for (const key of lookControls) {
    automated[key] = Math.round(
      base[key] + (look[key] - base[key]) * intensity,
    );
  }
  automated.blackAndWhite = intensity >= 0.5 && look.blackAndWhite;
  return automated;
}

export interface TimelineEffectsHost {
  videoEl: HTMLVideoElement;
  sourceMode: 'camera' | 'video';
  imageSettings: ImageSettings;
  detectors: Detectors;
  preferences: Pick<WebcamPreferences, 'updateImageControlsUI'>;
}

export class TimelineEffects {
  private applied: Partial<Record<DetectorKind | 'look', string>> = {};
  private pending: Promise<void> | null = null;
  private forceNext = false;
  private revision = 0;
  private base: ImageSettings | null = null;

  constructor(
    private readonly editor: VideoEditorSession,
    private readonly host: TimelineEffectsHost,
  ) {}

  reset(): void {
    this.resetApplied();
    this.base = null;
  }

  resetApplied(): void {
    this.revision += 1;
    this.pending = null;
    this.forceNext = false;
    this.applied = {};
  }

  initializeLook(): void {
    this.base = { ...DEFAULT_IMAGE_SETTINGS, ...this.operationalSettings() };
    this.host.imageSettings = { ...this.base };
  }

  private operationalSettings() {
    const settings = this.host.imageSettings;
    return {
      previewQuality: settings.previewQuality,
      jpegQuality: settings.jpegQuality,
      videoFormat: settings.videoFormat,
      editorExportPreset: settings.editorExportPreset,
      editorExportFormat: settings.editorExportFormat,
      editorExportMode: settings.editorExportMode,
      editorCopyAudio: settings.editorCopyAudio,
      experimentalExportFeatures: settings.experimentalExportFeatures,
      effectsExportChroma: settings.effectsExportChroma,
      captureTimerSeconds: settings.captureTimerSeconds,
      qualityEnhancer: settings.qualityEnhancer,
      qualityEnhancerStrength: settings.qualityEnhancerStrength,
    };
  }

  applyLook(time: number, { force = false } = {}): boolean {
    if (!this.hasSource()) return false;
    const { timeline } = this.editor;
    const item = timeline.activeAt(time).find((clip) => clip.type === 'look');
    const id = item?.id ?? '';
    if (!force && this.applied.look === id) return false;

    const operational = this.operationalSettings();
    const base = this.base ?? { ...DEFAULT_IMAGE_SETTINGS, ...operational };
    const look = item
      ? blendLook(
          base,
          normalizeLookClipConfig(item.config),
          automationIntensity(timeline, item, time),
        )
      : {};
    this.host.imageSettings = { ...base, ...look, ...operational };
    this.applied.look = id;
    this.host.preferences.updateImageControlsUI();
    return true;
  }

  syncLook(options?: { force?: boolean }): void {
    if (this.applyLook(this.host.videoEl.currentTime || 0, options))
      this.host.detectors.updateInfo();
  }

  async setDetector(
    kind: DetectorKind,
    item?: TimelineItem | null,
  ): Promise<void> {
    const revision = this.revision;
    const detectors = this.host.detectors;
    const enabled = Boolean(item);
    if (detectors.selection[kind] !== enabled) {
      await detectors.setEnabled(kind, enabled, {
        quiet: this.editor.exportSession.active,
      });
    }
    if (item && revision === this.revision)
      detectors[kind]?.setConfig(item.config);
  }

  async syncDetectorsAt(time: number, force = false): Promise<void> {
    if (!this.hasSource()) return;
    const revision = this.revision;
    const { timeline } = this.editor;
    const active = timeline
      .activeAt(time)
      .filter((item) => automationIntensity(timeline, item, time) > 0.1);
    for (const type of ['blob', 'face', 'blink'] as const) {
      const clip = active.find((item) => item.type === type);
      const id = clip?.id ?? '';
      if (force || this.applied[type] !== id) {
        await this.setDetector(type, clip);
        if (revision !== this.revision) return;
        this.applied[type] = id;
      }
    }
  }

  async syncDetectors(force = false): Promise<void> {
    if (!this.hasSource()) return;
    this.forceNext ||= force;
    if (this.pending) return this.pending;
    const revision = this.revision;
    const shouldForce = this.forceNext;
    this.forceNext = false;
    this.pending = this.syncDetectorsAt(
      this.host.videoEl.currentTime || 0,
      shouldForce,
    )
      .then(() => {
        if (revision !== this.revision) return;
        this.host.detectors.updateInfo();
        this.editor.workspace.updateAdjustmentsClipStatus();
      })
      .finally(() => {
        if (revision !== this.revision) return;
        this.pending = null;
        if (this.forceNext) void this.syncDetectors();
      });
    return this.pending;
  }

  async sync(force = false): Promise<void> {
    if (!this.hasSource()) return;
    const revision = this.revision;
    this.syncLook({ force });
    await this.editor.visualFx.sync(force);
    if (revision === this.revision) await this.syncDetectors(force);
  }

  private hasSource(): boolean {
    return this.host.sourceMode === 'video' && Boolean(this.editor.source.file);
  }
}
