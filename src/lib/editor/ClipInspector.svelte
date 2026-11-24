<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { editorActions, editorState } from './editor-store';
  import { transportPosition } from './transport-store';

  const clip = $derived($editorState.clip);

  function commitTiming(edge: 'start' | 'end', input: HTMLInputElement): void {
    const result = $editorActions?.commitSelectedEffectTiming(
      edge,
      input.valueAsNumber,
    );
    if (result !== undefined) input.value = result.toFixed(2);
  }
</script>

<div class="panel-section">
  <div class="section-title accent">
    <i class="fa-solid fa-layer-group"></i>
    {m('Clip seleccionado')}
  </div>
  <div
    class="help-text"
    class:hidden={$editorState.hasSource}
    id="videoEffectEmptyNoVideo"
  >
    {m(
      'Importá un video primero. Después arrastrá Look, Visual FX, Color, Caras u Ojos a la timeline.',
    )}
  </div>
  <div
    class="help-text"
    class:hidden={!$editorState.hasSource || Boolean(clip)}
    id="videoEffectEmptyHint"
  >
    {m(
      'Hacé click en un clip de la timeline para ver cuándo empieza y termina. Los ajustes visuales están en la pestaña Ajustes.',
    )}
  </div>
  <div class="timeline-clip-meta" class:hidden={!clip} id="videoEffectClipMeta">
    <div class="timeline-clip-type" id="videoEffectTypeLabel">
      {clip?.label ?? '-'}
    </div>
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
          max={$transportPosition.duration}
          value={clip?.startTime.toFixed(2) ?? '0'}
          onchange={(event) => commitTiming('start', event.currentTarget)}
        />
      </label>
      <label>
        <span>{m('Hasta')}</span>
        <input
          type="number"
          id="videoEffectEnd"
          min="0"
          step="0.01"
          max={$transportPosition.duration}
          value={clip?.endTime.toFixed(2) ?? '0'}
          onchange={(event) => commitTiming('end', event.currentTarget)}
        />
      </label>
    </div>
    <div class="mono timeline-clip-duration" id="videoEffectDurationLabel">
      {clip
        ? `${m('Duración')}: ${(clip.endTime - clip.startTime).toFixed(2)} s`
        : '0.00 s'}
    </div>
    <div class="slider-label"><span>{m('Automatización')}</span></div>
    <div class="select-wrapper">
      <select
        id="videoEffectAutomationSelect"
        aria-label={m('Automatización')}
        value={clip?.automation ?? 'fixed'}
        disabled={!clip}
        onchange={(event) =>
          $editorActions?.commitSelectedEffectAutomation(
            event.currentTarget.value,
          )}
      >
        <option value="fixed">{m('Fija')}</option>
        <option value="beat-pulse">{m('Pulso en beat')}</option>
        <option value="fade-in">{m('Fade in')}</option>
        <option value="fade-out">{m('Fade out')}</option>
        <option value="alternate-beat">{m('Alternar cada beat')}</option>
      </select>
    </div>
    <div class="btn-row clip-actions">
      <button
        type="button"
        class="btn"
        id="btnOpenEffectAdjust"
        disabled={!clip}
        onclick={() => $editorActions?.openSelectedClipAdjustments()}
      >
        <i class="fa-solid fa-sliders"></i>
        {m('Editar ajustes')}
      </button>
      <button
        type="button"
        class="btn danger"
        id="btnDeleteVideoEffect"
        disabled={!clip}
        onclick={() => $editorActions?.deleteSelectedVideoEffect()}
      >
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
    value={clip?.type ?? 'look'}
  >
    <option value="look">look</option>
    <option value="visual-fx">visual-fx</option>
    <option value="blob">blob</option>
    <option value="face">face</option>
    <option value="blink">blink</option>
  </select>
</div>
