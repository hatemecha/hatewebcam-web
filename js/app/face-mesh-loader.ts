import { isFaceMeshLoaded } from '../effects/face-mesh-client.ts';
import {
  MEDIAPIPE_CONSOLE_NOISE_PATTERNS,
  MEDIAPIPE_FACE_MESH_BASE_URL,
  MEDIAPIPE_FACE_MESH_SRC,
} from './constants.ts';

let loading: Promise<void> | null = null;
let filterInstalled = false;

function filterConsoleNoise(): void {
  if (filterInstalled) return;
  filterInstalled = true;
  for (const method of ['log', 'info', 'warn'] as const) {
    // The vendor emits routine setup messages through these console methods.
    // eslint-disable-next-line no-console
    const original = console[method].bind(console);
    // eslint-disable-next-line no-console
    console[method] = (...args: unknown[]) => {
      const message = args
        .filter((value) => typeof value === 'string')
        .join(' ');
      const fromMediaPipe =
        message.includes('face_mesh_solution') ||
        message.includes('gl_context');
      if (
        fromMediaPipe &&
        MEDIAPIPE_CONSOLE_NOISE_PATTERNS.some((pattern) =>
          message.includes(pattern),
        )
      )
        return;
      original(...args);
    };
  }
}

export function ensureFaceMeshLoaded(): Promise<void> {
  filterConsoleNoise();
  const environment = globalThis as typeof globalThis & {
    HATEWEBCAM_MEDIAPIPE_FACE_MESH_BASE_URL?: string;
  };
  environment.HATEWEBCAM_MEDIAPIPE_FACE_MESH_BASE_URL =
    MEDIAPIPE_FACE_MESH_BASE_URL;
  if (isFaceMeshLoaded()) return Promise.resolve();
  if (loading) return loading;

  const existing = Array.from(document.scripts).find((script) =>
    script.getAttribute('src')?.endsWith('/face_mesh.js'),
  );
  const script = existing ?? document.createElement('script');
  loading = new Promise<void>((resolve, reject) => {
    const listeners = new AbortController();
    const { signal } = listeners;
    script.addEventListener(
      'load',
      () => {
        listeners.abort();
        if (isFaceMeshLoaded()) resolve();
        else reject(new Error('mediapipe_facemesh_unavailable'));
      },
      { signal },
    );
    script.addEventListener(
      'error',
      () => {
        listeners.abort();
        reject(new Error('mediapipe_facemesh_load_failed'));
      },
      { signal },
    );
    if (!existing) {
      script.src = MEDIAPIPE_FACE_MESH_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    script.remove();
    loading = null;
    throw error;
  });
  return loading;
}
