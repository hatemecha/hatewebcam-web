import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Test the exact source modules in a real browser alongside the built application.
async function loadEngine(page) {
  await page.route('**/__visual-test/js/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      '/__visual-test/',
      '',
    );
    if (path.includes('..')) return route.abort();
    await route.fulfill({
      contentType: 'text/javascript',
      body: await readFile(new URL('../../' + path, import.meta.url), 'utf8'),
    });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const { VisualFxEffect } =
      await import('/__visual-test/js/visual-fx/effect.mjs');
    const { normalizeVisualConfig, VISUAL_PRESETS } =
      await import('/__visual-test/js/visual-fx/config.mjs');
    window.visualTest = {
      VisualFxEffect,
      normalizeVisualConfig,
      VISUAL_PRESETS,
    };
  });
}

test('GPU feedback owns prior output, deduplicates pause, resets seeks and matches export', async ({
  page,
}) => {
  await loadEngine(page);
  const result = await page.evaluate(() => {
    const { VisualFxEffect, normalizeVisualConfig } = window.visualTest;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const e = new VisualFxEffect();
    e.setActive(true, 'a');
    e.setConfig({
      ...normalizeVisualConfig(),
      amount: 1,
      modules: { feedback: 0.9 },
    });
    const draw = (color, t, mode = 'preview') => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 64, 64);
      e.processFullFrame(ctx, canvas, { currentTime: t }, {}, { mode });
      return Array.from(ctx.getImageData(32, 32, 1, 1).data);
    };
    draw('red', 0);
    const history = draw('blue', 1 / 30);
    const pause = draw('green', 1 / 30);
    e.onSeek();
    const seek = draw('blue', 1 / 30);
    draw('red', 2 / 30);
    const backwards = draw('blue', 0);
    e.onSeek();
    draw('red', 0, 'export');
    const exported = draw('blue', 1 / 30, 'export');
    const modeChange = draw('blue', 2 / 30, 'preview');
    e.setActive(true, 'b');
    const clipChange = draw('blue', 3 / 30);
    const error = e.renderer.gl.getError(),
      failed = e.renderer.failed;
    e.dispose();
    return {
      history,
      pause,
      seek,
      backwards,
      exported,
      modeChange,
      clipChange,
      error,
      failed,
    };
  });
  expect(result.failed).toBe(false);
  expect(result.error).toBe(0);
  expect(result.history[0]).toBeGreaterThan(100);
  expect(result.history[2]).toBeGreaterThan(10);
  expect(result.pause).toEqual(result.history);
  expect(result.exported).toEqual(result.history);
  for (const key of ['seek', 'backwards', 'modeChange', 'clipChange'])
    expect(result[key]).toEqual([0, 0, 255, 255]);
});

test('all recipes visibly change a non-person image and compile without GPU errors', async ({
  page,
}) => {
  await loadEngine(page);
  const result = await page.evaluate(() => {
    const { VisualFxEffect, VISUAL_PRESETS } = window.visualTest;
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const effect = new VisualFxEffect();
    effect.setActive(true, 'test');
    const draw = (i) => {
      const g = ctx.createLinearGradient(0, 0, 160, 90);
      g.addColorStop(0, '#ef853a');
      g.addColorStop(0.5, '#315fc2');
      g.addColorStop(1, '#46aa72');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 160, 90);
      ctx.fillStyle = 'white';
      ctx.fillRect(10 + i, 15, 30, 55);
    };
    const results = [];
    for (const preset of Object.keys(VISUAL_PRESETS)) {
      effect.setConfig({ preset });
      let original;
      for (let i = 0; i < 20; i++) {
        draw(i);
        original = ctx.getImageData(0, 0, 160, 90).data;
        effect.processFullFrame(ctx, canvas, { currentTime: i / 30 }, {});
      }
      const output = ctx.getImageData(0, 0, 160, 90).data;
      let diff = 0;
      for (let i = 0; i < output.length; i++)
        diff += Math.abs(output[i] - original[i]);
      results.push({
        preset,
        diff: diff / output.length,
        error: effect.renderer.gl.getError(),
      });
    }
    effect.dispose();
    return results;
  });
  for (const r of result) {
    expect(r.error, r.preset).toBe(0);
    expect(r.diff, r.preset).toBeGreaterThan(2);
  }
});

test('person and background compose complementary masks and missing analysis preserves source', async ({
  page,
}) => {
  await loadEngine(page);
  const result = await page.evaluate(() => {
    const { VisualFxEffect } = window.visualTest;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const image = document.createElement('canvas');
    image.width = 64;
    image.height = 64;
    const ic = image.getContext('2d');
    ic.fillStyle = 'red';
    ic.fillRect(0, 0, 64, 64);
    const analyzer = {
      lastMask: { width: 2, height: 2, data: new Uint8Array([255, 0, 255, 0]) },
      analyze() {},
      reset() {},
    };
    const effect = new VisualFxEffect({
      analysisAdapter: analyzer,
      renderer: { render: () => image, reset() {} },
    });
    effect.setActive(true, 'a');
    const render = (target) => {
      effect.setConfig({ target });
      effect.maskTime = 0;
      ctx.fillStyle = 'blue';
      ctx.fillRect(0, 0, 64, 64);
      effect.processFullFrame(ctx, canvas, { currentTime: 0 }, {});
      return [
        Array.from(ctx.getImageData(4, 32, 1, 1).data),
        Array.from(ctx.getImageData(60, 32, 1, 1).data),
      ];
    };
    const person = render('person'),
      background = render('background');
    analyzer.lastMask = null;
    const missing = render('person');
    return { person, background, missing };
  });
  expect(result.person).toEqual([
    [255, 0, 0, 255],
    [0, 0, 255, 255],
  ]);
  expect(result.background).toEqual([
    [0, 0, 255, 255],
    [255, 0, 0, 255],
  ]);
  expect(result.missing).toEqual([
    [0, 0, 255, 255],
    [0, 0, 255, 255],
  ]);
});

for (const width of [320, 768, 1024, 1440])
  test(`Visual FX inspector works at ${width}px without person assets`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const assets = [],
      errors = [];
    page.on('request', (r) => {
      if (/pose_landmarker|selfie_segmenter|vision_wasm/.test(r.url()))
        assets.push(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.getByRole('tab', { name: /video/i }).click();
    await page
      .locator('#videoFileInput')
      .setInputFiles(
        fileURLToPath(
          new URL('../fixtures/subject-init.webm', import.meta.url),
        ),
      );
    await page
      .locator('.timeline-palette-chip[data-effect-type="subject"]')
      .click();
    await expect(page.locator('[data-subject-preset]')).toHaveCount(9);
    await page.locator('[data-subject-preset="signal"]').click();
    await expect(page.locator('.timeline-item-label')).toContainText(
      'Signal Loss',
    );
    await page.locator('#visual-amount').fill('65');
    await page.locator('summary').filter({ hasText: 'Más ajustes' }).click();
    await page.locator('[data-visual-group="Color"] summary').click();
    await expect(page.locator('#visual-rgb')).toBeVisible();
    await page.locator('#visual-rgb').fill('90');
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(assets).toEqual([]);
    expect(errors).toEqual([]);
    await page.locator('summary').filter({ hasText: 'Más ajustes' }).click();
    await page.locator('.subject-inspector-title').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/visual-fx-ui-${width}.png`,
      fullPage: true,
    });
  });

test('compatible mode renders recipes without WebGL and preserves temporal reset', async ({
  page,
}) => {
  await loadEngine(page);
  const result = await page.evaluate(() => {
    const { VisualFxEffect } = window.visualTest;
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl' ? null : native.call(this, type, ...args);
    };
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const e = new VisualFxEffect();
      e.setActive(true, 'a');
      e.setConfig({ preset: 'noise' });
      ctx.fillStyle = '#958730';
      ctx.fillRect(0, 0, 64, 64);
      e.processFullFrame(ctx, canvas, { currentTime: 0 }, {});
      const noise = Array.from(ctx.getImageData(20, 20, 1, 1).data),
        failed = e.renderer.failed;
      e.setConfig({ preset: 'echo', amount: 1, modules: { feedback: 0.9 } });
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 64, 64);
      e.processFullFrame(ctx, canvas, { currentTime: 0 }, {});
      ctx.fillStyle = 'blue';
      ctx.fillRect(0, 0, 64, 64);
      e.processFullFrame(ctx, canvas, { currentTime: 1 / 30 }, {});
      const echo = ctx.getImageData(32, 32, 1, 1).data[0];
      e.onSeek();
      ctx.fillStyle = 'blue';
      ctx.fillRect(0, 0, 64, 64);
      e.processFullFrame(ctx, canvas, { currentTime: 1 / 30 }, {});
      const reset = ctx.getImageData(32, 32, 1, 1).data[0];
      e.dispose();
      return { noise, failed, echo, reset };
    } finally {
      HTMLCanvasElement.prototype.getContext = native;
    }
  });
  expect(result.failed).toBe(true);
  expect(result.noise[0]).toBe(result.noise[1]);
  expect(result.echo).toBeGreaterThan(100);
  expect(result.reset).toBe(0);
});

test('Visual FX completes a real WebM export', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('tab', { name: /video/i }).click();
  await page
    .locator('#videoFileInput')
    .setInputFiles(
      fileURLToPath(new URL('../fixtures/subject-init.webm', import.meta.url)),
    );
  await page
    .locator('.timeline-palette-chip[data-effect-type="subject"]')
    .click();
  await page.locator('[data-subject-preset="melt"]').click();
  // Use the existing export UI and encoder, not a substitute capture path.
  await page.locator('#tabInspectorProject').click();
  await page.locator('#editorExportPresetSelect').selectOption('fast');
  const downloadPromise = page.waitForEvent('download', { timeout: 75_000 });
  await page.locator('#btnExportVideo').click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.webm$/);
  await download.saveAs('test-results/visual-fx-export.webm');
  expect(errors).toEqual([]);
});

test('feedback decay follows media time at 30/60 FPS and resize discards old frames', async ({
  page,
}) => {
  await loadEngine(page);
  const result = await page.evaluate(() => {
    const { VisualFxEffect } = window.visualTest;
    const run = (fps) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const e = new VisualFxEffect();
      e.setActive(true, 'a');
      e.setConfig({ amount: 1, modules: { feedback: 0.95 } });
      const frame = (color, t) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        e.processFullFrame(ctx, canvas, { currentTime: t }, {});
      };
      frame('red', 0);
      for (let i = 1; i <= fps; i++) frame('blue', i / fps);
      const red = ctx.getImageData(32, 32, 1, 1).data[0];
      canvas.width = 96;
      frame('blue', 1 + 1 / fps);
      const resize = ctx.getImageData(32, 32, 1, 1).data[0];
      e.onSourceChanged();
      frame('blue', 0);
      const source = ctx.getImageData(32, 32, 1, 1).data[0];
      e.dispose();
      return { red, resize, source };
    };
    return { a: run(30), b: run(60) };
  });
  expect(Math.abs(result.a.red - result.b.red)).toBeLessThan(10);
  expect(result.a.resize).toBe(0);
  expect(result.b.resize).toBe(0);
  expect(result.a.source).toBe(0);
});
