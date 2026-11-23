import { EditorHistory } from '../../editor/editor-history.ts';
import { VideoTimeline } from '../../editor/video-timeline.ts';
import {
  EditAssistController,
  type EditAssistOptions,
} from '../edit-assist-controller.ts';
import { TimelineView } from '../timeline-view.ts';
import { VideoExportSession } from '../video-export-session.ts';
import { VideoFileSource } from './video-file-source.ts';

interface VideoEditorSessionOptions {
  video: HTMLVideoElement;
  formatTime: (seconds: number) => string;
  editAssist: Omit<
    EditAssistOptions,
    'getSourceFile' | 'getTimeline' | 'isExporting'
  >;
}

export class VideoEditorSession {
  readonly source: VideoFileSource;
  timeline = new VideoTimeline();
  readonly history = new EditorHistory();
  readonly exportSession = new VideoExportSession();
  readonly timelineView: TimelineView;
  readonly editAssist: EditAssistController;

  constructor({ video, formatTime, editAssist }: VideoEditorSessionOptions) {
    this.source = new VideoFileSource(video);
    this.timelineView = new TimelineView({ formatTime });
    this.editAssist = new EditAssistController({
      ...editAssist,
      getSourceFile: () => this.source.file,
      getTimeline: () => this.timeline,
      isExporting: () => this.exportSession.active,
    });
  }
}
