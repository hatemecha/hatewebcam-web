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

async function pickVideoCodec(width, height, fps, bitrate) {
  for (const codec of ['vp09.00.10.08', 'vp09.00.10.10', 'vp8']) {
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      bitrateMode: 'variable',
      latencyMode: 'quality',
    });
    if (support.supported) {
      return { codec: support.config.codec, muxerCodec: getWebmMuxerCodec(codec) };
    }
  }
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
      const duration = calculateFrameTimestampUs(frameIndex + 1, safeFps) - timestamp;
      const frame = new VideoFrame(canvas, {
        timestamp,
        duration,
      });
      encoder.encode(frame, { keyFrame: frameIndex % keyFrameInterval === 0 });
      frame.close();
      // backpressure: bound the native queue; stream to disk only if long clips make memory measurable.
      if (encoder.encodeQueueSize >= 8) await encoder.flush();
      onProgress?.(frameIndex + 1, totalFrames);
      if (frameIndex % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const finalTimestamp = Math.round(Math.max(0, Number(duration) || 0) * 1_000_000);
    const lastFrameTimestamp = calculateFrameTimestampUs(Math.max(0, totalFrames - 1), safeFps);
    if (finalTimestamp > lastFrameTimestamp) {
      const finalFrame = new VideoFrame(canvas, { timestamp: finalTimestamp });
      encoder.encode(finalFrame);
      finalFrame.close();
    }
    await encoder.flush();
    if (encoderError) throw encoderError;
  } finally {
    encoder.close();
  }

  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/webm' });
}
