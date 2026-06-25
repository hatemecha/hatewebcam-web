import { expect, test } from '@playwright/test';

test('video editor shell loads without fatal errors', async ({ page }) => {
  const fatalMessages = [];
  page.on('console', (message) => {
    if (message.type() === 'error') fatalMessages.push(message.text());
  });
  page.on('pageerror', (error) => fatalMessages.push(error.message));

  await page.goto('/');
  await page.getByRole('tab', { name: /video/i }).click();

  await expect(page.locator('#previewCanvas')).toHaveCount(1);
  await expect(page.locator('#videoTimeline')).toBeVisible();
  await expect(page.locator('#btnChooseVideo')).toBeVisible();
  await expect(page.locator('#btnEditAssistAnalyze')).toBeVisible();
  await expect(page.locator('#btnExportVideo')).toBeDisabled();
  await expect(page.locator('#videoExportDetails')).toContainText(
    'Importá un video',
  );
  expect(fatalMessages).toEqual([]);
});

test('template boot failure shows a visible error', async ({ page }) => {
  await page.route('**/templates/video-editor.html', (route) => route.abort());

  await page.goto('/');

  await expect(page.getByRole('heading')).toContainText(
    'No se pudo iniciar HateWebcam',
  );
});

test('runtime vendor assets are served from dist', async ({ request }) => {
  for (const path of [
    '/vendor/mediabunny/mediabunny.min.mjs',
    '/vendor/mediapipe/face_mesh/face_mesh.js',
  ]) {
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
  }
});
