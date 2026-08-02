import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});
const outputSet = process.argv[2] || 'after';

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
  [390, 844],
  [412, 915],
]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto('http://127.0.0.1:4173');
  await page.waitForLoadState('networkidle');
  await page.locator('#previewPlaceholder').waitFor({ state: 'hidden' });
  await page.locator('#previewCanvas').evaluate((canvas) => {
    canvas.style.visibility = 'hidden';
    canvas.parentElement.style.background = '#101010';
  });
  await page.locator('#fpsInfo').evaluate((element) => {
    element.textContent = '30 FPS';
  });
  await page.screenshot({
    path: `screenshots/${outputSet}/webcam-${width}x${height}.png`,
    animations: 'disabled',
  });
  await page.close();
}

await browser.close();
