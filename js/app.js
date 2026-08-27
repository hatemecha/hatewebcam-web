/**
 * HateWebcam Web — application entry point.
 */
import { loadAppTemplates } from './app/template-loader.mjs';
import { AppController } from './app/controller.mjs';
import { initializeI18n, translate } from './i18n.mjs';

const i18n = initializeI18n();

try {
  await loadAppTemplates();
  i18n.translateDocument();
  await new AppController().start();
} catch (err) {
  console.error(err);
  document.body.innerHTML = `
    <main class="boot-error" style="max-width: 42rem; margin: 12vh auto; padding: 2rem; font-family: system-ui, sans-serif; line-height: 1.5;">
      <h1>${translate('No se pudo iniciar HateWebcam')}</h1>
      <p>${translate('Revisá que estés sirviendo el proyecto desde localhost/https y que existan los templates.')}</p>
    </main>
  `;
  i18n.translateDocument();
}
