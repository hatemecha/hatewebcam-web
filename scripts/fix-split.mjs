import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js/app');

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

function collectMethodNames() {
  const names = new Set();
  for (const file of readdirSync(appDir)) {
    if (
      !file.endsWith('.mjs') ||
      file === 'controller.mjs' ||
      file === 'constants.mjs'
    )
      continue;
    const content = readFileSync(resolve(appDir, file), 'utf8');
    for (const match of content.matchAll(/proto\.(\w+) = /g))
      names.add(match[1]);
  }
  return [...names].sort((a, b) => b.length - a.length);
}

const METHOD_NAMES = collectMethodNames();

const GLOBAL_IDENTIFIERS = new Set([
  'console',
  'document',
  'window',
  'navigator',
  'performance',
  'Math',
  'JSON',
  'URL',
  'Date',
  'Promise',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'parseInt',
  'parseFloat',
  'Number',
  'String',
  'Array',
  'Object',
  'Error',
  'Blob',
  'File',
  'FileReader',
  'MediaRecorder',
  'VideoEncoder',
  'VideoFrame',
  'FaceMesh',
  'CameraManager',
  'EffectManager',
  'BlobTracking',
  'FaceDetection',
  'BlinkDetection',
  'VideoTimeline',
  'EditorHistory',
  'Int32Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'WeakMap',
  'Map',
  'Set',
  'RegExp',
  'ImageData',
  'HTMLCanvasElement',
  'HTMLVideoElement',
  'Event',
  'KeyboardEvent',
  'PointerEvent',
  'MouseEvent',
  'ResizeObserver',
  'IntersectionObserver',
  'alert',
  'prompt',
  'confirm',
  'fetch',
  'import',
  'proto',
  'app',
  'clamp',
  'escapeHtml',
]);

function fixArgColons(code) {
  return code.replace(/([(\[,]\s*)(\w+): this\.\2(?=\s*[,)])/g, '$1this.$2');
}

function fixSpreadState(code) {
  let out = code;
  for (const name of STATE_VARS) {
    out = out.replace(
      new RegExp(`\\.\\.\\.${name}\\b`, 'g'),
      `...this.${name}`,
    );
  }
  return out;
}

function fixBrokenObjectProps(code) {
  let out = code;
  out = out.replace(/,\s*this\.(\w+)\s*,/g, ', $1: this.$1,');
  out = out.replace(/,\s*this\.(\w+)\s*\}/g, ', $1: this.$1 }');
  out = out.replace(/\{\s*this\.(\w+)\s*,/g, '{ $1: this.$1,');
  return out;
}

function fixMethodCalls(code) {
  let out = code;
  for (const name of METHOD_NAMES) {
    if (GLOBAL_IDENTIFIERS.has(name)) continue;
    const re = new RegExp(
      `(?<!\\bthis\\.|\\bproto\\.|\\bfunction |\\basync )\\b${name}\\(`,
      'g',
    );
    out = out.replace(re, `this.${name}(`);
  }
  return out;
}

function fixDomFile(content) {
  return content
    .replace(/\$\('#app\./g, "$('#")
    .replace(/\$\("#app\./g, '$("#')
    .replace(/\n  \}\n\n\}\n$/, '\n}\n');
}

function splitModalFocus(content) {
  const marker = '  proto.openCapturePreview = function (capture) {';
  const idx = content.indexOf(marker);
  if (idx === -1) return { focus: content, captureTail: '' };
  const head = content
    .slice(0, idx)
    .replace(/^\s*this\.modalFocusState = new WeakMap\(\);\s*\n/m, '');
  const tail = content.slice(idx);
  return { focus: `${head}\n}\n`, captureTail: tail };
}

const modalPath = resolve(appDir, 'modal-focus.mjs');
const capturePath = resolve(appDir, 'capture.mjs');
const modalRaw = readFileSync(modalPath, 'utf8');
const { focus, captureTail } = splitModalFocus(modalRaw);
writeFileSync(modalPath, fixMethodCalls(fixArgColons(focus)));
writeFileSync(
  capturePath,
  fixMethodCalls(
    fixArgColons(
      fixSpreadState(
        readFileSync(capturePath, 'utf8') +
          captureTail.replace(/\n\}\n$/, '\n'),
      ),
    ),
  ),
);

for (const file of readdirSync(appDir)) {
  if (!file.endsWith('.mjs') || file === 'modal-focus.mjs') continue;
  const path = resolve(appDir, file);
  let content = readFileSync(path, 'utf8');
  if (file === 'dom.mjs') {
    writeFileSync(path, fixDomFile(content));
    continue;
  }
  if (file === 'constants.mjs' || file === 'controller.mjs') continue;
  content = fixArgColons(content);
  content = fixSpreadState(content);
  content = fixBrokenObjectProps(content);
  content = fixMethodCalls(content);
  writeFileSync(path, content);
}

console.log(`Fixed ${METHOD_NAMES.length} method names.`);
