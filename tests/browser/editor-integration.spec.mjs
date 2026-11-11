import { expect, test } from '@playwright/test';
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
