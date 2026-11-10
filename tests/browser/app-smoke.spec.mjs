import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const SUBJECT_VIDEO_FIXTURE = fileURLToPath(
  new URL('../fixtures/subject-init.webm', import.meta.url),
);

test('video editor shell loads without fatal errors', async ({ page }) => {
  const fatalMessages = [];
  page.on('console', (message) => {
    if (message.type() === 'error') fatalMessages.push(message.text());
  });
  page.on('pageerror', (error) => fatalMessages.push(error.message));

  await page.goto('/');
  await page.getByRole('tab', { name: /video/i }).click();

  await expect(page.locator('#previewCanvas')).toHaveCount(1);
  await expect(page.locator('#btnPreviewImportVideo')).toBeVisible();
  await expect(page.locator('#videoTimelineShell')).toBeHidden();
  await expect(page.locator('#btnChooseVideo')).toBeHidden();
  await expect(page.locator('#btnEditAssistAnalyze')).toBeHidden();
  await expect(page.locator('#btnExportVideo')).toBeDisabled();
  await expect(page.locator('#tabInspectorAdjust')).not.toHaveAttribute(
    'title',
  );
  await expect(page.locator('#videoExportDetails')).toContainText(
    'Importá un video',
  );
  await expect(page.locator('[data-effect-type="visual-fx"]')).toHaveCount(2);
  expect(fatalMessages).toEqual([]);
});

test('video empty state stays usable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('tab', { name: /video/i }).click();

  await expect(page.locator('#btnPreviewImportVideo')).toBeVisible();
  await expect(page.locator('#videoInspector')).toBeVisible();
  await expect(page.locator('.video-project-resume')).toBeVisible();
  await expect(page.locator('.video-inspector-tabs')).toBeHidden();

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    previewTop: document
      .querySelector('#previewWrapper')
      .getBoundingClientRect().top,
    inspectorTop: document
      .querySelector('#videoInspector')
      .getBoundingClientRect().top,
    previewBottom: document
      .querySelector('#previewWrapper')
      .getBoundingClientRect().bottom,
  }));

  expect(layout.scrollWidth).toBe(layout.clientWidth);
  expect(layout.inspectorTop).toBeGreaterThanOrEqual(layout.previewBottom);
});

test('header export follows source mode and video availability', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.locator('#btnWebcamMode')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('#btnHeaderExportVideo')).toBeHidden();

  await page.getByRole('tab', { name: /video/i }).click();
  await expect(page.locator('#btnVideoMode')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('#btnHeaderExportVideo')).toBeVisible();
  await expect(page.locator('#btnHeaderExportVideo')).toBeDisabled();

  await page.locator('#videoFileInput').setInputFiles(SUBJECT_VIDEO_FIXTURE);
  await expect(page.locator('#videoTimelineShell')).toBeVisible();
  await expect(page.locator('#btnHeaderExportVideo')).toBeEnabled();

  await page.getByRole('tab', { name: /webcam/i }).click();
  await expect(page.locator('#btnHeaderExportVideo')).toBeHidden();
});

test('specific-color detection exposes an editable target color', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#chkBlobTracking').check();
  await page.locator('#btnToggleAdvancedOptions').click();

  const targetColor = page.locator('#inpTargetColor');
  await expect(targetColor).toBeVisible();
  await targetColor.fill('#2a7fff');
  await expect(targetColor).toHaveValue('#2a7fff');
  await expect(page.locator('#targetColorValue')).toHaveText('#2A7FFF');
  await expect(page.locator('#cfgTargetColorStatus')).toContainText(
    'Color objetivo actualizado.',
  );
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
    '/vendor/mediapipe/tasks-vision/wasm/vision_wasm_internal.js',
    '/vendor/mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm',
    '/vendor/mediapipe/pose_landmarker/pose_landmarker_lite.task',
    '/vendor/mediapipe/image_segmenter/selfie_segmenter.tflite',
  ]) {
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
  }
});

test('Visual FX only initializes person assets when requested', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const failures = [];
  const requestedSubjectAssets = new Set();
  const trackedAssetPatterns = [
    /pose_landmarker_lite\.task$/,
    /vision_wasm(?:_\w+)?_internal\.js(?:\?|$)/,
    /vision_wasm(?:_\w+)?_internal\.wasm(?:\?|$)/,
    /selfie_segmenter\.tflite$/,
  ];

  const classifySubjectAsset = (url) => {
    const path = new URL(url).pathname;
    const file = path.split('/').pop() || '';
    if (file === 'pose_landmarker_lite.task') return 'pose';
    if (/vision_wasm.*_internal\.js$/.test(file)) return 'wasm-js';
    if (/vision_wasm.*_internal\.wasm$/.test(file)) return 'wasm-bin';
    if (file === 'selfie_segmenter.tflite') return 'segmenter';
    return null;
  };

  const subjectAssetsReady = () => {
    const kinds = new Set(
      [...requestedSubjectAssets]
        .map((name) => classifySubjectAsset(`http://local/${name}`))
        .filter(Boolean),
    );
    return kinds.has('pose') && kinds.has('wasm-js') && kinds.has('wasm-bin');
  };

  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const knownMediaPipeNoise = [
      'OpenGL error checking is disabled',
      'GPU stall due to ReadPixels',
      'Created TensorFlow Lite XNNPACK delegate for CPU',
      'Feedback manager requires a model with a single signature inference',
      'landmark_projection_calculator.cc',
      'Using NORM_RECT without IMAGE_DIMENSIONS',
    ];
    if (knownMediaPipeNoise.some((text) => message.text().includes(text))) {
      return;
    }
    if (
      message.type() === 'warning' &&
      message.text().includes('Error starting camera')
    ) {
      return;
    }
    if (message.type() === 'error' || message.type() === 'warning') {
      failures.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    failures.push(
      `requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`,
    );
  });
  page.on('response', (response) => {
    const url = response.url();
    if (!trackedAssetPatterns.some((pattern) => pattern.test(url))) return;
    const kind = classifySubjectAsset(url);
    if (!kind) return;
    const label = url.split('/').pop()?.split('?')[0] || kind;
    if (response.ok()) requestedSubjectAssets.add(label);
    else failures.push(`HTTP ${response.status()}: ${url}`);
  });

  await page.goto('/');
  await page.getByRole('tab', { name: /video/i }).click();
  await page.locator('#videoFileInput').setInputFiles(SUBJECT_VIDEO_FIXTURE);
  await expect(page.locator('#videoTimelineShell')).toBeVisible();
  await page
    .locator('.timeline-palette-chip[data-effect-type="visual-fx"]')
    .click();

  await expect(page.locator('.timeline-item-label')).toContainText('Recursive');
  expect([...requestedSubjectAssets]).toEqual([]);
  await page.locator('#visual-target-person').click();
  // The fixture is short: keep a frame inside the effect clip visible while
  // MediaPipe initializes, instead of racing playback against WASM startup.
  await page.locator('#videoSeek').evaluate((seek) => {
    const duration = Number(seek.max) || 1;
    seek.value = String(Math.min(0.1, duration / 2));
    seek.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => subjectAssetsReady(), { timeout: 45_000 }).toBe(true);
  await expect(page.locator('#visualFxInlineStatus')).not.toContainText(
    /No se pudo|error/i,
  );
  expect(failures).toEqual([]);
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
