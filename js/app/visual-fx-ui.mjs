import {
  VISUAL_SYSTEMS,
  VISUAL_SYSTEM_IDS,
  TUNING_SCHEMA,
  PALETTE_OPTIONS,
  MACRO_LABELS,
  normalizeVisualConfig,
} from '../visual-fx/config.mjs';
import { isVisualFxClipType } from '../editor/timeline-clip-types.mjs';

// Compact instrument panel: a system picker, "Aplicar a", four curated
// macros, and a Tuning drawer that only ever shows the handful of extra
// parameters that make sense for the active system. No preset gallery, no
// per-uniform slider wall.
export function applyVisualFxUIMixin(proto) {
  proto.getVisualFxVariationNumber = (seed) =>
    (Math.abs(Math.round(seed)) % 999) + 1;
  proto.isPlayheadInsideSelectedVisualFxClip = function (item) {
    const time = this.videoEl?.currentTime || 0;
    return (
      isVisualFxClipType(item?.type) &&
      time >= item.startTime &&
      time < item.endTime
    );
  };

  proto.renderVisualFxInspector = function () {
    const host = this.visualFxInspectorHost,
      item = this.getSelectedVideoEffectItem?.();
    if (!host) return;
    host.classList.toggle('hidden', !isVisualFxClipType(item?.type));
    if (!isVisualFxClipType(item?.type)) return;
    const c = normalizeVisualConfig(item.config),
      system = VISUAL_SYSTEMS[c.system],
      tuningSchema = TUNING_SCHEMA[c.system];
    const focused = host.contains(document.activeElement)
      ? document.activeElement?.id
      : null;
    const tuningOpen = host.querySelector('details')?.open || false;

    const macroSlider = (key) =>
      this.slider(
        `visual-macro-${key}`,
        `visual-value-macro-${key}`,
        MACRO_LABELS[key],
        Math.round(c.macros[key] * 100),
        0,
        100,
      );
    const tuningControl = (field) => {
      if (field.key === 'palette') return '';
      return this.slider(
        `visual-tuning-${field.key}`,
        `visual-value-tuning-${field.key}`,
        field.label,
        Math.round(
          ((c.tuning[field.key] - field.min) / (field.max - field.min)) * 100,
        ),
        0,
        100,
      );
    };
    const paletteField = tuningSchema.find((field) => field.key === 'palette');

    host.innerHTML = `<div class="vfx-inspector">
      <header class="vfx-inspector-head"><div class="vfx-inspector-title">Visual FX</div></header>
      ${!this.isPlayheadInsideSelectedVisualFxClip(item) ? '<div class="vfx-playhead-note"><span>Fuera del clip.</span><button class="btn btn-compact" id="visual-go">Ir al clip</button></div>' : ''}
      <div class="vfx-field-label">Sistema</div>
      <div class="vfx-preset-grid" role="group" aria-label="Sistema">${VISUAL_SYSTEM_IDS.map(
        (id) =>
          `<button type="button" class="vfx-preset-btn${c.system === id ? ' is-active' : ''}" data-visual-system="${id}" aria-pressed="${c.system === id}">${VISUAL_SYSTEMS[id].label}</button>`,
      ).join('')}</div>
      <p class="vfx-preset-hint">${system.hint}</p>
      <div class="vfx-field-label">Aplicar a</div>
      <div class="vfx-segmented" role="group" aria-label="Aplicar a">${[
        ['all', 'Todo'],
        ['person', 'Persona'],
        ['background', 'Fondo'],
      ]
        .map(
          ([id, label]) =>
            `<button type="button" id="visual-target-${id}" class="vfx-segment${c.target === id ? ' is-active' : ''}" data-visual-target="${id}" aria-pressed="${c.target === id}">${label}</button>`,
        )
        .join('')}</div>
      <p id="visualFxInlineStatus" class="vfx-preset-hint" role="status"></p>
      <div class="vfx-controls">${['intensity', 'memory', 'structure', 'movement'].map(macroSlider).join('')}</div>
      <details class="vfx-advanced-panel" ${tuningOpen ? 'open' : ''}><summary class="vfx-advanced-toggle">Tuning &#9656;</summary>
        <div class="vfx-tuning-body">
          ${tuningSchema.map(tuningControl).join('')}
          ${
            paletteField
              ? `<div class="vfx-field-label">${paletteField.label}</div>
                 <div class="select-wrapper vfx-tuning-select"><select id="visual-tuning-palette">${PALETTE_OPTIONS.map(
                   (opt) =>
                     `<option value="${opt.id}" ${c.tuning.palette === opt.id ? 'selected' : ''}>${opt.label}</option>`,
                 ).join('')}</select></div>`
              : ''
          }
          <div class="vfx-variation-controls">
            <span>Variación ${this.getVisualFxVariationNumber(c.seed)}</span>
            <button class="btn btn-compact" id="visual-variation">Cambiar</button>
            <button class="btn btn-compact" id="visual-restart" title="Limpiar el estado de la simulación">Reiniciar</button>
          </div>
        </div>
      </details>
      <footer class="vfx-footer-row"><label class="vfx-power-toggle"><input type="checkbox" id="chkVisualFxBypass" ${!this.visualFxBypass ? 'checked' : ''}><span>FX activo</span></label></footer>
    </div>`;
    // Error strings are text, never interpolated into markup.
    host.querySelector('#visualFxInlineStatus').textContent =
      this.visualFxEffect?.getStatusLabel() || '';

    host
      .querySelectorAll('[data-visual-system]')
      .forEach((button) =>
        button.addEventListener('click', () =>
          this.applyVisualSystemToSelection(button.dataset.visualSystem),
        ),
      );
    host.querySelectorAll('[data-visual-target]').forEach((button) =>
      button.addEventListener('click', () => {
        this.commitVisualFxConfig({ target: button.dataset.visualTarget });
        this.renderVisualFxInspector();
      }),
    );
    host.querySelectorAll('[id^="visual-macro-"]').forEach((input) =>
      input.addEventListener('input', () => {
        const key = input.id.slice('visual-macro-'.length),
          value = Number(input.value) / 100;
        host.querySelector(`#visual-value-macro-${key}`).textContent =
          input.value;
        this.commitVisualFxConfig({ macros: { [key]: value } });
      }),
    );
    host.querySelectorAll('[id^="visual-tuning-"]').forEach((input) => {
      if (input.tagName === 'SELECT') return;
      const key = input.id.slice('visual-tuning-'.length);
      const field = tuningSchema.find((candidate) => candidate.key === key);
      if (!field) return;
      input.addEventListener('input', () => {
        const pct = Number(input.value) / 100;
        const value = field.min + pct * (field.max - field.min);
        host.querySelector(`#visual-value-tuning-${key}`).textContent =
          input.value;
        this.commitVisualFxConfig({ tuning: { [key]: value } });
      });
    });
    host
      .querySelector('#visual-tuning-palette')
      ?.addEventListener('change', (e) => {
        this.commitVisualFxConfig({
          tuning: { palette: Number(e.target.value) },
        });
      });
    this.btnVisualFxBypass = host.querySelector('#chkVisualFxBypass');
    this.btnVisualFxBypass.addEventListener('change', () =>
      this.toggleVisualFxBypass(),
    );
    host
      .querySelector('#visual-variation')
      .addEventListener('click', () => this.stepVisualFxVariation(1));
    host
      .querySelector('#visual-restart')
      .addEventListener('click', () => this.restartVisualFxSimulation?.());
    host
      .querySelector('#visual-go')
      ?.addEventListener('click', () => void this.seekVideo(item.startTime));
    if (focused)
      host.querySelector(`#${focused}`)?.focus({ preventScroll: true });
  };
}
