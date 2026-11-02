// Classic worker: the vendored FaceMesh loader uses importScripts and already
// supports OffscreenCanvas. Never send its rendered image back to the UI.
let mesh;
let settingsKey = '';
let queue = Promise.resolve();
let resultsWaiter = null;
let frameCanvas = null;
let frameCtx = null;

function installLocateFileGuard(locateFile) {
  let moduleValue = { locateFile };
  Object.defineProperty(self, 'Module', {
    configurable: true,
    get() {
      return moduleValue;
    },
    set(value) {
      moduleValue = value && typeof value === 'object' ? value : {};
      moduleValue.locateFile = locateFile;
    },
  });
}

function serializeLandmarks(multiFaceLandmarks) {
  return (multiFaceLandmarks || []).map((face) =>
    Array.from(face || [], (landmark) => ({
      x: landmark.x,
      y: landmark.y,
      z: landmark.z,
    })),
  );
}

function waitForResults() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (resultsWaiter !== waiter) return;
      resultsWaiter = null;
      reject(new Error('face_mesh_results_timeout'));
    }, 5000);
    const waiter = {
      resolve(value) {
        clearTimeout(timer);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      },
    };
    resultsWaiter = waiter;
  });
}

function bitmapToOffscreenCanvas(bitmap) {
  const width = Math.max(1, bitmap.width || 1);
  const height = Math.max(1, bitmap.height || 1);
  if (
    !frameCanvas ||
    frameCanvas.width !== width ||
    frameCanvas.height !== height
  ) {
    frameCanvas = new OffscreenCanvas(width, height);
    frameCtx = frameCanvas.getContext('2d', { desynchronized: true });
  }
  frameCtx.clearRect(0, 0, width, height);
  frameCtx.drawImage(bitmap, 0, 0, width, height);
  return frameCanvas;
}

self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      if (data.type === 'init') {
        const locateFile = (file) => new URL(file, data.baseUrl).href;
        // Packed-assets and WASM glue reset global Module while loading; keep
        // locateFile attached so .wasm/.data resolve under vendor/, not /assets/.
        installLocateFileGuard(locateFile);
        importScripts(locateFile('face_mesh.js'));
        mesh = new self.FaceMesh({ locateFile });
        mesh.onResults((value) => {
          const payload = {
            multiFaceLandmarks: serializeLandmarks(value.multiFaceLandmarks),
          };
          value.image?.close?.();
          const waiter = resultsWaiter;
          resultsWaiter = null;
          waiter?.resolve(payload);
        });
        await mesh.initialize();
        // Warm the GL upload path with a tiny canvas so the first real frame
        // does not hit an uninitialized Solution renderer.
        const warm = new OffscreenCanvas(64, 64);
        warm.getContext('2d').fillRect(0, 0, 64, 64);
        const warmResults = waitForResults();
        await mesh.send({ image: warm });
        await warmResults;
        self.postMessage({ id: data.id, results: { multiFaceLandmarks: [] } });
      } else if (data.type === 'analyze') {
        const nextKey = JSON.stringify(data.settings);
        if (nextKey !== settingsKey) {
          mesh.setOptions(data.settings);
          settingsKey = nextKey;
        }
        const frame = bitmapToOffscreenCanvas(data.bitmap);
        const pendingResults = waitForResults();
        await mesh.send({ image: frame });
        const results = await pendingResults;
        self.postMessage({ id: data.id, results });
      } else {
        self.postMessage({ id: data.id, results: { multiFaceLandmarks: [] } });
      }
    } catch (error) {
      const waiter = resultsWaiter;
      resultsWaiter = null;
      waiter?.reject(error);
      self.postMessage({ id: data.id, error: error.message || String(error) });
    } finally {
      data.bitmap?.close();
    }
  });
};
