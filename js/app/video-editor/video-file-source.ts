interface OpenVideo {
  file: File;
  url: string;
  controller: AbortController;
}

export class VideoFileSource {
  private current: OpenVideo | null = null;
  private metadata: { fps: number; averageBitrate: number } | null = null;

  constructor(private readonly video: HTMLVideoElement) {}

  get file(): File | null {
    return this.current?.file ?? null;
  }

  get loading(): boolean {
    return this.current !== null && this.metadata === null;
  }

  get fps(): number {
    return this.metadata?.fps ?? 30;
  }

  get averageBitrate(): number {
    return this.metadata?.averageBitrate ?? 0;
  }

  finishLoading(
    signal: AbortSignal,
    fps: number,
    averageBitrate: number,
  ): void {
    signal.throwIfAborted();
    if (signal === this.current?.controller.signal)
      this.metadata = { fps, averageBitrate };
  }

  open(file: File): { ready: Promise<void>; signal: AbortSignal } {
    this.dispose();
    const source = {
      file,
      url: URL.createObjectURL(file),
      controller: new AbortController(),
    };
    this.current = source;
    const { signal } = source.controller;
    return { ready: this.loadMetadata(source.url, signal), signal };
  }

  async reload(timeoutMs: number): Promise<void> {
    const source = this.current;
    if (!source) throw new Error('video_decode_failed');
    const nextUrl = URL.createObjectURL(source.file);
    try {
      await this.loadMetadata(nextUrl, source.controller.signal, timeoutMs);
      source.controller.signal.throwIfAborted();
      URL.revokeObjectURL(source.url);
      source.url = nextUrl;
    } catch (error) {
      URL.revokeObjectURL(nextUrl);
      if (this.current === source) {
        this.video.src = source.url;
        this.video.load();
      }
      throw error;
    }
  }

  dispose(): void {
    const source = this.current;
    if (!source) return;
    this.current = null;
    this.metadata = null;
    source.controller.abort();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    URL.revokeObjectURL(source.url);
  }

  private loadMetadata(
    url: string,
    signal: AbortSignal,
    timeoutMs?: number,
  ): Promise<void> {
    const video = this.video;
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const finish = (error?: Error | DOMException) => {
        cleanup.abort();
        signal.removeEventListener('abort', onAbort);
        if (timer !== undefined) clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const cleanup = new AbortController();
      const onAbort = () =>
        finish(new DOMException('Video source released', 'AbortError'));
      const timer =
        timeoutMs === undefined
          ? undefined
          : setTimeout(
              () => finish(new Error('video_seek_timeout')),
              timeoutMs,
            );
      signal.addEventListener('abort', onAbort, { once: true });
      video.addEventListener('loadedmetadata', () => finish(), {
        signal: cleanup.signal,
      });
      video.addEventListener(
        'error',
        () => finish(new Error('video_decode_failed')),
        { signal: cleanup.signal },
      );
      video.pause();
      video.srcObject = null;
      video.src = url;
      video.muted = true;
      video.preload = 'auto';
      video.load();
    });
  }
}
