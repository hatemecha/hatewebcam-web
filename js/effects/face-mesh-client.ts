import type {
  FaceMesh,
  FaceMeshOptions,
  FaceMeshRequest,
  FaceMeshResults,
  FaceMeshSettings,
  FaceMeshWorkerRequest,
  FaceMeshWorkerResponse,
} from '../workers/face-mesh-protocol.ts';

type FaceSource = HTMLVideoElement | HTMLCanvasElement;

interface FaceFrameBuffer {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
}

const environment = globalThis as typeof globalThis & {
  HATEWEBCAM_FACE_MESH_WORKER?: boolean;
  FaceMesh?: new (options: FaceMeshOptions) => FaceMesh<FaceSource>;
};

function mainThreadMesh(options: FaceMeshOptions): FaceMesh<FaceSource> {
  if (!environment.FaceMesh) throw new Error('face_mesh_unavailable');
  return new environment.FaceMesh(options);
}

function getFrameSize(source: FaceSource) {
  return {
    width: ('videoWidth' in source && source.videoWidth) || source.width || 0,
    height:
      ('videoHeight' in source && source.videoHeight) || source.height || 0,
  };
}

// Shared FaceMesh input prep. Landmarks are normalized, so analysis can run on
// a much smaller frame than the camera/recording canvas.
export function prepareFaceMeshInput(
  source: FaceSource | null,
  state: FaceFrameBuffer,
  { maxEdge = 480, alpha = false } = {},
) {
  if (!source) return null;
  const { width, height } = getFrameSize(source);
  if (width <= 0 || height <= 0) return source;

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale >= 0.999) return source;

  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  if (!state.canvas) {
    state.canvas = document.createElement('canvas');
    state.ctx = state.canvas.getContext('2d', { alpha });
  }
  if (
    state.canvas.width !== targetWidth ||
    state.canvas.height !== targetHeight
  ) {
    state.canvas.width = targetWidth;
    state.canvas.height = targetHeight;
  }
  if (!state.ctx) return source;
  state.ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  return state.canvas;
}

// FaceMesh.send() returns a Promise, but its WASM work still blocks the thread
// that owns the instance. A classic-worker port exists in face-mesh-worker.ts,
// but this vendored FaceMesh build leaves its GL context undefined in workers
// (`Cannot read properties of undefined (reading 'canvas')`). Keep the API
// seam so we can switch backends later without touching detectors again.
export function createFaceMesh(options: FaceMeshOptions): FaceMesh<FaceSource> {
  if (environment.HATEWEBCAM_FACE_MESH_WORKER === true) {
    if (
      typeof Worker !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof createImageBitmap === 'function'
    ) {
      try {
        return new FaceMeshClient(options);
      } catch {
        // Fall through to the main-thread implementation.
      }
    }
  }
  return mainThreadMesh(options);
}

export class FaceMeshClient implements FaceMesh<FaceSource> {
  private readonly settings: FaceMeshSettings = {};
  private callback: (results: FaceMeshResults) => void = () => {};
  private readonly pending = new Map<
    number,
    {
      resolve: (results: FaceMeshResults) => void;
      reject: (error: Error) => void;
    }
  >();
  private sequence = 0;
  private closed = false;
  private sending = false;
  private worker: Worker | null;
  private fallback: FaceMesh<FaceSource> | null = null;
  private initialization: Promise<void> | null = null;

  constructor(private readonly options: FaceMeshOptions) {
    const worker = new Worker(
      new URL('../workers/face-mesh-worker.ts', import.meta.url),
    );
    this.worker = worker;
    worker.onmessage = ({ data }: MessageEvent<FaceMeshWorkerResponse>) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      this.pending.delete(data.id);
      if ('error' in data) request.reject(new Error(data.error));
      else request.resolve(data.results);
    };
    worker.onerror = (event) => {
      for (const request of this.pending.values()) {
        request.reject(new Error(event.message || 'face_worker_failed'));
      }
      this.pending.clear();
    };
  }

  private request(
    message: FaceMeshRequest,
    transfer: Transferable[] = [],
  ): Promise<FaceMeshResults> {
    const worker = this.worker;
    if (this.closed || !worker)
      return Promise.reject(new Error('face_mesh_closed'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      try {
        worker.postMessage(
          { id, ...message } satisfies FaceMeshWorkerRequest,
          transfer,
        );
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  setOptions(settings: FaceMeshSettings) {
    Object.assign(this.settings, settings);
    this.fallback?.setOptions(settings);
  }

  onResults(callback: (results: FaceMeshResults) => void) {
    this.callback = callback;
    this.fallback?.onResults(callback);
  }

  initialize() {
    if (!this.initialization) {
      const baseUrl = new URL(this.options.locateFile(''), document.baseURI)
        .href;
      this.initialization = this.request({ type: 'init', baseUrl }).then(
        () => {},
        async (error: unknown) => {
          await this.enableFallback(error);
        },
      );
    }
    return this.initialization;
  }

  private async enableFallback(reason: unknown): Promise<FaceMesh<FaceSource>> {
    if (this.closed) throw reason || new Error('face_mesh_closed');
    if (this.fallback) return this.fallback;
    try {
      this.worker?.terminate();
    } catch {
      // Worker may already be dead after a GL/init failure.
    }
    this.worker = null;
    this.fallback = mainThreadMesh(this.options);
    this.fallback.setOptions(this.settings);
    this.fallback.onResults(this.callback);
    await this.fallback.initialize();
    return this.fallback;
  }

  async send({ image }: { image: FaceSource }) {
    if (this.sending || this.closed) return;
    this.sending = true;
    let bitmap: ImageBitmap | null = null;
    try {
      await this.initialize();
      if (this.closed) return;
      if (this.fallback) return await this.fallback.send({ image });
      const maxEdge = 640;
      const { width, height } = getFrameSize(image);
      const scale =
        width > 0 && height > 0
          ? Math.min(1, maxEdge / Math.max(width, height))
          : 1;
      try {
        bitmap =
          scale < 1
            ? await createImageBitmap(image, {
                resizeWidth: Math.max(1, Math.round(width * scale)),
                resizeHeight: Math.max(1, Math.round(height * scale)),
                resizeQuality: 'low',
              })
            : await createImageBitmap(image);
      } catch {
        bitmap = await createImageBitmap(image);
      }
      if (this.closed) return;
      let result: FaceMeshResults;
      try {
        result = await this.request(
          { type: 'analyze', bitmap, settings: { ...this.settings } },
          [bitmap],
        );
      } catch (error) {
        const fallback = await this.enableFallback(error);
        if (this.closed) return;
        return await fallback.send({ image });
      }
      if (!this.closed) this.callback(result);
    } finally {
      bitmap?.close?.();
      this.sending = false;
    }
  }

  close() {
    this.closed = true;
    try {
      this.worker?.terminate();
    } catch {
      // ignore
    }
    this.worker = null;
    for (const request of this.pending.values()) {
      request.reject(new Error('face_mesh_closed'));
    }
    this.pending.clear();
    return this.fallback?.close();
  }
}
