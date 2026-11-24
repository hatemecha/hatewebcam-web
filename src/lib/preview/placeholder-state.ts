import {
  getCameraStatePresentation,
  type CameraStatePresentation,
} from '../../../js/app/camera-state.ts';
import type { MessageKey } from '../i18n/catalog.ts';

export interface PreviewPlaceholderActions {
  startCamera(): void;
  chooseVideo(): void;
}

interface PlaceholderState {
  view: 'camera' | 'video' | 'loading' | 'hidden';
  camera: CameraStatePresentation;
  cameraMessage: MessageKey | null;
  loadingMessage: MessageKey;
  focusRequest: number;
}

let state: PlaceholderState = {
  view: 'camera',
  camera: getCameraStatePresentation('off'),
  cameraMessage: null,
  loadingMessage: 'Leyendo metadata del video...',
  focusRequest: 0,
};

const listeners = new Set<(value: PlaceholderState) => void>();

export function getPlaceholderState() {
  return state;
}

export function updatePlaceholderState(patch: Partial<PlaceholderState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function subscribePlaceholderState(
  listener: (value: PlaceholderState) => void,
): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}
