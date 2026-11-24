import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SUBJECT_VIDEO_FIXTURE = fileURLToPath(
  new URL('../fixtures/subject-init.webm', import.meta.url),
);

async function openEditor(page) {
  await page.goto('/');
  await page.getByRole('tab', { name: /video/i }).click();
  await page.locator('#videoFileInput').setInputFiles(SUBJECT_VIDEO_FIXTURE);
  await expect(page.locator('#videoTimelineShell')).toBeVisible();
}

test('timeline clips support add, undo, redo and delete', async ({ page }) => {
  await openEditor(page);

  await page.locator('.timeline-palette-chip[data-effect-type="look"]').click();
  await expect(page.locator('.timeline-item')).toHaveCount(1);
  await expect(page.locator('#btnEditorUndo')).toBeEnabled();

  await page.locator('#btnEditorUndo').click();
  await expect(page.locator('.timeline-item')).toHaveCount(0);
  await expect(page.locator('#btnEditorRedo')).toBeEnabled();

  await page.locator('#btnEditorRedo').click();
  await expect(page.locator('.timeline-item')).toHaveCount(1);

  await page.locator('.timeline-item').first().click();
  await expect(page.locator('#btnDeleteVideoEffect')).toBeVisible();
  await page.locator('#btnTimelineZoomIn').click();
  await expect(page.locator('#timelineZoom')).toHaveValue('1.5');
  const clipStart = page.locator('#videoEffectStart');
  await clipStart.fill('0.25');
  await clipStart.press('Tab');
  await expect(clipStart).toHaveValue('0.25');
  await page.locator('#videoEffectAutomationSelect').selectOption('fade-in');
  await page.locator('#btnOpenEffectAdjust').click();
  await expect(page.locator('#tabInspectorAdjust')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.locator('#tabInspectorEffect').click();
  await expect(clipStart).toHaveValue('0.25');
  await expect(page.locator('#videoEffectAutomationSelect')).toHaveValue(
    'fade-in',
  );
  await page.locator('#btnDeleteVideoEffect').click();
  await expect(page.locator('.timeline-item')).toHaveCount(0);
});

test('a corrupt video leaves the editor recoverable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: /video/i }).click();

  await page.locator('#videoFileInput').setInputFiles({
    name: 'broken.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from('this is not a video'),
  });
  await expect(page.locator('#videoEditorStatus')).toHaveClass(/error/);
  await expect(page.locator('#videoTimelineShell')).toBeHidden();
  await expect(page.locator('#btnExportVideo')).toBeDisabled();

  await page.locator('#videoFileInput').setInputFiles(SUBJECT_VIDEO_FIXTURE);
  await expect(page.locator('#videoTimelineShell')).toBeVisible();
  await expect(page.locator('#btnExportVideo')).toBeEnabled();
});

test('transport plays, pauses and seeks within the trim', async ({ page }) => {
  await openEditor(page);
  const player = page.locator('#videoElement');
  const play = page.locator('#btnVideoPlay');
  await page.locator('#btnVideoEnd').click();
  const end = await player.evaluate((video) => video.currentTime);
  expect(end).toBeGreaterThan(0);
  await play.click();
  await expect(play.locator('.fa-pause')).toHaveCount(1);
  expect(await player.evaluate((video) => video.currentTime)).toBeLessThan(end);
  await play.click();
  await expect(play.locator('.fa-play')).toHaveCount(1);
  await page.locator('#btnVideoStart').click();
  await expect
    .poll(() => player.evaluate((video) => video.currentTime))
    .toBe(0);
});

test('leaving the editor cancels the source probe and revokes its URL', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const videoPrototype = HTMLVideoElement.prototype;
    const request = videoPrototype.requestVideoFrameCallback;
    const cancel = videoPrototype.cancelVideoFrameCallback;
    const revoke = URL.revokeObjectURL;
    window.revokedVideoUrls = [];
    URL.revokeObjectURL = (url) => {
      window.revokedVideoUrls.push(url);
      revoke(url);
    };
    videoPrototype.requestVideoFrameCallback = function (callback) {
      if (this.id === 'videoElement' && this.currentSrc.startsWith('blob:')) {
        window.probingVideoUrl = this.currentSrc;
        return -1;
      }
      return request.call(this, callback);
    };
    videoPrototype.cancelVideoFrameCallback = function (id) {
      if (id === -1) window.cancelledVideoProbe = true;
      else cancel.call(this, id);
    };
  });
  await page.goto('/');
  await page.getByRole('tab', { name: /video/i }).click();
  await page.locator('#videoFileInput').setInputFiles(SUBJECT_VIDEO_FIXTURE);
  await expect
    .poll(() => page.evaluate(() => window.probingVideoUrl))
    .toMatch(/^blob:/);
  await page.getByRole('tab', { name: /webcam/i }).click();
  await expect(page.locator('#btnTakePhoto')).toBeEnabled();
  expect(
    await page.evaluate(
      () =>
        window.cancelledVideoProbe &&
        window.revokedVideoUrls.includes(window.probingVideoUrl),
    ),
  ).toBe(true);
  await expect(page.locator('#videoTimelineShell')).toBeHidden();
});

test('closing the app releases the webcam and editor keyboard listeners', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const addEventListener = EventTarget.prototype.addEventListener;
    window.testKeyboardSignals = [];
    EventTarget.prototype.addEventListener = function (
      name,
      listener,
      options,
    ) {
      if (
        name === 'keydown' &&
        (this === window || this === document) &&
        options?.signal
      ) {
        window.testKeyboardSignals.push(options.signal);
      }
      return addEventListener.call(this, name, listener, options);
    };
  });
  await openEditor(page);
  const allReleased = await page.evaluate(() => {
    const signals = window.testKeyboardSignals;
    if (signals.length < 2 || signals.some((signal) => signal.aborted))
      return false;
    window.dispatchEvent(new Event('beforeunload'));
    return signals.every((signal) => signal.aborted);
  });
  expect(allReleased).toBe(true);
});

test('a saved project restores its timeline when the original video is reimported', async ({
  page,
}) => {
  await openEditor(page);
  await page.locator('.timeline-palette-chip[data-effect-type="look"]').click();
  await page.locator('#tabInspectorProject').click();
  const pendingDownload = page.waitForEvent('download');
  await page.locator('#btnSaveProject').click();
  const download = await pendingDownload;
  const project = await readFile(await download.path());
  expect(JSON.parse(project.toString('utf8')).version).toBe(2);

  await page.getByRole('tab', { name: /webcam/i }).click();
  await page.getByRole('tab', { name: /video/i }).click();
  await page.locator('#projectFileInput').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: project,
  });
  await expect(page.locator('#videoEditorStatus')).toContainText(
    'Reimportá el video original',
  );
  await page.locator('#videoFileInput').setInputFiles(SUBJECT_VIDEO_FIXTURE);
  await expect(page.locator('.timeline-item')).toHaveCount(1);
  await expect(page.locator('#videoEditorStatus')).toContainText(
    'Proyecto restaurado',
  );
});

test('an invalid project file reports a recoverable error', async ({
  page,
}) => {
  await openEditor(page);

  await page.locator('#projectFileInput').setInputFiles({
    name: 'broken.hatewebcam.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version": 99}'),
  });
  await expect(page.locator('#videoEditorStatus')).toContainText(
    'El archivo de proyecto no es válido.',
  );
  await expect(page.locator('#videoTimelineShell')).toBeVisible();
});

test('editor chrome follows a locale change', async ({ page }) => {
  await openEditor(page);
  await page.locator('.timeline-palette-chip[data-effect-type="look"]').click();

  await page.locator('#languageSelect').selectOption('en');
  await expect(page.locator('#tabInspectorProject')).toHaveText('Project');
  await expect(page.locator('#tabInspectorAdjust')).toHaveText('Settings');
  await expect(page.locator('#timelineEffectPalette')).toHaveAttribute(
    'aria-label',
    'Effects to drag onto the timeline',
  );
  await expect(page.locator('#timelineHintText')).toContainText('Drag');
  await expect(page.locator('#videoProjectHelp')).toContainText(
    'Replace the video',
  );
  await expect(page.locator('#btnChooseVideo')).toContainText('Change video');
  await expect(page.locator('#editAssistResult')).toHaveText('Not analyzed');
  await expect(page.locator('#videoEffectTypeLabel')).toContainText('LOOK');
  await expect(page.locator('#videoExportDiagnostics')).toContainText(
    'Diagnostics',
  );
  await expect(page.locator('#videoFileMeta')).toContainText('estimated');
});

test('Edit Assist restores its settings and edits the marker grid', async ({
  page,
}) => {
  await openEditor(page);
  await page.locator('#projectFileInput').setInputFiles({
    name: 'edit-assist.hatewebcam.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 2,
        source: { name: 'subject-init.webm' },
        timeline: { items: [], markers: [] },
        editAssist: { bpm: 120, confidence: 0.8, offset: 0, markerStep: 4 },
      }),
    ),
  });
  await expect(page.locator('#editAssistBpmInput')).toHaveValue('120');
  await page.locator('#btnEditAssistHalf').click();
  await expect(page.locator('#editAssistBpmInput')).toHaveValue('60');
  await page.locator('#btnEditAssistOffsetUp').click();
  await expect(page.locator('#editAssistOffsetInput')).toHaveValue('10');
  await page.locator('#btnEditAssistBeat').click();
  await expect(page.locator('#editAssistDensitySelect')).toHaveValue('1');
  await expect(
    page.locator('.timeline-marker[data-source="edit-assist"]').first(),
  ).toBeVisible();
  await page.locator('#languageSelect').selectOption('en');
  await expect(page.locator('#editAssistStatus')).toContainText(
    'Edit Assist markers created.',
  );
  await page.locator('#btnEditAssistClear').click();
  await expect(
    page.locator('.timeline-marker[data-source="edit-assist"]'),
  ).toHaveCount(0);
});

test('cancelling an export restores the editor', async ({ page }) => {
  test.setTimeout(60_000);
  await openEditor(page);
  await page.locator('.timeline-palette-chip[data-effect-type="look"]').click();
  await page.locator('#tabInspectorProject').click();
  await page.locator('#editorExportPresetSelect').selectOption('fast');
  await page.locator('#btnExportVideo').click();
  await expect(page.locator('#videoExportModal')).toBeVisible();
  await expect(page.locator('#btnCancelVideoExport')).toBeVisible();
  await page.locator('#btnCancelVideoExport').click();
  await expect(page.locator('#btnExportVideo')).toBeEnabled();
  await expect(page.locator('#videoTimelineShell')).toBeVisible();
});
