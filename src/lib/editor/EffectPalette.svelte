<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { editorState } from './editor-store';
</script>

<div
  class="timeline-effect-palette video-only"
  class:hidden={$editorState.mode !== 'video'}
  id="timelineEffectPalette"
  aria-label={m('Efectos para arrastrar a la timeline')}
>
  <span class="timeline-palette-label">{m('Efectos')}</span>
  <div class="timeline-palette-items" role="list">
    <button
      type="button"
      class="timeline-palette-chip"
      data-effect-type="look"
      draggable="true"
      disabled={!$editorState.hasSource || $editorState.exporting}
    >
      <i class="fa-solid fa-circle-half-stroke"></i>
      {m('Look')}
    </button>
    <button
      type="button"
      class="timeline-palette-chip"
      data-effect-type="visual-fx"
      draggable="true"
      disabled={!$editorState.hasSource || $editorState.exporting}
    >
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      {m('Visual FX')}
    </button>
    <button
      type="button"
      class="timeline-palette-chip"
      data-effect-type="blob"
      draggable="true"
      disabled={!$editorState.hasSource || $editorState.exporting}
    >
      <i class="fa-solid fa-palette"></i>
      {m('Color')}
    </button>
    <button
      type="button"
      class="timeline-palette-chip"
      data-effect-type="face"
      draggable="true"
      disabled={!$editorState.hasSource || $editorState.exporting}
    >
      <i class="fa-solid fa-face-smile"></i>
      {m('Caras')}
    </button>
    <button
      type="button"
      class="timeline-palette-chip"
      data-effect-type="blink"
      draggable="true"
      disabled={!$editorState.hasSource || $editorState.exporting}
    >
      <i class="fa-solid fa-eye"></i>
      {m('Ojos')}
    </button>
  </div>
  <span class="timeline-palette-hint"
    >{m('Hacé click o arrastrá a una pista.')}</span
  >
</div>
