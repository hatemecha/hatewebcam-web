const APP_TEMPLATES = [
  [
    '#videoEditorTemplateSlot',
    'templates/video-editor.html',
    'id="videoTimeline"',
  ],
];

export async function loadAppTemplates() {
  await Promise.all(
    APP_TEMPLATES.map(async ([selector, path, requiredFragment]) => {
      const slot = document.querySelector(selector);
      if (!slot) return;

      const response = await fetch(path, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`No se pudo cargar ${path}`);
      }
      const html = await response.text();
      if (requiredFragment && !html.includes(requiredFragment)) {
        throw new Error(`Plantilla incompleta: ${path}`);
      }

      slot.outerHTML = html;
    }),
  );
}
