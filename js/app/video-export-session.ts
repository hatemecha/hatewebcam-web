import type { buildEditorExportPreflight } from '../video-export.ts';

export interface VideoExportSessionOptions {
  now?: () => number;
}

export class VideoExportSession {
  now: () => number;
  active = false;
  startedAt = 0;
  lastUiUpdate = 0;
  totalFrames = 0;
  lastRenderedFrameIndex = -1;
  seekFallback = false;
  skippedFrames = 0;
  fileName = '';
  preflight: ReturnType<typeof buildEditorExportPreflight> | null = null;
  wakeLock: WakeLockSentinel | null = null;

  constructor({
    now = () => performance.now(),
  }: VideoExportSessionOptions = {}) {
    this.now = now;
  }

  start(totalFrames = 0): void {
    this.active = true;
    this.startedAt = this.now();
    this.lastUiUpdate = 0;
    this.totalFrames = totalFrames;
    this.lastRenderedFrameIndex = -1;
    this.seekFallback = false;
    this.skippedFrames = 0;
  }

  stop(): void {
    this.active = false;
  }

  reset(): void {
    this.active = false;
    this.startedAt = 0;
    this.lastUiUpdate = 0;
    this.totalFrames = 0;
    this.lastRenderedFrameIndex = -1;
    this.seekFallback = false;
    this.skippedFrames = 0;
    this.fileName = '';
    this.preflight = null;
  }

  async releaseWakeLock(): Promise<void> {
    const wakeLock = this.wakeLock;
    this.wakeLock = null;
    if (wakeLock) await wakeLock.release().catch(() => {});
  }
}
