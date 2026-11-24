<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { editAssistPanel } from './edit-assist-panel';

  const view = $derived($editAssistPanel.view);
  const actions = $derived($editAssistPanel.actions);
  const confidence = $derived(
    view.confidence >= 0.7
      ? ' · confianza alta'
      : view.confidence >= 0.4
        ? ' · confianza media'
        : ' · confianza baja',
  );
</script>

<div class="section-title">{m('Asistencia de edición')}</div>
<div class="help-text">
  {m(
    'Detecta pulsos aproximados para ayudarte a sincronizar efectos. Podés mover o borrar marcadores manualmente.',
  )}
</div>
<button
  type="button"
  class="btn"
  id="btnEditAssistAnalyze"
  disabled={!view.canAnalyze}
  onclick={() => void actions?.analyze()}
>
  <i
    class={view.analyzing
      ? 'fa-solid fa-spinner fa-spin'
      : 'fa-solid fa-wave-square'}
  ></i>
  {m(view.analyzing ? 'Analizando...' : 'Analizar audio')}
</button>
<div class="edit-assist-result mono" id="editAssistResult">
  {#if !view.loaded}
    {m('Importá un video para analizar su audio.')}
  {:else if view.analyzing}
    {m('Analizando pulsos aproximados...')}
  {:else if view.detectedBpm}
    {`${m('Tempo estimado:')} ${view.detectedBpm} BPM${m(' · usado ')}${view.bpm} BPM · offset ${view.offsetMs} ms${m(confidence)}`}
  {:else if view.hasResult}
    {m('No encontré pulsos claros en el audio.')}
  {:else}
    {m('Sin analizar')}
  {/if}
</div>
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
      value={view.bpm || ''}
      disabled={!view.canAdjust}
      onchange={(event) => {
        const input = event.currentTarget;
        input.value = String(actions?.setBpm(input.valueAsNumber) || '');
      }}
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
      value={view.offsetMs}
      disabled={!view.canAdjust}
      onchange={(event) => {
        const input = event.currentTarget;
        input.value = String(actions?.setOffset(input.valueAsNumber) ?? 0);
      }}
    />
  </label>
</div>
<div class="btn-row edit-assist-actions edit-assist-tempo-actions">
  <button
    type="button"
    class="btn"
    id="btnEditAssistHalf"
    disabled={!view.canGenerate}
    onclick={() => actions?.scaleBpm(0.5)}
  >
    {m('Mitad')}
  </button>
  <button
    type="button"
    class="btn"
    id="btnEditAssistDouble"
    disabled={!view.canGenerate}
    onclick={() => actions?.scaleBpm(2)}
  >
    {m('Doble')}
  </button>
  <button
    type="button"
    class="btn btn-icon"
    id="btnEditAssistOffsetDown"
    aria-label={m('Mover grilla 10 milisegundos antes')}
    disabled={!view.canGenerate}
    onclick={() => actions?.shiftOffset(-10)}
  >
    <i class="fa-solid fa-minus"></i>
  </button>
  <button
    type="button"
    class="btn btn-icon"
    id="btnEditAssistOffsetUp"
    aria-label={m('Mover grilla 10 milisegundos después')}
    disabled={!view.canGenerate}
    onclick={() => actions?.shiftOffset(10)}
  >
    <i class="fa-solid fa-plus"></i>
  </button>
</div>
<div class="slider-label"><span>{m('Marcadores')}</span></div>
<div class="select-wrapper">
  <select
    id="editAssistDensitySelect"
    value={String(view.markerStep)}
    disabled={!view.canAdjust}
    onchange={(event) =>
      actions?.setMarkerStep(Number(event.currentTarget.value))}
  >
    <option value="1">{m('Cada beat')}</option>
    <option value="2">{m('Cada 2 beats')}</option>
    <option value="4">{m('Cada 4 beats')}</option>
    <option value="8">{m('Cada 8 beats')}</option>
  </select>
</div>
<div class="btn-row edit-assist-actions edit-assist-marker-actions">
  <button
    type="button"
    class="btn"
    id="btnEditAssistBeat"
    class:is-active={view.markerStep === 1}
    disabled={!view.canGenerate}
    onclick={() => actions?.applyMarkers(1)}
  >
    {m('Cada beat')}
  </button>
  <button
    type="button"
    class="btn"
    id="btnEditAssistEvery2"
    class:is-active={view.markerStep === 2}
    disabled={!view.canGenerate}
    onclick={() => actions?.applyMarkers(2)}
  >
    {m('Cada 2')}
  </button>
  <button
    type="button"
    class="btn"
    id="btnEditAssistEvery4"
    class:is-active={view.markerStep === 4}
    disabled={!view.canGenerate}
    onclick={() => actions?.applyMarkers(4)}
  >
    {m('Cada 4')}
  </button>
  <button
    type="button"
    class="btn"
    id="btnEditAssistEvery8"
    class:is-active={view.markerStep === 8}
    disabled={!view.canGenerate}
    onclick={() => actions?.applyMarkers(8)}
  >
    {m('Cada 8')}
  </button>
  <button
    type="button"
    class="btn"
    id="btnEditAssistRegenerate"
    disabled={!view.canGenerate}
    onclick={() => actions?.applyMarkers()}
  >
    {m('Regenerar')}
  </button>
</div>
<button
  type="button"
  class="btn"
  id="btnEditAssistClear"
  disabled={!view.canClear}
  onclick={() => actions?.clearMarkers()}
>
  <i class="fa-solid fa-eraser"></i>
  {m('Limpiar Edit Assist')}
</button>
<div
  class={view.status ? `status-msg ${view.status.type}` : 'status-msg hidden'}
  id="editAssistStatus"
  role="status"
  aria-live="polite"
>
  {#if view.status}
    {`${view.status.count ?? ''}${m(view.status.message)}`}
  {/if}
</div>
