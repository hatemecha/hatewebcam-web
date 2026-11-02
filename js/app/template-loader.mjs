const APP_TEMPLATES = [
  ['#videoEditorTemplateSlot', 'templates/video-editor.html'],
  ['#webcamControlsTemplateSlot', 'templates/webcam-controls.html'],
  ['#exportModalTemplateSlot', 'templates/export-modal.html'],
  ['#captureModalTemplateSlot', 'templates/capture-modal.html'],
];

export async function loadAppTemplates() {
  await Promise.all(
    APP_TEMPLATES.map(async ([selector, path]) => {
      const slot = document.querySelector(selector);
      if (!slot) return;

      const response = await fetch(path, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`No se pudo cargar ${path}`);
      }

      slot.outerHTML = await response.text();
    }),
  );
}
