import type { Locale } from '../i18n/locale-state.ts';
import type { SourceMode } from '../editor/editor-state.ts';

export type { Locale, SourceMode };

export interface ShellState {
  mode: SourceMode;
  exportEnabled: boolean;
  locale: Locale;
}

let state: ShellState = {
  mode: 'camera',
  exportEnabled: false,
  locale: 'es',
};

const listeners = new Set<(state: ShellState) => void>();

export function getShellState() {
  return state;
}

export function updateShellState(patch: Partial<ShellState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function subscribeShellState(
  listener: (state: ShellState) => void,
): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}
