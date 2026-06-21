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

function checkReusableMorphologyBuffers() {
  const fakeContext = {
    drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
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
}

await checkCameraStreamCleanup();
checkReusableMorphologyBuffers();
console.log('Unit check passed.');
