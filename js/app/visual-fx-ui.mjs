import {
  VISUAL_PRESETS,
  VISUAL_MODULES,
  normalizeVisualConfig,
} from '../visual-fx/config.mjs';

// Existing timeline/controller hook names remain stable; all creative state is Visual FX v3.
export function applySubjectFxUIMixin(proto) {
  proto.getSubjectVariationNumber = (seed) =>
    (Math.abs(Math.round(seed)) % 999) + 1;
  proto.isPlayheadInsideSelectedSubjectClip = function (item) {
    const time = this.videoEl?.currentTime || 0;
    return (
      item?.type === 'subject' && time >= item.startTime && time < item.endTime
    );
  };
  proto.renderSubjectFxInspector = function () {
    const host = this.subjectFxInspectorHost,
      item = this.getSelectedVideoEffectItem?.();
    if (!host) return;
    host.classList.toggle('hidden', item?.type !== 'subject');
    if (item?.type !== 'subject') return;
    const c = normalizeVisualConfig(item.config),
      recipe = VISUAL_PRESETS[c.preset];
    const focused = host.contains(document.activeElement)
      ? document.activeElement?.id
      : null;
    const advanced = host.querySelector('details')?.open || false;
    const openGroups = new Set(
      [...host.querySelectorAll('[data-visual-group][open]')].map(
        (el) => el.dataset.visualGroup,
      ),
    );
    const groups = {
      Tiempo: ['feedback', 'recursion'],
      Espacio: ['flow', 'sorting', 'pixel', 'tiles', 'fragments'],
      Textura: ['posterize', 'dither', 'threshold', 'edges'],
      Color: ['rgb', 'scan', 'monochrome'],
    };
    const slider = (key, label, value) =>
      this.slider(
        `visual-${key}`,
        `visual-value-${key}`,
        label,
        Math.round(value * 100),
        0,
        100,
      );
    host.innerHTML = `<div class="subject-inspector">
      <header class="subject-inspector-head"><div class="subject-inspector-title">Visual FX</div></header>
      ${!this.isPlayheadInsideSelectedSubjectClip(item) ? '<div class="subject-playhead-note"><span>Fuera del clip.</span><button class="btn btn-compact" id="visual-go">Ir al clip</button></div>' : ''}
      <div class="subject-preset-grid" role="group" aria-label="Estilo visual">${Object.entries(
        VISUAL_PRESETS,
      )
        .map(
          ([id, p]) =>
            `<button type="button" class="subject-preset-btn${c.preset === id ? ' is-active' : ''}" data-subject-preset="${id}" aria-pressed="${c.preset === id}">${p.label}</button>`,
        )
        .join('')}</div>
      <p class="subject-preset-hint">${recipe.hint}</p>
      <div class="subject-field-label">Aplicar a</div><div class="subject-segmented" role="group" aria-label="Aplicar a">${[
        ['all', 'Todo'],
        ['person', 'Persona'],
        ['background', 'Fondo'],
      ]
        .map(
          ([id, label]) =>
            `<button type="button" id="visual-target-${id}" class="subject-segment${c.target === id ? ' is-active' : ''}" data-visual-target="${id}" aria-pressed="${c.target === id}">${label}</button>`,
        )
        .join('')}</div>
      <p id="subjectFxInlineStatus" class="subject-preset-hint" role="status"></p>
      <div class="subject-controls">${slider('amount', 'Intensidad', c.amount)}${slider('movement', 'Movimiento', c.movement)}${c.modules.feedback > 0 ? slider('persistence', 'Persistencia', c.persistence) : ''}</div>
      <details class="subject-advanced-panel" ${advanced ? 'open' : ''}><summary class="subject-advanced-toggle">Más ajustes</summary>
        ${Object.entries(groups)
          .map(
            ([name, keys]) =>
              `<details class="visual-module-group" data-visual-group="${name}" ${openGroups.has(name) ? 'open' : ''}><summary>${name}</summary>${keys.map((key) => slider(key, VISUAL_MODULES[key], c.modules[key])).join('')}</details>`,
          )
          .join('')}
        <div class="subject-variation-controls"><span>Variación ${this.getSubjectVariationNumber(c.seed)}</span><button class="btn btn-compact" id="visual-variation">Cambiar</button></div>
        <p class="subject-advanced-note">Combiná técnicas. Al buscar otro momento, el eco empieza de nuevo.</p>
      </details>
      <footer class="subject-footer-row"><label class="subject-power-toggle"><input type="checkbox" id="chkSubjectBypass" ${!this.subjectFxBypass ? 'checked' : ''}><span>FX activo</span></label></footer>
    </div>`;
    // Error strings are text, never interpolated into markup.
    host.querySelector('#subjectFxInlineStatus').textContent =
      this.subjectFxEffect?.getStatusLabel() || '';
    host
      .querySelectorAll('[data-subject-preset]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          this.applySubjectPresetToSelection(button.dataset.subjectPreset),
        ),
      );
    host.querySelectorAll('[data-visual-target]').forEach((button) =>
      button.addEventListener('click', () => {
        this.commitSubjectFxConfig({ target: button.dataset.visualTarget });
        this.renderSubjectFxInspector();
      }),
    );
    host.querySelectorAll('input[type="range"]').forEach((input) =>
      input.addEventListener('input', () => {
        const key = input.id.slice(7),
          value = Number(input.value) / 100;
        host.querySelector(`#visual-value-${key}`).textContent = input.value;
        if (key === 'feedback')
          host.querySelector('#visual-recursion').disabled = value === 0;
        this.commitSubjectFxConfig(
          Object.hasOwn(VISUAL_MODULES, key)
            ? { modules: { [key]: value } }
            : { [key]: value },
        );
      }),
    );
    host.querySelector('#visual-recursion').disabled = c.modules.feedback === 0;
    this.btnSubjectBypass = host.querySelector('#chkSubjectBypass');
    this.btnSubjectBypass.addEventListener('change', () =>
      this.toggleSubjectFxBypass(),
    );
    host
      .querySelector('#visual-variation')
      .addEventListener('click', () => this.stepSubjectVariation(1));
    host
      .querySelector('#visual-go')
      ?.addEventListener('click', () => void this.seekVideo(item.startTime));
    if (focused)
      host.querySelector(`#${focused}`)?.focus({ preventScroll: true });
  };
}
