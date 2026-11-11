export interface VideoExportSessionOptions {
  now?: () => number;
}

export interface LegacyExportAccessors {
  isVideoExporting?: boolean;
  videoExportLastUiUpdate?: number;
  videoExportTotalFrames?: number;
  videoExportLastRenderedFrameIndex?: number;
  videoExportSeekFallback?: boolean;
  videoExportSkippedFrames?: number;
  videoExportFileName?: string;
  videoExportWakeLock?: WakeLockSentinel | null;
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
  wakeLock: WakeLockSentinel | null = null;

  constructor({
    now = () => performance.now(),
  }: VideoExportSessionOptions = {}) {
    this.now = now;
  }

  attachLegacyAccessors(target: LegacyExportAccessors): void {
    Object.defineProperties(target, {
      isVideoExporting: {
        configurable: true,
        get: () => this.active,
        set: (value: boolean) => {
          this.active = value;
        },
      },
      videoExportLastUiUpdate: {
        configurable: true,
        get: () => this.lastUiUpdate,
        set: (value: number) => {
          this.lastUiUpdate = value;
        },
      },
      videoExportTotalFrames: {
        configurable: true,
        get: () => this.totalFrames,
        set: (value: number) => {
          this.totalFrames = value;
        },
      },
      videoExportLastRenderedFrameIndex: {
        configurable: true,
        get: () => this.lastRenderedFrameIndex,
        set: (value: number) => {
          this.lastRenderedFrameIndex = value;
        },
      },
      videoExportSeekFallback: {
        configurable: true,
        get: () => this.seekFallback,
        set: (value: boolean) => {
          this.seekFallback = value;
        },
      },
      videoExportSkippedFrames: {
        configurable: true,
        get: () => this.skippedFrames,
        set: (value: number) => {
          this.skippedFrames = value;
        },
      },
      videoExportFileName: {
        configurable: true,
        get: () => this.fileName,
        set: (value: string) => {
          this.fileName = value;
        },
      },
      videoExportWakeLock: {
        configurable: true,
        get: () => this.wakeLock,
        set: (value: WakeLockSentinel | null) => {
          this.wakeLock = value;
        },
      },
    });
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
  }

  async releaseWakeLock(): Promise<void> {
    if (this.wakeLock) await this.wakeLock.release().catch(() => {});
    this.wakeLock = null;
  }
}
