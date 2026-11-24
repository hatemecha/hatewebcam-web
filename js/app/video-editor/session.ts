import { setEditorActions } from '../../../src/lib/editor/editor-store.ts';
import { updateEditAssistPanel } from '../../../src/lib/editor/edit-assist-panel.ts';
import { updateEditorUiState } from '../../../src/lib/editor/editor-state.ts';
import { mountVisualFxInspector } from '../../../src/lib/editor/mount-visual-fx.ts';
import { EditorHistory } from '../../editor/editor-history.ts';
import { VideoTimeline } from '../../editor/video-timeline.ts';
import type { readAppDom } from '../dom.ts';
import { EditAssistController } from '../edit-assist-controller.ts';
import { showStatus } from '../feedback.ts';
import { formatDurationDetailed } from '../media-format.ts';
import { TimelineView } from '../timeline-view.ts';
import { VideoExportSession } from '../video-export-session.ts';
import { VisualFxLab } from '../visual-fx-lab.ts';
import { VideoExporter, type ExportHost } from './export.ts';
import { EditorProjects } from './projects.ts';
import {
  EditorSourceController,
  type SourceHost,
} from './source-controller.ts';
import {
  TimelineEffects,
  type TimelineEffectsHost,
} from './timeline-effects.ts';
import { VideoTransport } from './transport.ts';
import { VideoFileSource } from './video-file-source.ts';
import { VisualFxSession } from './visual-fx-session.ts';
import { EditorWorkspace, type EditorWorkspaceHost } from './workspace.ts';

export type VideoEditorHost = SourceHost &
  TimelineEffectsHost &
  ExportHost &
  EditorWorkspaceHost;

export class VideoEditorSession {
  readonly source: VideoFileSource;
  timeline = new VideoTimeline();
  readonly history = new EditorHistory();
  readonly exportSession = new VideoExportSession();
  readonly exporter: VideoExporter;
  readonly timelineView = new TimelineView({
    formatTime: formatDurationDetailed,
  });
  readonly editAssist: EditAssistController;
  readonly projects: EditorProjects;
  readonly transport: VideoTransport;
  readonly visualFx: VisualFxSession;
  readonly lab: VisualFxLab;
  readonly workspace: EditorWorkspace;
  readonly sourceController: EditorSourceController;
  readonly timelineEffects: TimelineEffects;
  private unmountInspector: (() => void) | null = null;

  constructor(host: VideoEditorHost, dom: ReturnType<typeof readAppDom>) {
    const { videoEl: video, videoEditorStatus } = dom;
    const { renderer } = host;
    this.workspace = new EditorWorkspace(this, dom, host);
    const { workspace } = this;
    const showEditorStatus = (
      message: string,
      type: 'info' | 'success' | 'warning' | 'error',
    ) => showStatus(videoEditorStatus, message, type);
    this.source = new VideoFileSource(video);
    this.exporter = new VideoExporter(this, host);
    this.editAssist = new EditAssistController({
      getSourceFile: () => this.source.file,
      getTimeline: () => this.timeline,
      isExporting: () => this.exportSession.active,
      updatePanel: updateEditAssistPanel,
      pushHistory: () => workspace.pushTimelineHistory(),
      renderTimeline: () => workspace.renderVideoTimeline(),
      updateTimelineHint: () => workspace.updateTimelineHint(),
    });
    this.projects = new EditorProjects(this, {
      video,
      getImageSettings: () => host.imageSettings,
      showStatus: showEditorStatus,
      onRestore: () => {
        workspace.resetSelection();
        workspace.updateEditorHistoryButtons();
        host.preferences.updateImageControlsUI();
        workspace.renderVideoTimeline();
        this.exporter.updateVideoEditorUI();
        if (this.source.file) void this.timelineEffects.sync(true);
      },
    });
    this.transport = new VideoTransport(this, {
      video,
      playhead: dom.timelinePlayhead,
      inVideoMode: () => host.sourceMode === 'video',
      cancelRender: () => renderer.cancelRenderLoop(),
      ensureRender: () => {
        if (!renderer.hasPendingFrame) renderer.scheduleRenderLoop();
      },
      onSeek: () => this.visualFx.activeEffect?.onSeek(),
      onSeeked: () => {
        void this.timelineEffects.sync();
        renderer.refreshPausedVideoPreview();
      },
      onPlayFailure: () =>
        showEditorStatus('No se pudo reproducir el video.', 'error'),
    });
    this.visualFx = new VisualFxSession({
      getTimeline: () => this.timeline,
      getTime: () => video.currentTime,
      seek: (time) => this.transport.seek(time),
      getSelection: () => workspace.getSelectedVideoEffectItem(),
      hasSource: () => host.sourceMode === 'video' && Boolean(this.source.file),
      pushHistory: () => workspace.pushTimelineHistory(),
      renderTimeline: () => workspace.renderVideoTimeline(),
      refreshPreview: () => renderer.refreshPausedVideoPreview(),
      publishVisibility: (visible, status) =>
        updateEditorUiState({
          visualFxSelected: visible,
          visualFxStatus: status,
        }),
    });
    this.lab = new VisualFxLab(
      this.visualFx,
      renderer,
      dom.canvas,
      dom.previewWrapper,
    );
    this.timelineEffects = new TimelineEffects(this, host);
    this.sourceController = new EditorSourceController(this, host);
  }

  start(inspector: HTMLElement | null): void {
    setEditorActions(this.workspace);
    this.workspace.bindVideoEditorEvents();
    this.workspace.bindTimelinePaletteDrag();
    this.workspace.bindEditorSplitters();
    this.transport.bind();
    if (inspector)
      this.unmountInspector = mountVisualFxInspector(inspector, this.visualFx);
    this.editAssist.updateUI();
    this.exporter.updateVideoEditorUI();
  }

  dispose(): void {
    this.exporter.dispose();
    setEditorActions(null);
    this.workspace.dispose();
    this.lab.dispose();
    this.transport.dispose();
    this.source.dispose();
    this.visualFx.dispose();
    this.unmountInspector?.();
    this.unmountInspector = null;
  }
}
