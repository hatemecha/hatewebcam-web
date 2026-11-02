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
    Object.defineProperty(element, 'textContent', {
      configurable: true,
      get: () => '30 FPS',
      set: () => {},
    });
  });
}

test.describe('deterministic desktop webcam states', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('camera off and running', async ({ page }) => {
    await openRunningCamera(page);
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-running-desktop.png',
      {
        animations: 'disabled',
        mask: dynamicMasks(page),
      },
    );
    await expect(page.locator('.desktop-capture-bar')).toHaveScreenshot(
      'webcam-capture-available-desktop.png',
      { animations: 'disabled' },
    );
    await page.locator('#fpsInfo').evaluate((element) => {
      delete element.textContent;
    });
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

  test('detectors off and advanced sidebar', async ({ page }) => {
    await openRunningCamera(page);
    await expect(page.locator('.preview-status-bar')).toHaveScreenshot(
      'webcam-detectors-off.png',
      { animations: 'disabled' },
    );
    await page.locator('#chkBlobTracking').check();
    await page.locator('#chkFaceDetection').check();
    await expect(page.locator('#colorPickSection')).toBeVisible();
    await expect(page.locator('#faceQuickControls')).toBeVisible();
    await expect(page.locator('#controlPanel')).toHaveScreenshot(
      'webcam-detectors-open-desktop.png',
      { animations: 'disabled' },
    );
    await page.locator('#chkBlobTracking').uncheck();
    await page.locator('#chkFaceDetection').uncheck();
    await page.locator('#btnToggleAdvancedOptions').click();
    await expect(page.locator('#advancedOptions')).toBeVisible();
    await page.locator('#advancedOptions').scrollIntoViewIfNeeded();
    await expect(page.locator('#controlPanel')).toHaveScreenshot(
      'webcam-advanced-open-desktop.png',
      { animations: 'disabled' },
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
      blob.textContent = 'Color · buscando';
      blob.dataset.state = 'searching';
      face.textContent = 'Caras · buscando';
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
      blob.textContent = 'Color encontrado';
      blob.dataset.state = 'detected';
      face.textContent = '2 caras';
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

test.describe('desktop webcam layout coverage', () => {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    test(`running at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openRunningCamera(page);
      await expect(page.locator('body')).toHaveScreenshot(
        `webcam-running-${viewport.width}x${viewport.height}.png`,
        { animations: 'disabled', mask: dynamicMasks(page) },
      );
    });
  }
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

  test('recording, countdown and mirror', async ({ page }) => {
    await openRunningCamera(page);
    await page.locator('#btnMobileRecord').click();
    await expect(page.locator('#recordingHud')).toBeVisible();
    await page.locator('#recordingHudTime').evaluate((element) => {
      element.textContent = '00:14';
    });
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-recording-mobile.png',
      { animations: 'disabled', mask: dynamicMasks(page) },
    );
    await page.locator('#btnMobileRecord').click();
    await expect(page.locator('#recordingHud')).toBeHidden();
    await expect(page.locator('#capturePreviewModal')).toBeVisible();
    await page.locator('#btnDiscardCapture').click();
    await expect(page.locator('#capturePreviewModal')).toBeHidden();

    await page
      .locator('#selMobileCaptureTimer')
      .selectOption('5', { force: true });
    await page.locator('#btnMobileTakePhoto').click();
    await expect(page.locator('#captureCountdown')).toBeVisible();
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-countdown-mobile.png',
      { animations: 'disabled', mask: dynamicMasks(page) },
    );
    await page.locator('#btnMobileTakePhoto').click();

    await page.locator('#btnMobileMirror').click();
    await expect(page.locator('#btnMobileMirror')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-mirror-mobile.png',
      { animations: 'disabled', mask: dynamicMasks(page) },
    );
  });
});

test.describe('mobile webcam layout coverage', () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true });

  test('running at 412x915', async ({ page }) => {
    await openRunningCamera(page);
    await expect(page.locator('body')).toHaveScreenshot(
      'webcam-running-412x915.png',
      { animations: 'disabled', mask: dynamicMasks(page) },
    );
  });
});
