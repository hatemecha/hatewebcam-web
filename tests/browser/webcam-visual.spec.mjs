import { expect, test } from '@playwright/test';

const dynamicMasks = () => [];

test.beforeEach(async ({ page: _page }, testInfo) => {
  testInfo.snapshotSuffix = '';
});

async function openRunningCamera(page) {
  await page.goto('/');
  await expect(page.locator('#previewPlaceholder')).toHaveClass(/hidden/);
  await page.locator('#previewCanvas').evaluate((canvas) => {
    canvas.style.visibility = 'hidden';
    canvas.parentElement.style.background = '#101010';
  });
  await page.locator('#fpsInfo').evaluate((element) => {
    element.textContent = '30 FPS';
  });
}

test.describe('deterministic desktop webcam states', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('camera off and running', async ({ page }) => {
    await openRunningCamera(page);
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-running-desktop.png',
      {
        animations: 'disabled',
        mask: dynamicMasks(page),
      },
    );
    await page.locator('#btnToggleCamera').click();
    await expect(page.locator('#cameraStateTitle')).toHaveText(
      'Cámara apagada',
    );
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-off-desktop.png',
      {
        animations: 'disabled',
      },
    );
  });

  test('permission denied', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(
          new DOMException('denied for visual test', 'NotAllowedError'),
        );
    });
    await page.goto('/');
    await expect(page.locator('#cameraStateTitle')).toHaveText(
      'Permiso de cámara denegado',
    );
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-denied-desktop.png',
      {
        animations: 'disabled',
      },
    );
  });

  test('countdown and recording', async ({ page }) => {
    await openRunningCamera(page);
    await page.locator('#captureTimerSelect').selectOption('5');
    await page.locator('#btnTakePhoto').click();
    await expect(page.locator('#captureCountdown')).toBeVisible();
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-countdown-desktop.png',
      {
        animations: 'disabled',
        mask: dynamicMasks(page),
      },
    );
    await page.locator('#btnTakePhoto').click();
    await page.locator('#btnRecord').click();
    await expect(page.locator('#recordingHud')).toBeVisible();
    await page.locator('#recordingHudTime').evaluate((element) => {
      element.textContent = '00:14';
    });
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-recording-desktop.png',
      {
        animations: 'disabled',
        mask: dynamicMasks(page),
      },
    );
    await page.locator('#btnRecord').click();
  });

  test('detectors searching and with a result', async ({ page }) => {
    await openRunningCamera(page);
    await page.evaluate(() => {
      const blob = document.querySelector('#detectorChipBlob');
      const face = document.querySelector('#detectorChipFace');
      blob.textContent = 'Color: buscando';
      blob.dataset.state = 'searching';
      face.textContent = 'Caras: buscando';
      face.dataset.state = 'searching';
    });
    await expect(page.locator('.preview-area')).toHaveScreenshot(
      'webcam-detectors-searching.png',
      {
        animations: 'disabled',
        mask: dynamicMasks(page),
      },
    );
    await page.evaluate(() => {
      const blob = document.querySelector('#detectorChipBlob');
      const face = document.querySelector('#detectorChipFace');
      blob.textContent = 'Color encontrado (1)';
      blob.dataset.state = 'detected';
      face.textContent = '2 caras detectadas';
      face.dataset.state = 'detected';
    });
    await expect(page.locator('.preview-area')).toHaveScreenshot(
      'webcam-detectors-result.png',
      {
        animations: 'disabled',
        mask: dynamicMasks(page),
      },
    );
  });
});

test.describe('deterministic mobile webcam states', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test('camera and effects panel', async ({ page }) => {
    await openRunningCamera(page);
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-running-mobile.png',
      {
        animations: 'disabled',
        mask: dynamicMasks(page),
      },
    );
    await page.locator('#btnMobileEffectsDock').click();
    await expect(page.locator('#mobileFxPanel')).toBeVisible();
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-panel-mobile.png',
      {
        animations: 'disabled',
        mask: dynamicMasks(page),
      },
    );
  });
});
