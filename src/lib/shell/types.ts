import type { Locale, SourceMode } from './shell-bridge.ts';

export interface ShellAdapter {
  setSourceMode(mode: SourceMode): void;
  startVideoExport(): void;
  setLocale(locale: Locale): void;
}
