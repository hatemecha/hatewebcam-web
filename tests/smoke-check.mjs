import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
    .filter((file) => /\.(?:[cm]?js|[cm]?ts)$/.test(file))
    .sort();
}

const runtimeFiles = [...listRuntimeFiles('js'), ...listRuntimeFiles('src')];
const javascriptFiles = runtimeFiles.filter((file) => !file.endsWith('.ts'));
const htmlTemplateFiles = [
  'src/lib/webcam/EffectsControls.svelte',
  'src/lib/webcam/AdvancedDetectorOptions.svelte',
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

if (javascriptFiles.length) {
  fail(`Runtime modules must use TypeScript: ${javascriptFiles.join(', ')}`);
}
for (const file of runtimeFiles) {
  const source = readFileSync(resolve(rootDir, file), 'utf8');
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  for (const diagnostic of syntax.parseDiagnostics) {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    );
    fail(`${file} has a syntax error.\n${message}`);
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
  !appSource.includes(
    "import { WebcamApplication } from './app/application.ts'",
  )
) {
  fail('app.ts must start the typed webcam application');
}
const applicationSource = readFileSync(
  resolve(rootDir, 'js/app/application.ts'),
  'utf8',
);
if (
  !applicationSource.includes("from 'virtual:editor-entry-url'") ||
  !applicationSource.includes('import(/* @vite-ignore */ entry.href)')
) {
  fail('the editor entry must load only on demand');
}
for (const fragment of requiredHtmlFragments) {
  if (!htmlBundle.includes(fragment)) {
    fail(`HTML templates are missing ${fragment}`);
  }
}

console.log('Smoke check passed.');
