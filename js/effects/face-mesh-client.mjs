// Shared FaceMesh input prep. Landmarks are normalized, so analysis can run on
// a much smaller frame than the camera/recording canvas.
export function prepareFaceMeshInput(
  source,
  state,
  { maxEdge = 480, alpha = false } = {},
) {
  if (!source) return null;
  const width = source.videoWidth || source.width || 0;
  const height = source.videoHeight || source.height || 0;
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
  state.ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  return state.canvas;
}

// FaceMesh.send() returns a Promise, but its WASM work still blocks the thread
// that owns the instance. A classic-worker port exists in face-mesh-worker.js,
// but this vendored FaceMesh build leaves its GL context undefined in workers
// (`Cannot read properties of undefined (reading 'canvas')`). Keep the API
// seam so we can switch backends later without touching detectors again.
export function createFaceMesh(options) {
  if (globalThis.HATEWEBCAM_FACE_MESH_WORKER === true) {
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
  return new globalThis.FaceMesh(options);
}

export class FaceMeshClient {
  constructor(options) {
    this.options = options;
    this.settings = {};
    this.callback = () => {};
    this.pending = new Map();
    this.sequence = 0;
    this.closed = false;
    this.sending = false;
    this.worker = new Worker(
      new URL('../workers/face-mesh-worker.js', import.meta.url),
    );
    this.worker.onmessage = ({ data }) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      this.pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data);
    };
    this.worker.onerror = (event) => {
      for (const request of this.pending.values()) {
        request.reject(new Error(event.message || 'face_worker_failed'));
      }
      this.pending.clear();
    };
  }

  request(type, data = {}, transfer = []) {
    if (this.closed) return Promise.reject(new Error('face_mesh_closed'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ type, id, ...data }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  setOptions(settings) {
    Object.assign(this.settings, settings);
    this.fallback?.setOptions(settings);
  }

  onResults(callback) {
    this.callback = callback;
    this.fallback?.onResults(callback);
  }

  initialize() {
    if (!this.initialization) {
      const baseUrl = new URL(this.options.locateFile(''), document.baseURI)
        .href;
      this.initialization = this.request('init', { baseUrl }).catch((error) =>
        this.enableFallback(error),
      );
    }
    return this.initialization;
  }

  async enableFallback(reason) {
    if (this.closed) throw reason || new Error('face_mesh_closed');
    if (this.fallback) return;
    try {
      this.worker?.terminate();
    } catch {
      // Worker may already be dead after a GL/init failure.
    }
    this.worker = null;
    this.fallback = new globalThis.FaceMesh(this.options);
    this.fallback.setOptions(this.settings);
    this.fallback.onResults(this.callback);
    await this.fallback.initialize();
  }

  async send({ image }) {
    if (this.sending || this.closed) return;
    this.sending = true;
    let bitmap;
    try {
      await this.initialize();
      if (this.closed) return;
      if (this.fallback) return await this.fallback.send({ image });
      const maxEdge = 640;
      const width = image.videoWidth || image.width || 0;
      const height = image.videoHeight || image.height || 0;
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
      let result;
      try {
        result = await this.request(
          'analyze',
          { bitmap, settings: { ...this.settings } },
          [bitmap],
        );
      } catch (error) {
        bitmap = null;
        await this.enableFallback(error);
        if (this.closed) return;
        return await this.fallback.send({ image });
      }
      if (!this.closed) this.callback(result.results);
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
