/**
 * Presentation state for the video editor. Dependency-free so Node tests can
 * load editor modules without importing Svelte; the store wrapper lives in
 * editor-store.ts.
 */
import type { MessageKey } from '../i18n/catalog.ts';
import {
  DEFAULT_IMAGE_SETTINGS,
  type ImageSettings,
} from '../../../js/app/constants.ts';

export type SourceMode = 'camera' | 'video';
export type InspectorTab = 'project' | 'effect' | 'adjust';
export type EditorTool = 'select' | 'cut' | 'trim';

export interface ClipReadout {
  type: string;
  label: string;
  startTime: number;
  endTime: number;
  automation: string;
}

export interface ProjectActions {
  loadVideo(file: File): void;
  loadProject(file: File): void;
  saveProject(): void;
  startExport(): void;
  setExportSetting(setting: ExportSetting, value: string | boolean): void;
}

const exportFields = [
  'editorExportPreset',
  'editorExportMode',
  'editorExportFormat',
  'editorCopyAudio',
  'experimentalExportFeatures',
  'effectsExportChroma',
] as const;

export type ExportSetting = (typeof exportFields)[number];
type ExportSettings = Pick<ImageSettings, ExportSetting>;

function readExportSettings(settings: ImageSettings): ExportSettings {
  return {
    editorExportPreset: settings.editorExportPreset,
    editorExportMode: settings.editorExportMode,
    editorExportFormat: settings.editorExportFormat,
    editorCopyAudio: settings.editorCopyAudio,
    experimentalExportFeatures: settings.experimentalExportFeatures,
    effectsExportChroma: settings.effectsExportChroma,
  };
}

export interface EditorUiState {
  mode: SourceMode;
  hasSource: boolean;
  sourceDetails: string;
  exporting: boolean;
  canExport: boolean;
  exportSettings: ExportSettings;
  exportDetails: string;
  exportDiagnostics: string;
  canUndo: boolean;
  canRedo: boolean;
  inspectorTab: InspectorTab;
  tool: EditorTool;
  zoom: number;
  snapEnabled: boolean;
  trimStart: number;
  trimEnd: number;
  clip: ClipReadout | null;
  timelineHint: MessageKey | '';
  clipboardStatus: string;
  targetTrack: string | null;
  adjustTrack: string | null;
  visualFxSelected: boolean;
  visualFxStatus: MessageKey | '';
}

let state: EditorUiState = {
  mode: 'camera',
  hasSource: false,
  sourceDetails: '',
  exporting: false,
  canExport: false,
  exportSettings: readExportSettings(DEFAULT_IMAGE_SETTINGS),
  exportDetails: '',
  exportDiagnostics: '',
  canUndo: false,
  canRedo: false,
  inspectorTab: 'project',
  tool: 'select',
  zoom: 1,
  snapEnabled: true,
  trimStart: 0,
  trimEnd: 0,
  clip: null,
  timelineHint: '',
  clipboardStatus: '',
  targetTrack: null,
  adjustTrack: null,
  visualFxSelected: false,
  visualFxStatus: '',
};

const listeners = new Set<(next: EditorUiState) => void>();

export function getEditorUiState(): EditorUiState {
  return state;
}

export function updateExportSettings(settings: ImageSettings): void {
  if (exportFields.some((key) => state.exportSettings[key] !== settings[key])) {
    updateEditorUiState({ exportSettings: readExportSettings(settings) });
  }
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
