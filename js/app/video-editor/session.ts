import { EditorHistory } from '../../editor/editor-history.ts';
import { mountVisualFxInspector } from '../../../src/lib/editor/mount-visual-fx.ts';
import { VideoTimeline } from '../../editor/video-timeline.ts';
import {
  EditAssistController,
  type EditAssistOptions,
} from '../edit-assist-controller.ts';
import { TimelineView } from '../timeline-view.ts';
import { VideoExportSession } from '../video-export-session.ts';
import {
  EditorSourceController,
  type SourceHost,
} from './source-controller.ts';
import { EditorProjects, type ProjectOptions } from './projects.ts';
import {
  TimelineEffects,
  type TimelineEffectsHost,
} from './timeline-effects.ts';
import { VideoTransport, type TransportOptions } from './transport.ts';
import { VideoFileSource } from './video-file-source.ts';
import { VisualFxSession, type VisualFxOptions } from './visual-fx-session.ts';

interface VideoEditorSessionOptions {
  video: HTMLVideoElement;
  formatTime: (seconds: number) => string;
  editAssist: Omit<
    EditAssistOptions,
    'getSourceFile' | 'getTimeline' | 'isExporting'
  >;
  projects: Omit<ProjectOptions, 'video'>;
  transport: Omit<TransportOptions, 'video'>;
  visualFx: Omit<VisualFxOptions, 'getTimeline' | 'getTime' | 'seek'>;
  sourceHost: SourceHost & TimelineEffectsHost;
}

export class VideoEditorSession {
  readonly source: VideoFileSource;
  timeline = new VideoTimeline();
  readonly history = new EditorHistory();
  readonly exportSession = new VideoExportSession();
  readonly timelineView: TimelineView;
  readonly editAssist: EditAssistController;
  readonly projects: EditorProjects;
  readonly transport: VideoTransport;
  readonly visualFx: VisualFxSession;
  readonly sourceController: EditorSourceController;
  readonly timelineEffects: TimelineEffects;
  private unmountInspector: (() => void) | null = null;

  constructor({
    video,
    formatTime,
    editAssist,
    projects,
    transport,
    visualFx,
    sourceHost,
  }: VideoEditorSessionOptions) {
    this.source = new VideoFileSource(video);
    this.timelineView = new TimelineView({ formatTime });
    this.editAssist = new EditAssistController({
      ...editAssist,
      getSourceFile: () => this.source.file,
      getTimeline: () => this.timeline,
      isExporting: () => this.exportSession.active,
    });
    this.projects = new EditorProjects(this, { ...projects, video });
    this.transport = new VideoTransport(this, { ...transport, video });
    this.visualFx = new VisualFxSession({
      ...visualFx,
      getTimeline: () => this.timeline,
      getTime: () => video.currentTime,
      seek: (time) => this.transport.seek(time),
    });
    this.timelineEffects = new TimelineEffects(this, sourceHost);
    this.sourceController = new EditorSourceController(this, sourceHost);
  }

  mountInspector(host: HTMLElement | null): void {
    if (host && !this.unmountInspector)
      this.unmountInspector = mountVisualFxInspector(host, this.visualFx);
  }

  dispose(): void {
    this.exportSession.stop();
    void this.exportSession.releaseWakeLock();
    this.transport.dispose();
    this.source.dispose();
    this.visualFx.dispose();
    this.unmountInspector?.();
    this.unmountInspector = null;
  }
}
