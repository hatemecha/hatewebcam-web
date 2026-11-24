<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { editorActions, editorState } from './editor-store';
  import { transportActions, transportReadout } from './transport-store';
</script>

<div class="video-editor-toolbar">
  <div class="video-tool-group" role="group" aria-label={m('Herramientas')}>
    <button
      type="button"
      class="video-tool-btn"
      class:is-active={$editorState.tool === 'select'}
      aria-pressed={$editorState.tool === 'select'}
      onclick={() => $editorActions?.setEditorTool('select')}
      id="btnToolSelect"
      data-tool="select"
      title={m('Seleccionar (V)')}
    >
      <i class="fa-solid fa-arrow-pointer"></i><span>{m('Seleccionar')}</span>
    </button>
    <button
      type="button"
      class="video-tool-btn"
      class:is-active={$editorState.tool === 'cut'}
      aria-pressed={$editorState.tool === 'cut'}
      onclick={() => $editorActions?.setEditorTool('cut')}
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
      onclick={() => $editorActions?.splitAllEffectsAtMarkers()}
      title={m('Cortar todos los efectos en cada marcador')}
      disabled={!$editorState.hasSource || $editorState.exporting}
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
      disabled={!$editorState.hasSource || $editorState.exporting}
      onclick={() => $transportActions?.boundary('start')}
    >
      <i class="fa-solid fa-backward-step"></i>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      id="btnVideoBack"
      aria-label="-5 s"
      disabled={!$editorState.hasSource || $editorState.exporting}
      onclick={() => $transportActions?.jump(-5)}
    >
      <i class="fa-solid fa-backward"></i>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      id="btnVideoPlay"
      aria-label={m('Play (Espacio)')}
      disabled={!$editorState.hasSource || $editorState.exporting}
      onclick={() => void $transportActions?.toggle()}
    >
      <i
        class={$transportReadout.paused
          ? 'fa-solid fa-play'
          : 'fa-solid fa-pause'}
      ></i>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      id="btnVideoForward"
      aria-label="+5 s"
      disabled={!$editorState.hasSource || $editorState.exporting}
      onclick={() => $transportActions?.jump(5)}
    >
      <i class="fa-solid fa-forward"></i>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      id="btnVideoEnd"
      aria-label={m('Final')}
      disabled={!$editorState.hasSource || $editorState.exporting}
      onclick={() => $transportActions?.boundary('end')}
    >
      <i class="fa-solid fa-forward-step"></i>
    </button>
    <span class="mono video-time-readout" id="videoTimeLabel"
      >{$transportReadout.timeLabel}</span
    >
  </div>
  <div class="video-timeline-controls" aria-label="Timeline">
    <label class="timeline-snap-toggle" title={m('Imán')}>
      <input
        type="checkbox"
        id="chkTimelineSnap"
        checked={$editorState.snapEnabled}
        onchange={(event) =>
          $editorActions?.setSnapEnabled(event.currentTarget.checked)}
      />
      <span>{m('Imán')}</span>
    </label>
    <div class="timeline-zoom-controls">
      <button
        type="button"
        class="btn btn-icon"
        id="btnTimelineZoomOut"
        onclick={() => $editorActions?.setTimelineZoom($editorState.zoom - 0.5)}
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
        value={$editorState.zoom}
        oninput={(event) =>
          $editorActions?.setTimelineZoom(event.currentTarget.valueAsNumber)}
        aria-label="Zoom"
      />
      <button
        type="button"
        class="btn btn-icon"
        id="btnTimelineZoomIn"
        onclick={() => $editorActions?.setTimelineZoom($editorState.zoom + 0.5)}
        aria-label={m('Acercar')}
      >
        <i class="fa-solid fa-plus"></i>
      </button>
    </div>
    <button
      type="button"
      class="btn btn-icon"
      id="btnEditorUndo"
      onclick={() => $editorActions?.undoTimelineEdit()}
      aria-label={m('Deshacer')}
      disabled={!$editorState.canUndo}
    >
      <i class="fa-solid fa-rotate-left"></i>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      id="btnEditorRedo"
      onclick={() => $editorActions?.redoTimelineEdit()}
      aria-label={m('Rehacer')}
      disabled={!$editorState.canRedo}
    >
      <i class="fa-solid fa-rotate-right"></i>
    </button>
  </div>
</div>
