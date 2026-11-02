import { expect, test } from '@playwright/test';

const CONFIG_KEY = 'hatewebcam_config';
const PROFILES_KEY = 'hatewebcam_profiles';

test.describe('adversarial browser state', () => {
  for (const [label, key, value] of [
    ['null config', CONFIG_KEY, 'null'],
    ['string config', CONFIG_KEY, '"unexpected"'],
    ['null profiles', PROFILES_KEY, 'null'],
  ]) {
    test(`recovers from ${label} in local storage`, async ({ page }) => {
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await page.addInitScript(
        ({ storageKey, storageValue }) => {
          localStorage.setItem(storageKey, storageValue);
        },
        { storageKey: key, storageValue: value },
      );

      await page.goto('/');

      await expect(page.locator('.boot-error')).toHaveCount(0);
      await expect(page.getByRole('tab', { name: /webcam/i })).toBeVisible();
      expect(pageErrors).toEqual([]);
    });
  }

  test('keeps working when browser storage rejects reads and writes', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException('blocked', 'SecurityError');
      };
      Storage.prototype.setItem = () => {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    });

    await page.goto('/');

    await expect(page.locator('.boot-error')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /webcam/i })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('shows a recoverable state without the MediaDevices API', async ({
    page,
  }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: undefined,
      });
    });

    await page.goto('/');

    await expect(page.locator('.boot-error')).toHaveCount(0);
    await expect(page.locator('#cameraStateTitle')).toHaveText(
      'Configuración no soportada',
    );
    await expect(page.locator('#btnCameraStateAction')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('does not contact hosts outside the local preview server', async ({
    page,
  }) => {
    const externalRequests = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
        externalRequests.push(request.url());
      }
    });

    await page.goto('/');
    await page.getByRole('tab', { name: /video/i }).click();

    expect(externalRequests).toEqual([]);
  });

  test('shows the boot error when a template is incomplete', async ({
    page,
  }) => {
    await page.route('**/templates/webcam-controls.html', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '' }),
    );

    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'No se pudo iniciar HateWebcam',
    );
  });

  test('releases color detector workers after repeated toggles', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      globalThis.__activeDetectorWorkers = 0;
      globalThis.Worker = class {
        constructor() {
          globalThis.__activeDetectorWorkers += 1;
        }
        postMessage() {}
        terminate() {
          globalThis.__activeDetectorWorkers -= 1;
        }
      };
    });
    await page.goto('/');

    const detector = page.locator('#chkBlobTracking');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await detector.check();
      await detector.uncheck();
    }

    await expect
      .poll(() => page.evaluate(() => globalThis.__activeDetectorWorkers))
      .toBe(0);
  });

  test('persists profile names that overlap object prototype keys', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#btnToggleAdvancedOptions').click();
    page.once('dialog', (dialog) => dialog.accept('__proto__'));

    await page.locator('#btnSaveProfile').click();

    await expect(
      page.locator('#profileSelect option[value="__proto__"]'),
    ).toHaveCount(1);
    const persistedOwnKey = await page.evaluate(() =>
      Object.hasOwn(
        JSON.parse(localStorage.getItem('hatewebcam_profiles')),
        '__proto__',
      ),
    );
    expect(persistedOwnKey).toBe(true);
  });

  test('renders hostile profile names as text without executing markup', async ({
    page,
  }) => {
    const hostileName = '<img src=x onerror="globalThis.__profileXss=1">';
    await page.goto('/');
    await page.locator('#btnToggleAdvancedOptions').click();
    page.once('dialog', (dialog) => dialog.accept(hostileName));

    await page.locator('#btnSaveProfile').click();

    await expect(page.locator('#profileSelect option').last()).toHaveText(
      hostileName,
    );
    expect(await page.evaluate(() => globalThis.__profileXss || 0)).toBe(0);
  });
});
