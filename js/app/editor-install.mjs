/**
 * Lazy editor entry point.
 *
 * Everything imported here belongs to the video editor and is only fetched
 * when the user switches to Video mode. Keeping this module out of the
 * bootstrap graph is what lets the webcam start without the timeline, export
 * encoder or Visual FX engine.
 */
import { updateEditorUiState } from '../../src/lib/editor/editor-state.ts';
import { updateEditAssistPanel } from '../../src/lib/editor/edit-assist-panel.ts';
import { VideoEditorSession } from './video-editor/session.ts';
import { applyLocalvideoeditorMixin } from './video-editor.mjs';
import { applyVisualFxLabMixin } from './visual-fx-lab.mjs';

/**
 * @param {import('./controller.mjs').AppController} app
 */
export async function installVideoEditor(app) {
  if (app.editor) return app.editor;

  applyLocalvideoeditorMixin(app);
  applyVisualFxLabMixin(app);

  const editor = new VideoEditorSession({
    video: app.videoEl,
    sourceHost: app,
    formatTime: (seconds) => app.formatDurationDetailed(seconds),
    editAssist: {
      updatePanel: updateEditAssistPanel,
      pushHistory: () => app.pushTimelineHistory(),
      renderTimeline: () => app.renderVideoTimeline(),
      updateTimelineHint: () => app.updateTimelineHint(),
    },
    projects: {
      getImageSettings: () => app.imageSettings,
      showStatus: (message, type) =>
        app.showStatus(app.videoEditorStatus, message, type),
      onRestore: () => {
        app.selectedVideoEffectId = '';
        app.selectedVideoEffectIds = new Set();
        app.timelineClipboard = null;
        app.updateEditorHistoryButtons();
        if (app.videoTrimStart)
          app.videoTrimStart.value = String(editor.timeline.trimStart);
        if (app.videoTrimEnd)
          app.videoTrimEnd.value = String(editor.timeline.trimEnd);
        app.preferences.updateImageControlsUI();
        app.updateTimelineClipboardStatus();
        app.renderVideoTimeline();
        app.updateVideoEditorUI();
        if (editor.source.file) void app.editor?.timelineEffects.sync(true);
      },
    },
    visualFx: {
      getSelection: () => app.getSelectedVideoEffectItem(),
      hasSource: () =>
        app.sourceMode === 'video' && Boolean(editor.source.file),
      pushHistory: () => app.pushTimelineHistory(),
      renderTimeline: () => app.renderVideoTimeline(),
      refreshPreview: () => app.renderer.refreshPausedVideoPreview(),
      publishVisibility: (visible, status) =>
        updateEditorUiState({
          visualFxSelected: visible,
          visualFxStatus: status,
        }),
    },
    transport: {
      playhead: app.timelinePlayhead,
      inVideoMode: () => app.sourceMode === 'video',
      cancelRender: () => app.renderer.cancelRenderLoop(),
      ensureRender: () => {
        if (!app.renderer.hasPendingFrame) app.renderer.scheduleRenderLoop();
      },
      onSeek: () => {
        editor.visualFx.activeEffect?.onSeek();
      },
      onSeeked: () => {
        void app.editor?.timelineEffects.sync();
        app.renderer.refreshPausedVideoPreview();
      },
      onPlayFailure: () =>
        app.showStatus(
          app.videoEditorStatus,
          'No se pudo reproducir el video.',
          'error',
        ),
    },
  });

  app.editor = editor;
  app.bindVideoEditorEvents();
  app.bindTimelinePaletteDrag();
  app.bindEditorSplitters();
  editor.transport.bind();
  editor.mountInspector(app.visualFxInspectorHost);
  editor.editAssist.updateUI();
  app.updateVideoEditorUI();
  return editor;
}
