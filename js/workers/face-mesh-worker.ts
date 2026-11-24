import type {
  FaceLandmark,
  FaceMesh,
  FaceMeshOptions,
  FaceMeshResults,
  FaceMeshWorkerRequest,
  FaceMeshWorkerResponse,
} from './face-mesh-protocol.ts';

// Classic worker: the vendored FaceMesh loader uses importScripts and already
// supports OffscreenCanvas. Never send its rendered image back to the UI.
type WorkerResults = FaceMeshResults & { image?: { close?(): void } };
const worker = self as DedicatedWorkerGlobalScope & {
  FaceMesh?: new (
    options: FaceMeshOptions,
  ) => FaceMesh<OffscreenCanvas, WorkerResults>;
};
let mesh: FaceMesh<OffscreenCanvas, WorkerResults> | null = null;
let settingsKey = '';
let queue = Promise.resolve();
interface ResultWaiter {
  resolve(value: FaceMeshResults): void;
  reject(error: unknown): void;
}
let resultsWaiter: ResultWaiter | null = null;
let frameCanvas: OffscreenCanvas | null = null;
let frameCtx: OffscreenCanvasRenderingContext2D | null = null;

function installLocateFileGuard(locateFile: FaceMeshOptions['locateFile']) {
  let moduleValue = { locateFile };
  Object.defineProperty(worker, 'Module', {
    configurable: true,
    get() {
      return moduleValue;
    },
    set(value: unknown) {
      if (value && typeof value === 'object') {
        moduleValue = Object.assign(value, { locateFile });
      } else {
        moduleValue = { locateFile };
      }
    },
  });
}

function serializeLandmarks(multiFaceLandmarks: FaceLandmark[][]) {
  return (multiFaceLandmarks || []).map((face) =>
    Array.from(face || [], (landmark) => ({
      x: landmark.x,
      y: landmark.y,
      z: landmark.z,
    })),
  );
}

function waitForResults() {
  return new Promise<FaceMeshResults>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (resultsWaiter !== waiter) return;
      resultsWaiter = null;
      reject(new Error('face_mesh_results_timeout'));
    }, 5000);
    const waiter: ResultWaiter = {
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

function bitmapToOffscreenCanvas(bitmap: ImageBitmap) {
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
  if (!frameCtx) throw new Error('face_mesh_canvas_unavailable');
  frameCtx.clearRect(0, 0, width, height);
  frameCtx.drawImage(bitmap, 0, 0, width, height);
  return frameCanvas;
}

function post(response: FaceMeshWorkerResponse) {
  worker.postMessage(response);
}

worker.onmessage = ({ data }: MessageEvent<FaceMeshWorkerRequest>) => {
  queue = queue.then(async () => {
    try {
      if (data.type === 'init') {
        const locateFile = (file: string) => new URL(file, data.baseUrl).href;
        // Packed-assets and WASM glue reset global Module while loading; keep
        // locateFile attached so .wasm/.data resolve under vendor/, not /assets/.
        installLocateFileGuard(locateFile);
        importScripts(locateFile('face_mesh.js'));
        if (!worker.FaceMesh) throw new Error('face_mesh_unavailable');
        mesh = new worker.FaceMesh({ locateFile });
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
        const warmContext = warm.getContext('2d');
        if (!warmContext) throw new Error('face_mesh_canvas_unavailable');
        warmContext.fillRect(0, 0, 64, 64);
        const warmResults = waitForResults();
        await Promise.all([mesh.send({ image: warm }), warmResults]);
        post({ id: data.id, results: { multiFaceLandmarks: [] } });
      } else if (data.type === 'analyze') {
        if (!mesh) throw new Error('face_mesh_not_ready');
        const nextKey = JSON.stringify(data.settings);
        if (nextKey !== settingsKey) {
          mesh.setOptions(data.settings);
          settingsKey = nextKey;
        }
        const frame = bitmapToOffscreenCanvas(data.bitmap);
        const pendingResults = waitForResults();
        const [, results] = await Promise.all([
          mesh.send({ image: frame }),
          pendingResults,
        ]);
        post({ id: data.id, results });
      }
    } catch (error) {
      const waiter = resultsWaiter;
      resultsWaiter = null;
      waiter?.reject(error);
      post({
        id: data.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (data.type === 'analyze') data.bitmap.close();
    }
  });
};
