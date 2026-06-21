import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const javascriptFiles = [
  'js/app.js',
  'js/app/controller.mjs',
  'js/app/constants.mjs',
  'js/app/dom.mjs',
  'js/app/settings.mjs',
  'js/app/video-editor.mjs',
  'js/app/init.mjs',
  'js/app/events.mjs',
  'js/app/camera.mjs',
  'js/app/effects.mjs',
  'js/app/render.mjs',
  'js/app/color-pick.mjs',
  'js/app/effect-config.mjs',
  'js/app/ui-helpers.mjs',
  'js/app/profiles.mjs',
  'js/app/capture.mjs',
  'js/app/modal-focus.mjs',
  'js/video-export.mjs',
  'js/video-timeline.js',
  'js/editor-history.js',
  'js/camera.js',
  'js/effects/effect-manager.js',
  'js/effects/blob-tracking.js',
  'js/effects/face-detection.js',
  'js/effects/blink-detection.js',
];

const controllerConstantPattern = /(?<![.\w$])(?:TIMELINE_EFFECT_META|DEFAULT_TIMELINE_EFFECT_DURATION|DEFAULT_IMAGE_SETTINGS|DEFAULT_CAMERA_FPS|DEFAULT_PREVIEW_QUALITY|MEDIAPIPE_FACE_MESH_VERSION|MEDIAPIPE_FACE_MESH_SRC|MEDIAPIPE_CONSOLE_NOISE_PATTERNS|DETECTOR_DEFAULT_BOX_COLOR|DEFAULT_QUICK_DETECTOR_SETTINGS|ADJUST_CONTEXT_HELP|STORAGE_KEY|PROFILES_KEY|COMMON_VIDEO_FPS)\b/;
const controllerMethodNames = javascriptFiles
  .filter((file) => file.startsWith('js/app/'))
  .flatMap((file) => [...readFileSync(resolve(rootDir, file), 'utf8').matchAll(/proto\.([\w$]+)\s*=/g)].map((match) => match[1]));

const requiredHtmlFragments = [
  'id="videoElement"',
  'id="previewCanvas"',
  'id="btnToggleCamera"',
  'id="cameraSelect"',
  'id="btnTakePhoto"',
  'id="btnRecord"',
  'id="captureTimerSelect"',
  'id="captureCountdown"',
  'id="btnVideoMode"',
  'id="videoFileInput"',
  'id="videoTimeline"',
  'id="timelineEffectPalette"',
  'id="btnExportVideo"',
  'id="btnHeaderExportVideo"',
  'id="videoInspector"',
  'id="btnToolSelect"',
  'id="timelinePlayheadHandle"',
  'js/editor-history.js',
  'id="videoExportModal"',
  'id="chkMirror"',
  'id="chkFaceDetection"',
  'id="chkBlinkDetection"',
  'js/app.js',
  'js/video-timeline.js',
];

function fail(message) {
  console.error(`Smoke check failed: ${message}`);
  process.exit(1);
}

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', resolve(rootDir, file)], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    fail(`${file} has a syntax error.\n${output}`);
  }

  const source = readFileSync(resolve(rootDir, file), 'utf8');
  if (/(?<![.\w$])(?:clamp|escapeHtml)\s*\(/.test(source)) {
    fail(`${file} calls a controller helper without this.`);
  }
  if (file !== 'js/app/dom.mjs' && /(?<![.\w$])\$\s*\(/.test(source)) {
    fail(`${file} uses the DOM helper outside dom.mjs.`);
  }
  if (file.startsWith('js/app/') && !['js/app/constants.mjs', 'js/app/controller.mjs'].includes(file) && controllerConstantPattern.test(source)) {
    fail(`${file} accesses a controller constant without this.`);
  }
  for (const methodName of controllerMethodNames) {
    const bareCallbackPattern = new RegExp(`(?:addEventListener\\([^,]+,|requestAnimationFrame\\(|requestVideoFrameCallback\\()\\s*${methodName}\\b`);
    if (bareCallbackPattern.test(source)) fail(`${file} passes ${methodName} without binding the controller.`);
  }
}

const html = readFileSync(resolve(rootDir, 'index.html'), 'utf8');
const appJs = readFileSync(resolve(rootDir, 'js/app.js'), 'utf8');
if (!appJs.includes("import { AppController } from './app/controller.mjs'")) {
  fail('app.js must bootstrap AppController from ./app/controller.mjs');
}
const controllerJs = readFileSync(resolve(rootDir, 'js/app/controller.mjs'), 'utf8');
if (!controllerJs.includes("from '../video-export.mjs'") && !controllerJs.includes("from './constants.mjs'")) {
  fail('controller.mjs must wire video export/constants modules');
}
const settingsJs = readFileSync(resolve(rootDir, 'js/app/settings.mjs'), 'utf8');
if (settingsJs.includes('...DEFAULT_QUICK_DETECTOR_SETTINGS')) {
  fail('settings.mjs must access DEFAULT_QUICK_DETECTOR_SETTINGS through the controller.');
}
const videoEditorJs = readFileSync(resolve(rootDir, 'js/app/video-editor.mjs'), 'utf8');
if (videoEditorJs.includes("import('./video-export.mjs')")) {
  fail('video-editor.mjs must import video-export.mjs from its parent directory.');
}
for (const fragment of requiredHtmlFragments) {
  if (!html.includes(fragment)) {
    fail(`index.html is missing ${fragment}`);
  }
}

console.log('Smoke check passed.');
