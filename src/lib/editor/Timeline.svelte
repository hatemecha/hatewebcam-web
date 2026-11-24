<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { editorActions, editorState } from './editor-store';
  import { transportActions, transportPosition } from './transport-store';
</script>

<div class="timeline-viewport" id="timelineViewport">
  <div class="timeline-scroll" id="timelineScroll">
    <div
      class="timeline-time-ruler"
      id="timelineTimeRuler"
      aria-hidden="true"
    ></div>
    <div
      class="timeline-tracks"
      id="videoTimeline"
      data-editor-tool={$editorState.tool}
      aria-label={m(
        'Línea de tiempo. Arrastrá para elegir un tramo o mover el cursor.',
      )}
    >
      <div class="timeline-track-labels">
        <button
          type="button"
          class="timeline-track-label"
          data-adjust-context="look"
          data-sync-tool="trim"
          class:is-active={$editorState.adjustTrack === 'look'}
          onclick={(event) =>
            $editorActions?.openTrack(
              'look',
              undefined,
              'trim',
              event.shiftKey,
            )}
          title={m('Ajustes de video y look')}
        >
          VIDEO
        </button>
        <button
          type="button"
          class="timeline-track-label"
          data-adjust-context="look"
          data-sync-tool="effect"
          data-effect-type="look"
          class:is-active={$editorState.adjustTrack === 'look'}
          onclick={(event) =>
            $editorActions?.openTrack('look', 'look', 'effect', event.shiftKey)}
          title={m('Ajustes de video y look')}
        >
          LOOK
        </button>
        <button
          type="button"
          class="timeline-track-label"
          data-adjust-context="visual-fx"
          data-effect-type="visual-fx"
          class:is-active={$editorState.adjustTrack === 'visual-fx'}
          onclick={(event) =>
            $editorActions?.openTrack(
              'visual-fx',
              'visual-fx',
              undefined,
              event.shiftKey,
            )}
          title={m('Ajustes de Visual FX')}
        >
          VISUAL FX
        </button>
        <button
          type="button"
          class="timeline-track-label"
          data-adjust-context="blob"
          data-effect-type="blob"
          class:is-active={$editorState.adjustTrack === 'blob'}
          onclick={(event) =>
            $editorActions?.openTrack(
              'blob',
              'blob',
              undefined,
              event.shiftKey,
            )}
          title={m('Ajustes de color')}
        >
          COLOR
        </button>
        <button
          type="button"
          class="timeline-track-label"
          data-adjust-context="face"
          data-effect-type="face"
          class:is-active={$editorState.adjustTrack === 'face'}
          onclick={(event) =>
            $editorActions?.openTrack(
              'face',
              'face',
              undefined,
              event.shiftKey,
            )}
          title={m('Ajustes de caras')}
        >
          {m('CARAS')}
        </button>
        <button
          type="button"
          class="timeline-track-label"
          data-adjust-context="blink"
          data-effect-type="blink"
          class:is-active={$editorState.adjustTrack === 'blink'}
          onclick={(event) =>
            $editorActions?.openTrack(
              'blink',
              'blink',
              undefined,
              event.shiftKey,
            )}
          title={m('Ajustes de ojos')}
        >
          {m('OJOS')}
        </button>
      </div>
      <div class="timeline-track-area">
        <div class="timeline-track timeline-track-video" data-track="video">
          <div
            class="timeline-trim-outside timeline-trim-outside-start"
            id="timelineTrimOutsideStart"
          ></div>
          <div
            class="timeline-trim-outside timeline-trim-outside-end"
            id="timelineTrimOutsideEnd"
          ></div>
          <div class="timeline-trim" id="timelineTrim"></div>
          <div class="timeline-video-clip" id="timelineVideoClip"></div>
          <button
            type="button"
            class="timeline-trim-handle start"
            id="timelineTrimStartHandle"
            aria-label={m('Inicio del video')}
          ></button>
          <button
            type="button"
            class="timeline-trim-handle end"
            id="timelineTrimEndHandle"
            aria-label={m('Fin del video')}
          ></button>
        </div>
        <div
          class="timeline-track timeline-track-effects"
          data-track="look"
          class:is-target-track={$editorState.targetTrack === 'look'}
        ></div>
        <div
          class="timeline-track timeline-track-effects"
          data-track="visual-fx"
          class:is-target-track={$editorState.targetTrack === 'visual-fx'}
        ></div>
        <div
          class="timeline-track timeline-track-effects"
          data-track="blob"
          class:is-target-track={$editorState.targetTrack === 'blob'}
        ></div>
        <div
          class="timeline-track timeline-track-effects"
          data-track="face"
          class:is-target-track={$editorState.targetTrack === 'face'}
        ></div>
        <div
          class="timeline-track timeline-track-effects"
          data-track="blink"
          class:is-target-track={$editorState.targetTrack === 'blink'}
        ></div>
        <div class="timeline-playhead" id="timelinePlayhead">
          <button
            type="button"
            class="timeline-playhead-handle"
            id="timelinePlayheadHandle"
            aria-label={m('Mover cursor de reproducción')}
          ></button>
        </div>
        <div class="timeline-cut-guide" id="timelineCutGuide"></div>
        <div class="timeline-selection" id="timelineSelection"></div>
        <div class="timeline-markers" id="timelineMarkers"></div>
        <div class="timeline-items" id="timelineItems"></div>
      </div>
    </div>
  </div>
</div>

<div class="visually-hidden" aria-hidden="true">
  <input
    type="number"
    id="videoTrimStart"
    min="0"
    step="0.01"
    max={$transportPosition.duration}
    value={$editorState.trimStart.toFixed(2)}
    onchange={(event) => {
      const input = event.currentTarget;
      const result = $editorActions?.setTrimBoundary(
        'start',
        input.valueAsNumber,
      );
      if (result !== undefined) input.value = result.toFixed(2);
    }}
    tabindex="-1"
  />
  <input
    type="number"
    id="videoTrimEnd"
    min="0"
    step="0.01"
    max={$transportPosition.duration}
    value={$editorState.trimEnd.toFixed(2)}
    onchange={(event) => {
      const input = event.currentTarget;
      const result = $editorActions?.setTrimBoundary(
        'end',
        input.valueAsNumber,
      );
      if (result !== undefined) input.value = result.toFixed(2);
    }}
    tabindex="-1"
  />
  <button
    type="button"
    id="btnSetTrimFromPlayhead"
    onclick={() => $editorActions?.setTrimBoundary('start')}
    aria-label={m('Inicio del video')}
    tabindex="-1"
  ></button>
  <button
    type="button"
    id="btnSetTrimEndFromPlayhead"
    onclick={() => $editorActions?.setTrimBoundary('end')}
    aria-label={m('Fin del video')}
    tabindex="-1"
  ></button>
</div>
<input
  type="range"
  id="videoSeek"
  class="visually-hidden"
  min="0"
  max={$transportPosition.duration}
  step="0.01"
  value={$transportPosition.currentTime}
  aria-label={m('Posición del video')}
  disabled={!$editorState.hasSource || $editorState.exporting}
  tabindex="-1"
  oninput={(event) =>
    $transportActions?.seek(event.currentTarget.valueAsNumber)}
/>
