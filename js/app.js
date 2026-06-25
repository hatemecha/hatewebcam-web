/**
 * HateWebcam Web — application entry point.
 */
import { loadAppTemplates } from './app/template-loader.mjs';
import { AppController } from './app/controller.mjs';

await loadAppTemplates();
new AppController().start();
