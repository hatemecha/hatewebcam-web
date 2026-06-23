import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  getProcessingFrameDimensions,
  getPreviewFrameDimensions,
} from '../js/preview-metrics.mjs';
import {
  calculateExportBitrate,
  calculateFrameDurationUs,
  calculateExportFrameCount,
  calculateFrameRateFromMediaTimes,
  calculateFrameTimestampUs,
  calculateSourceAverageBitrate,
  canCopyAudioCodecToFormat,
  chooseEditorExportFormat,
  diagnoseVideoExportSupport,
  formatExportDebugInfo,
  formatObservedExportProgress,
  getWebmMuxerCodec,
  normalizeFrameRate,
  snapFrameRate,
  shouldAppendFinalFrame,
} from '../js/video-export.mjs';
import { RENDER_PROFILES } from '../js/app/render-engine.mjs';
import { calculateTimelineTickInterval } from '../js/app/timeline-view.mjs';
import { applyEffectsMixin } from '../js/app/effects.mjs';
import { applyLocalvideoeditorMixin } from '../js/app/video-editor.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadClass(file, className, context = {}) {
  const source = readFileSync(resolve(rootDir, file), 'utf8');
  const sandbox = vm.createContext({ ...context });
  vm.runInContext(`${source}\n;globalThis.ExportedClass = ${className};`, sandbox, {
    filename: file,
  });
  return sandbox.ExportedClass;
}

async function checkCameraStreamCleanup() {
  let trackStopped = false;
  const stream = {
    getTracks: () => [{ stop: () => { trackStopped = true; } }],
    getVideoTracks: () => [],
  };
  const navigator = {
    mediaDevices: {
      getUserMedia: async () => stream,
    },
  };
  const CameraManager = loadClass('js/camera.js', 'CameraManager', {
    console: { warn() {} },
    navigator,
  });
  const camera = new CameraManager();
  const video = {
    srcObject: null,
    play: async () => { throw new Error('play_failed'); },
  };

  const started = await camera.start(video);
  assert.equal(started, false);
  assert.equal(trackStopped, true, 'failed playback must stop the acquired track');
  assert.equal(camera.stream, null);
  assert.equal(video.srcObject, null);
  assert.equal(camera.isRunning(), false);
}

function checkCameraPreservesSupportedFps() {
  const CameraManager = loadClass('js/camera.js', 'CameraManager', {
    console,
    navigator: { userAgent: '', mediaDevices: {} },
  });
  const camera = new CameraManager();
  const preferred = camera._buildVideoConstraints();
  const requested = camera._buildVideoConstraints(null, { fps: 30 });

  assert.equal(preferred.video.frameRate.ideal, 60, 'camera should prefer 60 FPS when supported');
  assert.equal('max' in preferred.video.frameRate, false, 'camera FPS must not be capped');
  assert.equal(requested.video.frameRate.ideal, 30, 'an explicit camera FPS should be preserved');
}

function checkReusableMorphologyBuffers() {
  let now = 0;
  let analysisCount = 0;
  const fakeContext = {
    drawImage() {},
    getImageData: (x, y, width, height) => {
      analysisCount++;
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
  };
  const document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => fakeContext,
    }),
  };
  const BlobTracking = loadClass('js/effects/blob-tracking.js', 'BlobTracking', {
    document,
    Uint8Array,
    Int32Array,
    Math,
    performance: { now: () => now },
  });
  const effect = new BlobTracking();
  effect._ensureBuffers(3, 3);

  const firstBuffer = effect._morphBufferA;
  const centroids = effect.centroids;
  const input = new Uint8Array(9).fill(255);
  effect._erode(input, firstBuffer, 3, 3);
  assert.deepEqual(Array.from(firstBuffer), [0, 0, 0, 0, 255, 0, 0, 0, 0]);

  effect._ensureBuffers(3, 3);
  assert.equal(effect._morphBufferA, firstBuffer, 'same dimensions must reuse buffers');
  effect.reset();
  assert.equal(effect.centroids, centroids, 'reset must reuse the centroids array');

  effect.setColorFromPixel(255, 0, 0);
  assert.deepEqual(Array.from(effect.hsvMin), [150, 195, 195], 'red selection must wrap the hue range');
  assert.deepEqual(Array.from(effect.hsvMax), [30, 255, 255]);

  const blob = { x: 0, y: 0, width: 20, height: 20, area: 400, cx: 10, cy: 10 };
  effect._stabilizeBlobs([blob], 0);
  const smoothed = effect._stabilizeBlobs([{ ...blob, x: 10, cx: 20 }], 30);
  assert.equal(smoothed[0].x, 6.5, 'box movement must stay responsive without jittering');
  assert.equal(effect._stabilizeBlobs([], 100).length, 1, 'short detection gaps must not flicker');
  assert.equal(effect._stabilizeBlobs([], 220).length, 0, 'stale detections must disappear');
  effect.setConfig({ labelSize: 99 });
  assert.equal(effect.getConfig().labelSize, 32, 'blob label size must clamp high values');
  effect.setConfig({ labelSize: 2 });
  assert.equal(effect.getConfig().labelSize, 8, 'blob label size must clamp low values');

  effect.processFrame(fakeContext, { width: 100, height: 100 });
  now = 20;
  effect.processFrame(fakeContext, { width: 100, height: 100 });
  assert.equal(analysisCount, 1, 'blob analysis must be reused between video frames');
  now = 50;
  effect.processFrame(fakeContext, { width: 100, height: 100 });
  assert.equal(analysisCount, 2, 'blob analysis must resume at its configured interval');

  now = 100;
  effect.processFrame(fakeContext, { width: 640, height: 360 });
  const workSize = [effect._workW, effect._workH];
  now = 150;
  effect.processFrame(fakeContext, { width: 1600, height: 900 });
  assert.deepEqual([effect._workW, effect._workH], workSize, 'preview quality must not change detector resolution');
  const previewAnalysisCount = analysisCount;
  now = 151;
  effect.processFrame(fakeContext, { width: 1600, height: 900 }, null, RENDER_PROFILES.preview);
  assert.equal(analysisCount, previewAnalysisCount, 'preview profile must keep detector throttling');
  effect.processFrame(fakeContext, { width: 1600, height: 900 }, null, RENDER_PROFILES.export);
  assert.equal(analysisCount, previewAnalysisCount + 1, 'export profile must force per-frame analysis');
}

function checkBlinkDetectionUsesRefinedEyeLandmarks() {
  let options;
  class FaceMesh {
    setOptions(value) { options = value; }
    onResults() {}
    initialize() { return Promise.resolve(); }
  }
  const BlinkDetection = loadClass('js/effects/blink-detection.js', 'BlinkDetection', {
    console,
    FaceMesh,
  });

  const effect = new BlinkDetection();
  assert.equal(options.refineLandmarks, true, 'blink detection needs refined eye landmarks');
  assert.equal(effect.minClosedFrames, 1, 'blink response should not wait for extra frames');
  assert.equal(effect._earSmoothing, 0.35, 'eye smoothing must prioritize low latency');
}

async function checkBlinkCallbackClearsWhenBlobDisabled() {
  const app = {
    chkBlobTracking: { checked: false },
    blobTrackingEffect: {},
    blinkDetectionEffect: {
      callback: () => {},
      setBlinkCallback(callback) { this.callback = callback; },
    },
    effectManager: { removeEffect(effect) { assert.equal(effect, app.blobTrackingEffect); } },
    effectsInfo: { textContent: '' },
    colorPickSection: { classList: { add() {}, remove() {} } },
    syncQuickDetectorSettingsFromEffects() {},
    saveActiveEffectSettings() {},
    renderEffectConfig() {},
    updateEffectsInfo() {},
  };
  applyEffectsMixin(app);
  await app.toggleEffect('blob');
  assert.equal(app.blobTrackingEffect, null);
  assert.equal(app.blinkDetectionEffect.callback, null, 'blink must stop calling color tracking when color detector is disabled');
}

function checkFaceDetectionUsesRefinedEyeLandmarks() {
  let options;
  class FaceMesh {
    setOptions(value) { options = value; }
    onResults() {}
    initialize() { return Promise.resolve(); }
  }
  const FaceDetection = loadClass('js/effects/face-detection.js', 'FaceDetection', {
    console,
    document: { createElement: () => ({ getContext: () => ({}) }) },
    FaceMesh,
  });

  const effect = new FaceDetection();
  assert.equal(options.refineLandmarks, true, 'shared face landmarks must preserve blink accuracy');
  assert.equal(effect.processIntervalMs, 30, 'face analysis must refresh near video frame rate');
  assert.equal(effect.boxSmoothing, 0.5, 'face boxes must respond without excessive lag');
  assert.equal(effect.detectionHoldMs, 120, 'short gaps may be held without leaving stale boxes');
  assert.equal(effect.showBox, true, 'face boxes must be enabled by default');
  assert.equal(effect.showBlur, false, 'face blur must be opt-in');
  effect.setConfig({ labelSize: 99 });
  assert.equal(effect.getConfig().labelSize, 32, 'face label size must clamp high values');
  effect.setConfig({ labelSize: 2 });
  assert.equal(effect.getConfig().labelSize, 8, 'face label size must clamp low values');
  effect.setConfig({ visualMode: 'hybrid' });
  assert.equal(effect.showBox, true, 'hybrid mode must keep box enabled');
  assert.equal(effect.showBlur, true, 'hybrid mode must keep blur enabled');
  assert.equal(effect.getConfig().visualMode, 'hybrid', 'legacy visualMode must stay compatible');
  effect.setConfig({ showBox: false, showBlur: true });
  assert.equal(effect.getConfig().visualMode, 'pixelate', 'blur-only mode must map to pixelate');
}

function checkVideoTimelineIntervals() {
  const VideoTimeline = loadClass('js/video-timeline.js', 'VideoTimeline');
  const timeline = new VideoTimeline(20);
  timeline.setTrim(2, 18);
  const look = timeline.add('look', 2, 8, { contrast: 120 });
  const face = timeline.add('face', 6, 10, { visualMode: 'pixelate' });

  assert.deepEqual(Array.from(timeline.activeAt(2), (item) => item.type), ['look']);
  assert.deepEqual(Array.from(timeline.activeAt(6), (item) => item.type), ['look', 'face']);
  assert.deepEqual(Array.from(timeline.activeAt(8), (item) => item.type), ['face'], 'end boundaries must be exclusive');
  assert.throws(() => timeline.add('look', 7, 9), /superponer/);
  timeline.add('look', 8, 9, { contrast: 90 });
  assert.throws(() => timeline.add('blink', 0, 3), /dentro del recorte/);
  assert.throws(() => timeline.setTrim(4, 16), /fuera del nuevo recorte/);

  timeline.upsert({ ...look, startTime: 3, endTime: 6 });
  timeline.remove(face.id);
  assert.equal(timeline.activeAt(6).length, 0);

  const added = timeline.toggleMarker(5.123, 0.08);
  assert.equal(added.action, 'added');
  assert.equal(timeline.markers[0].time, 5.123);
  assert.ok(timeline.getSnapPoints().includes(5.123), 'markers must be timeline snap points');
  const removed = timeline.toggleMarker(5.16, 0.08);
  assert.equal(removed.action, 'removed');
  assert.equal(timeline.markers.length, 0);
}

function checkTimelineClipSnappingHelper() {
  const app = {
    videoTimeline: {
      trimStart: 0,
      trimEnd: 10,
      duration: 10,
      markers: [{ id: 'm1', time: 2.5 }],
      items: [{ id: 'a', type: 'blob', startTime: 1, endTime: 4 }],
      getSnapPoints() { return [this.trimStart, this.trimEnd, this.markers[0].time, 1, 4]; },
    },
    videoEl: { currentTime: 6 },
    chkTimelineSnap: { checked: true },
    timelineZoom: 1,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  };
  applyLocalvideoeditorMixin(app);
  assert.deepEqual(
    app.resolveTimelineClipTimes({ type: 'blob', startTime: 4.04, endTime: 7.04 }),
    { startTime: 4, endTime: 7 },
    'new clips must snap to the nearest same-track edge'
  );
  assert.deepEqual(
    app.resolveTimelineClipTimes({ type: 'face', startTime: 5.9, endTime: 7.9 }),
    { startTime: 6, endTime: 8 },
    'new clips must snap to the playhead when it is closer'
  );
  assert.equal(app.snapTimelineTime(2.46), 2.5, 'timeline cursor must snap to markers');
  assert.deepEqual(
    app.getTimelineRowStyle(2),
    { top: 'calc(2 * 20%)', height: '20%' },
    'timeline clips must fill the full effect row height'
  );
}

function checkEditorHistoryUndoRedo() {
  const EditorHistory = loadClass('js/editor-history.js', 'EditorHistory');
  const VideoTimeline = loadClass('js/video-timeline.js', 'VideoTimeline');
  const history = new EditorHistory();
  const timeline = new VideoTimeline(12);
  timeline.setTrim(1, 11);
  timeline.add('look', 2, 5, { contrast: 110 });
  timeline.toggleMarker(6, 0.08);
  history.push(timeline);
  timeline.setTrim(2, 10);
  timeline.items[0].startTime = 3;
  timeline.markers[0].time = 7;
  assert.ok(history.undo(timeline));
  assert.equal(timeline.trimStart, 1);
  assert.equal(timeline.items[0].startTime, 2);
  assert.equal(timeline.markers[0].time, 6);
  assert.ok(history.redo(timeline));
  assert.equal(timeline.trimStart, 2);
  assert.equal(timeline.items[0].startTime, 3);
  assert.equal(timeline.markers[0].time, 7);
}

function checkPreviewProcessingResolutionContract() {
  const sourceWidth = 1920;
  const sourceHeight = 1080;
  const processing = getProcessingFrameDimensions(sourceWidth, sourceHeight);
  const draftPreview = getPreviewFrameDimensions(sourceWidth, sourceHeight, 'draft');
  const fullPreview = getPreviewFrameDimensions(sourceWidth, sourceHeight, 'full');

  assert.equal(processing.width, sourceWidth, 'processing width must match source');
  assert.equal(processing.height, sourceHeight, 'processing height must match source');
  assert.equal(fullPreview.width, sourceWidth, 'full preview must match source');
  assert.equal(fullPreview.height, sourceHeight, 'full preview must match source');
  assert.ok(draftPreview.width < processing.width, 'draft preview must downscale display width');
  assert.ok(draftPreview.height < processing.height, 'draft preview must downscale display height');
  assert.notDeepEqual(
    [draftPreview.width, draftPreview.height],
    [fullPreview.width, fullPreview.height],
    'preview quality must still change display resolution'
  );
}

function checkVideoExportTimingAndQuality() {
  for (const fps of [23.976, 24, 25, 29.97, 30, 59.94, 60]) {
    const duration = 10;
    const frameCount = calculateExportFrameCount(duration, fps);
    const encodedDuration = calculateFrameTimestampUs(frameCount, fps) / 1_000_000;
    assert.ok(Math.abs(encodedDuration - duration) <= 1 / fps, `${fps} FPS duration must stay within one frame`);
    assert.equal(calculateFrameTimestampUs(1, fps), Math.round(1_000_000 / fps));
    assert.ok(calculateFrameDurationUs(0, fps) > 0, `${fps} FPS frame duration must be positive`);
  }

  assert.equal(calculateSourceAverageBitrate(10_000_000, 10), 8_000_000);
  assert.equal(calculateSourceAverageBitrate(0, 10), 0);
  assert.equal(calculateExportBitrate(12_000_000, 1920, 1080, 30), 12_000_000);
  assert.ok(calculateExportBitrate(1_000_000, 3840, 2160, 60) > 1_000_000);
  assert.equal(getWebmMuxerCodec('vp09.00.10.08'), 'V_VP9');
  assert.equal(getWebmMuxerCodec('vp8'), 'V_VP8');
  assert.equal(normalizeFrameRate('24'), 24);
  assert.equal(normalizeFrameRate(0), null);
  assert.equal(snapFrameRate(23.98), 23.976);
  assert.equal(snapFrameRate(24.04), 24);
  assert.equal(calculateFrameRateFromMediaTimes([0, 1 / 24, 2 / 24, 3 / 24]), 24);
  assert.equal(calculateFrameRateFromMediaTimes([0, 1 / 24, 2 / 24, 2 / 24, 3 / 24]), 24);
  assert.equal(calculateFrameRateFromMediaTimes([0]), null);
  assert.equal(shouldAppendFinalFrame(10, 30, 300), false, 'exact frame-grid exports must not append a duplicate final frame');
  assert.equal(shouldAppendFinalFrame(10.01, 30, 300), true, 'non-grid durations may append a final duration marker');
  assert.equal(
    formatExportDebugInfo({ stage: 'encode', done: 3, total: 10, fps: 30, time: 0.1, width: 640, height: 360, queueSize: 2 }),
    'stage:encode · frame:3/10 · fps:30 · t:0.100s · 640x360 · queue:2'
  );
  assert.equal(
    formatExportDebugInfo({ stage: 'seek-fallback', done: 579, total: 590, fps: 30, time: 19.3, width: 576, height: 576, note: 'frames_reutilizados:1' }),
    'stage:seek-fallback · frame:579/590 · fps:30 · t:19.300s · 576x576 · queue:0 · frames_reutilizados:1'
  );
}

async function checkVideoExportDiagnostics() {
  const noWebCodecs = await diagnoseVideoExportSupport({
    VideoEncoderImpl: undefined,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(noWebCodecs.supported, false);
  assert.equal(noWebCodecs.reason, 'webcodecs_unavailable');

  const noVideoFrame = await diagnoseVideoExportSupport({
    VideoEncoderImpl: class VideoEncoder {},
    VideoFrameImpl: undefined,
  });
  assert.equal(noVideoFrame.supported, false);
  assert.equal(noVideoFrame.reason, 'videoframe_unavailable');

  class UnsupportedEncoder {
    static async isConfigSupported(config) {
      return { supported: false, config };
    }
  }
  const unsupported = await diagnoseVideoExportSupport({
    VideoEncoderImpl: UnsupportedEncoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.reason, 'webcodecs_codec_unsupported');

  class Vp8Encoder {
    static async isConfigSupported(config) {
      return { supported: config.codec === 'vp8', config };
    }
  }
  const supported = await diagnoseVideoExportSupport({
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 12_000_000,
    VideoEncoderImpl: Vp8Encoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(supported.supported, true);
  assert.equal(supported.codec, 'vp8');
  assert.equal(supported.muxerCodec, 'V_VP8');
  assert.equal(supported.format, 'webm');

  class AvcEncoder {
    static async isConfigSupported(config) {
      return { supported: config.codec.startsWith('avc1.'), config };
    }
  }
  const mp4 = await diagnoseVideoExportSupport({
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 12_000_000,
    requestedFormat: 'auto',
    audioCodec: 'aac',
    copyAudio: true,
    VideoEncoderImpl: AvcEncoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(mp4.supported, true);
  assert.equal(mp4.format, 'mp4', 'auto export may use MP4 when WebM is unavailable');
  assert.equal(mp4.extension, 'mp4');
  assert.equal(mp4.mediaCodec, 'avc');
  assert.equal(mp4.audioCopySupported, true);

  class FastWebmAndMp4Encoder {
    static async isConfigSupported(config) {
      return { supported: config.codec === 'vp8' || config.codec.startsWith('avc1.'), config };
    }
  }
  const autoFast = await diagnoseVideoExportSupport({
    requestedFormat: 'auto',
    VideoEncoderImpl: FastWebmAndMp4Encoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(autoFast.format, 'webm', 'auto export must prefer fast WebM when both containers are available');

  const forcedMp4Unsupported = await diagnoseVideoExportSupport({
    requestedFormat: 'mp4',
    VideoEncoderImpl: Vp8Encoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(forcedMp4Unsupported.supported, false, 'forced MP4 must not silently fall back');

  const effectsOnly = await diagnoseVideoExportSupport({
    requestedFormat: 'mp4',
    mode: 'effects-chroma',
    VideoEncoderImpl: Vp8Encoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(effectsOnly.supported, true);
  assert.equal(effectsOnly.format, 'webm', 'effects-only chroma export must force WebM');
  assert.equal(effectsOnly.audioReason, 'effects_export_has_no_audio');
}

function checkEditorExportFormatHelpers() {
  assert.equal(chooseEditorExportFormat({ requestedFormat: 'auto', mp4Supported: true, webmSupported: true }), 'webm');
  assert.equal(chooseEditorExportFormat({ requestedFormat: 'auto', mp4Supported: false, webmSupported: true }), 'webm');
  assert.equal(chooseEditorExportFormat({ requestedFormat: 'mp4', mp4Supported: false, webmSupported: true }), '');
  assert.equal(chooseEditorExportFormat({ requestedFormat: 'mp4', mode: 'effects-chroma', mp4Supported: true, webmSupported: true }), 'webm');
  assert.equal(canCopyAudioCodecToFormat('aac', 'mp4'), true);
  assert.equal(canCopyAudioCodecToFormat('mp4a.40.2', 'mp4'), true);
  assert.equal(canCopyAudioCodecToFormat('opus', 'webm'), true);
  assert.equal(canCopyAudioCodecToFormat('aac', 'webm'), false);
  assert.equal(canCopyAudioCodecToFormat('opus', 'mp4'), false);
}

function checkPaletteDropUsesEffectTypeRow() {
  let addedType = '';
  const chip = {
    classList: { remove() {} },
    hasPointerCapture: () => false,
  };
  const app = {
    TIMELINE_EFFECT_META: {
      blob: { label: 'Color', trackLabel: 'COLOR', row: 2 },
      face: { label: 'Caras', trackLabel: 'CARAS', row: 3 },
    },
    paletteDragState: { type: 'blob', chip, moved: true },
    videoSourceFile: {},
    removeTimelineDragGhost() {},
    clearTimelineDropTargets() {},
    updateEffectTrackHighlight() {},
    showStatus() {},
    hideStatus() {},
  };
  applyLocalvideoeditorMixin(app);
  app.getTimelineRowFromClientY = () => 'face';
  app.getTimelineTime = () => 4;
  app.addTimelineEffectClip = (type, time) => {
    addedType = `${type}:${time}`;
  };
  app.removeTimelineDragGhost = () => {};
  app.finishPaletteDrag({ pointerId: 1, clientX: 100, clientY: 50 });
  assert.equal(addedType, 'blob:4', 'palette drops must use the dragged effect type, not the row under the pointer');
}

async function checkEffectsOnlyExportSkipsBaseRender() {
  const app = {
    videoTimeline: { trimStart: 2 },
    imageSettings: {
      editorExportMode: 'effects-chroma',
      effectsExportChroma: 'green',
      qualityEnhancer: true,
    },
    videoExportTotalFrames: 1,
    recordingCanvas: { width: 100, height: 100 },
    recordingCtx: {},
    progressCalls: [],
    lookCalls: 0,
    baseRenderCalls: 0,
    effectsOnlyCalls: 0,
    updateVideoExportProgress(done, total, fps, meta) {
      this.progressCalls.push(meta.stage);
    },
    seekVideoForExport: async (time) => {
      assert.equal(time, 2, 'effects-only export should seek to trim start for frame zero');
    },
    applyVideoTimelineLook() {
      this.lookCalls += 1;
    },
    syncVideoTimelineDetectorsAt: async () => {},
    ensureRecordingCanvas() {},
    renderSourceFrameBuffer() {
      this.baseRenderCalls += 1;
    },
    renderEffectsOnlyFrame(canvas, ctx, chromaColor) {
      assert.equal(chromaColor, '#00ff00');
      this.effectsOnlyCalls += 1;
    },
  };
  applyLocalvideoeditorMixin(app);
  app.seekVideoForExport = async (time) => {
    assert.equal(time, 2, 'effects-only export should seek to trim start for frame zero');
  };
  await app.renderVideoExportFrame(0, 30, { mode: 'effects-chroma', chromaColor: '#00ff00' });
  assert.equal(app.lookCalls, 0, 'effects-only export must not render LOOK as a video base transform');
  assert.equal(app.baseRenderCalls, 0, 'effects-only export must not call the full video-base renderer');
  assert.equal(app.effectsOnlyCalls, 1);
}

function checkObservedExportProgressAndTimelineTicks() {
  assert.equal(calculateTimelineTickInterval(60, 180), 30, 'narrow timelines need sparse labels');
  assert.equal(calculateTimelineTickInterval(60, 720), 10, 'wide timelines can show denser labels');

  const early = formatObservedExportProgress({ done: 1, total: 100, startedAt: 0, now: 500, fps: 30 });
  assert.ok(!early.includes('restantes'), 'early progress must not fake an ETA');
  assert.ok(early.includes('midiendo velocidad real'));

  const observed = formatObservedExportProgress({ done: 50, total: 100, startedAt: 0, now: 5000, fps: 30 });
  assert.ok(observed.includes('~5s restantes'), 'ETA must use observed processing speed');
}

await checkCameraStreamCleanup();
checkCameraPreservesSupportedFps();
checkReusableMorphologyBuffers();
checkBlinkDetectionUsesRefinedEyeLandmarks();
await checkBlinkCallbackClearsWhenBlobDisabled();
checkFaceDetectionUsesRefinedEyeLandmarks();
checkVideoTimelineIntervals();
checkTimelineClipSnappingHelper();
checkEditorHistoryUndoRedo();
checkPreviewProcessingResolutionContract();
checkVideoExportTimingAndQuality();
await checkVideoExportDiagnostics();
checkEditorExportFormatHelpers();
checkPaletteDropUsesEffectTypeRow();
await checkEffectsOnlyExportSkipsBaseRender();
checkObservedExportProgressAndTimelineTicks();
console.log('Unit check passed.');
