// Dev-only visual QA harness (not part of `npm test`). Renders each system
// against a synthetic moving frame at several points in time and writes a
// contact sheet PNG so the actual pixels can be inspected, per the task's
// "ENGINE + VISUAL QUALITY FIRST" requirement.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT_DIR = new URL('../../test-results/', import.meta.url);
mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.VFX_BASE_URL || 'http://localhost:5183';
const SYSTEMS = ['recursive', 'flow', 'pixelfield', 'trace'];
const FRAME_SAMPLES = [1, 20, 60, 120, 220];
const CELL = 220;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto(BASE + '/');

const result = await page.evaluate(
  async ({ systems, frameSamples }) => {
    const { VisualFxEffect } = await import('/js/visual-fx/effect.mjs');
    const { normalizeVisualConfig } = await import('/js/visual-fx/config.mjs');

    const source = document.createElement('canvas');
    source.width = 320;
    source.height = 180;
    const sctx = source.getContext('2d');

    // A synthetic "webcam-like" frame: soft gradient backdrop, mild sensor
    // grain, and a moving silhouette with soft shading - representative of
    // real camera footage rather than a hard graphic test pattern.
    function drawFrame(t) {
      const w = source.width,
        h = source.height;
      const g = sctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#3a3f45');
      g.addColorStop(0.5, '#1c2024');
      g.addColorStop(1, '#0a0b0d');
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, w, h);
      const cx = w / 2 + Math.sin(t * 0.6) * 60;
      const cy = h / 2 + Math.cos(t * 0.4) * 20;
      const grad = sctx.createRadialGradient(cx, cy - 10, 4, cx, cy - 10, 70);
      grad.addColorStop(0, '#efece4');
      grad.addColorStop(0.6, '#cfc9ba');
      grad.addColorStop(1, '#221f1a');
      sctx.fillStyle = grad;
      sctx.beginPath();
      sctx.ellipse(cx, cy - 30, 26, 40, 0, 0, Math.PI * 2);
      sctx.fill();
      sctx.fillRect(cx - 34, cy + 4, 68, 60);
      // Mild per-frame sensor grain, closer to real camera noise than a
      // clean synthetic gradient would be.
      const noise = sctx.getImageData(0, 0, w, h);
      for (let i = 0; i < noise.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 10;
        noise.data[i] += n;
        noise.data[i + 1] += n;
        noise.data[i + 2] += n;
      }
      sctx.putImageData(noise, 0, 0);
    }

    const outputs = {};
    for (const system of systems) {
      const effect = new VisualFxEffect();
      effect.setActive(true, `sheet-${system}`);
      effect.setConfig(normalizeVisualConfig({ system }));
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const shots = [];
      let nextSampleIdx = 0;
      for (
        let frame = 0;
        frame <= frameSamples[frameSamples.length - 1];
        frame++
      ) {
        const t = frame / 30;
        drawFrame(t);
        ctx.drawImage(source, 0, 0);
        effect.processFullFrame(
          ctx,
          canvas,
          { currentTime: t },
          {},
          { mediaTime: t },
        );
        if (frame === frameSamples[nextSampleIdx]) {
          shots.push(canvas.toDataURL('image/png'));
          nextSampleIdx++;
        }
      }
      outputs[system] = shots;
      effect.dispose();
    }
    return outputs;
  },
  { systems: SYSTEMS, frameSamples: FRAME_SAMPLES },
);

// Stitch into one contact sheet: rows = systems, columns = time samples.
await page.evaluate(
  async ({ result, systems, frameSamples, cell }) => {
    const canvas = document.createElement('canvas');
    canvas.width = cell * (frameSamples.length + 1);
    canvas.height = cell * systems.length + 24 * systems.length;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101112';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#f0f0ec';
    for (let row = 0; row < systems.length; row++) {
      const y = row * (cell + 24);
      ctx.fillText(systems[row], 8, y + 16);
      for (let col = 0; col < frameSamples.length; col++) {
        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = result[systems[row]][col];
        });
        const x = (col + 1) * cell;
        ctx.drawImage(img, x, y + 20, cell, (cell * img.height) / img.width);
        ctx.fillText(`frame ${frameSamples[col]}`, x + 4, y + 16);
      }
    }
    window.__contactSheet = canvas.toDataURL('image/png');
  },
  { result, systems: SYSTEMS, frameSamples: FRAME_SAMPLES, cell: CELL },
);

const dataUrl = await page.evaluate(() => window.__contactSheet);
const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
const outPath = new URL('visual-fx-contact-sheet.png', OUT_DIR);
await import('node:fs/promises').then((fs) => fs.writeFile(outPath, buffer));
console.log('Wrote', outPath.pathname);

await browser.close();
