import type { readAppDom } from './dom.ts';
import {
  VideoEditorSession,
  type VideoEditorHost,
} from './video-editor/session.ts';

export function createVideoEditor(
  host: VideoEditorHost,
  dom: ReturnType<typeof readAppDom>,
): VideoEditorSession {
  return new VideoEditorSession(host, dom);
}
