export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  extension: string;
  durationSec: number;
}

export interface RecordingStart {
  stream: MediaStream;
  mimeType: string;
  extension: string;
  videoBitsPerSecond: number;
  timesliceMs?: number;
  tickMs?: number;
  onTick: () => void;
  onStopped: (result: RecordingResult | null) => void;
}

type RecorderFactory = (
  stream: MediaStream,
  options: MediaRecorderOptions,
) => MediaRecorder;

export class RecordingSession {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private discardOnStop = false;
  private mimeType = '';
  private extension = 'webm';
  private onStopped: ((result: RecordingResult | null) => void) | null = null;
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;

  constructor(
    private readonly createRecorder: RecorderFactory = (stream, options) =>
      new MediaRecorder(stream, options),
  ) {}

  get mediaRecorder(): MediaRecorder | null {
    return this.recorder;
  }

  get mediaStream(): MediaStream | null {
    return this.stream;
  }

  get active(): boolean {
    return this.startedAt !== null && this.stoppedAt === null;
  }

  get elapsedSeconds(): number {
    if (this.startedAt === null) return 0;
    return Math.max(
      0,
      ((this.stoppedAt ?? Date.now()) - this.startedAt) / 1000,
    );
  }

  get format(): string {
    return this.extension;
  }

  start(input: RecordingStart): void {
    this.dispose();
    this.discardOnStop = false;
    this.chunks = [];
    this.mimeType = input.mimeType;
    this.extension = input.extension;
    this.stream = input.stream;
    this.onStopped = input.onStopped;
    try {
      const requested = this.createRecorder(input.stream, {
        mimeType: input.mimeType,
        videoBitsPerSecond: input.videoBitsPerSecond,
      });
      this.recorder = requested;
      requested.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) this.chunks.push(event.data);
      };
      requested.onstop = () => {
        const mimeType = this.mimeType || 'video/webm';
        const result =
          !this.discardOnStop && this.chunks.length
            ? {
                blob: new Blob(this.chunks, { type: mimeType }),
                mimeType,
                extension: this.extension,
                durationSec: this.elapsedSeconds,
              }
            : null;
        const notify = this.onStopped;
        this.dispose();
        notify?.(result);
      };
      requested.start(input.timesliceMs ?? 250);
      this.startedAt = Date.now();
      this.timer = setInterval(input.onTick, input.tickMs ?? 1000);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  stop(save: boolean): void {
    if (!this.recorder) return;
    this.discardOnStop ||= !save;
    this.stoppedAt ??= Date.now();
    this.clearTimer();
    if (this.recorder.state !== 'inactive') this.recorder.stop();
  }

  dispose(): void {
    this.discardOnStop = true;
    this.clearTimer();
    if (this.recorder) {
      this.recorder.onstop = null;
      this.recorder.ondataavailable = null;
      if (this.recorder.state !== 'inactive') this.recorder.stop();
    }
    this.recorder = null;
    this.chunks = [];
    this.onStopped = null;
    this.startedAt = null;
    this.stoppedAt = null;
    this.releaseStream();
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

export class PhotoCountdown {
  private timer: ReturnType<typeof setInterval> | null = null;
  private onTick: ((remaining: number) => void) | null = null;
  private onDone: (() => void) | null = null;
  remaining = 0;
  total = 0;

  get active(): boolean {
    return this.timer !== null;
  }

  start(
    seconds: number,
    onTick: (remaining: number) => void,
    onDone: () => void,
    intervalMs = 1000,
  ): void {
    this.cancel();
    this.remaining = seconds;
    this.total = seconds;
    this.onTick = onTick;
    this.onDone = onDone;
    this.timer = setInterval(() => this.advance(), intervalMs);
  }

  advance(): void {
    if (!this.timer) return;
    this.remaining -= 1;
    if (this.remaining <= 0) {
      const done = this.onDone;
      this.cancel();
      done?.();
      return;
    }
    this.onTick?.(this.remaining);
  }

  cancel(): boolean {
    const wasActive = this.timer !== null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.remaining = 0;
    this.total = 0;
    this.onTick = null;
    this.onDone = null;
    return wasActive;
  }
}
