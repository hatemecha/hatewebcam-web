import type { Locale, SourceMode } from './shell-bridge.mjs';

export interface ShellAdapter {
  setSourceMode(mode: SourceMode): void;
  startVideoExport(): void;
  setLocale(locale: Locale): void;
}
