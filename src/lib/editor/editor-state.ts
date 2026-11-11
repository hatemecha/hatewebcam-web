/**
 * Presentation state for the video editor. Dependency-free so Node tests can
 * load editor modules without importing Svelte; the store wrapper lives in
 * editor-store.ts.
 */
export type SourceMode = 'camera' | 'video';
export type InspectorTab = 'project' | 'effect' | 'adjust';

export interface EditorUiState {
  mode: SourceMode;
  hasSource: boolean;
  exporting: boolean;
  canExport: boolean;
  canUndo: boolean;
  canRedo: boolean;
  inspectorTab: InspectorTab;
}

let state: EditorUiState = {
  mode: 'camera',
  hasSource: false,
  exporting: false,
  canExport: false,
  canUndo: false,
  canRedo: false,
  inspectorTab: 'project',
};

const listeners = new Set<(next: EditorUiState) => void>();

export function getEditorUiState(): EditorUiState {
  return state;
}

export function updateEditorUiState(patch: Partial<EditorUiState>): void {
  let changed = false;
  for (const key of Object.keys(patch) as (keyof EditorUiState)[]) {
    if (state[key] !== patch[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function subscribeEditorUiState(
  listener: (next: EditorUiState) => void,
): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}
