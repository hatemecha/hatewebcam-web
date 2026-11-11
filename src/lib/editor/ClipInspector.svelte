<script lang="ts">
  import { m } from '../i18n/text.svelte';
</script>

<div class="panel-section">
  <div class="section-title accent">
    <i class="fa-solid fa-layer-group"></i>
    {m('Clip seleccionado')}
  </div>
  <div class="help-text" id="videoEffectEmptyNoVideo">
    {m(
      'Importá un video primero. Después arrastrá Look, Visual FX, Color, Caras u Ojos a la timeline.',
    )}
  </div>
  <div class="help-text hidden" id="videoEffectEmptyHint">
    {m(
      'Hacé click en un clip de la timeline para ver cuándo empieza y termina. Los ajustes visuales están en la pestaña Ajustes.',
    )}
  </div>
  <div class="timeline-clip-meta hidden" id="videoEffectClipMeta">
    <div class="timeline-clip-type" id="videoEffectTypeLabel">-</div>
    <div class="help-text inspector-clip-note">
      {m(
        'Mové o estirá el clip en la timeline, o editá los tiempos acá abajo.',
      )}
    </div>
    <div class="video-time-grid timeline-values">
      <label>
        <span>{m('Desde')}</span>
        <input
          type="number"
          id="videoEffectStart"
          min="0"
          step="0.01"
          value="0"
        />
      </label>
      <label>
        <span>{m('Hasta')}</span>
        <input
          type="number"
          id="videoEffectEnd"
          min="0"
          step="0.01"
          value="0"
        />
      </label>
    </div>
    <div class="mono timeline-clip-duration" id="videoEffectDurationLabel">
      0.00 s
    </div>
    <div class="slider-label"><span>{m('Automatización')}</span></div>
    <div class="select-wrapper">
      <select id="videoEffectAutomationSelect">
        <option value="fixed">{m('Fija')}</option>
        <option value="beat-pulse">{m('Pulso en beat')}</option>
        <option value="fade-in">{m('Fade in')}</option>
        <option value="fade-out">{m('Fade out')}</option>
        <option value="alternate-beat">{m('Alternar cada beat')}</option>
      </select>
    </div>
    <div class="btn-row clip-actions">
      <button type="button" class="btn" id="btnOpenEffectAdjust">
        <i class="fa-solid fa-sliders"></i>
        {m('Editar ajustes')}
      </button>
      <button type="button" class="btn danger" id="btnDeleteVideoEffect">
        <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
        {m('Eliminar clip')}
      </button>
    </div>
  </div>
  <select
    id="videoEffectType"
    class="visually-hidden"
    aria-hidden="true"
    tabindex="-1"
  >
    <option value="look">look</option>
    <option value="blob">blob</option>
    <option value="face">face</option>
    <option value="blink">blink</option>
  </select>
</div>
