/**
 * Lazy editor entry point.
 *
 * Everything imported here belongs to the video editor and is only fetched
 * when the user switches to Video mode. Keeping this module out of the
 * bootstrap graph is what lets the webcam start without the timeline, export
 * encoder or Visual FX engine.
 */
import { updateEditAssistPanel } from '../../src/lib/editor/edit-assist-panel.ts';
import { VideoEditorSession } from './video-editor/session.ts';
import { applyLocalvideoeditorMixin } from './video-editor.mjs';
import { applyVisualFxIntegrationMixin } from './visual-fx-integration.mjs';
import { applyVisualFxUIMixin } from './visual-fx-ui.mjs';
import { applyVisualFxLabMixin } from './visual-fx-lab.mjs';

/**
 * @param {import('./controller.mjs').AppController} app
 */
export async function installVideoEditor(app) {
  if (app.editor) return app.editor;

  applyLocalvideoeditorMixin(app);
  applyVisualFxIntegrationMixin(app);
  applyVisualFxUIMixin(app);
  applyVisualFxLabMixin(app);

  const editor = new VideoEditorSession({
    video: app.videoEl,
    formatTime: (seconds) => app.formatDurationDetailed(seconds),
    editAssist: {
      updatePanel: updateEditAssistPanel,
      pushHistory: () => app.pushTimelineHistory(),
      renderTimeline: () => app.renderVideoTimeline(),
      updateTimelineHint: () => app.updateTimelineHint(),
    },
  });

  app.editor = editor;
  app.bindVideoEditorEvents();
  app.bindTimelinePaletteDrag();
  app.bindEditorSplitters();
  editor.editAssist.updateUI();
  app.updateVideoEditorUI();
  return editor;
}
