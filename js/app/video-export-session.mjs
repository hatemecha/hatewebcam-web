export class VideoExportSession {
  constructor({ now = () => performance.now() } = {}) {
    this.now = now;
    this.active = false;
    this.startedAt = 0;
    this.lastUiUpdate = 0;
    this.totalFrames = 0;
    this.lastRenderedFrameIndex = -1;
    this.seekFallback = false;
    this.skippedFrames = 0;
    this.fileName = '';
    this.wakeLock = null;
  }

  attachLegacyAccessors(target) {
    const mappings = {
      isVideoExporting: 'active',
      videoExportLastUiUpdate: 'lastUiUpdate',
      videoExportTotalFrames: 'totalFrames',
      videoExportLastRenderedFrameIndex: 'lastRenderedFrameIndex',
      videoExportSeekFallback: 'seekFallback',
      videoExportSkippedFrames: 'skippedFrames',
      videoExportFileName: 'fileName',
      videoExportWakeLock: 'wakeLock',
    };
    Object.entries(mappings).forEach(([legacyKey, stateKey]) => {
      Object.defineProperty(target, legacyKey, {
        configurable: true,
        get: () => this[stateKey],
        set: (value) => { this[stateKey] = value; },
      });
    });
  }

  start(totalFrames = 0) {
    this.active = true;
    this.startedAt = this.now();
    this.lastUiUpdate = 0;
    this.totalFrames = totalFrames;
    this.lastRenderedFrameIndex = -1;
    this.seekFallback = false;
    this.skippedFrames = 0;
  }

  stop() {
    this.active = false;
  }

  reset() {
    this.active = false;
    this.startedAt = 0;
    this.lastUiUpdate = 0;
    this.totalFrames = 0;
    this.lastRenderedFrameIndex = -1;
    this.seekFallback = false;
    this.skippedFrames = 0;
    this.fileName = '';
  }

  async releaseWakeLock() {
    if (this.wakeLock) await this.wakeLock.release().catch(() => {});
    this.wakeLock = null;
  }
}
