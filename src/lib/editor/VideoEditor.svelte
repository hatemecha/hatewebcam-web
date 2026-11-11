<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { editorState } from './editor-store';
  import EditorToolbar from './EditorToolbar.svelte';
  import EffectPalette from './EffectPalette.svelte';
  import Timeline from './Timeline.svelte';
  import Inspector from './Inspector.svelte';
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="editor-splitter editor-splitter-horizontal video-only"
  class:hidden={$editorState.mode !== 'video'}
  id="timelineSplitter"
  role="separator"
  aria-label={m('Cambiar altura de la línea de tiempo')}
  aria-orientation="horizontal"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow="50"
  tabindex="0"
></div>
<section
  class="video-timeline-shell video-only"
  class:hidden={$editorState.mode !== 'video'}
  id="videoTimelineShell"
  aria-label={m('Editor de video')}
>
  <EditorToolbar />
  <EffectPalette />
  <Timeline />
  <div class="timeline-hint">
    <span id="timelineHintText"></span>
    <span class="mono" id="videoEffectRangeLabel"></span>
  </div>
</section>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="editor-splitter editor-splitter-vertical video-only"
  class:hidden={$editorState.mode !== 'video'}
  id="inspectorSplitter"
  role="separator"
  aria-label={m('Cambiar ancho del inspector')}
  aria-orientation="vertical"
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow="50"
  tabindex="0"
></div>
<Inspector />
