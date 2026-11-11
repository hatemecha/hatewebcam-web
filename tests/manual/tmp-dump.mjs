import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});
const context = await browser.newContext({
  locale: 'es-AR',
  viewport: { width: 320, height: 1000 },
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:4175/');
await page.getByRole('tab', { name: /video/i }).click();
await page
  .locator('#videoFileInput')
  .setInputFiles(
    'C:/Users/hatemecha/Desktop/Proyectos/hatewebcam/hatewebcam-web/tests/fixtures/subject-init.webm',
  );
await page.waitForTimeout(2500);
console.log(
  await page.evaluate(() => {
    const el = document.querySelector(
      '.timeline-palette-chip[data-effect-type="visual-fx"]',
    );
    const chain = [];
    let cur = el;
    while (cur && chain.length < 8) {
      const rect = cur.getBoundingClientRect();
      chain.push({
        tag: cur.tagName,
        id: cur.id,
        cls: typeof cur.className === 'string' ? cur.className : '',
        display: getComputedStyle(cur).display,
        visibility: getComputedStyle(cur).visibility,
        rect: { w: rect.width, h: rect.height, x: rect.x, y: rect.y },
        overflow: getComputedStyle(cur).overflow,
      });
      cur = cur.parentElement;
    }
    return { body: document.body.className, chain };
  }),
);
await browser.close();
