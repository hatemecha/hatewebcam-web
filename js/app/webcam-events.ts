import type { ColorPicker } from './color-pick.ts';
import type { Detectors } from './detectors.ts';
import type { readAppDom } from './dom.ts';
import type { PreviewRenderer } from './preview-renderer.ts';
import type { VideoEditorSession } from './video-editor/session.ts';
import type { WebcamCamera } from './webcam-camera.ts';
import type { WebcamCapture } from './webcam-capture.ts';
import type { WebcamPreferences } from './webcam-preferences.ts';

interface WebcamEventHost {
  dom: ReturnType<typeof readAppDom>;
  isPageVisible: boolean;
  isRunning: boolean;
  camera: WebcamCamera;
  capture: WebcamCapture;
  colorPicker: ColorPicker;
  detectors: Detectors;
  editor: VideoEditorSession | null;
  preferences: WebcamPreferences;
  renderer: PreviewRenderer;
}

export function bindWebcamEvents(host: WebcamEventHost) {
  const controller = new AbortController();
  const { signal } = controller;
  const { camera, capture, colorPicker, detectors, preferences, renderer } =
    host;
  host.dom.canvas.addEventListener(
    'click',
    (event) => colorPicker.sample(event),
    { signal },
  );
  window.addEventListener(
    'keydown',
    (event) => capture.onGlobalKeyDown(event),
    { signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      host.isPageVisible = document.visibilityState !== 'hidden';
      if (host.editor?.exportSession.active || !host.isRunning) return;
      if (!host.isPageVisible) {
        renderer.cancelRenderLoop();
      } else if (!renderer.hasPendingFrame) {
        renderer.resetCadence();
        renderer.scheduleRenderLoop();
      }
    },
    { signal },
  );
  window.addEventListener(
    'resize',
    () => {
      preferences.syncMobileViewportState();
      renderer.requestPreviewRefresh(true);
    },
    { signal },
  );
  const dispose = () => {
    if (signal.aborted) return;
    controller.abort();
    colorPicker.cancel();
    renderer.dispose();
    capture.dispose();
    detectors.dispose();
    camera.stop();
    host.editor?.dispose();
  };
  window.addEventListener('beforeunload', dispose, { signal });
  return { signal, dispose };
}
