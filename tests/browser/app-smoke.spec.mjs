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

test('language follows the browser and a discreet persisted override', async ({
  browser,
}) => {
  const englishContext = await browser.newContext({ locale: 'en-US' });
  const page = await englishContext.newPage();

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#languageSelect')).toHaveValue('en');
  await expect(page.locator('#languageSelect')).toHaveAttribute(
    'aria-label',
    'Language',
  );
  await expect(page.locator('#performanceModeSelect option')).toHaveText([
    'Automatic',
    'Smoother',
    'Balanced',
    'More detail',
  ]);
  const englishUi = await page.locator('body').textContent();
  expect(englishUi).not.toMatch(/[áéíóúñ¿¡]/i);
  expect(englishUi).not.toMatch(
    /\b(Ajustes|Cámara|Caras|Pestañeos|Temporizador|Guardar|Eliminar|Restablecer|Exportación|Importar|Seleccionar|Recuadro|Desenfoque)\b/i,
  );

  await page.locator('#chkBlobTracking').check();
  await expect(page.locator('#effectConfigBlob')).not.toBeEmpty();
  expect(await page.locator('#effectConfigBlob').textContent()).not.toMatch(
    /[áéíóúñ¿¡]/i,
  );

  await page.locator('#btnToggleAdvancedOptions').click();
  let profilePromptMessage = '';
  page.once('dialog', async (dialog) => {
    profilePromptMessage = dialog.message();
    await dialog.dismiss();
  });
  await page.locator('#btnSaveProfile').click();
  expect(profilePromptMessage).toBe('Name for this preset:');

  await page.locator('#languageSelect').selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('#performanceModeSelect option')).toHaveText([
    'Automático',
    'Más fluido',
    'Balanceado',
    'Más detalle',
  ]);
  await page.reload();
  await expect(page.locator('#languageSelect')).toHaveValue('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');

  await englishContext.close();

  const spanishContext = await browser.newContext({ locale: 'es-AR' });
  const spanishPage = await spanishContext.newPage();
  await spanishPage.goto('/');
  await expect(spanishPage.locator('#languageSelect')).toHaveValue('es');
  await expect(spanishPage.locator('html')).toHaveAttribute('lang', 'es');
  await spanishContext.close();
});
