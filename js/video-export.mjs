const WEBM_MUXER_URL = 'https://esm.sh/webm-muxer@5.1.0';
export const COMMON_VIDEO_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];

export function normalizeFrameRate(value) {
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) return null;
  return Math.min(240, Math.max(1, Math.round(fps * 1000) / 1000));
}

export function snapFrameRate(value) {
  const fps = normalizeFrameRate(value);
  if (!fps) return null;
  const nearest = COMMON_VIDEO_FPS.reduce((best, candidate) => (
    Math.abs(fps - candidate) < Math.abs(fps - best) ? candidate : best
  ));
  return Math.abs(fps - nearest) <= 0.08 ? nearest : fps;
}

export function calculateFrameRateFromMediaTimes(mediaTimes) {
  if (!Array.isArray(mediaTimes) || mediaTimes.length < 2) return null;
  const deltas = mediaTimes
    .slice(1)
    .map((time, index) => Number(time) - Number(mediaTimes[index]))
    .filter((delta) => Number.isFinite(delta) && delta > 0.0005)
    .sort((a, b) => a - b);
  if (!deltas.length) return null;
  const middle = Math.floor(deltas.length / 2);
  const median = deltas.length % 2
    ? deltas[middle]
    : (deltas[middle - 1] + deltas[middle]) / 2;
  return snapFrameRate(1 / median);
}

export function getWebmMuxerCodec(codec) {
  return typeof codec === 'string' && codec.startsWith('vp09') ? 'V_VP9' : codec === 'vp8' ? 'V_VP8' : null;
}

function formatProgressFps(value) {
  const fps = normalizeFrameRate(value);
  if (!fps) return '?';
  return Number.isInteger(fps) ? String(fps) : fps.toFixed(3).replace(/\.?0+$/, '');
}

function formatObservedDuration(seconds) {
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
  const observedFps = elapsedSec >= 1.2 && safeDone >= 2 ? safeDone / elapsedSec : 0;
  if (!observedFps || safeDone < safeTotal * 0.03) {
    return `Exportando ${percent}% · ${formatProgressFps(fps)} FPS · midiendo velocidad real`;
  }
  const remainingSec = (safeTotal - safeDone) / observedFps;
  return `Exportando ${percent}% · ${formatProgressFps(fps)} FPS · ~${formatObservedDuration(remainingSec)} restantes`;
}

export async function diagnoseVideoExportSupport({
  width = 1,
  height = 1,
  fps = 30,
  bitrate = 8_000_000,
  VideoEncoderImpl = globalThis.VideoEncoder,
  VideoFrameImpl = globalThis.VideoFrame,
} = {}) {
  const diagnosis = {
    supported: false,
    webCodecs: typeof VideoEncoderImpl !== 'undefined',
    videoFrame: typeof VideoFrameImpl !== 'undefined',
    codec: '',
    muxerCodec: '',
    reason: '',
  };

  if (!diagnosis.webCodecs) {
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

  for (const codec of ['vp09.00.10.08', 'vp09.00.10.10', 'vp8']) {
    let support;
    try {
      support = await VideoEncoderImpl.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        bitrateMode: 'variable',
        latencyMode: 'quality',
      });
    } catch {
      support = { supported: false };
    }
    if (support.supported) {
      diagnosis.supported = true;
      diagnosis.codec = support.config?.codec || codec;
      diagnosis.muxerCodec = getWebmMuxerCodec(codec);
      return diagnosis;
    }
  }
  diagnosis.reason = 'webcodecs_codec_unsupported';
  return diagnosis;
}

async function pickVideoCodec(width, height, fps, bitrate) {
  const diagnosis = await diagnoseVideoExportSupport({ width, height, fps, bitrate });
  if (diagnosis.supported) return { codec: diagnosis.codec, muxerCodec: diagnosis.muxerCodec };
  throw new Error('webcodecs_codec_unsupported');
}

export function calculateSourceAverageBitrate(fileSize, duration) {
  const bytes = Number(fileSize);
  const seconds = Number(duration);
  return Number.isFinite(bytes) && bytes > 0 && Number.isFinite(seconds) && seconds > 0
    ? Math.round((bytes * 8) / seconds)
    : 0;
}

export function calculateExportBitrate(sourceBitrate, width, height, fps, enhanced = false) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const safeFps = Math.max(1, Number(fps) || 1);
  const qualityBitrate = Math.min(
    80_000_000,
    Math.max(8_000_000, Math.round(safeWidth * safeHeight * safeFps * (enhanced ? 0.22 : 0.18)))
  );
  return Math.max(Number.isFinite(sourceBitrate) ? sourceBitrate : 0, qualityBitrate);
}

export function calculateExportFrameCount(duration, fps) {
  return Math.max(1, Math.round(Math.max(0, Number(duration) || 0) * Math.max(1, Number(fps) || 1)));
}

export function calculateFrameTimestampUs(frameIndex, fps) {
  return Math.round(((Number(frameIndex) || 0) / Math.max(1, Number(fps) || 1)) * 1_000_000);
}

export function calculateFrameDurationUs(frameIndex, fps) {
  return Math.max(1, calculateFrameTimestampUs(frameIndex + 1, fps) - calculateFrameTimestampUs(frameIndex, fps));
}

export function shouldAppendFinalFrame(duration, fps, totalFrames) {
  const finalTimestamp = Math.round(Math.max(0, Number(duration) || 0) * 1_000_000);
  const encodedEnd = calculateFrameTimestampUs(Math.max(1, Number(totalFrames) || 1), fps);
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
  const frame = safeTotal ? `${Math.min(safeDone, safeTotal)}/${safeTotal}` : `${safeDone}/?`;
  const fpsText = Number.isFinite(Number(fps)) && Number(fps) > 0 ? Number(fps).toFixed(3).replace(/\.?0+$/, '') : '?';
  const timeText = Number.isFinite(Number(time)) ? Number(time).toFixed(3) : '?';
  const sizeText = width && height ? `${width}x${height}` : '?x?';
  const noteText = note ? ` · ${note}` : '';
  return `stage:${stage} · frame:${frame} · fps:${fpsText} · t:${timeText}s · ${sizeText} · queue:${Math.max(0, Number(queueSize) || 0)}${noteText}`;
}

/**
 * Encodes a canvas sequence to WebM with explicit frame timestamps (microseconds).
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
}) {
  const { Muxer, ArrayBufferTarget } = await import(WEBM_MUXER_URL);
  const safeFps = Math.max(1, Number(fps) || 30);
  const keyFrameInterval = Math.max(1, Math.round(safeFps * 2));
  const { codec, muxerCodec } = await pickVideoCodec(width, height, safeFps, bitrate);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: muxerCodec,
      width,
      height,
      frameRate: safeFps,
    },
    firstTimestampBehavior: 'offset',
  });

  let encoderError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => { encoderError = err; },
  });

  encoder.configure({
    codec,
    width,
    height,
    bitrate,
    framerate: safeFps,
    bitrateMode: 'variable',
    latencyMode: 'quality',
  });

  try {
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      if (shouldCancel?.()) throw new Error('export_cancelled');
      await renderFrame(frameIndex);
      if (encoderError) throw encoderError;
      const timestamp = calculateFrameTimestampUs(frameIndex, safeFps);
      const frame = new VideoFrame(canvas, {
        timestamp,
        duration: calculateFrameDurationUs(frameIndex, safeFps),
      });
      encoder.encode(frame, { keyFrame: frameIndex % keyFrameInterval === 0 });
      frame.close();
      // backpressure: bound the native queue; stream to disk only if long clips make memory measurable.
      if (encoder.encodeQueueSize >= 8) await encoder.flush();
      onProgress?.(frameIndex + 1, totalFrames, {
        stage: 'encode',
        queueSize: encoder.encodeQueueSize,
      });
      if (frameIndex % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const finalTimestamp = Math.round(Math.max(0, Number(duration) || 0) * 1_000_000);
    if (shouldAppendFinalFrame(duration, safeFps, totalFrames)) {
      const finalFrame = new VideoFrame(canvas, { timestamp: finalTimestamp });
      encoder.encode(finalFrame);
      finalFrame.close();
    }
    onProgress?.(totalFrames, totalFrames, { stage: 'mux', queueSize: encoder.encodeQueueSize, force: true });
    await encoder.flush();
    if (encoderError) throw encoderError;
  } finally {
    encoder.close();
  }

  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/webm' });
}
