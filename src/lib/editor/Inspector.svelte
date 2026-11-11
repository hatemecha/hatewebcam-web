<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import ProjectPanel from './ProjectPanel.svelte';
  import ClipInspector from './ClipInspector.svelte';
  import AdjustPanel from './AdjustPanel.svelte';
</script>

<aside
  class="video-inspector video-only hidden"
  id="videoInspector"
  aria-label={m('Inspector de video')}
>
  <div
    class="video-inspector-tabs"
    role="tablist"
    aria-label={m('Secciones del inspector')}
  >
    <button
      type="button"
      class="video-inspector-tab is-active"
      id="tabInspectorProject"
      role="tab"
      aria-selected="true"
      aria-controls="inspectorPanelProject"
      data-tab="project"
    >
      {m('Proyecto')}
    </button>
    <button
      type="button"
      class="video-inspector-tab"
      id="tabInspectorEffect"
      role="tab"
      aria-selected="false"
      aria-controls="inspectorPanelEffect"
      data-tab="effect"
    >
      {m('Clip')}
    </button>
    <button
      type="button"
      class="video-inspector-tab"
      id="tabInspectorAdjust"
      role="tab"
      aria-selected="false"
      aria-controls="inspectorPanelAdjust"
      data-tab="adjust"
    >
      {m('Ajustes')}
    </button>
  </div>
  <div
    class="inspector-clipboard-status mono"
    id="timelineClipboardStatus"
  ></div>
  <div class="video-inspector-panels">
    <ProjectPanel />
    <div
      class="video-inspector-panel"
      id="inspectorPanelEffect"
      role="tabpanel"
      aria-labelledby="tabInspectorEffect"
      hidden
    >
      <ClipInspector />
    </div>
    <div
      class="video-inspector-panel"
      id="inspectorPanelAdjust"
      role="tabpanel"
      aria-labelledby="tabInspectorAdjust"
      hidden
    >
      <AdjustPanel />
    </div>
  </div>
</aside>
