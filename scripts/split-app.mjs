/**
 * Splits js/app.js into js/app/* modules using mixin pattern.
 * Run: node scripts/split-app.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = resolve(root, 'js/app.js');
const outDir = resolve(root, 'js/app');
mkdirSync(outDir, { recursive: true });

const raw = readFileSync(srcPath, 'utf8');
const lines = raw.split('\n');
const importBlock = lines.slice(0, 10).join('\n');
const iifeStart = lines.findIndex((l) => l.trim() === '(function () {');
const bodyLines = lines.slice(iifeStart + 2, lines.length - 2);

const markers = [];
bodyLines.forEach((line, idx) => {
  if (/^\s*\/\/ ───/.test(line)) markers.push(idx);
});
markers.push(bodyLines.length);

const sections = [];
for (let i = 0; i < markers.length - 1; i++) {
  sections.push({
    header: bodyLines[markers[i]].trim(),
    content: bodyLines.slice(markers[i] + 1, markers[i + 1]),
  });
}

const STATE_VARS = [
  'blobTrackingEffect',
  'faceDetectionEffect',
  'blinkDetectionEffect',
  'isRunning',
  'colorPickMode',
  'animFrameId',
  'frameCount',
  'lastFpsTime',
  'flipH',
  'flipV',
  'rotation',
  'mobileActivePreset',
  'mediaRecorder',
  'recordingStream',
  'recordingChunks',
  'isRecording',
  'recordingStartTs',
  'recordingTimer',
  'currentRecordingMimeType',
  'currentRecordingExt',
  'currentRecordingBitrate',
  'currentRecordingFps',
  'pendingCapture',
  'recordingCanvas',
  'recordingCtx',
  'recordingEnhancerCanvas',
  'recordingEnhancerCtx',
  'lastRecordingDurationSec',
  'previewScale',
  'photoPreviewRenderToken',
  'previewPhotoEnhancerDebounceId',
  'photoCountdownTimer',
  'photoCountdownRemaining',
  'isPhotoCountdownActive',
  'postFxCanvas',
  'postFxCtx',
  'captureFxCanvas',
  'captureFxCtx',
  'recordingFxCanvas',
  'recordingFxCtx',
  'preferredDeviceId',
  'faceMeshScriptLoadPromise',
  'mediaPipeConsoleFilterInstalled',
  'faceLoadRequestId',
  'blinkLoadRequestId',
  'isPageVisible',
  'sourceMode',
  'videoObjectUrl',
  'videoSourceFile',
  'videoSourceFps',
  'videoSourceAverageBitrate',
  'videoTimeline',
  'editorHistory',
  'editorTool',
  'adjustmentsContext',
  'timelineZoom',
  'timelineHistorySuspended',
  'selectedVideoEffectId',
  'paletteDragState',
  'timelineDragGhost',
  'appliedTimelineItemIds',
  'videoBaseImageSettings',
  'isVideoExporting',
  'videoExportFileName',
  'videoExportWakeLock',
  'webcamSessionState',
  'imageSettings',
  'quickDetectorSettings',
  'saveImageSettingsTimer',
  'saveQuickDetectorSettingsTimer',
  'saveEffectSettingsTimer',
  'syncSelectedClipConfigTimer',
  'storageWarningShown',
  'cameraManager',
  'effectManager',
  'ctx',
];

const DOM_VARS = [
  'videoEl',
  'canvas',
  'previewWrapper',
  'captureCountdown',
  'captureCountdownValue',
  'placeholder',
  'resolutionInfo',
  'fpsInfo',
  'effectsInfo',
  'previewQualitySelect',
  'btnWebcamMode',
  'btnVideoMode',
  'videoFileInput',
  'btnChooseVideo',
  'videoFileMeta',
  'videoEditorStatus',
  'btnVideoStart',
  'btnVideoBack',
  'btnVideoPlay',
  'btnVideoForward',
  'btnVideoEnd',
  'btnVideoMute',
  'videoSeek',
  'videoTimeLabel',
  'videoTimelineEl',
  'timelineTrim',
  'timelineTrimStartHandle',
  'timelineTrimEndHandle',
  'timelinePlayhead',
  'timelineItems',
  'timelineEffectPalette',
  'videoEffectRangeLabel',
  'videoTrimStart',
  'videoTrimEnd',
  'btnSetTrimFromPlayhead',
  'btnSetTrimEndFromPlayhead',
  'videoEffectType',
  'videoEffectStart',
  'videoEffectEnd',
  'videoEffectClipMeta',
  'videoEffectTypeLabel',
  'videoEffectDurationLabel',
  'btnOpenEffectAdjust',
  'btnDeleteVideoEffect',
  'videoExportDetails',
  'videoExportModal',
  'videoExportTitle',
  'videoExportSummary',
  'videoExportProgress',
  'btnExportVideo',
  'btnHeaderExportVideo',
  'btnCancelVideoExport',
  'btnCloseVideoExportModal',
  'btnToolSelect',
  'btnToolTrim',
  'btnTimelineZoomIn',
  'btnTimelineZoomOut',
  'timelineZoomInput',
  'timelineViewport',
  'timelineScroll',
  'timelineTimeRuler',
  'timelineTrackArea',
  'timelineVideoClip',
  'timelineTrimOutsideStart',
  'timelineTrimOutsideEnd',
  'timelinePlayheadHandle',
  'timelineHintText',
  'chkTimelineSnap',
  'btnEditorUndo',
  'btnEditorRedo',
  'videoInspector',
  'inspectorAdjustmentsHost',
  'inspectorAdjustmentsEmpty',
  'effectsControlsSlot',
  'videoEffectEmptyHint',
  'inspectorTabs',
  'inspectorPanels',
  'btnToggleCamera',
  'cameraSelect',
  'btnTakePhoto',
  'btnRecord',
  'captureStatus',
  'captureTimerSelect',
  'sldJpegQuality',
  'valJpegQuality',
  'videoFormatSelect',
  'chkQualityEnhancer',
  'sldQualityEnhancerStrength',
  'valQualityEnhancerStrength',
  'qualityEnhancerStrengthGroup',
  'capturePreviewModal',
  'capturePreviewTitle',
  'capturePreviewFilename',
  'capturePreviewImage',
  'capturePreviewVideo',
  'capturePreviewInfo',
  'capturePreviewPhotoTools',
  'chkPreviewPhotoEnhancer',
  'sldPreviewPhotoEnhancerStrength',
  'valPreviewPhotoEnhancerStrength',
  'previewPhotoEnhancerStrengthGroup',
  'btnDownloadCapture',
  'btnDiscardCapture',
  'btnCloseCapturePreview',
  'controlPanel',
  'chkMirror',
  'chkFlipV',
  'rotationSelect',
  'chkBlackWhite',
  'sldExposure',
  'valExposure',
  'sldShadows',
  'valShadows',
  'sldHighlights',
  'valHighlights',
  'sldContrast',
  'valContrast',
  'sldSaturation',
  'valSaturation',
  'sldTemperature',
  'valTemperature',
  'sldDetail',
  'valDetail',
  'sldSharpness',
  'valSharpness',
  'btnResetImageAdjustments',
  'presetButtons',
  'mobilePresetButtons',
  'chkBlobTracking',
  'chkFaceDetection',
  'chkBlinkDetection',
  'inpBlobQuickColor',
  'blobQuickColorSwatch',
  'inpFaceQuickColor',
  'faceQuickColorChip',
  'faceQuickColorSwatch',
  'faceQuickControls',
  'faceQuickLabelWrap',
  'chkFaceShowBox',
  'chkFaceShowBlur',
  'inpFaceQuickLabel',
  'colorPickSection',
  'btnColorPick',
  'colorPickStatus',
  'btnToggleAdvancedOptions',
  'advancedToggleLabel',
  'advancedOptions',
  'effectConfigBlob',
  'effectConfigFace',
  'effectConfigBlink',
  'adjustContextNav',
  'adjustContextHelp',
  'profileSelect',
  'btnSaveProfile',
  'btnDeleteProfile',
  'profileStatus',
  'btnMobileEffectsDock',
  'mobileFxBackdrop',
  'mobileFxPanel',
  'btnMobileFxClose',
  'btnMobileTakePhoto',
  'btnMobileRecord',
  'selMobileCaptureTimer',
  'btnMobileBlobToggle',
  'btnMobileFaceToggle',
  'btnMobileBlinkToggle',
  'btnMobileColorPick',
  'inpMobileBlobColor',
  'inpMobileFaceColor',
  'mobileFaceColorChip',
  'mobileFaceLabelWrap',
  'chkMobileFaceShowBox',
  'chkMobileFaceShowBlur',
  'inpMobileFaceLabel',
];

const CONST_VARS = [
  'TIMELINE_EFFECT_META',
  'DEFAULT_TIMELINE_EFFECT_DURATION',
  'DEFAULT_IMAGE_SETTINGS',
  'DEFAULT_CAMERA_FPS',
  'DEFAULT_PREVIEW_QUALITY',
  'MEDIAPIPE_FACE_MESH_VERSION',
  'MEDIAPIPE_FACE_MESH_SRC',
  'MEDIAPIPE_CONSOLE_NOISE_PATTERNS',
  'DETECTOR_DEFAULT_BOX_COLOR',
  'DEFAULT_QUICK_DETECTOR_SETTINGS',
  'ADJUST_CONTEXT_HELP',
  'STORAGE_KEY',
  'PROFILES_KEY',
  'modalFocusState',
  'PREVIEW_QUALITY_PRESETS',
  'PREVIEW_MIN_WIDTH',
  'PREVIEW_MIN_HEIGHT',
  'COMMON_VIDEO_FPS',
];

function toThisRefs(code) {
  let out = code;
  for (const name of [...STATE_VARS, ...DOM_VARS, ...CONST_VARS]) {
    const re = new RegExp(`(?<![.\\w$])${name}(?![\\w$])`, 'g');
    out = out.replace(re, `this.${name}`);
  }
  out = out.replace(/const \$ = \(s\) => document\.querySelector\(s\);/g, '');
  out = out.replace(/this\.\$\(/g, 'document.querySelector(');
  return out;
}

function toProtoMethods(code) {
  let out = toThisRefs(code);
  out = out.replace(
    /^(\s*)async function (\w+)\(/gm,
    '$1proto.$2 = async function (',
  );
  out = out.replace(/^(\s*)function (\w+)\(/gm, '$1proto.$2 = function (');
  return out;
}

function stripConstBlocks(code) {
  return code
    .replace(/^\s*const STORAGE_KEY = .*;\s*$/gm, '')
    .replace(/^\s*const PROFILES_KEY = .*;\s*$/gm, '')
    .replace(
      /^\s*const TIMELINE_EFFECT_META = Object\.freeze\([\s\S]*?\);\s*$/m,
      '',
    )
    .replace(/^\s*const DEFAULT_TIMELINE_EFFECT_DURATION = .*;\s*$/gm, '')
    .replace(/^\s*const DEFAULT_IMAGE_SETTINGS = \{[\s\S]*?\};\s*$/m, '')
    .replace(/^\s*const DEFAULT_CAMERA_FPS = .*;\s*$/gm, '')
    .replace(/^\s*const DEFAULT_PREVIEW_QUALITY = .*;\s*$/gm, '')
    .replace(/^\s*const MEDIAPIPE_FACE_MESH_VERSION = .*;\s*$/gm, '')
    .replace(/^\s*const MEDIAPIPE_FACE_MESH_SRC = .*;\s*$/gm, '')
    .replace(
      /^\s*const MEDIAPIPE_CONSOLE_NOISE_PATTERNS = \[[\s\S]*?\];\s*$/m,
      '',
    )
    .replace(/^\s*const DETECTOR_DEFAULT_BOX_COLOR = .*;\s*$/gm, '')
    .replace(
      /^\s*const DEFAULT_QUICK_DETECTOR_SETTINGS = \{[\s\S]*?\};\s*$/m,
      '',
    )
    .replace(/^\s*const ADJUST_CONTEXT_HELP = \{[\s\S]*?\};\s*$/m, '')
    .replace(/^\s*this\.modalFocusState = new WeakMap\(\);\s*$/gm, '');
}

function extractInitializers(sectionLines) {
  const inits = [];
  const re = /^\s*(?:let|const)\s+(\w+)\s*(?:=\s*(.+))?;/;
  for (const line of sectionLines) {
    const m = line.match(re);
    if (!m) continue;
    const [, name, value = 'undefined'] = m;
    if (STATE_VARS.includes(name)) inits.push({ name, value: value.trim() });
  }
  return inits;
}

const sectionMap = {
  DOM: 'dom.mjs',
  Core: null,
  Storage: 'settings.mjs',
  'Local video editor': 'video-editor.mjs',
  Init: 'init.mjs',
  Events: 'events.mjs',
  Camera: 'camera.mjs',
  Effects: 'effects.mjs',
  'Render Loop': 'render.mjs',
  'Color Pick': 'color-pick.mjs',
  'Effect Config UI': 'effect-config.mjs',
  'UI Helpers': 'ui-helpers.mjs',
  Profiles: 'profiles.mjs',
  Capture: 'capture.mjs',
  'Modal focus management': 'modal-focus.mjs',
  Go: null,
};

writeFileSync(
  resolve(outDir, 'constants.mjs'),
  `import { PREVIEW_QUALITY_PRESETS, PREVIEW_MIN_WIDTH, PREVIEW_MIN_HEIGHT, normalizePreviewQuality } from '../preview-metrics.mjs';
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
  previewQuality: 'balanced',
  captureTimerSeconds: 0,
  qualityEnhancer: false,
  qualityEnhancerStrength: 35,
};
export const DEFAULT_CAMERA_FPS = 30;
export const DEFAULT_PREVIEW_QUALITY = 'balanced';
export const MEDIAPIPE_FACE_MESH_VERSION = '0.4.1633559619';
export const MEDIAPIPE_FACE_MESH_SRC = \`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@\${MEDIAPIPE_FACE_MESH_VERSION}/face_mesh.js\`;
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
export const STORAGE_KEY = 'hatewebcam_config';
export const PROFILES_KEY = 'hatewebcam_profiles';
`,
);

const domSection = sections.find((s) => s.header.includes('DOM'));
const coreSection = sections.find((s) => s.header.includes('Core'));
const domInits = extractInitializers(domSection.content);
const coreInits = extractInitializers(coreSection.content);

for (const section of sections) {
  const key = section.header.replace(/^\/\/ ───\s*|\s*───$/g, '');
  const file = sectionMap[key];
  if (!file || file === 'dom.mjs') continue;
  let content = section.content.join('\n');
  if (key === 'Storage') content = stripConstBlocks(content);
  if (key === 'Go') continue;
  const converted = toProtoMethods(content);
  const mixinName = `apply${key.replace(/[^a-zA-Z0-9]+/g, '')}Mixin`;
  const extraImports =
    key === 'Storage'
      ? "import { PREVIEW_QUALITY_PRESETS, normalizePreviewQuality } from './constants.mjs';\n"
      : key === 'Render Loop'
        ? "import { PREVIEW_MIN_WIDTH, PREVIEW_MIN_HEIGHT, PREVIEW_QUALITY_PRESETS } from './constants.mjs';\n"
        : '';
  writeFileSync(
    resolve(outDir, file),
    `${extraImports}/** @param {import('./controller.mjs').AppController} proto */\nexport function ${mixinName}(proto) {\n${converted}\n}\n`,
  );
}

let domBody = domSection.content.join('\n');
domBody = domBody.replace(/^\s*if \(!videoEl[\s\S]*?return;\s*$/m, '');
domBody = toThisRefs(domBody);
writeFileSync(
  resolve(outDir, 'dom.mjs'),
  `/** @param {import('./controller.mjs').AppController} app */\nexport function setupDom(app) {\n  const $ = (s) => document.querySelector(s);\n${domBody.replace(/\bthis\./g, 'app.')}\n}\n`,
);

const constructorLines = [...domInits, ...coreInits]
  .map(
    ({ name, value }) =>
      `    this.${name} = ${value.replace(/\bvideoEl\b/g, 'null').replace(/\bcanvas\b/g, 'null')};`,
  )
  .filter((line, idx, arr) => arr.indexOf(line) === idx);

const mixinImports = Object.entries(sectionMap)
  .filter(([, file]) => file && file !== 'dom.mjs')
  .map(([key, file]) => {
    const mixinName = `apply${key.replace(/[^a-zA-Z0-9]+/g, '')}Mixin`;
    return `import { ${mixinName} } from './${file}';`;
  })
  .join('\n');

const mixinCalls = Object.entries(sectionMap)
  .filter(([, file]) => file && file !== 'dom.mjs')
  .map(
    ([key]) =>
      `apply${key.replace(/[^a-zA-Z0-9]+/g, '')}Mixin(AppController.prototype);`,
  )
  .join('\n');

writeFileSync(
  resolve(outDir, 'controller.mjs'),
  `${importBlock.replace("from './preview-metrics.mjs'", "from '../preview-metrics.mjs'").replace("from './video-export.mjs'", "from '../video-export.mjs'")}

import {
  TIMELINE_EFFECT_META,
  DEFAULT_TIMELINE_EFFECT_DURATION,
  DEFAULT_IMAGE_SETTINGS,
  DEFAULT_CAMERA_FPS,
  DEFAULT_PREVIEW_QUALITY,
  MEDIAPIPE_FACE_MESH_VERSION,
  MEDIAPIPE_FACE_MESH_SRC,
  MEDIAPIPE_CONSOLE_NOISE_PATTERNS,
  DETECTOR_DEFAULT_BOX_COLOR,
  DEFAULT_QUICK_DETECTOR_SETTINGS,
  ADJUST_CONTEXT_HELP,
  STORAGE_KEY,
  PROFILES_KEY,
  PREVIEW_QUALITY_PRESETS,
  PREVIEW_MIN_WIDTH,
  PREVIEW_MIN_HEIGHT,
  COMMON_VIDEO_FPS,
  normalizePreviewQuality,
} from './constants.mjs';
import { setupDom } from './dom.mjs';
${mixinImports}

export class AppController {
  constructor() {
    this.modalFocusState = new WeakMap();
    this.TIMELINE_EFFECT_META = TIMELINE_EFFECT_META;
    this.DEFAULT_TIMELINE_EFFECT_DURATION = DEFAULT_TIMELINE_EFFECT_DURATION;
    this.DEFAULT_IMAGE_SETTINGS = DEFAULT_IMAGE_SETTINGS;
    this.DEFAULT_CAMERA_FPS = DEFAULT_CAMERA_FPS;
    this.DEFAULT_PREVIEW_QUALITY = DEFAULT_PREVIEW_QUALITY;
    this.MEDIAPIPE_FACE_MESH_VERSION = MEDIAPIPE_FACE_MESH_VERSION;
    this.MEDIAPIPE_FACE_MESH_SRC = MEDIAPIPE_FACE_MESH_SRC;
    this.MEDIAPIPE_CONSOLE_NOISE_PATTERNS = MEDIAPIPE_CONSOLE_NOISE_PATTERNS;
    this.DETECTOR_DEFAULT_BOX_COLOR = DETECTOR_DEFAULT_BOX_COLOR;
    this.DEFAULT_QUICK_DETECTOR_SETTINGS = DEFAULT_QUICK_DETECTOR_SETTINGS;
    this.ADJUST_CONTEXT_HELP = ADJUST_CONTEXT_HELP;
    this.STORAGE_KEY = STORAGE_KEY;
    this.PROFILES_KEY = PROFILES_KEY;
    this.PREVIEW_QUALITY_PRESETS = PREVIEW_QUALITY_PRESETS;
    this.PREVIEW_MIN_WIDTH = PREVIEW_MIN_WIDTH;
    this.PREVIEW_MIN_HEIGHT = PREVIEW_MIN_HEIGHT;
    this.COMMON_VIDEO_FPS = COMMON_VIDEO_FPS;
    this.normalizePreviewQuality = normalizePreviewQuality;
${constructorLines.join('\n')}
  }

  start() {
    setupDom(this);
    if (!this.videoEl || !this.canvas || !this.ctx || !this.btnToggleCamera || !this.cameraSelect || !this.btnTakePhoto || !this.btnRecord) {
      console.error('HateWebcam: faltan elementos base del DOM para iniciar la app.');
      return;
    }
    this.init();
  }
}

${mixinCalls}
`,
);

writeFileSync(
  resolve(root, 'js/app.js'),
  `${importBlock}

import { AppController } from './app/controller.mjs';

new AppController().start();
`,
);

console.log('Split complete.');
