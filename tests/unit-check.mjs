import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  getProcessingFrameDimensions,
  getPreviewFrameDimensions,
} from '../js/preview-metrics.mjs';

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
  assert.throws(() => timeline.add('blink', 0, 3), /dentro del recorte/);
  assert.throws(() => timeline.setTrim(4, 16), /fuera del nuevo recorte/);

  timeline.upsert({ ...look, startTime: 3, endTime: 6 });
  timeline.remove(face.id);
  assert.equal(timeline.activeAt(6).length, 0);
}

function checkEditorHistoryUndoRedo() {
  const EditorHistory = loadClass('js/editor-history.js', 'EditorHistory');
  const VideoTimeline = loadClass('js/video-timeline.js', 'VideoTimeline');
  const history = new EditorHistory();
  const timeline = new VideoTimeline(12);
  timeline.setTrim(1, 11);
  timeline.add('look', 2, 5, { contrast: 110 });
  history.push(timeline);
  timeline.setTrim(2, 10);
  timeline.items[0].startTime = 3;
  assert.ok(history.undo(timeline));
  assert.equal(timeline.trimStart, 1);
  assert.equal(timeline.items[0].startTime, 2);
  assert.ok(history.redo(timeline));
  assert.equal(timeline.trimStart, 2);
  assert.equal(timeline.items[0].startTime, 3);
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

await checkCameraStreamCleanup();
checkCameraPreservesSupportedFps();
checkReusableMorphologyBuffers();
checkBlinkDetectionUsesRefinedEyeLandmarks();
checkFaceDetectionUsesRefinedEyeLandmarks();
checkVideoTimelineIntervals();
checkEditorHistoryUndoRedo();
checkPreviewProcessingResolutionContract();
console.log('Unit check passed.');
