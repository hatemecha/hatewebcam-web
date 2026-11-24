import type { WebcamPreferences } from './webcam-preferences.ts';
import { BlinkDetection } from '../effects/blink-detection.ts';
import { BlobTracking } from '../effects/blob-tracking.ts';
import { EffectManager } from '../effects/effect-manager.ts';
import { FaceDetection } from '../effects/face-detection.ts';
import { translateCurrent } from '../../src/lib/i18n/translate.ts';
import { updateDetectorChip } from '../../src/lib/preview/preview-bridge.ts';
import type { DetectorKind } from '../../src/lib/webcam/types.ts';
import {
  STORAGE_KEY,
  type DEFAULT_QUICK_DETECTOR_SETTINGS,
} from './constants.ts';
import { ensureFaceMeshLoaded } from './face-mesh-loader.ts';
import { hideStatus, showStatus } from './feedback.ts';
import type { SettingsStore } from './settings-store.ts';

const kinds = ['blob', 'face', 'blink'] as const;
type MeshDetector = 'face' | 'blink';

interface DetectorHost {
  sourceMode: 'camera' | 'video';
  settingsStore: SettingsStore;
  captureStatus: HTMLElement | null;
  capture: { recording: boolean };
  camera: { applyDetectorPerformanceProfile(): void };
  quickDetectorSettings: typeof DEFAULT_QUICK_DETECTOR_SETTINGS;
  preferences: Pick<
    WebcamPreferences,
    | 'applyQuickDetectorSettingsToEffects'
    | 'syncQuickDetectorSettingsFromEffects'
    | 'updateQuickDetectorControlsUI'
    | 'saveActiveEffectSettings'
    | 'publishWebcamPanel'
  >;
  renderEffectConfig(): void;
}

export class Detectors {
  readonly manager = new EffectManager();
  blob: BlobTracking | null = null;
  face: FaceDetection | null = null;
  blink: BlinkDetection | null = null;
  private faceRequests = { face: 0, blink: 0 };
  private enabled = { blob: false, face: false, blink: false };
  private loading = { face: false, blink: false };
  private lastInfoUpdate = 0;

  constructor(private readonly host: DetectorHost) {}

  get selection(): Readonly<Record<DetectorKind, boolean>> {
    return this.enabled;
  }

  get busy(): Readonly<Record<MeshDetector, boolean>> {
    return this.loading;
  }

  async setEnabled(
    type: DetectorKind,
    enabled: boolean,
    { quiet = false } = {},
  ): Promise<void> {
    this.enabled[type] = enabled;
    if (type === 'blob') {
      this.toggleColor(enabled);
    } else {
      const request = ++this.faceRequests[type];
      if (enabled) {
        if (!(await this.prepareFaceMesh(type, request, quiet))) return;
        this.enableFaceEffect(type);
        if (!quiet && !this.host.capture.recording) {
          setTimeout(() => hideStatus(this.host.captureStatus), 1200);
        }
      } else {
        this.remove(type);
        this.loading[type] = false;
      }
      this.blink?.setLandmarkSource(this.face);
    }

    if (!quiet) {
      this.host.preferences.syncQuickDetectorSettingsFromEffects();
      this.host.preferences.saveActiveEffectSettings();
      this.host.renderEffectConfig();
      this.updateInfo();
      this.saveActivation();
    }
  }

  private toggleColor(enabled: boolean): void {
    if (enabled) {
      if (!this.blob) {
        this.blob = new BlobTracking();
        const saved = this.saved().blob;
        if (saved) this.blob.setConfig(saved);
        this.blob.boxColor = this.host.quickDetectorSettings.blobBoxColor;
        this.host.camera.applyDetectorPerformanceProfile();
        this.manager.addEffect(this.blob);
      }
      this.blink?.setBlinkCallback((eye) => this.blob?.triggerConnection(eye));
    } else {
      this.remove('blob');
      this.blink?.setBlinkCallback(null);
    }
  }

  private async prepareFaceMesh(
    type: MeshDetector,
    request: number,
    quiet: boolean,
  ): Promise<boolean> {
    if (!quiet) {
      showStatus(
        this.host.captureStatus,
        type === 'face'
          ? 'Cargando detector de caras...'
          : 'Cargando detector de pestañeos...',
        'info',
      );
    }
    this.loading[type] = true;
    this.host.preferences.publishWebcamPanel();
    try {
      await ensureFaceMeshLoaded();
      return request === this.faceRequests[type] && this.enabled[type];
    } catch (error) {
      if (request === this.faceRequests[type]) {
        console.error('No se pudo cargar MediaPipe Face Mesh:', error);
        if (!quiet) {
          showStatus(
            this.host.captureStatus,
            type === 'face'
              ? 'No se pudo cargar el detector de caras'
              : 'No se pudo cargar el detector de pestañeos',
            'error',
          );
        }
        this.enabled[type] = false;
      }
      return false;
    } finally {
      if (request === this.faceRequests[type]) {
        this.loading[type] = false;
        this.host.preferences.publishWebcamPanel();
      }
    }
  }

  private enableFaceEffect(type: 'face' | 'blink'): void {
    if (type === 'face') {
      if (!this.face) {
        this.face = new FaceDetection();
        const saved = this.saved().face;
        if (saved) this.face.setConfig(saved);
        this.host.preferences.applyQuickDetectorSettingsToEffects();
        this.host.camera.applyDetectorPerformanceProfile();
        this.manager.addEffect(this.face);
      } else {
        this.host.preferences.applyQuickDetectorSettingsToEffects();
      }
    } else {
      if (!this.blink) {
        this.blink = new BlinkDetection({ landmarkSource: this.face });
        const saved = this.saved().blink;
        if (saved) this.blink.setConfig(saved);
        this.host.camera.applyDetectorPerformanceProfile();
        this.manager.addEffect(this.blink);
      }
      this.blink.setBlinkCallback(
        this.blob ? (eye) => this.blob?.triggerConnection(eye) : null,
      );
    }
  }

  private remove(type: DetectorKind): void {
    const effect = this[type];
    if (effect) {
      this.manager.removeEffect(effect);
      effect.dispose?.();
    }
    this[type] = null;
  }

  private saved() {
    type StoredEffects = Partial<{
      [Kind in DetectorKind]: Parameters<
        NonNullable<Detectors[Kind]>['setConfig']
      >[0];
    }>;
    return (
      this.host.settingsStore.loadObject<{ effectSettings?: StoredEffects }>(
        STORAGE_KEY,
      ).effectSettings ?? {}
    );
  }

  private saveActivation(): void {
    if (this.host.sourceMode === 'video') return;
    const config = this.host.settingsStore.loadObject(STORAGE_KEY);
    config.activeDetectors = { ...this.enabled };
    this.host.settingsStore.saveJson(STORAGE_KEY, config);
  }

  async restore(config: Record<string, unknown>): Promise<void> {
    const active = config.activeDetectors;
    if (active !== null && typeof active === 'object') {
      const selection = active as Partial<Record<DetectorKind, unknown>>;
      for (const type of kinds) {
        if (this.host.sourceMode !== 'camera') return;
        if (!selection[type]) continue;
        await this.setEnabled(type, true);
      }
    }
    this.host.preferences.updateQuickDetectorControlsUI();
  }

  updateInfo(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastInfoUpdate < 200) return;
    this.lastInfoUpdate = now;

    const blob = this.blob?.getDetectionSummary();
    const face = this.face?.getDetectionSummary();
    const blink = this.blink?.getDetectionSummary();
    updateDetectorChip('blob', {
      text: translateCurrent(
        !blob
          ? 'Color'
          : blob.count > 0
            ? 'Color encontrado'
            : 'Color · buscando',
      ),
      state: blob?.status ?? 'off',
    });
    updateDetectorChip('face', {
      text:
        face && face.count > 0 && face.status !== 'error'
          ? translateCurrent(
              face.count === 1 ? '{count} cara' : '{count} caras',
              { count: face.count },
            )
          : translateCurrent(
              !face
                ? 'Caras'
                : face.status === 'error'
                  ? 'Caras · error'
                  : 'Caras · buscando',
            ),
      state: face?.status ?? 'off',
    });
    updateDetectorChip('blink', {
      text: translateCurrent(
        !blink
          ? 'Pestañeos'
          : blink.status === 'error'
            ? 'Pestañeos · error'
            : blink.detected
              ? 'Pestañeo'
              : 'Pestañeos · activos',
      ),
      state: blink?.status ?? 'off',
    });
  }

  dispose(): void {
    this.faceRequests.face += 1;
    this.faceRequests.blink += 1;
    this.loading.face = false;
    this.loading.blink = false;
    for (const type of kinds) {
      this.enabled[type] = false;
      this.remove(type);
    }
  }
}
