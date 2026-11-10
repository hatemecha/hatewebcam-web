export type SourceMode = 'camera' | 'video';
export type Locale = 'es' | 'en';

export interface ShellState {
  mode: SourceMode;
  exportEnabled: boolean;
  locale: Locale;
}

export function getShellState(): ShellState;
export function updateShellState(patch: Partial<ShellState>): void;
export function subscribeShellState(
  listener: (state: ShellState) => void,
): () => void;
