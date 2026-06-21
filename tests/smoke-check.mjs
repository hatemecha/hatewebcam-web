import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const javascriptFiles = [
  'js/app.js',
  'js/video-timeline.js',
  'js/camera.js',
  'js/effects/effect-manager.js',
  'js/effects/blob-tracking.js',
  'js/effects/face-detection.js',
  'js/effects/blink-detection.js',
];

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
  'id="timelineSelection"',
  'id="btnExportVideo"',
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
}

const html = readFileSync(resolve(rootDir, 'index.html'), 'utf8');
for (const fragment of requiredHtmlFragments) {
  if (!html.includes(fragment)) {
    fail(`index.html is missing ${fragment}`);
  }
}

console.log('Smoke check passed.');
