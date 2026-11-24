import type { WebcamPreferences } from '../webcam-preferences.ts';
import {
  updateEditorUiState,
  type SourceMode,
} from '../../../src/lib/editor/editor-state.ts';
import type { MessageKey } from '../../../src/lib/i18n/catalog.ts';
import { updateShellState } from '../../../src/lib/shell/shell-bridge.ts';
import { VideoTimeline } from '../../editor/video-timeline.ts';
import {
  calculateFrameRateFromMediaTimes,
  calculateSourceAverageBitrate,
} from '../../video-export.ts';
import type { ColorPicker } from '../color-pick.ts';
import type { ImageSettings } from '../constants.ts';
import type { Detectors } from '../detectors.ts';
import { hideStatus, showStatus } from '../feedback.ts';
import {
  formatBytes,
  formatDurationDetailed,
  formatVideoBitrate,
  formatVideoFps,
} from '../media-format.ts';
import type { PreviewRenderer } from '../preview-renderer.ts';
import type { WebcamCamera } from '../webcam-camera.ts';
import type { WebcamCapture } from '../webcam-capture.ts';
import type { VideoEditorSession } from './session.ts';
import { detectVideoSourceFps } from './video-frame-rate.ts';

type DetectorConfig<T extends 'blob' | 'face' | 'blink'> = ReturnType<
  NonNullable<Detectors[T]>['getConfig']
>;
interface WebcamSnapshot {
  image: ImageSettings;
  selection: Record<'blob' | 'face' | 'blink', boolean>;
  blob?: DetectorConfig<'blob'>;
  face?: DetectorConfig<'face'>;
  blink?: DetectorConfig<'blink'>;
}

export interface SourceHost {
  sourceMode: SourceMode;
  isRunning: boolean;
  videoEl: HTMLVideoElement;
  videoEditorStatus: HTMLElement | null;
  imageSettings: ImageSettings;
  camera: WebcamCamera;
  capture: WebcamCapture;
  colorPicker: ColorPicker;
  detectors: Detectors;
  renderer: PreviewRenderer;
  enterVideoUI(): void;
  leaveVideoUI(): void;
  resetVideoTimelineUI(): void;
  prepareSourceUI(duration: number): void;
  preferences: Pick<
    WebcamPreferences,
    'updateImageControlsUI' | 'updateQuickDetectorControlsUI'
  >;
  updateVideoEditorUI(): void;
  renderVideoTimeline(): void;
  applyTimelineZoom(): void;
  cancelVideoExport(): void;
}

const projectMessages = {
  none: 'Video listo.',
  restored: 'Proyecto restaurado con el video reimportado.',
  mismatch:
    'El video no coincide con el proyecto cargado. Elegí el archivo original.',
} satisfies Record<string, MessageKey>;

export class EditorSourceController {
  private webcam: WebcamSnapshot | null = null;
  private modeRequest = 0;

  constructor(
    private readonly editor: VideoEditorSession,
    private readonly host: SourceHost,
  ) {}

  setMode(mode: SourceMode): void {
    if (mode === this.host.sourceMode || this.editor.exportSession.active)
      return;
    const request = ++this.modeRequest;
    this.host.colorPicker.cancel();
    if (mode === 'video') this.enterVideo();
    else this.clear();

    this.host.sourceMode = mode;
    document.body.classList.toggle('video-mode', mode === 'video');
    for (const element of document.querySelectorAll('.webcam-only')) {
      element.classList.toggle('hidden', mode === 'video');
    }
    updateEditorUiState({ mode });
    updateShellState({ mode });
    if (mode === 'video') {
      this.host.enterVideoUI();
      this.host.renderer.clearPreviewCanvas();
      this.clearDetectors();
      this.host.updateVideoEditorUI();
    } else {
      delete document.body.dataset.editorTool;
      this.host.leaveVideoUI();
      this.host.camera.setCameraPlaceholderMessage(
        'Iniciando cámara automáticamente...',
      );
      void this.restoreWebcam(request);
      void this.host.camera.toggleCamera(true);
    }
    this.host.camera.updatePreviewPlaceholder();
  }

  private enterVideo(): void {
    const { detectors, capture, camera, renderer } = this.host;
    this.webcam ??= {
      image: { ...this.host.imageSettings },
      selection: { ...detectors.selection },
      blob: detectors.blob?.getConfig(),
      face: detectors.face?.getConfig(),
      blink: detectors.blink?.getConfig(),
    };
    if (capture.recording) capture.stopRecording(true);
    capture.cancelPhotoCountdown(false);
    camera.stop();
    this.host.isRunning = false;
    renderer.cancelRenderLoop();
    camera.setCameraState('off');
  }

  private async restoreWebcam(request: number): Promise<void> {
    const snapshot = this.webcam;
    if (!snapshot) return;
    const { detectors } = this.host;
    this.host.imageSettings = { ...snapshot.image };
    this.host.preferences.updateImageControlsUI();
    for (const type of ['blob', 'face', 'blink'] as const) {
      if (request !== this.modeRequest) return;
      if (!snapshot.selection[type]) continue;
      await detectors.setEnabled(type, true);
      if (request !== this.modeRequest) return;
      if (type === 'blob' && snapshot.blob)
        detectors.blob?.setConfig(snapshot.blob);
      if (type === 'face' && snapshot.face)
        detectors.face?.setConfig(snapshot.face);
      if (type === 'blink' && snapshot.blink)
        detectors.blink?.setConfig(snapshot.blink);
    }
    this.webcam = null;
    this.host.preferences.updateQuickDetectorControlsUI();
    detectors.updateInfo();
  }

  private clearDetectors(): void {
    this.host.detectors.dispose();
    this.host.preferences.updateQuickDetectorControlsUI();
    this.host.detectors.updateInfo(true);
  }

  private clear(): void {
    if (this.editor.exportSession.active) this.host.cancelVideoExport();
    this.editor.source.dispose();
    this.host.renderer.cancelRenderLoop();
    this.host.isRunning = false;
    this.editor.timeline = new VideoTimeline();
    this.editor.transport.update();
    this.editor.history.clear();
    this.editor.editAssist.reset();
    this.editor.timelineEffects.reset();
    this.host.resetVideoTimelineUI();
    this.editor.visualFx.reset(true);
    updateEditorUiState({
      sourceDetails: '',
      hasSource: false,
      canExport: false,
    });
    updateShellState({ exportEnabled: false });
    if (this.host.sourceMode === 'video') {
      this.clearDetectors();
      this.host.renderer.clearPreviewCanvas();
    }
    this.host.camera.updatePreviewPlaceholder();
  }

  async load(file: File): Promise<void> {
    if (this.host.sourceMode !== 'video' || this.editor.exportSession.active)
      return;
    if (!file.type.startsWith('video/')) {
      showStatus(
        this.host.videoEditorStatus,
        'Elegí un archivo de video válido.',
        'error',
      );
      return;
    }

    this.clear();
    const { videoEl: video, renderer } = this.host;
    let signal: AbortSignal | undefined;
    try {
      const request = this.editor.source.open(file);
      signal = request.signal;
      this.host.camera.showVideoPlaceholderLoading();
      await request.ready;
      signal.throwIfAborted();
      if (
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        !video.videoWidth ||
        !video.videoHeight
      ) {
        throw new Error('video_metadata_invalid');
      }
      video.currentTime = Math.min(0.001, video.duration);
      const fps = await detectVideoSourceFps(
        video,
        calculateFrameRateFromMediaTimes,
        signal,
      );
      const averageBitrate = calculateSourceAverageBitrate(
        file.size,
        video.duration,
      );
      this.editor.source.finishLoading(signal, fps, averageBitrate);
      this.editor.timeline.setDuration(video.duration);
      this.editor.timelineEffects.initializeLook();
      this.host.isRunning = true;
      this.host.camera.updatePreviewPlaceholder();
      this.host.prepareSourceUI(video.duration);
      const restore = this.editor.projects.restorePending(file);
      updateEditorUiState({
        sourceDetails: `${file.name} · ${formatBytes(file.size)} · ${video.videoWidth}×${video.videoHeight} · ${formatDurationDetailed(video.duration)} · ${formatVideoFps(fps)} FPS · ${formatVideoBitrate(averageBitrate)}`,
      });
      renderer.resetCadence();
      renderer.syncPreviewCanvasMetrics(
        video.videoWidth,
        video.videoHeight,
        true,
      );
      renderer.scheduleRenderLoop();
      this.host.renderVideoTimeline();
      await this.editor.timelineEffects.sync(true);
      signal.throwIfAborted();
      this.host.updateVideoEditorUI();
      this.host.applyTimelineZoom();
      showStatus(
        this.host.videoEditorStatus,
        projectMessages[restore],
        restore === 'mismatch' ? 'warning' : 'success',
      );
      setTimeout(() => {
        if (!signal?.aborted) hideStatus(this.host.videoEditorStatus);
      }, 1800);
    } catch (error) {
      if (signal?.aborted || this.host.sourceMode !== 'video') return;
      console.error('Error loading video:', error);
      this.clear();
      showStatus(
        this.host.videoEditorStatus,
        error instanceof Error && error.message === 'video_metadata_invalid'
          ? 'El video no contiene resolución o duración válidas.'
          : 'El navegador no puede decodificar este archivo.',
        'error',
      );
      this.host.updateVideoEditorUI();
    }
  }
}
