import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function listRuntimeFiles(dir) {
  return readdirSync(resolve(rootDir, dir))
    .flatMap((entry) => {
      const relativePath = `${dir}/${entry}`;
      const absolutePath = resolve(rootDir, relativePath);
      return statSync(absolutePath).isDirectory()
        ? listRuntimeFiles(relativePath)
        : relativePath;
    })
    .filter((file) => /\.(mjs|js|ts)$/.test(file))
    .sort();
}

const runtimeFiles = [...listRuntimeFiles('js'), ...listRuntimeFiles('src')];
const javascriptFiles = runtimeFiles.filter((file) => !file.endsWith('.ts'));
const htmlTemplateFiles = [
  'src/lib/webcam/EffectsControls.svelte',
  'src/lib/webcam/CameraSourcePanel.svelte',
  'src/lib/preview/PreviewMetrics.svelte',
  'src/lib/preview/PreviewPlaceholder.svelte',
  'src/lib/capture/CaptureStatusChrome.svelte',
  'src/lib/capture/CaptureBar.svelte',
  'src/lib/shell/SkipLink.svelte',
  'src/lib/capture/MobileHud.svelte',
  'src/lib/shell/AppHeader.svelte',
  'src/lib/preview/DetectorChips.svelte',
  'src/lib/modals/ExportModal.svelte',
  'src/lib/modals/CaptureModal.svelte',
  'src/lib/editor/VideoEditor.svelte',
  'src/lib/editor/EditorToolbar.svelte',
  'src/lib/editor/EffectPalette.svelte',
  'src/lib/editor/Timeline.svelte',
  'src/lib/editor/Inspector.svelte',
  'src/lib/editor/ProjectPanel.svelte',
  'src/lib/editor/EditAssistPanel.svelte',
  'src/lib/editor/ExportPanel.svelte',
  'src/lib/editor/ClipInspector.svelte',
  'src/lib/editor/AdjustPanel.svelte',
  'src/lib/editor/VisualFxInspector.svelte',
];

const controllerConstantPattern =
  /(?<![.\w$])(?:TIMELINE_EFFECT_META|DEFAULT_TIMELINE_EFFECT_DURATION|DEFAULT_IMAGE_SETTINGS|DEFAULT_CAMERA_FPS|DEFAULT_PREVIEW_QUALITY|MEDIAPIPE_FACE_MESH_VERSION|MEDIAPIPE_FACE_MESH_SRC|MEDIAPIPE_CONSOLE_NOISE_PATTERNS|DETECTOR_DEFAULT_BOX_COLOR|DEFAULT_QUICK_DETECTOR_SETTINGS|ADJUST_CONTEXT_HELP|STORAGE_KEY|PROFILES_KEY|COMMON_VIDEO_FPS)\b/;
const controllerMethodNames = javascriptFiles
  .filter((file) => file.startsWith('js/app/'))
  .flatMap((file) =>
    [
      ...readFileSync(resolve(rootDir, file), 'utf8').matchAll(
        /proto\.([\w$]+)\s*=/g,
      ),
    ].map((match) => match[1]),
  );

const requiredHtmlFragments = [
  'id="videoElement"',
  'id="previewCanvas"',
  'id="btnToggleCamera"',
  'id="cameraSelect"',
  'id="btnTakePhoto"',
  'id="btnRecord"',
  'id="captureTimerSelect"',
  'id="performanceModeSelect"',
  'id="captureCountdown"',
  'id="btnVideoMode"',
  'id="videoFileInput"',
  'id="projectFileInput"',
  'id="btnSaveProject"',
  'id="btnLoadProject"',
  'id="videoTimeline"',
  'id="timelineEffectPalette"',
  'id="btnExportVideo"',
  'id="btnHeaderExportVideo"',
  'id="videoExportDiagnostics"',
  'id="videoExportModeSelect"',
  'id="editorExportPresetSelect"',
  'id="editorExportFormatSelect"',
  'id="chkEditorCopyAudio"',
  'id="chkExperimentalExportFeatures"',
  'id="btnEditAssistAnalyze"',
  'id="btnEditAssistBeat"',
  'id="btnEditAssistEvery8"',
  'id="editAssistBpmInput"',
  'id="editAssistOffsetInput"',
  'id="editAssistDensitySelect"',
  'id="btnEditAssistRegenerate"',
  'id="btnEditAssistClear"',
  'id="effectsExportChromaSelect"',
  'id="videoInspector"',
  'id="videoEffectAutomationSelect"',
  'id="inspectorSplitter"',
  'id="timelineSplitter"',
  'id="btnToolSelect"',
  'id="timelinePlayheadHandle"',
  'id="timelineMarkers"',
  'id="videoExportModal"',
  'id="chkMirror"',
  'id="chkFaceDetection"',
  'id="chkBlinkDetection"',
  'js/app.ts',
];

function fail(message) {
  console.error(`Smoke check failed: ${message}`);
  process.exit(1);
}

for (const file of runtimeFiles) {
  const path = resolve(rootDir, file);
  const source = readFileSync(path, 'utf8');
  if (file.endsWith('.ts')) {
    const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
    for (const diagnostic of syntax.parseDiagnostics) {
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        '\n',
      );
      fail(`${file} has a syntax error.\n${message}`);
    }
    continue;
  }
  const result = spawnSync(process.execPath, ['--check', path], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    fail(`${file} has a syntax error.\n${output}`);
  }

  if (
    file.startsWith('js/app/') &&
    /(?<![.\w$])(?:clamp|escapeHtml)\s*\(/.test(source)
  ) {
    fail(`${file} calls a controller helper without this.`);
  }
  if (file !== 'js/app/dom.ts' && /(?<![.\w$])\$\s*\(/.test(source)) {
    fail(`${file} uses the DOM helper outside dom.ts.`);
  }
  if (
    file.startsWith('js/app/') &&
    !['js/app/constants.ts', 'js/app/controller.mjs'].includes(file) &&
    controllerConstantPattern.test(source)
  ) {
    fail(`${file} accesses a controller constant without this.`);
  }
  for (const methodName of controllerMethodNames) {
    const bareCallbackPattern = new RegExp(
      `(?:addEventListener\\([^,]+,|requestAnimationFrame\\(|requestVideoFrameCallback\\()\\s*${methodName}\\b`,
    );
    if (bareCallbackPattern.test(source))
      fail(`${file} passes ${methodName} without binding the controller.`);
  }
}

const html = readFileSync(resolve(rootDir, 'index.html'), 'utf8');
const htmlBundle = [
  html,
  ...htmlTemplateFiles.map((file) => {
    const path = resolve(rootDir, file);
    if (!existsSync(path)) {
      fail(`missing template ${file}`);
    }
    return readFileSync(path, 'utf8');
  }),
].join('\n');
const forbiddenRuntimeFragments = [
  'https://cdn.jsdelivr.net',
  'https://esm.sh',
  'https://cdnjs.cloudflare.com',
  'webm-muxer',
];
for (const file of ['index.html', ...htmlTemplateFiles, ...runtimeFiles]) {
  const source =
    file === 'index.html' ? html : readFileSync(resolve(rootDir, file), 'utf8');
  for (const fragment of forbiddenRuntimeFragments) {
    if (source.includes(fragment)) {
      fail(
        `${file} still references runtime CDN/deprecated dependency ${fragment}`,
      );
    }
  }
}
for (const fragment of [
  'id="videoEditorTemplateSlot"',
  'id="controlPanel"',
  'id="exportModalTemplateSlot"',
  'id="captureModalTemplateSlot"',
]) {
  if (!html.includes(fragment)) {
    fail(`index.html is missing template mount ${fragment}`);
  }
}
const appSource = readFileSync(resolve(rootDir, 'js/app.ts'), 'utf8');
if (
  !appSource.includes("import { AppController } from './app/controller.mjs'")
) {
  fail('app.ts must bootstrap AppController from ./app/controller.mjs');
}
const controllerJs = readFileSync(
  resolve(rootDir, 'js/app/controller.mjs'),
  'utf8',
);
if (
  !controllerJs.includes("from '../video-export.ts'") &&
  !controllerJs.includes("from './constants.ts'")
) {
  fail('controller.mjs must wire video export/constants modules');
}
const videoEditorJs = readFileSync(
  resolve(rootDir, 'js/app/video-editor.mjs'),
  'utf8',
);
if (videoEditorJs.includes("import('./video-export.ts')")) {
  fail(
    'video-editor.mjs must import video-export.ts from its parent directory.',
  );
}
for (const fragment of requiredHtmlFragments) {
  if (!htmlBundle.includes(fragment)) {
    fail(`HTML templates are missing ${fragment}`);
  }
}

console.log('Smoke check passed.');
