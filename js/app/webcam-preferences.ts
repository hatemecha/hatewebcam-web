import {
  clamp,
  configObject,
  faceVisualModeFromFlags,
  normalizeCaptureTimerSeconds,
  normalizeFaceVisualFlags,
  normalizeFaceLabel,
  normalizeHexColor,
  oneOf,
  readImageSettings,
  readQuickDetectorSettings,
  toFiniteInt,
  type QuickDetectorSettings,
} from './webcam-settings.ts';
import {
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_QUICK_DETECTOR_SETTINGS,
  normalizePerformanceMode,
  normalizePreviewQuality,
  PREVIEW_QUALITY_PRESETS,
  STORAGE_KEY,
  type ImageSettings,
} from './constants.ts';
import { translateCurrent } from '../../src/lib/i18n/translate.ts';
import {
  updateExportSettings,
  type ExportSetting,
} from '../../src/lib/editor/editor-state.ts';
import { applyEditorExportPreset } from './export-settings.ts';
import { updateCameraSourceState } from '../../src/lib/webcam/camera-source-bridge.ts';
import {
  deriveDetectorExtras,
  replaceWebcamPanelState,
  type ImagePresetName,
} from '../../src/lib/webcam/panel-state.ts';
import type {
  DetectorUpdate,
  FaceVisualKind,
} from '../../src/lib/webcam/types.ts';
import { setColorPickFeedback } from '../../src/lib/webcam/color-pick-feedback.ts';
import type { TimelineItem } from '../editor/video-timeline.ts';
import type { Detectors } from './detectors.ts';
import type { readAppDom } from './dom.ts';
import type { PreviewRenderer } from './preview-renderer.ts';
import type { SettingsStore } from './settings-store.ts';
import type { WebcamCamera } from './webcam-camera.ts';
import type { WebcamProfiles } from './webcam-profiles.ts';
import type { WebcamCapture } from './webcam-capture.ts';
import type { VideoEditorSession } from './video-editor/session.ts';
import { hideStatus, showStatus } from './feedback.ts';
import { toFiniteNumber as readPanelNumber } from './ui-helpers.ts';

const imagePresets: Record<
  ImagePresetName,
  Pick<
    ImageSettings,
    | 'blackAndWhite'
    | 'exposure'
    | 'shadows'
    | 'highlights'
    | 'contrast'
    | 'saturation'
    | 'temperature'
    | 'detail'
    | 'sharpness'
  >
> = {
  natural: {
    blackAndWhite: false,
    exposure: 0,
    shadows: 0,
    highlights: 0,
    contrast: 100,
    saturation: 100,
    temperature: 0,
    detail: 0,
    sharpness: 0,
  },
  vivid: {
    blackAndWhite: false,
    exposure: 8,
    shadows: 12,
    highlights: -10,
    contrast: 116,
    saturation: 135,
    temperature: 8,
    detail: 24,
    sharpness: 12,
  },
  cinema: {
    blackAndWhite: false,
    exposure: -8,
    shadows: 18,
    highlights: -22,
    contrast: 112,
    saturation: 88,
    temperature: -6,
    detail: 12,
    sharpness: 8,
  },
  bw: {
    blackAndWhite: true,
    exposure: 0,
    shadows: 12,
    highlights: -10,
    contrast: 118,
    saturation: 0,
    temperature: 0,
    detail: 20,
    sharpness: 10,
  },
};

type ImageNumberControl =
  | 'exposure'
  | 'shadows'
  | 'highlights'
  | 'contrast'
  | 'saturation'
  | 'temperature'
  | 'detail'
  | 'sharpness'
  | 'jpegQuality'
  | 'qualityEnhancerStrength';
const imageNumberControls: readonly string[] = [
  'exposure',
  'shadows',
  'highlights',
  'contrast',
  'saturation',
  'temperature',
  'detail',
  'sharpness',
  'jpegQuality',
  'qualityEnhancerStrength',
];

function isImageNumberControl(value: string): value is ImageNumberControl {
  return imageNumberControls.includes(value);
}

interface PreferencesHost {
  dom: ReturnType<typeof readAppDom>;
  sourceMode: 'camera' | 'video';
  settingsStore: SettingsStore;
  imageSettings: ImageSettings;
  quickDetectorSettings: QuickDetectorSettings;
  camera: WebcamCamera;
  renderer: PreviewRenderer;
  capture: WebcamCapture;
  detectors: Detectors;
  editor: VideoEditorSession | null;
  selectedVideoEffectId: string;
  adjustClipStatusText?: string;
  adjustClipVisible?: boolean;
  adjustmentsContext: string;
  profiles: Pick<WebcamProfiles, 'names' | 'selected'>;
  flipH: boolean;
  flipV: boolean;
  rotation: number;
  isRunning: boolean;
  mobileFxOpen: boolean;
  updateVideoEffectInspector(): void;
  updateVideoEditorUI(): void;
  getSelectedVideoEffectItem?(): TimelineItem | null;
  snapshotVideoEffectConfig?(type: string): Record<string, unknown>;
  syncLookClipConfigNow?(): void;
}

export function isMobileViewport(): boolean {
  return window.matchMedia('(max-width: 900px)').matches;
}

export function getCurrentPreviewQualityPreset(settings: ImageSettings) {
  return PREVIEW_QUALITY_PRESETS[
    normalizePreviewQuality(settings.previewQuality)
  ];
}

export class WebcamPreferences {
  private mobileActivePreset: ImagePresetName | null = null;
  private storageWarningShown = false;
  private advancedOptionsOpen = false;
  private saveQuickDetectorSettingsTimer: ReturnType<typeof setTimeout> | null =
    null;
  private saveEffectSettingsTimer: ReturnType<typeof setTimeout> | null = null;
  private saveImageSettingsTimer: ReturnType<typeof setTimeout> | null = null;
  private syncSelectedClipConfigTimer: ReturnType<typeof setTimeout> | null =
    null;

  constructor(private readonly host: PreferencesHost) {}

  publishWebcamPanel() {
    const image = this.host.imageSettings;
    const quick = this.host.quickDetectorSettings;
    const { blob, face, blink } = this.host.detectors;
    const blobConfig = blob?.getConfig();
    const faceConfig = face?.getConfig();
    const faceFlags = normalizeFaceVisualFlags(quick);
    const selectedEffect =
      this.host.sourceMode === 'video'
        ? (this.host.getSelectedVideoEffectItem?.()?.type ?? null)
        : null;
    const extras = deriveDetectorExtras({
      sourceMode: this.host.sourceMode === 'video' ? 'video' : 'camera',
      blobOn: this.host.detectors.selection.blob,
      faceOn: this.host.detectors.selection.face,
      selectedEffect,
      faceShowBox: !!faceFlags.showBox,
    });
    replaceWebcamPanelState({
      sourceMode: this.host.sourceMode === 'video' ? 'video' : 'camera',
      contextual:
        !!this.host.dom.effectsControlsSlot?.classList.contains(
          'is-contextual',
        ),
      adjustContext: this.host.adjustmentsContext || 'look',
      adjustHelp: this.host.dom.adjustContextHelp?.textContent || '',
      adjustClipStatus: this.host.adjustClipStatusText || '',
      adjustClipVisible: !!this.host.adjustClipVisible,
      advancedOpen: !!this.advancedOptionsOpen,
      activePreset: this.mobileActivePreset || null,
      detectors: {
        blob: this.host.detectors.selection.blob,
        face: this.host.detectors.selection.face,
        blink: this.host.detectors.selection.blink,
        faceBusy: this.host.detectors.busy.face,
        blinkBusy: this.host.detectors.busy.blink,
      },
      detectorOptions: {
        blob: blobConfig
          ? {
              ...blobConfig,
              boxColor: normalizeHexColor(
                blobConfig.boxColor,
                quick.blobBoxColor,
              ),
              targetColor: normalizeHexColor(blobConfig.targetColor, '#00c853'),
            }
          : null,
        face: faceConfig
          ? {
              ...faceConfig,
              boxColor: normalizeHexColor(
                faceConfig.boxColor,
                quick.faceBoxColor,
              ),
            }
          : null,
        blink: blink?.getConfig() ?? null,
      },
      ...extras,
      blobColor: quick.blobBoxColor || '#ff2222',
      faceColor: quick.faceBoxColor || '#ff2222',
      faceShowBox: !!faceFlags.showBox,
      faceShowBlur: !!faceFlags.showBlur,
      faceLabel: quick.faceLabelText || 'CARA',
      image: {
        blackAndWhite: !!image.blackAndWhite,
        exposure: readPanelNumber(image.exposure, 0),
        shadows: readPanelNumber(image.shadows, 0),
        highlights: readPanelNumber(image.highlights, 0),
        contrast: readPanelNumber(image.contrast, 100),
        saturation: readPanelNumber(image.saturation, 100),
        temperature: readPanelNumber(image.temperature, 0),
        detail: readPanelNumber(image.detail, 0),
        sharpness: readPanelNumber(image.sharpness, 0),
        jpegQuality: readPanelNumber(image.jpegQuality, 92),
        videoFormat: image.videoFormat || 'auto',
        qualityEnhancer: !!image.qualityEnhancer,
        qualityEnhancerStrength: readPanelNumber(
          image.qualityEnhancerStrength,
          35,
        ),
        shutterSound: image.shutterSound !== false,
        captureTimerSeconds: readPanelNumber(image.captureTimerSeconds, 0),
      },
      orientation: {
        flipH: !!this.host.flipH,
        flipV: !!this.host.flipV,
        rotation: Number(this.host.rotation) || 0,
      },
      profiles: this.host.profiles.names,
      selectedProfile: this.host.profiles.selected,
      previewQualityLabel: translateCurrent(
        getCurrentPreviewQualityPreset(this.host.imageSettings).label,
      ),
    });
  }

  loadJsonStorage<T>(key: string, fallbackValue: T) {
    return this.host.settingsStore.loadJson(key, fallbackValue);
  }

  notifyStorageUnavailable(err: unknown) {
    console.warn(
      'HateWebcam: no se pudieron guardar los ajustes locales.',
      err,
    );
    if (this.storageWarningShown) return;
    this.storageWarningShown = true;
    showStatus(
      this.host.dom.captureStatus || this.host.dom.profileStatus,
      'No se pudieron guardar los ajustes locales en este navegador.',
      'warning',
    );
  }

  saveJsonStorage(key: string, value: unknown) {
    return this.host.settingsStore.saveJson(key, value);
  }

  loadConfig() {
    return this.host.settingsStore.loadObject(STORAGE_KEY);
  }
  saveConfig(cfg: Record<string, unknown>) {
    return this.saveJsonStorage(STORAGE_KEY, cfg);
  }

  getFaceVisualMode(settings = this.host.quickDetectorSettings) {
    const { showBox, showBlur } = normalizeFaceVisualFlags(settings);
    return faceVisualModeFromFlags(showBox, showBlur);
  }

  private applyFaceVisualFlags(showBox: boolean, showBlur: boolean) {
    const normalized = normalizeFaceVisualFlags({
      faceShowBox: showBox,
      faceShowBlur: showBlur,
    });
    this.host.quickDetectorSettings.faceShowBox = normalized.showBox;
    this.host.quickDetectorSettings.faceShowBlur = normalized.showBlur;
    if (this.host.detectors.face) {
      this.host.detectors.face.showBox = normalized.showBox;
      this.host.detectors.face.showBlur = normalized.showBlur;
    }
    this.updateQuickDetectorControlsUI();
    this.host.detectors.updateInfo();
    this.scheduleSaveQuickDetectorSettings();
    this.scheduleSaveActiveEffectSettings();
    if (this.host.sourceMode === 'video') this.scheduleSyncSelectedClipConfig();
  }

  getMatchingImagePreset(): ImagePresetName | null {
    for (const name of Object.keys(imagePresets) as ImagePresetName[]) {
      const preset = imagePresets[name];
      const keys = Object.keys(preset) as Array<keyof typeof preset>;
      if (keys.every((key) => this.host.imageSettings[key] === preset[key]))
        return name;
    }
    return null;
  }

  isMobileFxPanelVisible() {
    return !!this.host.mobileFxOpen;
  }

  setMobileFxPanelVisible(visible: boolean) {
    this.host.mobileFxOpen = !!visible;
    this.host.capture?.publishCaptureChrome();
    if (this.host.isRunning && isMobileViewport()) {
      if (this.host.dom.videoEl && this.host.dom.videoEl.paused) {
        void this.host.dom.videoEl.play().catch(() => {});
      }
      this.host.renderer.requestPreviewRefresh(true);
    }
  }

  syncMobileViewportState() {
    if (!isMobileViewport()) {
      this.setMobileFxPanelVisible(false);
    }
  }

  loadQuickDetectorSettings(cfg: Record<string, unknown>) {
    this.host.quickDetectorSettings = readQuickDetectorSettings(
      cfg.quickDetectorSettings,
    );
  }

  saveQuickDetectorSettings() {
    const cfg = this.loadConfig();
    cfg.quickDetectorSettings = { ...this.host.quickDetectorSettings };
    this.saveConfig(cfg);
  }

  scheduleSaveQuickDetectorSettings() {
    if (this.saveQuickDetectorSettingsTimer)
      clearTimeout(this.saveQuickDetectorSettingsTimer);
    this.saveQuickDetectorSettingsTimer = setTimeout(() => {
      this.saveQuickDetectorSettingsTimer = null;
      this.saveQuickDetectorSettings();
    }, 120);
  }

  updateQuickDetectorControlsUI() {
    const faceFlags = normalizeFaceVisualFlags(this.host.quickDetectorSettings);
    this.host.quickDetectorSettings.faceShowBox = faceFlags.showBox;
    this.host.quickDetectorSettings.faceShowBlur = faceFlags.showBlur;
    this.host.capture.updateCaptureButtons();
    this.host.updateVideoEffectInspector();
    this.host.updateVideoEditorUI();
    this.publishWebcamPanel();
  }

  applyQuickDetectorSettingsToEffects() {
    if (this.host.detectors.blob)
      this.host.detectors.blob.boxColor =
        this.host.quickDetectorSettings.blobBoxColor;
    if (this.host.detectors.face) {
      this.host.detectors.face.setConfig({
        boxColor: this.host.quickDetectorSettings.faceBoxColor,
        labelText: this.host.quickDetectorSettings.faceLabelText,
        showBox: this.host.quickDetectorSettings.faceShowBox,
        showBlur: this.host.quickDetectorSettings.faceShowBlur,
        pixelationCellSize:
          this.host.quickDetectorSettings.facePixelationCellSize,
        censorPaddingPercent:
          this.host.quickDetectorSettings.faceCensorPaddingPercent,
      });
    }
  }

  syncQuickDetectorSettingsFromEffects() {
    if (this.host.detectors.blob)
      this.host.quickDetectorSettings.blobBoxColor =
        this.host.detectors.blob.boxColor ||
        this.host.quickDetectorSettings.blobBoxColor;
    if (this.host.detectors.face) {
      this.host.quickDetectorSettings.faceBoxColor =
        this.host.detectors.face.boxColor ||
        this.host.quickDetectorSettings.faceBoxColor;
      this.host.quickDetectorSettings.faceLabelText = normalizeFaceLabel(
        this.host.detectors.face.labelText,
      );
      this.host.quickDetectorSettings.faceShowBox =
        this.host.detectors.face.showBox !== false;
      this.host.quickDetectorSettings.faceShowBlur =
        !!this.host.detectors.face.showBlur;
      this.host.quickDetectorSettings.facePixelationCellSize = clamp(
        this.host.detectors.face.pixelationCellSize ||
          this.host.quickDetectorSettings.facePixelationCellSize,
        4,
        48,
      );
      this.host.quickDetectorSettings.faceCensorPaddingPercent = clamp(
        toFiniteInt(
          this.host.detectors.face.censorPaddingPercent,
          this.host.quickDetectorSettings.faceCensorPaddingPercent,
        ),
        0,
        48,
      );
    }
    this.updateQuickDetectorControlsUI();
    this.saveQuickDetectorSettings();
  }

  saveActiveEffectSettings() {
    const cfg = this.loadConfig();
    const effectSettings = { ...configObject(cfg.effectSettings) };
    cfg.effectSettings = effectSettings;

    if (this.host.detectors.blob)
      effectSettings.blob = this.host.detectors.blob.getConfig();
    if (this.host.detectors.face)
      effectSettings.face = this.host.detectors.face.getConfig();
    if (this.host.detectors.blink)
      effectSettings.blink = this.host.detectors.blink.getConfig();

    this.saveConfig(cfg);
  }

  scheduleSaveActiveEffectSettings() {
    this.host.renderer?.refreshPausedVideoPreview();
    if (this.saveEffectSettingsTimer)
      clearTimeout(this.saveEffectSettingsTimer);
    this.saveEffectSettingsTimer = setTimeout(() => {
      this.saveEffectSettingsTimer = null;
      this.saveActiveEffectSettings();
      this.scheduleSyncSelectedClipConfig();
    }, 140);
  }

  syncSelectedClipConfig() {
    const { editor, snapshotVideoEffectConfig } = this.host;
    if (
      !editor ||
      !snapshotVideoEffectConfig ||
      this.host.sourceMode !== 'video' ||
      !this.host.selectedVideoEffectId
    )
      return;
    const item = editor.timeline.items.find(
      (candidate) => candidate.id === this.host.selectedVideoEffectId,
    );
    if (!item) return;
    try {
      editor.timeline.upsert({
        ...item,
        config: snapshotVideoEffectConfig.call(this.host, item.type),
      });
      if (item.type === 'look') {
        this.host.editor?.timelineEffects.syncLook({ force: true });
      } else {
        void this.host.editor?.timelineEffects.sync(true);
      }
      this.host.renderer?.refreshPausedVideoPreview();
    } catch (err) {
      console.warn(
        'No se pudo actualizar el clip seleccionado:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  flushPendingClipConfigSync() {
    if (this.saveImageSettingsTimer) {
      clearTimeout(this.saveImageSettingsTimer);
      this.saveImageSettingsTimer = null;
      this.saveImageSettings();
    }
    if (this.syncSelectedClipConfigTimer) {
      clearTimeout(this.syncSelectedClipConfigTimer);
      this.syncSelectedClipConfigTimer = null;
    }
    this.host.syncLookClipConfigNow?.();
    this.syncSelectedClipConfig();
  }

  scheduleSyncSelectedClipConfig() {
    if (this.host.sourceMode !== 'video' || !this.host.selectedVideoEffectId)
      return;
    if (this.syncSelectedClipConfigTimer)
      clearTimeout(this.syncSelectedClipConfigTimer);
    this.syncSelectedClipConfigTimer = setTimeout(() => {
      this.syncSelectedClipConfigTimer = null;
      this.syncSelectedClipConfig();
    }, 120);
  }

  loadImageSettings(cfg: Record<string, unknown>) {
    this.host.imageSettings = readImageSettings(cfg.imageSettings);
  }

  saveImageSettings() {
    const cfg = this.loadConfig();
    cfg.imageSettings = { ...this.host.imageSettings };
    this.saveConfig(cfg);
  }

  scheduleSaveImageSettings() {
    this.host.syncLookClipConfigNow?.();
    this.host.renderer?.refreshPausedVideoPreview();
    if (this.saveImageSettingsTimer) clearTimeout(this.saveImageSettingsTimer);
    this.saveImageSettingsTimer = setTimeout(() => {
      this.saveImageSettingsTimer = null;
      this.saveImageSettings();
    }, 100);
  }

  updateImageControlsUI() {
    updateCameraSourceState({
      performanceMode: normalizePerformanceMode(
        this.host.imageSettings.performanceMode,
      ),
    });
    updateExportSettings(this.host.imageSettings);
    this.mobileActivePreset = this.getMatchingImagePreset();
    this.publishWebcamPanel();
  }

  setPanelImageNumber(key: string, value: number) {
    if (!isImageNumberControl(key) || !Number.isFinite(value)) return;
    this.host.imageSettings[key] = value;
    this.mobileActivePreset = null;
    this.scheduleSaveImageSettings();
    this.publishWebcamPanel();
  }

  setPanelBlackAndWhite(checked: boolean) {
    this.host.imageSettings.blackAndWhite = !!checked;
    this.mobileActivePreset = null;
    this.scheduleSaveImageSettings();
    this.publishWebcamPanel();
  }

  setPanelVideoFormat(format: string) {
    this.host.imageSettings.videoFormat = oneOf(
      format,
      ['auto', 'mp4', 'webm'],
      'auto',
    );
    this.saveImageSettings();
    this.publishWebcamPanel();
  }

  setPanelQualityEnhancer(checked: boolean) {
    this.host.imageSettings.qualityEnhancer = !!checked;
    this.saveImageSettings();
    this.publishWebcamPanel();
  }

  setPanelShutterSound(checked: boolean) {
    this.host.imageSettings.shutterSound = !!checked;
    this.saveImageSettings();
    this.publishWebcamPanel();
  }

  resetImageAdjustments() {
    this.host.imageSettings = {
      ...DEFAULT_IMAGE_SETTINGS,
      jpegQuality: this.host.imageSettings.jpegQuality,
      videoFormat: this.host.imageSettings.videoFormat,
      editorExportPreset: this.host.imageSettings.editorExportPreset,
      editorExportFormat: this.host.imageSettings.editorExportFormat,
      editorExportMode: this.host.imageSettings.editorExportMode,
      editorCopyAudio: this.host.imageSettings.editorCopyAudio,
      experimentalExportFeatures:
        this.host.imageSettings.experimentalExportFeatures,
      effectsExportChroma: this.host.imageSettings.effectsExportChroma,
      previewQuality: this.host.imageSettings.previewQuality,
      performanceMode: this.host.imageSettings.performanceMode,
      qualityEnhancer: this.host.imageSettings.qualityEnhancer,
      qualityEnhancerStrength: this.host.imageSettings.qualityEnhancerStrength,
    };
    this.mobileActivePreset = null;
    this.updateImageControlsUI();
    this.scheduleSaveImageSettings();
  }

  setQuickBlobColor(color: string) {
    this.host.quickDetectorSettings.blobBoxColor = color;
    if (this.host.detectors.blob) this.host.detectors.blob.boxColor = color;
    this.updateQuickDetectorControlsUI();
    this.scheduleSaveQuickDetectorSettings();
    this.scheduleSaveActiveEffectSettings();
  }

  setDetectorOptions(...[kind, options]: DetectorUpdate) {
    const { blob, face, blink } = this.host.detectors;
    switch (kind) {
      case 'blob':
        blob?.setConfig(options);
        break;
      case 'face':
        if (face) {
          face.setConfig(options);
          if (
            options.pixelationCellSize !== undefined ||
            options.censorPaddingPercent !== undefined
          ) {
            this.host.quickDetectorSettings.facePixelationCellSize =
              face.pixelationCellSize;
            this.host.quickDetectorSettings.faceCensorPaddingPercent =
              face.censorPaddingPercent;
            this.scheduleSaveQuickDetectorSettings();
          }
        }
        break;
      case 'blink':
        blink?.setConfig(options);
        break;
    }
    this.publishWebcamPanel();
    this.scheduleSaveActiveEffectSettings();
  }

  setTargetColor(color: string) {
    if (!this.host.detectors.blob?.setColorFromHex(color)) return;
    setColorPickFeedback('advanced', {
      message: 'Color objetivo actualizado.',
      type: 'success',
    });
    this.publishWebcamPanel();
    this.scheduleSaveActiveEffectSettings();
  }

  setQuickFaceColor(color: string) {
    this.host.quickDetectorSettings.faceBoxColor = color;
    if (this.host.detectors.face) this.host.detectors.face.boxColor = color;
    this.updateQuickDetectorControlsUI();
    this.scheduleSaveQuickDetectorSettings();
    this.scheduleSaveActiveEffectSettings();
  }

  setQuickFaceLabel(value: string) {
    const next = String(value || '').slice(0, 28);
    this.host.quickDetectorSettings.faceLabelText = next || 'CARA';
    if (this.host.detectors.face) this.host.detectors.face.labelText = next;
    this.scheduleSaveQuickDetectorSettings();
    this.scheduleSaveActiveEffectSettings();
    this.publishWebcamPanel();
  }

  commitQuickFaceLabel(value: string) {
    const normalized = normalizeFaceLabel(value);
    this.host.quickDetectorSettings.faceLabelText = normalized;
    if (this.host.detectors.face)
      this.host.detectors.face.labelText = normalized;
    this.saveQuickDetectorSettings();
    this.saveActiveEffectSettings();
    this.publishWebcamPanel();
  }

  setFaceVisualChecked(kind: FaceVisualKind, checked: boolean) {
    let showBox =
      kind === 'box' ? checked : !!this.host.quickDetectorSettings.faceShowBox;
    let showBlur =
      kind === 'blur'
        ? checked
        : !!this.host.quickDetectorSettings.faceShowBlur;
    if (!showBox && !showBlur) {
      if (kind === 'box') showBox = true;
      else showBlur = true;
    }
    this.applyFaceVisualFlags(showBox, showBlur);
  }

  setExportSetting(setting: ExportSetting, value: string | boolean) {
    if (this.host.editor?.exportSession.active) return;
    const image = this.host.imageSettings;
    switch (setting) {
      case 'editorExportPreset':
        applyEditorExportPreset(image, String(value));
        break;
      case 'editorExportMode':
        image.editorExportMode = oneOf(
          value,
          ['full', 'effects-chroma'],
          'full',
        );
        break;
      case 'editorExportFormat':
        image.editorExportFormat = oneOf(
          value,
          ['auto', 'mp4', 'webm'],
          'webm',
        );
        break;
      case 'experimentalExportFeatures':
        image.experimentalExportFeatures = value === true;
        break;
      case 'editorCopyAudio':
        image.editorCopyAudio = value === true;
        break;
      case 'effectsExportChroma':
        image.effectsExportChroma = oneOf(value, ['green', 'blue'], 'green');
        break;
    }
    if (!image.experimentalExportFeatures) {
      image.editorExportFormat = 'webm';
      image.editorCopyAudio = false;
    }
    this.updateImageControlsUI();
    this.host.updateVideoEditorUI();
    this.saveImageSettings();
  }

  setCaptureTimerSeconds(value: unknown) {
    this.host.imageSettings.captureTimerSeconds =
      normalizeCaptureTimerSeconds(value);
    this.publishWebcamPanel();
    this.saveImageSettings();
  }

  syncMirrorControls() {
    updateCameraSourceState({ mirrored: !!this.host.flipH });
    this.publishWebcamPanel();
  }

  toggleMirrorQuick() {
    this.host.camera.setTransform({ flipH: !this.host.flipH });
  }

  async resetWebcamConfiguration() {
    if (
      !confirm(
        translateCurrent(
          '¿Restablecer toda la configuración de webcam? Los perfiles guardados no se eliminarán.',
        ),
      )
    )
      return;
    this.host.capture.cancelPhotoCountdown(false);
    const editorKeys = [
      'editorExportPreset',
      'editorExportFormat',
      'editorExportMode',
      'editorCopyAudio',
      'experimentalExportFeatures',
      'effectsExportChroma',
    ] as const;
    const preservedEditorSettings = Object.fromEntries(
      editorKeys.map((key) => [key, this.host.imageSettings[key]]),
    );
    this.host.imageSettings = {
      ...DEFAULT_IMAGE_SETTINGS,
      ...preservedEditorSettings,
    };
    this.host.flipH = false;
    this.host.flipV = false;
    this.host.rotation = 0;
    this.host.quickDetectorSettings = { ...DEFAULT_QUICK_DETECTOR_SETTINGS };
    this.syncMirrorControls();

    this.host.detectors.dispose();
    this.host.detectors.updateInfo(true);

    await this.host.camera.applyPerformanceMode(
      DEFAULT_IMAGE_SETTINGS.performanceMode,
      {
        restartCamera: false,
        notify: false,
        save: false,
      },
    );
    this.mobileActivePreset = 'natural';
    this.updateImageControlsUI();
    this.updateQuickDetectorControlsUI();

    const cfg = this.loadConfig();
    cfg.flipH = false;
    cfg.flipV = false;
    cfg.rotation = 0;
    cfg.imageSettings = { ...this.host.imageSettings };
    cfg.quickDetectorSettings = { ...this.host.quickDetectorSettings };
    cfg.activeDetectors = { blob: false, face: false, blink: false };
    const effectSettings = { ...configObject(cfg.effectSettings) };
    cfg.effectSettings = effectSettings;
    delete effectSettings.blob;
    delete effectSettings.face;
    delete effectSettings.blink;
    this.saveConfig(cfg);
    showStatus(
      this.host.dom.captureStatus,
      'Configuración de webcam restablecida',
      'success',
    );
    setTimeout(() => hideStatus(this.host.dom.captureStatus), 2200);
  }

  applyImagePreset(name: string) {
    if (!Object.hasOwn(imagePresets, name)) return;
    const preset = name as ImagePresetName;
    this.host.imageSettings = {
      ...this.host.imageSettings,
      ...imagePresets[preset],
    };
    this.mobileActivePreset = preset;
    this.updateImageControlsUI();
    this.scheduleSaveImageSettings();
  }

  setAdvancedOptionsVisible(visible: boolean) {
    this.advancedOptionsOpen = Boolean(visible);
    this.publishWebcamPanel();
  }

  toggleAdvancedOptions() {
    const nextVisible = !this.advancedOptionsOpen;
    this.setAdvancedOptionsVisible(nextVisible);

    const cfg = this.loadConfig();
    cfg.showAdvancedOptions = nextVisible;
    this.saveConfig(cfg);
  }
}
