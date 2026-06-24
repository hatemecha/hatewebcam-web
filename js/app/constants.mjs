import {
  PREVIEW_QUALITY_PRESETS,
  PREVIEW_MIN_WIDTH,
  PREVIEW_MIN_HEIGHT,
  normalizePreviewQuality,
} from '../preview-metrics.mjs';
import { COMMON_VIDEO_FPS } from '../video-export.mjs';

export {
  PREVIEW_QUALITY_PRESETS,
  PREVIEW_MIN_WIDTH,
  PREVIEW_MIN_HEIGHT,
  normalizePreviewQuality,
  COMMON_VIDEO_FPS,
};

export const TIMELINE_EFFECT_META = Object.freeze({
  look: { label: 'Look', trackLabel: 'LOOK', row: 1 },
  blob: { label: 'Color', trackLabel: 'COLOR', row: 2 },
  face: { label: 'Caras', trackLabel: 'CARAS', row: 3 },
  blink: { label: 'Ojos', trackLabel: 'OJOS', row: 4 },
});
export const DEFAULT_TIMELINE_EFFECT_DURATION = 3;
export const DEFAULT_IMAGE_SETTINGS = {
  blackAndWhite: false,
  exposure: 0,
  shadows: 0,
  highlights: 0,
  contrast: 100,
  saturation: 100,
  temperature: 0,
  detail: 0,
  sharpness: 0,
  jpegQuality: 92,
  videoFormat: 'auto',
  editorExportPreset: 'balanced',
  editorExportFormat: 'webm',
  editorExportMode: 'full',
  editorCopyAudio: false,
  experimentalExportFeatures: false,
  effectsExportChroma: 'green',
  previewQuality: 'balanced',
  captureTimerSeconds: 0,
  qualityEnhancer: false,
  qualityEnhancerStrength: 35,
};
export const DEFAULT_CAMERA_FPS = 30;
export const DEFAULT_PREVIEW_QUALITY = 'balanced';
export const MEDIAPIPE_FACE_MESH_VERSION = '0.4.1633559619';
export const MEDIAPIPE_FACE_MESH_BASE_URL = 'vendor/mediapipe/face_mesh';
export const MEDIAPIPE_FACE_MESH_SRC = `${MEDIAPIPE_FACE_MESH_BASE_URL}/face_mesh.js`;
export const MEDIAPIPE_CONSOLE_NOISE_PATTERNS = [
  'gl_context_webgl.cc',
  'gl_context.cc:351',
  'gl_context.cc:821',
  'OpenGL error checking is disabled',
  'GL version: 3.0 (OpenGL ES 3.0',
];
export const DETECTOR_DEFAULT_BOX_COLOR = '#ff2222';
export const DEFAULT_QUICK_DETECTOR_SETTINGS = {
  blobBoxColor: DETECTOR_DEFAULT_BOX_COLOR,
  faceBoxColor: DETECTOR_DEFAULT_BOX_COLOR,
  faceLabelText: 'CARA',
  faceShowBox: true,
  faceShowBlur: false,
  facePixelationCellSize: 14,
  faceCensorPaddingPercent: 18,
};
export const ADJUST_CONTEXT_HELP = {
  look: 'Orientación, encuadre, presets y ajuste fino para la pista VIDEO y tramos LOOK.',
  blob: 'Seguimiento por color para tramos en la pista COLOR.',
  face: 'Detección y estilo de caras en la pista CARAS.',
  blink: 'Detección de pestañeos en la pista OJOS.',
};
export const ADJUST_CONTEXT_VIDEO_HELP = {
  look: 'Ajustá orientación, filtros y look del clip seleccionado. Solo se ve cuando el cursor está dentro de su tramo.',
  blob: 'Elegí color, sensibilidad y aspecto del tracking. El detector se enciende solo dentro del clip COLOR.',
  face: 'Elegí recuadro, blur, pixelado y etiqueta. La detección se enciende sola cuando el cursor entra en el clip CARAS.',
  blink:
    'Ajustá sensibilidad del detector. Se activa solo dentro del clip OJOS en la timeline.',
};
export const STORAGE_KEY = 'hatewebcam_config';
export const PROFILES_KEY = 'hatewebcam_profiles';
