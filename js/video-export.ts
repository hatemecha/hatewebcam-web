import { translateCurrent } from '../src/lib/i18n/translate.ts';
import type { ImageSettings } from './app/constants.ts';
import { COMMON_VIDEO_FPS } from './app/media-format.ts';
import {
  loadMediabunny,
  type AudioTrack,
  type EncodedAudioSource,
  type MediaInput,
  type MediaOutput,
  type MediabunnyModule,
} from './mediabunny.ts';

export { COMMON_VIDEO_FPS };

type RequestedFormat = ImageSettings['editorExportFormat'];
type ExportMode = ImageSettings['editorExportMode'];
type ExportPreset = ImageSettings['editorExportPreset'];
type ContainerFormat = Exclude<RequestedFormat, 'auto'>;
type ExportCodec = '' | 'avc' | 'vp8' | 'vp9';
type EncoderSupport = Pick<typeof VideoEncoder, 'isConfigSupported'>;

interface ExportSelectionOptions {
  requestedFormat?: unknown;
  mode?: unknown;
  mp4Supported?: boolean;
  webmSupported?: boolean;
}

interface CodecSupport {
  supported: boolean;
  codec: string;
  mediaCodec: ExportCodec;
  muxerCodec: 'V_VP9' | 'V_VP8' | '' | null;
}

interface DiagnosisOptions extends Pick<
  ExportSelectionOptions,
  'requestedFormat' | 'mode'
> {
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  format?: unknown;
  copyAudio?: boolean;
  audioCodec?: unknown;
  VideoEncoderImpl?: EncoderSupport;
  VideoFrameImpl?: typeof VideoFrame;
}

export interface VideoExportDiagnosis extends CodecSupport {
  webCodecs: boolean;
  videoFrame: boolean;
  format: ContainerFormat | '';
  extension: string;
  mimeType: string;
  mode: ExportMode;
  requestedFormat: RequestedFormat;
  reason: string;
  audioCopyRequested: boolean;
  audioCopySupported: boolean;
  audioCodec: string;
  audioReason: string;
}

const CHROMA_COLORS = {
  green: '#00ff00',
  blue: '#0047ff',
};
const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const EXPORT_RISK_LIMITS = Object.freeze({
  highBytes: 700 * MIB,
  blockBytes: 1.5 * GIB,
  highFrames: 18_000,
  blockFrames: 36_000,
  highPixelRate: 125_000_000,
});
const EXPORT_PRESET_PROFILES = Object.freeze({
  fast: Object.freeze({
    mode: 'full',
    format: 'webm',
    copyAudio: false,
    qualityEnhancer: false,
    maxWidth: 1280,
    maxHeight: 720,
    maxFps: 30,
  }),
  balanced: Object.freeze({
    mode: 'full',
    format: 'webm',
    copyAudio: false,
    qualityEnhancer: false,
    maxWidth: 1920,
    maxHeight: 1080,
    maxFps: 30,
  }),
  high: Object.freeze({
    mode: 'full',
    format: 'webm',
    copyAudio: false,
    qualityEnhancer: true,
    maxWidth: Number.POSITIVE_INFINITY,
    maxHeight: Number.POSITIVE_INFINITY,
    maxFps: 60,
  }),
  chroma: Object.freeze({
    mode: 'effects-chroma',
    format: 'webm',
    copyAudio: false,
    qualityEnhancer: false,
    maxWidth: Number.POSITIVE_INFINITY,
    maxHeight: Number.POSITIVE_INFINITY,
    maxFps: 30,
  }),
  'experimental-mp4': Object.freeze({
    mode: 'full',
    format: 'mp4',
    copyAudio: true,
    qualityEnhancer: false,
    maxWidth: 1920,
    maxHeight: 1080,
    maxFps: 30,
  }),
});
const MP4_CODEC_CANDIDATES = [
  { codec: 'avc1.640033', mediaCodec: 'avc' },
  { codec: 'avc1.64002a', mediaCodec: 'avc' },
  { codec: 'avc1.640028', mediaCodec: 'avc' },
  { codec: 'avc1.4d4028', mediaCodec: 'avc' },
  { codec: 'avc1.42001f', mediaCodec: 'avc' },
] as const;
const WEBM_CODEC_CANDIDATES = [
  { codec: 'vp09.00.10.08', mediaCodec: 'vp9' },
  { codec: 'vp09.00.10.10', mediaCodec: 'vp9' },
  { codec: 'vp8', mediaCodec: 'vp8' },
] as const;

const UNAVAILABLE_CODEC: CodecSupport = {
  supported: false,
  codec: '',
  mediaCodec: '',
  muxerCodec: '',
};

export function normalizeFrameRate(value: unknown) {
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) return null;
  return Math.min(240, Math.max(1, Math.round(fps * 1000) / 1000));
}

export function snapFrameRate(value: unknown) {
  const fps = normalizeFrameRate(value);
  if (!fps) return null;
  const nearest = COMMON_VIDEO_FPS.reduce((best, candidate) =>
    Math.abs(fps - candidate) < Math.abs(fps - best) ? candidate : best,
  );
  return Math.abs(fps - nearest) <= 0.08 ? nearest : fps;
}

export function calculateFrameRateFromMediaTimes(
  mediaTimes: readonly number[],
) {
  if (!Array.isArray(mediaTimes) || mediaTimes.length < 2) return null;
  const deltas = mediaTimes
    .slice(1)
    .map((time, index) => Number(time) - Number(mediaTimes[index]))
    .filter((delta) => Number.isFinite(delta) && delta > 0.0005)
    .sort((a, b) => a - b);
  if (!deltas.length) return null;
  const middle = Math.floor(deltas.length / 2);
  const median =
    deltas.length % 2
      ? deltas[middle]
      : (deltas[middle - 1] + deltas[middle]) / 2;
  return snapFrameRate(1 / median);
}

export function getWebmMuxerCodec(codec: unknown) {
  return typeof codec === 'string' && codec.startsWith('vp09')
    ? 'V_VP9'
    : codec === 'vp8'
      ? 'V_VP8'
      : null;
}

export function normalizeEditorExportFormat(value: unknown): RequestedFormat {
  const format = String(value || 'auto').toLowerCase();
  return format === 'mp4' || format === 'webm' ? format : 'auto';
}

export function normalizeEditorExportMode(value: unknown): ExportMode {
  const mode = String(value || 'full').toLowerCase();
  return mode === 'effects-chroma' ? mode : 'full';
}

export function normalizeEditorExportPreset(value: unknown): ExportPreset {
  const preset = String(value || 'balanced').toLowerCase();
  return Object.hasOwn(EXPORT_PRESET_PROFILES, preset)
    ? (preset as ExportPreset)
    : 'balanced';
}

export function getEditorExportPresetProfile(value: unknown) {
  const preset = normalizeEditorExportPreset(value);
  return { preset, ...EXPORT_PRESET_PROFILES[preset] };
}

export function getEditorChromaColor(value: unknown) {
  return value === 'blue' ? CHROMA_COLORS.blue : CHROMA_COLORS.green;
}

export function normalizeAudioCodec(codec: unknown) {
  const normalized = String(codec || '').toLowerCase();
  if (!normalized) return '';
  if (normalized === 'aac' || normalized.startsWith('mp4a.40')) return 'aac';
  if (normalized === 'opus') return 'opus';
  if (normalized === 'vorbis') return 'vorbis';
  if (
    normalized === 'mp3' ||
    normalized.startsWith('mp4a.69') ||
    normalized.startsWith('mp4a.6b')
  )
    return 'mp3';
  return normalized;
}

export function canCopyAudioCodecToFormat(codec: unknown, format: unknown) {
  const audioCodec = normalizeAudioCodec(codec);
  const container = normalizeEditorExportFormat(format);
  if (!audioCodec || container === 'auto') return false;
  if (container === 'mp4') return audioCodec === 'aac' || audioCodec === 'mp3';
  if (container === 'webm')
    return audioCodec === 'opus' || audioCodec === 'vorbis';
  return false;
}

export function getEditorExportMimeType(format: unknown) {
  return format === 'mp4' ? 'video/mp4' : 'video/webm';
}

export function getEditorExportExtension(format: unknown) {
  return format === 'mp4' ? 'mp4' : 'webm';
}

export function chooseEditorExportFormat({
  requestedFormat = 'auto',
  mode = 'full',
  mp4Supported = false,
  webmSupported = false,
}: ExportSelectionOptions = {}): ContainerFormat | '' {
  if (normalizeEditorExportMode(mode) === 'effects-chroma')
    return webmSupported ? 'webm' : '';
  const requested = normalizeEditorExportFormat(requestedFormat);
  if (requested === 'mp4') return mp4Supported ? 'mp4' : '';
  if (requested === 'webm') return webmSupported ? 'webm' : '';
  if (webmSupported) return 'webm';
  return mp4Supported ? 'mp4' : '';
}

function formatProgressFps(value: unknown) {
  const fps = normalizeFrameRate(value);
  if (!fps) return '?';
  return Number.isInteger(fps)
    ? String(fps)
    : fps.toFixed(3).replace(/\.?0+$/, '');
}

function formatObservedFps(value: unknown) {
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) return '?';
  if (fps < 1) return fps.toFixed(2);
  if (fps < 10) return fps.toFixed(1);
  return Math.round(fps).toString();
}

function formatObservedDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  if (minutes <= 0) return `${restSeconds}s`;
  return `${minutes}:${String(restSeconds).padStart(2, '0')}`;
}

export function formatObservedExportProgress({
  done = 0,
  total = 0,
  startedAt = 0,
  now = 0,
  fps = 0,
} = {}) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeDone = Math.min(safeTotal, Math.max(0, Number(done) || 0));
  const progress = safeDone / safeTotal;
  const percent = Math.round(progress * 100);
  const elapsedSec = Math.max(0, (Number(now) - Number(startedAt)) / 1000);
  const observedFps =
    elapsedSec >= 1.2 && safeDone >= 2 ? safeDone / elapsedSec : 0;
  if (!observedFps || safeDone < safeTotal * 0.03) {
    return translateCurrent(
      'Exportando {percent}% · salida {fps} FPS · midiendo velocidad real',
      { percent, fps: formatProgressFps(fps) },
    );
  }
  return translateCurrent(
    'Exportando {percent}% · {fps} fps reales · {elapsed} transcurridos',
    {
      percent,
      fps: formatObservedFps(observedFps),
      elapsed: formatObservedDuration(elapsedSec),
    },
  );
}

async function testVideoCodecSupport(
  VideoEncoderImpl: EncoderSupport,
  config: VideoEncoderConfig,
) {
  try {
    const support = await VideoEncoderImpl.isConfigSupported(config);
    return support?.supported
      ? {
          supported: true,
          codec: support.config?.codec || config.codec,
        }
      : { supported: false, codec: config.codec };
  } catch {
    return { supported: false, codec: config.codec };
  }
}

async function pickSupportedVideoCodec({
  format,
  width,
  height,
  fps,
  bitrate,
  VideoEncoderImpl,
}: {
  format: ContainerFormat;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  VideoEncoderImpl: EncoderSupport;
}): Promise<CodecSupport> {
  const candidates =
    format === 'mp4' ? MP4_CODEC_CANDIDATES : WEBM_CODEC_CANDIDATES;
  for (const candidate of candidates) {
    const support = await testVideoCodecSupport(VideoEncoderImpl, {
      codec: candidate.codec,
      width,
      height,
      bitrate,
      framerate: fps,
      bitrateMode: 'variable',
      latencyMode: 'quality',
    });
    if (support.supported) {
      return {
        supported: true,
        codec: support.codec,
        mediaCodec: candidate.mediaCodec,
        muxerCodec: format === 'webm' ? getWebmMuxerCodec(candidate.codec) : '',
      };
    }
  }
  return UNAVAILABLE_CODEC;
}

export async function diagnoseVideoExportSupport({
  width = 1,
  height = 1,
  fps = 30,
  bitrate = 8_000_000,
  requestedFormat = 'auto',
  format,
  mode = 'full',
  copyAudio = false,
  audioCodec = '',
  VideoEncoderImpl = globalThis.VideoEncoder,
  VideoFrameImpl = globalThis.VideoFrame,
}: DiagnosisOptions = {}): Promise<VideoExportDiagnosis> {
  const exportMode = normalizeEditorExportMode(mode);
  const requested =
    exportMode === 'effects-chroma'
      ? 'webm'
      : normalizeEditorExportFormat(format || requestedFormat);
  const safeFps = normalizeFrameRate(fps) || 30;
  const diagnosis: VideoExportDiagnosis = {
    supported: false,
    webCodecs: typeof VideoEncoderImpl !== 'undefined',
    videoFrame: typeof VideoFrameImpl !== 'undefined',
    codec: '',
    mediaCodec: '',
    muxerCodec: '',
    format: requested === 'auto' ? '' : requested,
    extension: '',
    mimeType: '',
    mode: exportMode,
    requestedFormat: requested,
    reason: '',
    audioCopyRequested: !!copyAudio && exportMode === 'full',
    audioCopySupported: false,
    audioCodec: normalizeAudioCodec(audioCodec),
    audioReason: '',
  };

  if (!VideoEncoderImpl) {
    diagnosis.reason = 'webcodecs_unavailable';
    return diagnosis;
  }
  if (!diagnosis.videoFrame) {
    diagnosis.reason = 'videoframe_unavailable';
    return diagnosis;
  }
  if (typeof VideoEncoderImpl.isConfigSupported !== 'function') {
    diagnosis.reason = 'webcodecs_config_unavailable';
    return diagnosis;
  }

  const shouldTryMp4 = requested === 'auto' || requested === 'mp4';
  const shouldTryWebm = requested === 'auto' || requested === 'webm';
  const mp4 = shouldTryMp4
    ? await pickSupportedVideoCodec({
        format: 'mp4',
        width,
        height,
        fps: safeFps,
        bitrate,
        VideoEncoderImpl,
      })
    : UNAVAILABLE_CODEC;
  const webm = shouldTryWebm
    ? await pickSupportedVideoCodec({
        format: 'webm',
        width,
        height,
        fps: safeFps,
        bitrate,
        VideoEncoderImpl,
      })
    : UNAVAILABLE_CODEC;

  const pickedFormat = chooseEditorExportFormat({
    requestedFormat: requested,
    mode: exportMode,
    mp4Supported: !!mp4.supported,
    webmSupported: !!webm.supported,
  });
  if (!pickedFormat) {
    diagnosis.reason = 'webcodecs_codec_unsupported';
    return diagnosis;
  }

  const picked = pickedFormat === 'mp4' ? mp4 : webm;
  diagnosis.supported = true;
  diagnosis.codec = picked.codec;
  diagnosis.mediaCodec = picked.mediaCodec;
  diagnosis.muxerCodec = picked.muxerCodec;
  diagnosis.format = pickedFormat;
  diagnosis.extension = getEditorExportExtension(pickedFormat);
  diagnosis.mimeType = getEditorExportMimeType(pickedFormat);

  if (!diagnosis.audioCopyRequested) {
    diagnosis.audioReason =
      exportMode === 'effects-chroma'
        ? 'effects_export_has_no_audio'
        : 'audio_copy_disabled';
  } else if (!diagnosis.audioCodec) {
    diagnosis.audioReason = 'audio_codec_unknown';
  } else if (canCopyAudioCodecToFormat(diagnosis.audioCodec, pickedFormat)) {
    diagnosis.audioCopySupported = true;
  } else {
    diagnosis.audioReason = 'audio_codec_incompatible';
  }

  return diagnosis;
}

async function pickVideoCodec(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
  requestedFormat: unknown = 'webm',
  mode: unknown = 'full',
) {
  const diagnosis = await diagnoseVideoExportSupport({
    width,
    height,
    fps,
    bitrate,
    requestedFormat,
    mode,
  });
  if (diagnosis.supported) return diagnosis;
  throw new Error('webcodecs_codec_unsupported');
}

export function calculateSourceAverageBitrate(
  fileSize: unknown,
  duration: unknown,
) {
  const bytes = Number(fileSize);
  const seconds = Number(duration);
  return Number.isFinite(bytes) &&
    bytes > 0 &&
    Number.isFinite(seconds) &&
    seconds > 0
    ? Math.round((bytes * 8) / seconds)
    : 0;
}

export function calculateExportBitrate(
  sourceBitrate: number,
  width: number,
  height: number,
  fps: number,
  enhanced = false,
) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const safeFps = Math.max(1, Number(fps) || 1);
  const qualityBitrate = Math.min(
    80_000_000,
    Math.max(
      8_000_000,
      Math.round(safeWidth * safeHeight * safeFps * (enhanced ? 0.22 : 0.18)),
    ),
  );
  return Math.max(
    Number.isFinite(sourceBitrate) ? sourceBitrate : 0,
    qualityBitrate,
  );
}

export function calculateExportDimensions({
  width = 1,
  height = 1,
  preset = 'balanced',
} = {}) {
  const profile = getEditorExportPresetProfile(preset);
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const maxWidth = Number(profile.maxWidth) || Number.POSITIVE_INFINITY;
  const maxHeight = Number(profile.maxHeight) || Number.POSITIVE_INFINITY;
  const scale = Math.min(1, maxWidth / safeWidth, maxHeight / safeHeight);
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
    scale,
  };
}

export function classifyExportMemoryRisk({
  estimatedBytes = 0,
  totalFrames = 0,
  width = 1,
  height = 1,
  fps = 30,
} = {}) {
  const safeBytes = Math.max(0, Number(estimatedBytes) || 0);
  const safeFrames = Math.max(0, Number(totalFrames) || 0);
  const pixelRate =
    Math.max(1, Number(width) || 1) *
    Math.max(1, Number(height) || 1) *
    Math.max(1, Number(fps) || 1);
  const blocked =
    safeBytes > EXPORT_RISK_LIMITS.blockBytes ||
    safeFrames > EXPORT_RISK_LIMITS.blockFrames;
  if (blocked) {
    return {
      level: 'blocked',
      label: 'Bloqueado',
      blocked: true,
      recommendation:
        'Reducí duración o usá Rápido/Balanceado antes de exportar.',
    };
  }
  const high =
    safeBytes > EXPORT_RISK_LIMITS.highBytes ||
    safeFrames > EXPORT_RISK_LIMITS.highFrames ||
    pixelRate >= EXPORT_RISK_LIMITS.highPixelRate;
  if (high) {
    return {
      level: 'high',
      label: 'Alto',
      blocked: false,
      recommendation: 'Recomendación: usar Balanceado o 720p/30.',
    };
  }
  const medium = safeBytes > 300 * MIB || safeFrames > 9_000;
  return {
    level: medium ? 'medium' : 'low',
    label: medium ? 'Medio' : 'Bajo',
    blocked: false,
    recommendation: medium
      ? 'Si la pestaña se vuelve lenta, usá Rápido.'
      : 'Listo para exportar.',
  };
}

interface ExportPreflightOptions {
  preset?: unknown;
  width?: number;
  height?: number;
  sourceFps?: number;
  duration?: number;
  sourceBitrate?: number;
  mode?: unknown;
  requestedFormat?: unknown;
  copyAudio?: boolean | null;
  qualityEnhancer?: boolean | null;
}

export function buildEditorExportPreflight({
  preset = 'balanced',
  width = 1,
  height = 1,
  sourceFps = 30,
  duration = 0,
  sourceBitrate = 0,
  mode,
  requestedFormat,
  copyAudio,
  qualityEnhancer,
}: ExportPreflightOptions = {}) {
  const profile = getEditorExportPresetProfile(preset);
  const exportMode = normalizeEditorExportMode(mode || profile.mode);
  const exportFormat =
    exportMode === 'effects-chroma'
      ? 'webm'
      : normalizeEditorExportFormat(requestedFormat || profile.format);
  const shouldCopyAudio =
    exportMode === 'full' &&
    (copyAudio == null ? profile.copyAudio : copyAudio);
  const shouldEnhance =
    qualityEnhancer == null ? profile.qualityEnhancer : !!qualityEnhancer;
  const dimensions = calculateExportDimensions({
    width,
    height,
    preset: profile.preset,
  });
  const fps = Math.min(
    normalizeFrameRate(sourceFps) || 30,
    Math.max(1, Number(profile.maxFps) || 30),
  );
  const safeDuration = Math.max(0, Number(duration) || 0);
  const totalFrames = calculateExportFrameCount(safeDuration, fps);
  const bitrate = calculateExportBitrate(
    sourceBitrate,
    dimensions.width,
    dimensions.height,
    fps,
    shouldEnhance && exportMode === 'full',
  );
  const estimatedBytes = Math.ceil((bitrate * safeDuration) / 8);
  const risk = classifyExportMemoryRisk({
    estimatedBytes,
    totalFrames,
    width: dimensions.width,
    height: dimensions.height,
    fps,
  });
  return {
    ...profile,
    mode: exportMode,
    format: exportFormat,
    copyAudio: shouldCopyAudio,
    qualityEnhancer: shouldEnhance,
    width: dimensions.width,
    height: dimensions.height,
    scale: dimensions.scale,
    fps,
    duration: safeDuration,
    totalFrames,
    bitrate,
    estimatedBytes,
    risk,
    blocked: risk.blocked,
  };
}

export function calculateExportFrameCount(duration: number, fps: number) {
  return Math.max(
    1,
    Math.round(
      Math.max(0, Number(duration) || 0) * Math.max(1, Number(fps) || 1),
    ),
  );
}

export function calculateFrameTimestampUs(frameIndex: number, fps: number) {
  return Math.round(
    ((Number(frameIndex) || 0) / Math.max(1, Number(fps) || 1)) * 1_000_000,
  );
}

export function calculateFrameDurationUs(frameIndex: number, fps: number) {
  return Math.max(
    1,
    calculateFrameTimestampUs(frameIndex + 1, fps) -
      calculateFrameTimestampUs(frameIndex, fps),
  );
}

function calculateFrameTimestampSeconds(frameIndex: number, fps: number) {
  return calculateFrameTimestampUs(frameIndex, fps) / 1_000_000;
}

function calculateFrameDurationSeconds(frameIndex: number, fps: number) {
  return calculateFrameDurationUs(frameIndex, fps) / 1_000_000;
}

export function shouldAppendFinalFrame(
  duration: number,
  fps: number,
  totalFrames: number,
) {
  const finalTimestamp = Math.round(
    Math.max(0, Number(duration) || 0) * 1_000_000,
  );
  const encodedEnd = calculateFrameTimestampUs(
    Math.max(1, Number(totalFrames) || 1),
    fps,
  );
  return finalTimestamp > encodedEnd;
}

export function formatExportDebugInfo({
  stage = 'idle',
  done = 0,
  total = 0,
  fps = 0,
  time = 0,
  width = 0,
  height = 0,
  queueSize = 0,
  note = '',
} = {}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeDone = Math.max(0, Number(done) || 0);
  const frame = safeTotal
    ? `${Math.min(safeDone, safeTotal)}/${safeTotal}`
    : `${safeDone}/?`;
  const fpsText =
    Number.isFinite(Number(fps)) && Number(fps) > 0
      ? Number(fps)
          .toFixed(3)
          .replace(/\.?0+$/, '')
      : '?';
  const timeText = Number.isFinite(Number(time))
    ? Number(time).toFixed(3)
    : '?';
  const sizeText = width && height ? `${width}x${height}` : '?x?';
  const noteText = note ? ` · ${note}` : '';
  return `stage:${stage} · frame:${frame} · fps:${fpsText} · t:${timeText}s · ${sizeText} · queue:${Math.max(0, Number(queueSize) || 0)}${noteText}`;
}

interface AudioCopyOptions {
  mediabunny: MediabunnyModule;
  output: MediaOutput;
  format: ContainerFormat | '';
  audioSourceFile: Blob | null;
  trimStart?: number;
  trimEnd?: number;
  copyAudio?: boolean;
}

interface AudioCopy {
  enabled: boolean;
  copied: boolean;
  codec: string;
  reason: string;
  input: MediaInput | null;
  track: AudioTrack | null;
  source: EncodedAudioSource | null;
  decoderConfig: AudioDecoderConfig | null;
  trimStart: number;
  trimEnd: number;
}

async function prepareAudioCopy({
  mediabunny,
  output,
  format,
  audioSourceFile,
  trimStart = 0,
  trimEnd = 0,
  copyAudio = false,
}: AudioCopyOptions): Promise<AudioCopy> {
  const result: AudioCopy = {
    enabled: false,
    copied: false,
    codec: '',
    reason: '',
    input: null,
    track: null,
    source: null,
    decoderConfig: null,
    trimStart: Math.max(0, Number(trimStart) || 0),
    trimEnd: Math.max(0, Number(trimEnd) || 0),
  };
  if (!copyAudio) {
    result.reason = 'audio_copy_disabled';
    return result;
  }
  if (!audioSourceFile) {
    result.reason = 'audio_source_missing';
    return result;
  }

  let input: MediaInput | null = null;
  try {
    const { Input, BlobSource, ALL_FORMATS, EncodedAudioPacketSource } =
      mediabunny;
    input = new Input({
      source: new BlobSource(audioSourceFile),
      formats: ALL_FORMATS,
    });
    if (!(await input.canRead())) {
      result.reason = 'audio_input_unreadable';
      return result;
    }
    const track = await input.getPrimaryAudioTrack();
    if (!track) {
      result.reason = 'audio_track_missing';
      return result;
    }
    const codec = normalizeAudioCodec(await track.getCodec());
    if (!canCopyAudioCodecToFormat(codec, format)) {
      result.codec = codec;
      result.reason = codec
        ? 'audio_codec_incompatible'
        : 'audio_codec_unknown';
      return result;
    }

    const decoderConfig = await track.getDecoderConfig();
    const source = new EncodedAudioPacketSource(codec);
    output.addAudioTrack(source);
    result.enabled = true;
    result.codec = codec;
    result.input = input;
    result.track = track;
    result.source = source;
    result.decoderConfig = decoderConfig;
    result.trimEnd = result.trimEnd || Number.POSITIVE_INFINITY;
    return result;
  } catch (err) {
    result.reason = err instanceof Error ? err.message : 'audio_copy_failed';
    return result;
  } finally {
    if (!result.enabled) disposeAudioInput(input);
  }
}

function disposeAudioInput(input: MediaInput | null) {
  try {
    input?.dispose();
  } catch {
    // Preserve the export error when releasing a failed input.
  }
}

async function writeCopiedAudioPackets(
  mediabunny: MediabunnyModule,
  audioCopy: AudioCopy,
  shouldCancel?: () => boolean,
) {
  if (!audioCopy?.enabled || !audioCopy.source || !audioCopy.track)
    return audioCopy;
  const { EncodedPacketSink } = mediabunny;
  const sink = new EncodedPacketSink(audioCopy.track);
  let firstPacket = true;
  let copiedCount = 0;

  try {
    for await (const packet of sink.packets()) {
      if (shouldCancel?.()) throw new Error('export_cancelled');
      const packetStart = Number(packet.timestamp) || 0;
      const packetEnd = packetStart + Math.max(0, Number(packet.duration) || 0);
      if (packetEnd <= audioCopy.trimStart) continue;
      if (packetStart >= audioCopy.trimEnd) break;

      const shifted = packet.clone({
        timestamp: Math.max(0, packetStart - audioCopy.trimStart),
      });
      await audioCopy.source.add(
        shifted,
        firstPacket && audioCopy.decoderConfig
          ? { decoderConfig: audioCopy.decoderConfig }
          : undefined,
      );
      firstPacket = false;
      copiedCount += 1;
    }
    audioCopy.source.close();
    audioCopy.copied = copiedCount > 0;
    audioCopy.reason = copiedCount > 0 ? '' : 'audio_packets_missing';
    return audioCopy;
  } catch (err) {
    if (err instanceof Error && err.message === 'export_cancelled') throw err;
    audioCopy.reason = err instanceof Error ? err.message : 'audio_copy_failed';
    return audioCopy;
  }
}

interface CanvasSequenceOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  duration: number;
  bitrate: number;
  renderFrame(
    frameIndex: number,
    options: {
      mode: ExportMode;
      chromaColor: string;
      format: ContainerFormat | '';
    },
  ): void | Promise<void>;
  onProgress?(
    done: number,
    total: number,
    meta: {
      stage: 'encode' | 'audio' | 'mux';
      queueSize: number;
      force?: boolean;
    },
  ): void;
  shouldCancel?(): boolean;
  requestedFormat?: RequestedFormat;
  format?: RequestedFormat;
  mode?: ExportMode;
  chromaColor?: ImageSettings['effectsExportChroma'];
  audioSourceFile?: Blob | null;
  trimStart?: number;
  trimEnd?: number;
  copyAudio?: boolean;
  diagnosis?: VideoExportDiagnosis | null;
}

/**
 * Encodes a canvas sequence through WebCodecs and Mediabunny.
 * Playback speed matches source fps regardless of how fast frames are rendered.
 */
export async function encodeCanvasSequence({
  canvas,
  width,
  height,
  fps,
  totalFrames,
  duration,
  bitrate,
  renderFrame,
  onProgress,
  shouldCancel,
  requestedFormat = 'webm',
  format,
  mode = 'full',
  chromaColor = 'green',
  audioSourceFile = null,
  trimStart = 0,
  trimEnd = duration,
  copyAudio = false,
  diagnosis = null,
}: CanvasSequenceOptions) {
  const mediabunny = await loadMediabunny();
  const {
    Output,
    Mp4OutputFormat,
    WebMOutputFormat,
    BufferTarget,
    CanvasSource,
  } = mediabunny;
  const safeFps = Math.max(1, Number(fps) || 30);
  const safeDuration = Math.max(0, Number(duration) || 0);
  const exportMode = normalizeEditorExportMode(mode);
  const exportDiagnosis = diagnosis?.supported
    ? diagnosis
    : await pickVideoCodec(
        width,
        height,
        safeFps,
        bitrate,
        format || requestedFormat,
        exportMode,
      );
  const outputFormat =
    exportDiagnosis.format === 'mp4'
      ? new Mp4OutputFormat({ fastStart: 'in-memory' })
      : new WebMOutputFormat();
  const target = new BufferTarget();
  const output = new Output({ format: outputFormat, target });
  const keyFrameIntervalSeconds = 2;
  const keyFrameEveryFrames = Math.max(
    1,
    Math.round(safeFps * keyFrameIntervalSeconds),
  );
  const videoSource = new CanvasSource(canvas, {
    codec:
      exportDiagnosis.mediaCodec ||
      (exportDiagnosis.format === 'mp4' ? 'avc' : 'vp9'),
    bitrate: Math.max(1, Math.round(Number(bitrate) || 8_000_000)),
    keyFrameInterval: keyFrameIntervalSeconds,
    bitrateMode: 'variable',
    latencyMode: 'quality',
  });
  output.addVideoTrack(videoSource, {
    frameRate: safeFps,
  });
  const audioCopy = await prepareAudioCopy({
    mediabunny,
    output,
    format: exportDiagnosis.format,
    audioSourceFile,
    trimStart,
    trimEnd,
    copyAudio: copyAudio && exportMode === 'full',
  });

  try {
    await output.start();
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      if (shouldCancel?.()) throw new Error('export_cancelled');
      await renderFrame(frameIndex, {
        mode: exportMode,
        chromaColor: getEditorChromaColor(chromaColor),
        format: exportDiagnosis.format,
      });
      const timestamp = calculateFrameTimestampSeconds(frameIndex, safeFps);
      await videoSource.add(
        timestamp,
        calculateFrameDurationSeconds(frameIndex, safeFps),
        {
          keyFrame: frameIndex % keyFrameEveryFrames === 0,
        },
      );
      onProgress?.(frameIndex + 1, totalFrames, {
        stage: 'encode',
        queueSize: 0,
      });
      if (frameIndex % 4 === 0)
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (shouldAppendFinalFrame(safeDuration, safeFps, totalFrames)) {
      await videoSource.add(safeDuration, 0, { keyFrame: true });
    }
    videoSource.close();

    if (audioCopy.enabled) {
      onProgress?.(totalFrames, totalFrames, {
        stage: 'audio',
        queueSize: 0,
        force: true,
      });
      await writeCopiedAudioPackets(mediabunny, audioCopy, shouldCancel);
    }

    if (shouldCancel?.()) throw new Error('export_cancelled');
    onProgress?.(totalFrames, totalFrames, {
      stage: 'mux',
      queueSize: 0,
      force: true,
    });
    await output.finalize();
  } catch (err) {
    try {
      await output.cancel();
    } catch {
      // ignore cancel failures
    }
    throw err;
  } finally {
    disposeAudioInput(audioCopy.input);
  }

  if (!target.buffer) throw new Error('export_buffer_unavailable');
  const blob = new Blob([target.buffer], {
    type: exportDiagnosis.mimeType || outputFormat.mimeType,
  });
  const exportInfo = {
    format: exportDiagnosis.format,
    extension: exportDiagnosis.extension,
    mimeType: exportDiagnosis.mimeType || outputFormat.mimeType,
    codec: exportDiagnosis.codec,
    mediaCodec: exportDiagnosis.mediaCodec,
    mode: exportMode,
    chromaColor: getEditorChromaColor(chromaColor),
    audioCopied: !!audioCopy.copied,
    audioCodec: audioCopy.codec || '',
    audioReason: audioCopy.reason || '',
  };
  return Object.assign(blob, { exportInfo });
}
