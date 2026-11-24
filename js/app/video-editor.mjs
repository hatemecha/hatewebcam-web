import { applyVideoEditorClipboardMixin } from './video-editor-clipboard.mjs';
import { applyVideoEditorTimelineMixin } from './video-editor-timeline.mjs';
import { applyVideoEditorExportMixin } from './video-editor/export.mjs';
import { applyVideoEditorClipInspectorMixin } from './video-editor/clip-inspector.mjs';
import { applyVideoEditorInspectorShellMixin } from './video-editor/inspector-shell.mjs';
import { applyVideoEditorTimelineChromeMixin } from './video-editor/timeline-chrome.mjs';
import { applyVideoEditorTimelineInteractionMixin } from './video-editor/timeline-interaction.mjs';

/** @param {import('./controller.mjs').AppController} proto */
export function applyLocalvideoeditorMixin(proto) {
  applyVideoEditorTimelineMixin(proto);
  applyVideoEditorClipboardMixin(proto);
  applyVideoEditorExportMixin(proto);
  applyVideoEditorClipInspectorMixin(proto);
  applyVideoEditorInspectorShellMixin(proto);
  applyVideoEditorTimelineChromeMixin(proto);
  applyVideoEditorTimelineInteractionMixin(proto);
}
