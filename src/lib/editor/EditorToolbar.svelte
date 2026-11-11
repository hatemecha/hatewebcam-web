<script lang="ts">
  import { m } from '../i18n/text.svelte';
</script>

<div class="video-editor-toolbar">
  <div class="video-tool-group" role="group" aria-label={m('Herramientas')}>
    <button
      type="button"
      class="video-tool-btn is-active"
      id="btnToolSelect"
      data-tool="select"
      title={m('Seleccionar (V)')}
    >
      <i class="fa-solid fa-arrow-pointer"></i><span>{m('Seleccionar')}</span>
    </button>
    <button
      type="button"
      class="video-tool-btn"
      id="btnToolTrim"
      data-tool="cut"
      title={m('Cortar clips (T)')}
    >
      <i class="fa-solid fa-scissors"></i><span>{m('Cortar')}</span>
    </button>
    <button
      type="button"
      class="video-tool-btn timeline-marker-cut-btn"
      id="btnCutAtMarkers"
      title={m('Cortar todos los efectos en cada marcador')}
      disabled
    >
      <i class="fa-solid fa-timeline"></i>
      <span>{m('En marcadores')}</span>
    </button>
  </div>
  <div class="video-transport" aria-label={m('Reproducción')}>
    <button
      type="button"
      class="btn btn-icon"
      id="btnVideoStart"
      aria-label={m('Inicio')}
    >
      <i class="fa-solid fa-backward-step"></i>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      id="btnVideoBack"
      aria-label="-5 s"
    >
      <i class="fa-solid fa-backward"></i>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      id="btnVideoPlay"
      aria-label={m('Play (Espacio)')}
    >
      <i class="fa-solid fa-play"></i>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      id="btnVideoForward"
      aria-label="+5 s"
    >
      <i class="fa-solid fa-forward"></i>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      id="btnVideoEnd"
      aria-label={m('Final')}
    >
      <i class="fa-solid fa-forward-step"></i>
    </button>
    <span class="mono video-time-readout" id="videoTimeLabel"
      >00:00 / 00:00</span
    >
  </div>
  <div class="video-timeline-controls" aria-label="Timeline">
    <label class="timeline-snap-toggle" title={m('Imán')}>
      <input type="checkbox" id="chkTimelineSnap" checked />
      <span>{m('Imán')}</span>
    </label>
    <div class="timeline-zoom-controls">
      <button
        type="button"
        class="btn btn-icon"
        id="btnTimelineZoomOut"
        aria-label={m('Alejar')}
      >
        <i class="fa-solid fa-minus"></i>
      </button>
      <input
        type="range"
        id="timelineZoom"
        min="1"
        max="8"
        step="0.25"
        value="1"
        aria-label="Zoom"
      />
      <button
        type="button"
        class="btn btn-icon"
        id="btnTimelineZoomIn"
        aria-label={m('Acercar')}
      >
        <i class="fa-solid fa-plus"></i>
      </button>
    </div>
    <button
      type="button"
      class="btn btn-icon"
      id="btnEditorUndo"
      aria-label={m('Deshacer')}
      disabled
    >
      <i class="fa-solid fa-rotate-left"></i>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      id="btnEditorRedo"
      aria-label={m('Rehacer')}
      disabled
    >
      <i class="fa-solid fa-rotate-right"></i>
    </button>
  </div>
</div>
