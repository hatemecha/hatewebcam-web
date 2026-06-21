import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

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
  assert.equal(smoothed[0].x, 4, 'box movement must be smoothed');
  assert.equal(effect._stabilizeBlobs([], 100).length, 1, 'short detection gaps must not flicker');
  assert.equal(effect._stabilizeBlobs([], 220).length, 0, 'stale detections must disappear');

  effect.processFrame(fakeContext, { width: 100, height: 100 });
  now = 20;
  effect.processFrame(fakeContext, { width: 100, height: 100 });
  assert.equal(analysisCount, 1, 'blob analysis must be reused between video frames');
  now = 50;
  effect.processFrame(fakeContext, { width: 100, height: 100 });
  assert.equal(analysisCount, 2, 'blob analysis must resume at its configured interval');
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
  assert.equal(effect.minClosedFrames, 2, 'one noisy frame must not trigger a blink');
  assert.equal(effect._earSmoothing, 0.7, 'eye movement must be smoothed');
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
  assert.equal(effect.processIntervalMs, 50, 'face analysis must not run on every video frame');
  assert.equal(effect.boxSmoothing, 0.82, 'face boxes must keep the stable smoothing default');
  assert.equal(effect.detectionHoldMs, 220, 'short detection gaps must not hide face effects');
}

await checkCameraStreamCleanup();
checkCameraPreservesSupportedFps();
checkReusableMorphologyBuffers();
checkBlinkDetectionUsesRefinedEyeLandmarks();
checkFaceDetectionUsesRefinedEyeLandmarks();
console.log('Unit check passed.');
