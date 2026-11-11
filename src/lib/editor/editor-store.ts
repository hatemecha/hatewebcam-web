import { readable } from 'svelte/store';
import {
  getEditorUiState,
  subscribeEditorUiState,
  type EditorUiState,
} from './editor-state';

export const editorState = readable<EditorUiState>(getEditorUiState(), (set) =>
  subscribeEditorUiState(set),
);
