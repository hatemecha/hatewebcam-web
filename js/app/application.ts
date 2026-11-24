import editorEntryUrl from 'virtual:editor-entry-url';
import type { SourceMode } from '../../src/lib/editor/editor-state.ts';
import type { DetectorKind } from '../../src/lib/webcam/types.ts';
import { ColorPicker } from './color-pick.ts';
import {
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_QUICK_DETECTOR_SETTINGS,
  type ImageSettings,
} from './constants.ts';
import { Detectors } from './detectors.ts';
import { readAppDom } from './dom.ts';
import { showStatus } from './feedback.ts';
import { initializeWebcam } from './init.ts';
import { PreviewRenderer } from './preview-renderer.ts';
import { RenderEngine } from './render-engine.ts';
import { SettingsStore } from './settings-store.ts';
import type { VideoEditorSession } from './video-editor/session.ts';
import { WebcamCamera } from './webcam-camera.ts';
import { WebcamCapture } from './webcam-capture.ts';
import { bindWebcamEvents } from './webcam-events.ts';
import { WebcamPreferences } from './webcam-preferences.ts';
import { WebcamProfiles } from './webcam-profiles.ts';

export class WebcamApplication {
  readonly dom = readAppDom();
  readonly canvas = this.dom.canvas;
  readonly ctx = this.dom.ctx;
  readonly videoEl = this.dom.videoEl;
  readonly previewWrapper = this.dom.previewWrapper;
  readonly captureStatus = this.dom.captureStatus;
  readonly videoEditorStatus = this.dom.videoEditorStatus;

  readonly settingsStore = new SettingsStore({
    onError: (error) => this.preferences.notifyStorageUnavailable(error),
  });
  readonly renderEngine = new RenderEngine();
  readonly preferences: WebcamPreferences = new WebcamPreferences(this);
  readonly profiles: WebcamProfiles = new WebcamProfiles(this);
  readonly camera: WebcamCamera = new WebcamCamera(this);
  readonly renderer: PreviewRenderer = new PreviewRenderer(this);
  readonly detectors: Detectors = new Detectors(this);
  readonly capture: WebcamCapture = new WebcamCapture(this);
  readonly colorPicker = new ColorPicker(this);

  imageSettings: ImageSettings = { ...DEFAULT_IMAGE_SETTINGS };
  quickDetectorSettings = { ...DEFAULT_QUICK_DETECTOR_SETTINGS };
  flipH = false;
  flipV = false;
  rotation = 0;
  isRunning = false;
  isPageVisible = document.visibilityState !== 'hidden';
  mobileFxOpen = false;
  sourceMode: SourceMode = 'camera';
  editor: VideoEditorSession | null = null;
  private requestedMode: SourceMode = 'camera';
  private editorLoad: Promise<VideoEditorSession | null> | null = null;
  private editorLoadAttempt = 0;
  private signal: AbortSignal | undefined;

  async start() {
    const lifecycle = bindWebcamEvents(this);
    this.signal = lifecycle.signal;
    try {
      await initializeWebcam(this);
      return lifecycle;
    } catch (error) {
      lifecycle.dispose();
      throw error;
    }
  }

  private loadEditor(): Promise<VideoEditorSession | null> {
    if (this.editorLoad) return this.editorLoad;
    const entry = new URL(editorEntryUrl, import.meta.url);
    // Browsers cache a failed module fetch for its original URL.
    if (this.editorLoadAttempt > 0)
      entry.searchParams.set('retry', String(this.editorLoadAttempt));
    this.editorLoadAttempt += 1;
    this.editorLoad = import(/* @vite-ignore */ entry.href)
      .then(({ createVideoEditor }: typeof import('./editor-install.ts')) => {
        if (this.signal?.aborted) return null;
        const editor = createVideoEditor(this, this.dom);
        this.editor = editor;
        try {
          editor.start(this.dom.visualFxInspectorHost);
          return editor;
        } catch (error) {
          editor.dispose();
          this.editor = null;
          throw error;
        }
      })
      .catch((error: unknown) => {
        this.editorLoad = null;
        if (!this.signal?.aborted) {
          console.error('Error loading the video editor:', error);
          showStatus(
            this.captureStatus,
            'No se pudo abrir el editor. Volvé a intentarlo.',
            'error',
          );
        }
        return null;
      });
    return this.editorLoad;
  }

  async setSourceMode(mode: SourceMode): Promise<void> {
    if (this.editor?.exportSession.active || this.signal?.aborted) return;
    this.requestedMode = mode;
    if (mode === this.sourceMode) return;
    if (
      mode === 'video' &&
      (!(await this.loadEditor()) || this.requestedMode !== mode)
    )
      return;
    this.editor?.sourceController.setMode(mode);
  }

  async importVideoFile(file: File): Promise<void> {
    if (this.requestedMode === 'video') await this.setSourceMode('video');
    if (this.sourceMode === 'video')
      await this.editor?.sourceController.load(file);
  }

  async importEditorProjectFile(file: File): Promise<void> {
    if (this.requestedMode === 'video') await this.setSourceMode('video');
    if (this.sourceMode === 'video') await this.editor?.projects.load(file);
  }

  handleDetectorToggle(type: DetectorKind, checked: boolean): void {
    if (this.sourceMode === 'video') {
      void this.editor?.timelineEffects.sync(true);
    } else {
      void this.detectors.setEnabled(type, checked);
    }
  }
}
