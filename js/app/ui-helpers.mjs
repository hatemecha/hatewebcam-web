/** @param {import('./controller.mjs').AppController} proto */
export function applyUIHelpersMixin(proto) {
  proto.createSection = function (title, html) {
    const div = document.createElement('div');
    div.className = 'panel-section fade-in';
    div.innerHTML = `<div class="section-title accent">${this.escapeHtml(title)}</div><div class="effect-config">${html}</div>`;
    return div;
  }

  proto.slider = function (id, valId, label, value, min, max, step = 1) {
    const safeValue = this.toFiniteNumber(value, min);
    const safeMin = this.toFiniteNumber(min, 0);
    const safeMax = this.toFiniteNumber(max, safeMin);
    const safeStep = this.toFiniteNumber(step, 1);
    const displayVal = Number.isInteger(safeValue) ? safeValue : safeValue.toFixed(2);
    return `
      <div class="slider-group">
        <div class="slider-label">
          <span>${this.escapeHtml(label)}</span>
          <span class="value" id="${this.escapeHtml(valId)}">${this.escapeHtml(displayVal)}</span>
        </div>
        <input type="range" id="${this.escapeHtml(id)}" min="${safeMin}" max="${safeMax}" step="${safeStep}" value="${safeValue}">
      </div>`;
  }

  proto.bindSlider = function (parent, sliderId, valueId, callback) {
    const sld = parent.querySelector(`#${sliderId}`);
    const val = parent.querySelector(`#${valueId}`);
    if (!sld || !val) return;
    sld.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      val.textContent = Number.isInteger(v) ? v : v.toFixed(2);
      callback(v);
      this.scheduleSaveActiveEffectSettings();
    });
  }

}
