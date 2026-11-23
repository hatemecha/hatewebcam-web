import { DEFAULT_CAMERA_FPS } from '../constants.ts';
import { COMMON_VIDEO_FPS, snapVideoSourceFps } from '../media-format.ts';

type CalculateFrameRate = (mediaTimes: number[]) => number | null;

type CapturableVideo = HTMLVideoElement & { captureStream?(): MediaStream };

function probeVideoFrameRate(
  video: HTMLVideoElement,
  calculateFrameRate: CalculateFrameRate,
  signal: AbortSignal,
): Promise<number | null> {
  if (typeof video.requestVideoFrameCallback !== 'function')
    return Promise.resolve(null);
  const savedTime = video.currentTime;
  const wasPaused = video.paused;
  const mediaTimes: number[] = [];
  let callbackId: number | null = null;
  let frameCount = 0;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (fps: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      if (callbackId !== null) video.cancelVideoFrameCallback?.(callbackId);
      if (!signal.aborted) {
        video.pause();
        video.currentTime = savedTime;
        if (!wasPaused) void video.play().catch(() => {});
      }
      resolve(snapVideoSourceFps(fps, COMMON_VIDEO_FPS));
    };
    const onAbort = () => finish(null);
    const timeout = setTimeout(
      () => finish(calculateFrameRate(mediaTimes)),
      3500,
    );
    signal.addEventListener('abort', onAbort, { once: true });

    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      frameCount += 1;
      const previousTime = mediaTimes.at(-1);
      if (
        Number.isFinite(metadata.mediaTime) &&
        (previousTime === undefined ||
          metadata.mediaTime - previousTime > 0.0005)
      ) {
        mediaTimes.push(metadata.mediaTime);
      }
      if (mediaTimes.length >= 25 || frameCount >= 120) {
        finish(calculateFrameRate(mediaTimes));
        return;
      }
      callbackId = video.requestVideoFrameCallback(onFrame);
    };

    void video.play().catch(() => finish(null));
    callbackId = video.requestVideoFrameCallback(onFrame);
  });
}

export async function detectVideoSourceFps(
  video: CapturableVideo,
  calculateFrameRate: CalculateFrameRate,
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted();
  const probed = await probeVideoFrameRate(video, calculateFrameRate, signal);
  signal.throwIfAborted();
  if (probed) return probed;

  if (video.captureStream) {
    const stream = video.captureStream();
    try {
      const fps = snapVideoSourceFps(
        Number(stream.getVideoTracks()[0]?.getSettings().frameRate),
        COMMON_VIDEO_FPS,
      );
      if (fps) return fps;
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  const quality = video.getVideoPlaybackQuality?.();
  if (quality && video.currentTime > 0.2) {
    const fps = snapVideoSourceFps(
      quality.totalVideoFrames / video.currentTime,
      COMMON_VIDEO_FPS,
    );
    if (fps) return fps;
  }
  return DEFAULT_CAMERA_FPS;
}
