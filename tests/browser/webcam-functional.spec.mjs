import { expect, test } from '@playwright/test';
import { applyRenderLoopMixin } from '../../js/app/render.mjs';
import { DEFAULT_IMAGE_SETTINGS } from '../../js/app/constants.mjs';

async function openWebcam(page) {
  await page.goto('/');
  await expect(page.locator('#btnToggleCamera')).toBeVisible();
}

async function waitForCamera(page) {
  await expect(page.locator('#previewPlaceholder')).toHaveClass(/hidden/);
  await expect(page.locator('#btnTakePhoto')).toBeEnabled();
}

async function mockCameraError(page, name, failCount = 999) {
  await page.addInitScript(
    ({ errorName, failures }) => {
      const mediaDevices = navigator.mediaDevices;
      const original = mediaDevices.getUserMedia.bind(mediaDevices);
      let calls = 0;
      mediaDevices.getUserMedia = (constraints) => {
        calls += 1;
        if (calls <= failures) {
          return Promise.reject(
            new DOMException('camera test error', errorName),
          );
        }
        return original(constraints);
      };
    },
    { errorName: name, failures: failCount },
  );
}

test('camera starts successfully and exposes a single performance control', async ({
  page,
}) => {
  await openWebcam(page);
  await waitForCamera(page);
  await expect(page.locator('#performanceModeSelect')).toHaveCount(1);
  await expect(page.locator('#previewQualitySelect')).toHaveCount(0);
  await expect(page.locator('#performanceModeSelect option')).toHaveText([
    'Automático',
    'Más fluido',
    'Balanceado',
    'Más detalle',
  ]);
});

test('permission denied is explained and recoverable in the preview', async ({
  page,
}) => {
  await mockCameraError(page, 'NotAllowedError');
  await openWebcam(page);
  await expect(page.locator('#cameraStateTitle')).toHaveText(
    'Permiso de cámara denegado',
  );
  await expect(page.locator('#cameraStateHint')).toContainText('permisos');
  await expect(page.locator('#btnCameraStateAction')).toHaveText(/Reintentar/);
  await expect(page.locator('#previewPlaceholderCamera')).toHaveAttribute(
    'role',
    'status',
  );
  await expect(page.locator('#previewPlaceholderCamera')).toHaveAttribute(
    'aria-live',
    'polite',
  );
});

test('missing camera is classified separately', async ({ page }) => {
  await mockCameraError(page, 'NotFoundError');
  await openWebcam(page);
  await expect(page.locator('#cameraStateTitle')).toHaveText(
    'No se encontró una cámara',
  );
  await expect(page.locator('#btnCameraStateAction')).toBeVisible();
});

test('retry starts the camera after a transient error', async ({ page }) => {
  await mockCameraError(page, 'NotReadableError', 1);
  await openWebcam(page);
  await expect(page.locator('#cameraStateTitle')).toHaveText(
    'La cámara está ocupada',
  );
  await page.locator('#btnCameraStateAction').click();
  await waitForCamera(page);
});

test('mirror is quick, accessible and persisted', async ({ page }) => {
  await openWebcam(page);
  const mirror = page.locator('#btnMirrorQuick');
  await expect(mirror).toHaveAttribute('aria-pressed', 'false');
  await mirror.click();
  await expect(mirror).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#chkMirror')).toBeChecked();
  await page.reload();
  await expect(page.locator('#btnMirrorQuick')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#chkMirror')).toBeChecked();
});

test('camera change preserves webcam configuration', async ({ page }) => {
  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    const original = mediaDevices.getUserMedia.bind(mediaDevices);
    mediaDevices.enumerateDevices = async () => [
      {
        kind: 'videoinput',
        deviceId: 'cam-a',
        label: 'Cámara A',
        groupId: 'test',
      },
      {
        kind: 'videoinput',
        deviceId: 'cam-b',
        label: 'Cámara B',
        groupId: 'test',
      },
    ];
    mediaDevices.getUserMedia = (constraints) => {
      const next = { ...constraints, video: { ...constraints.video } };
      delete next.video.deviceId;
      return original(next);
    };
  });
  await openWebcam(page);
  await waitForCamera(page);
  await page.locator('#btnMirrorQuick').click();
  await page.locator('#captureTimerSelect').selectOption('5');
  await page.locator('#performanceModeSelect').selectOption('performance');
  await page.locator('#btnToggleAdvancedOptions').click();
  await page.locator('#sldExposure').fill('24');
  await page.locator('#chkBlobTracking').check();
  await page.locator('#inpBlobQuickColor').fill('#00c853');
  await page.locator('#inpFaceQuickLabel').evaluate((input) => {
    input.value = 'INVITADO';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await page.locator('#cameraSelect').selectOption('cam-b');
  await expect(page.locator('#cameraSelect')).toBeEnabled();
  await expect(page.locator('#chkMirror')).toBeChecked();
  await expect(page.locator('#captureTimerSelect')).toHaveValue('5');
  await expect(page.locator('#performanceModeSelect')).toHaveValue(
    'performance',
  );
  await expect(page.locator('#sldExposure')).toHaveValue('24');
  await expect(page.locator('#chkBlobTracking')).toBeChecked();
  await expect(page.locator('#inpBlobQuickColor')).toHaveValue('#00c853');
  await expect(page.locator('#inpFaceQuickLabel')).toHaveValue('INVITADO');
});

test('recording shows time and effective format, then stops accessibly', async ({
  page,
}) => {
  await openWebcam(page);
  await waitForCamera(page);
  await page.locator('#btnRecord').click();
  await expect(page.locator('#recordingHud')).toBeVisible();
  await expect(page.locator('#recordingHudTime')).toHaveText(/00:0[0-9]/);
  await expect(page.locator('#recordingHudFormat')).toHaveText(/MP4|WebM/);
  await expect(page.locator('#btnMobileRecord')).toHaveAttribute(
    'aria-label',
    'Detener grabación',
  );
  await page.waitForTimeout(1100);
  await page.locator('#btnRecord').click();
  await expect(page.locator('#recordingHud')).toBeHidden();
  await expect(page.locator('#captureStatus')).toContainText(
    /Grabación detenida|Video listo/,
  );
});

test('MP4 fallback communicates WebM as the effective format', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    MediaRecorder.isTypeSupported = (type) =>
      type.startsWith('video/mp4') ? false : original(type);
  });
  await openWebcam(page);
  await waitForCamera(page);
  await page.locator('#btnToggleAdvancedOptions').click();
  await page.locator('#videoFormatSelect').selectOption('mp4');
  await page.locator('#btnRecord').click();
  await expect(page.locator('#recordingHudFormat')).toHaveText('WebM');
  await expect(page.locator('#captureStatus')).toContainText(
    'MP4 no disponible',
  );
  await page.locator('#btnRecord').click();
});

test('photo countdown becomes cancellable without creating another timer', async ({
  page,
}) => {
  await openWebcam(page);
  await waitForCamera(page);
  await page.locator('#captureTimerSelect').selectOption('5');
  await page.locator('#btnTakePhoto').click();
  await expect(page.locator('#captureCountdown')).toBeVisible();
  await expect(page.locator('#btnTakePhoto')).toHaveAttribute(
    'aria-label',
    'Cancelar temporizador de foto',
  );
  await page.locator('#btnTakePhoto').click();
  await expect(page.locator('#captureCountdown')).toBeHidden();
});

test('full reset keeps profiles and profile deletion stays separate', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'hatewebcam_profiles',
      JSON.stringify({ Estudio: { display: {} } }),
    );
  });
  await openWebcam(page);
  await page.locator('#btnMirrorQuick').click();
  await page.locator('#captureTimerSelect').selectOption('10');
  await page.locator('#performanceModeSelect').selectOption('quality');
  await page.locator('#btnToggleAdvancedOptions').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#btnResetWebcamConfig').click();
  await expect(page.locator('#chkMirror')).not.toBeChecked();
  await expect(page.locator('#captureTimerSelect')).toHaveValue('0');
  await expect(page.locator('#performanceModeSelect')).toHaveValue('normal');
  await expect(
    page.locator('#profileSelect option', { hasText: 'Estudio' }),
  ).toHaveCount(1);

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#btnDeleteAllProfiles').click();
  await expect(page.locator('#profileSelect option')).toHaveCount(1);
});

test('loading a profile synchronizes mirror and performance controls', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'hatewebcam_profiles',
      JSON.stringify({
        Detalle: {
          display: {
            flipH: true,
            flipV: false,
            rotation: 0,
            imageSettings: {
              performanceMode: 'quality',
              previewQuality: 'high',
            },
          },
        },
      }),
    );
  });
  await openWebcam(page);
  await page.locator('#btnToggleAdvancedOptions').click();
  await page.locator('#profileSelect').selectOption('Detalle');
  await expect(page.locator('#chkMirror')).toBeChecked();
  await expect(page.locator('#btnMirrorQuick')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#performanceModeSelect')).toHaveValue('quality');
  await expect(page.locator('#previewQualityDiagnostic')).toHaveText('Alta');
});

test('detectors expose visible public summaries and primary ARIA states', async ({
  page,
}) => {
  await openWebcam(page);
  await waitForCamera(page);
  await expect(page.locator('#detectorChipBlob')).toHaveAttribute(
    'data-state',
    'off',
  );
  await page.locator('#chkBlobTracking').check();
  await expect(page.locator('#detectorChipBlob')).toHaveText(
    /buscando|encontrado/i,
  );
  await expect(page.locator('#btnMobileBlobToggle')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});

test('black and white recording keeps moving and produces a playable video', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openWebcam(page);
  await waitForCamera(page);
  await page.locator('#btnToggleAdvancedOptions').click();
  await page.locator('#chkBlackWhite').check();
  await page.locator('#chkBlobTracking').check();
  await page.locator('#btnRecord').click();
  await expect(page.locator('#recordingHud')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.locator('#btnRecord').click();
  const video = page.locator('#capturePreviewVideo');
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((el) => el.readyState))
    .toBeGreaterThanOrEqual(2);
  const initial = await video.evaluate(async (el) => {
    el.muted = true;
    el.currentTime = 0;
    await el.play();
    return el.currentTime;
  });
  await expect
    .poll(() => video.evaluate((el) => el.currentTime))
    .toBeGreaterThan(initial + 0.5);
  expect(errors).toEqual([]);
});

test('simplified recording filters preserve pixel colors', async ({ page }) => {
  const app = { imageSettings: { ...DEFAULT_IMAGE_SETTINGS } };
  applyRenderLoopMixin(app);
  app.clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const filters = [];
  for (const blackAndWhite of [false, true]) {
    for (const exposure of [0, 30, -40]) {
      for (const contrast of [100, 140]) {
        Object.assign(app.imageSettings, { blackAndWhite, exposure, contrast });
        const values = app.getBaseFilterValues();
        filters.push({
          original: `brightness(${values.exposureBoost}%) contrast(${values.contrastPercent}%) saturate(${values.saturationPercent}%) grayscale(${values.grayscalePercent}%)`,
          optimized: app.buildCanvasFilter(),
        });
      }
    }
  }
  await page.goto('/');
  const difference = await page.evaluate((pairs) => {
    const source = document.createElement('canvas');
    source.width = 32;
    source.height = 32;
    const ctx = source.getContext('2d');
    const pixels = ctx.createImageData(32, 32);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = (i * 17) % 256;
      pixels.data[i + 1] = (i * 31 + 45) % 256;
      pixels.data[i + 2] = (i * 7 + 93) % 256;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const render = (filter) => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const target = canvas.getContext('2d');
      target.filter = filter;
      target.drawImage(source, 0, 0);
      return target.getImageData(0, 0, 32, 32).data;
    };
    let maxDifference = 0;
    for (const pair of pairs) {
      const a = render(pair.original),
        b = render(pair.optimized);
      for (let i = 0; i < a.length; i++)
        maxDifference = Math.max(maxDifference, Math.abs(a[i] - b[i]));
    }
    return maxDifference;
  }, filters);
  expect(difference).toBeLessThanOrEqual(1);
});
