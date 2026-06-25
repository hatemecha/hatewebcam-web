const APP_TEMPLATES = [
  ['#videoEditorTemplateSlot', 'templates/video-editor.html'],
  ['#webcamControlsTemplateSlot', 'templates/webcam-controls.html'],
  ['#exportModalTemplateSlot', 'templates/export-modal.html'],
  ['#captureModalTemplateSlot', 'templates/capture-modal.html'],
];

export async function loadAppTemplates() {
  for (const [selector, path] of APP_TEMPLATES) {
    const slot = document.querySelector(selector);
    if (!slot) continue;

    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${path}`);
    }

    slot.outerHTML = await response.text();
  }
}
