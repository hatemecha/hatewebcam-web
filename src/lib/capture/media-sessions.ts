export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  extension: string;
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

  start(input: RecordingStart): void {
    this.dispose();
    this.discardOnStop = false;
    this.chunks = [];
    this.mimeType = input.mimeType;
    this.extension = input.extension;
    this.stream = input.stream;
    this.onStopped = input.onStopped;
    this.recorder = this.createRecorder(input.stream, {
      mimeType: input.mimeType,
      videoBitsPerSecond: input.videoBitsPerSecond,
    });
    const requested = this.recorder;
    requested.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };
    requested.onstop = () => {
      const savedChunks = this.discardOnStop ? [] : this.chunks.slice();
      const savedType = this.mimeType;
      const savedExtension = this.extension;
      const notify = this.onStopped;
      this.chunks = [];
      this.releaseStream();
      this.recorder = null;
      this.onStopped = null;
      this.clearTimer();
      const result =
        savedChunks.length > 0
          ? {
              blob: new Blob(savedChunks, { type: savedType || 'video/webm' }),
              mimeType: savedType || 'video/webm',
              extension: savedExtension,
            }
          : null;
      notify?.(result);
    };
    requested.start(input.timesliceMs ?? 250);
    this.timer = setInterval(() => input.onTick(), input.tickMs ?? 1000);
  }

  stop(save: boolean): void {
    this.discardOnStop = !save;
    this.clearTimer();
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
      return;
    }
    this.releaseStream();
    this.recorder = null;
    this.chunks = [];
  }

  dispose(): void {
    this.discardOnStop = true;
    this.clearTimer();
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.recorder = null;
    this.chunks = [];
    this.onStopped = null;
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
