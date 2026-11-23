const MEDIABUNNY_URL = '../vendor/mediabunny/mediabunny.min.mjs?v=1.49.0-local';

export interface AudioSample {
  numberOfChannels: number;
  numberOfFrames: number;
  sampleRate: number;
  allocationSize(options: { planeIndex: number; format: 'f32' }): number;
  copyTo(
    data: Float32Array,
    options: { planeIndex: number; format: 'f32' },
  ): void;
  close(): void;
}

export interface AudioTrack {
  canDecode(): Promise<boolean>;
  getCodec(): Promise<string | null>;
  getDecoderConfig(): Promise<AudioDecoderConfig | null>;
}

export interface MediaInput {
  canRead(): Promise<boolean>;
  getPrimaryAudioTrack(): Promise<AudioTrack | null>;
  dispose(): void;
}

interface AudioPacket {
  timestamp: number;
  duration: number;
  clone(options: { timestamp: number }): AudioPacket;
}

export interface EncodedAudioSource {
  add(
    packet: AudioPacket,
    metadata?: { decoderConfig: AudioDecoderConfig },
  ): Promise<void>;
  close(): void;
}

interface CanvasSource {
  add(
    timestamp: number,
    duration: number,
    options: { keyFrame: boolean },
  ): Promise<void>;
  close(): void;
}

export interface MediaOutput {
  addAudioTrack(source: EncodedAudioSource): void;
  addVideoTrack(source: CanvasSource, options: { frameRate: number }): void;
  start(): Promise<void>;
  finalize(): Promise<void>;
  cancel(): Promise<void>;
}

interface BufferTarget {
  buffer: ArrayBuffer | null;
}

interface OutputFormat {
  mimeType: string;
}

interface CanvasSourceOptions {
  codec: string;
  bitrate: number;
  keyFrameInterval: number;
  bitrateMode: 'variable';
  latencyMode: 'quality';
}

export interface MediabunnyModule {
  ALL_FORMATS: readonly object[];
  Input: new (options: {
    source: object;
    formats: readonly object[];
  }) => MediaInput;
  BlobSource: new (file: Blob) => object;
  AudioSampleSink: new (track: AudioTrack) => {
    samples(start: number, end: number): AsyncIterable<AudioSample>;
  };
  EncodedAudioPacketSource: new (codec: string) => EncodedAudioSource;
  EncodedPacketSink: new (track: AudioTrack) => {
    packets(): AsyncIterable<AudioPacket>;
  };
  Mp4OutputFormat: new (options: { fastStart: 'in-memory' }) => OutputFormat;
  WebMOutputFormat: new () => OutputFormat;
  BufferTarget: new () => BufferTarget;
  Output: new (options: {
    format: OutputFormat;
    target: BufferTarget;
  }) => MediaOutput;
  CanvasSource: new (
    canvas: HTMLCanvasElement,
    options: CanvasSourceOptions,
  ) => CanvasSource;
}

export async function loadMediabunny(): Promise<MediabunnyModule> {
  return import(/* @vite-ignore */ MEDIABUNNY_URL);
}
