// Dev-only stress harness (not part of `npm test`). Exercises the scenario
// this task cares about most: a video with several Visual FX Persona/Fondo
// clips plus other detectors, cut up into short segments, playing
// continuously - and reports the real perf-dev metrics (mask age,
// inference latency, backlog, superseded/discarded frames) BEFORE/AFTER a
// change. Run with `node tests/manual/perf-stress.mjs`.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.VFX_BASE_URL || 'http://localhost:5184';
const OUT_DIR = new URL('../../test-results/', import.meta.url);
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`);
});

await page.goto(`${BASE}/?perf=1`);
await page.getByRole('tab', { name: /video/i }).click();
await page
  .locator('#videoFileInput')
  .setInputFiles(
    fileURLToPath(new URL('../fixtures/subject-init.webm', import.meta.url)),
  );
await page.locator('#videoTimelineShell').waitFor({ state: 'visible' });

// A busy timeline: several short Visual FX Persona/Fondo clips (forcing
// repeated clip-change resyncs), plus Look, Blob, Face and Blink all active
// at once - the exact "many cuts + detectors" stress scenario in the task.
async function addClip(type) {
  await page
    .locator(`.timeline-palette-chip[data-effect-type="${type}"]`)
    .click();
}

await addClip('subject');
await page.locator('[data-visual-system="recursive"]').click();
await page.locator('#visual-target-person').click();

await addClip('look');
await addClip('blob');
await addClip('face');
await addClip('blink');
// Give MediaPipe assets a moment to load before the stress run starts.
await page.waitForTimeout(2500);

// Re-select the Visual FX clip and flip its target a few times while
// seeking around - the "several changes, must recover fast" scenario.
// Other detector types don't share the same inspector host, so re-select
// the subject clip explicitly each time.
async function reselectSubjectClip() {
  await page.locator('.timeline-item[data-type="subject"]').first().click();
  // Selecting a clip switches the inspector to the "Clip" tab; the target
  // (Persona/Fondo) buttons live under "Ajustes".
  await page.locator('#tabInspectorAdjust').click();
}

const clipTimes = [0, 0.4, 0.8, 1.2, 1.6];
for (let i = 0; i < clipTimes.length; i++) {
  await page.evaluate((t) => {
    const video = document.querySelector('video');
    if (video) video.currentTime = t;
  }, clipTimes[i]);
  await page.waitForTimeout(150);
  await reselectSubjectClip();
  if (i % 2 === 1) await page.locator('#visual-target-background').click();
  else await page.locator('#visual-target-person').click();
}

// Now real continuous playback under load: this is what "Persona/Fondo
// nunca alcanza al playback" would show up as - a monotonically growing
// mask age gauge, or a superseded-result rate that swamps completed ones.
await page.locator('#btnVideoPlay').click();
await page.waitForTimeout(6000);

const snapshot = await page.evaluate(() => window.__hatewebcamPerfSnapshot?.());
await browser.close();

const report = { snapshot, consoleErrors };
const outPath = new URL('perf-stress-report.json', OUT_DIR);
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log('\nWrote', outPath.pathname);
