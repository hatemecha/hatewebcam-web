/**
 * HateWebcam Web — application entry point.
 */
import { loadAppTemplates } from './app/template-loader.mjs';
import { AppController } from './app/controller.mjs';
import { getLocale, initializeI18n, setLocale, translate } from './i18n.mjs';
import { mountAppHeader } from '../src/lib/shell/mount.ts';
import { updateShellState } from '../src/lib/shell/shell-bridge.mjs';

const i18n = initializeI18n();
const controller = new AppController();
let controllerReady = false;

try {
  await loadAppTemplates();
  mountAppHeader(
    document.querySelector('#appHeaderMount'),
    {
      setSourceMode: (mode) => {
        if (controllerReady) controller.setSourceMode(mode);
      },
      startVideoExport: () => {
        if (controllerReady) void controller.startVideoExport();
      },
      setLocale: (locale) => {
        setLocale(locale);
        updateShellState({ locale });
      },
    },
    { mode: 'camera', exportEnabled: false, locale: getLocale() },
  );
  i18n.translateDocument();
  await controller.start();
  controllerReady = true;
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
