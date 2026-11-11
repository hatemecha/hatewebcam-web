/**
 * Lazy editor entry point.
 *
 * Everything imported here belongs to the video editor and is only fetched
 * when the user switches to Video mode. Keeping this module out of the
 * bootstrap graph is what lets the webcam start without the timeline, export
 * encoder or Visual FX engine.
 */
import { VideoTimeline } from '../editor/video-timeline.ts';
import { EditorHistory } from '../editor/editor-history.ts';
import { TimelineView } from './timeline-view.mjs';
import { EditAssistController } from './edit-assist-controller.mjs';
import { VideoExportSession } from './video-export-session.mjs';
import { applyLocalvideoeditorMixin } from './video-editor.mjs';
import { applyVisualFxIntegrationMixin } from './visual-fx-integration.mjs';
import { applyVisualFxUIMixin } from './visual-fx-ui.mjs';
import { applyVisualFxLabMixin } from './visual-fx-lab.mjs';

/**
 * @param {import('./controller.mjs').AppController} app
 */
export async function installVideoEditor(app) {
  if (app._editorInstalled) return app;

  const proto = Object.getPrototypeOf(app);
  applyLocalvideoeditorMixin(proto);
  applyVisualFxIntegrationMixin(proto);
  applyVisualFxUIMixin(proto);
  applyVisualFxLabMixin(proto);

  app.videoTimeline = new VideoTimeline();
  app.editorHistory = new EditorHistory();
  app.timelineView = new TimelineView({
    formatTime: (seconds) => app.formatDurationDetailed(seconds),
  });
  app.editAssist = new EditAssistController({
    getSourceFile: () => app.videoSourceFile,
    getTimeline: () => app.videoTimeline,
    isExporting: () => app.isVideoExporting,
    getElements: () => ({
      analyzeButton: app.btnEditAssistAnalyze,
      beatButton: app.btnEditAssistBeat,
      every2Button: app.btnEditAssistEvery2,
      every4Button: app.btnEditAssistEvery4,
      every8Button: app.btnEditAssistEvery8,
      halfButton: app.btnEditAssistHalf,
      doubleButton: app.btnEditAssistDouble,
      offsetDownButton: app.btnEditAssistOffsetDown,
      offsetUpButton: app.btnEditAssistOffsetUp,
      regenerateButton: app.btnEditAssistRegenerate,
      clearButton: app.btnEditAssistClear,
      bpmInput: app.editAssistBpmInput,
      offsetInput: app.editAssistOffsetInput,
      densitySelect: app.editAssistDensitySelect,
      result: app.editAssistResult,
      status: app.editAssistStatus,
    }),
    pushHistory: () => app.pushTimelineHistory(),
    renderTimeline: () => app.renderVideoTimeline(),
    showStatus: (el, message, type) => app.showStatus(el, message, type),
    updateTimelineHint: () => app.updateTimelineHint(),
  });
  app.videoExportSession = new VideoExportSession();
  app.videoExportSession.attachLegacyAccessors(app);

  app._editorInstalled = true;
  app.bindVideoEditorEvents();
  app.bindTimelinePaletteDrag();
  app.bindEditorSplitters();
  app.editAssist.bind();
  app.updateVideoEditorUI();
  return app;
}
