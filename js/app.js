/**
 * HateWebcam Web — application entry point.
 */
import { loadAppTemplates } from './app/template-loader.mjs';
import { AppController } from './app/controller.mjs';

try {
  await loadAppTemplates();
  new AppController().start();
} catch (err) {
  console.error(err);
  document.body.innerHTML = `
    <main class="boot-error" style="max-width: 42rem; margin: 12vh auto; padding: 2rem; font-family: system-ui, sans-serif; line-height: 1.5;">
      <h1>No se pudo iniciar HateWebcam</h1>
      <p>Revisá que estés sirviendo el proyecto desde localhost/https y que existan los templates.</p>
    </main>
  `;
}
