<script lang="ts">
  import { m } from '../i18n/text.svelte';
</script>

<div class="section-title">{m('Asistencia de edición')}</div>
<div class="help-text">
  {m(
    'Detecta pulsos aproximados para ayudarte a sincronizar efectos. Podés mover o borrar marcadores manualmente.',
  )}
</div>
<button type="button" class="btn" id="btnEditAssistAnalyze">
  <i class="fa-solid fa-wave-square"></i>
  {m('Analizar audio')}
</button>
<div class="edit-assist-result mono" id="editAssistResult"></div>
<div class="edit-assist-grid">
  <label>
    <span>{m('BPM')}</span>
    <input
      type="number"
      id="editAssistBpmInput"
      class="text-input"
      min="20"
      max="320"
      step="0.1"
      disabled
    />
  </label>
  <label>
    <span>{m('Offset ms')}</span>
    <input
      type="number"
      id="editAssistOffsetInput"
      class="text-input"
      min="-5000"
      max="5000"
      step="10"
      value="0"
      disabled
    />
  </label>
</div>
<div class="btn-row edit-assist-actions edit-assist-tempo-actions">
  <button type="button" class="btn" id="btnEditAssistHalf" disabled>
    {m('Mitad')}
  </button>
  <button type="button" class="btn" id="btnEditAssistDouble" disabled>
    {m('Doble')}
  </button>
  <button
    type="button"
    class="btn btn-icon"
    id="btnEditAssistOffsetDown"
    aria-label={m('Mover grilla 10 milisegundos antes')}
    disabled
  >
    <i class="fa-solid fa-minus"></i>
  </button>
  <button
    type="button"
    class="btn btn-icon"
    id="btnEditAssistOffsetUp"
    aria-label={m('Mover grilla 10 milisegundos después')}
    disabled
  >
    <i class="fa-solid fa-plus"></i>
  </button>
</div>
<div class="slider-label"><span>{m('Marcadores')}</span></div>
<div class="select-wrapper">
  <select id="editAssistDensitySelect" disabled>
    <option value="1">{m('Cada beat')}</option>
    <option value="2">{m('Cada 2 beats')}</option>
    <option value="4" selected>{m('Cada 4 beats')}</option>
    <option value="8">{m('Cada 8 beats')}</option>
  </select>
</div>
<div class="btn-row edit-assist-actions edit-assist-marker-actions">
  <button type="button" class="btn" id="btnEditAssistBeat" disabled>
    {m('Cada beat')}
  </button>
  <button type="button" class="btn" id="btnEditAssistEvery2" disabled>
    {m('Cada 2')}
  </button>
  <button type="button" class="btn" id="btnEditAssistEvery4" disabled>
    {m('Cada 4')}
  </button>
  <button type="button" class="btn" id="btnEditAssistEvery8" disabled>
    {m('Cada 8')}
  </button>
  <button type="button" class="btn" id="btnEditAssistRegenerate" disabled>
    {m('Regenerar')}
  </button>
</div>
<button type="button" class="btn" id="btnEditAssistClear" disabled>
  <i class="fa-solid fa-eraser"></i>
  {m('Limpiar Edit Assist')}
</button>
<div
  class="status-msg hidden"
  id="editAssistStatus"
  role="status"
  aria-live="polite"
></div>
