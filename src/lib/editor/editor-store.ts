import { readable, readonly, writable } from 'svelte/store';
import type { EditorWorkspace } from '../../../js/app/video-editor/workspace.ts';
import {
  getEditorUiState,
  subscribeEditorUiState,
  type EditorUiState,
} from './editor-state';

export const editorState = readable<EditorUiState>(getEditorUiState(), (set) =>
  subscribeEditorUiState(set),
);

type EditorActions = Pick<
  EditorWorkspace,
  | 'setInspectorTab'
  | 'setEditorTool'
  | 'splitAllEffectsAtMarkers'
  | 'setSnapEnabled'
  | 'setTimelineZoom'
  | 'undoTimelineEdit'
  | 'redoTimelineEdit'
  | 'setTrimBoundary'
  | 'commitSelectedEffectTiming'
  | 'commitSelectedEffectAutomation'
  | 'openSelectedClipAdjustments'
  | 'deleteSelectedVideoEffect'
  | 'openTrack'
  | 'addPaletteClip'
>;

const actions = writable<EditorActions | null>(null);
export const editorActions = readonly(actions);
export const setEditorActions = actions.set;
