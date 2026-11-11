import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});
const context = await browser.newContext({
  locale: 'en-US',
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:4174/');
await page.waitForTimeout(1500);
const offenders = await page.evaluate(() => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue?.trim();
    if (text && /[áéíóúñ¿¡]/i.test(text)) {
      out.push({
        text,
        parent: node.parentElement?.tagName,
        id: node.parentElement?.id,
        cls: node.parentElement?.className,
      });
    }
    node = walker.nextNode();
  }
  return out;
});
console.log(JSON.stringify(offenders, null, 2));
const words = await page.evaluate(() =>
  document.body.textContent.match(
    /\b(Ajustes|Cámara|Caras|Pestañeos|Temporizador|Guardar|Eliminar|Restablecer|Exportación|Importar|Seleccionar|Recuadro|Desenfoque)\b/gi,
  ),
);
console.log('words', words);
await browser.close();
