<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { editorState } from './editor-store';
  import ProjectPanel from './ProjectPanel.svelte';
  import ClipInspector from './ClipInspector.svelte';
  import AdjustPanel from './AdjustPanel.svelte';
</script>

<aside
  class="video-inspector video-only"
  class:hidden={$editorState.mode !== 'video'}
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
      class="video-inspector-tab"
      class:is-active={$editorState.inspectorTab === 'project'}
      id="tabInspectorProject"
      role="tab"
      aria-selected={$editorState.inspectorTab === 'project'}
      aria-controls="inspectorPanelProject"
      data-tab="project"
    >
      {m('Proyecto')}
    </button>
    <button
      type="button"
      class="video-inspector-tab"
      class:is-active={$editorState.inspectorTab === 'effect'}
      id="tabInspectorEffect"
      role="tab"
      aria-selected={$editorState.inspectorTab === 'effect'}
      aria-controls="inspectorPanelEffect"
      data-tab="effect"
    >
      {m('Clip')}
    </button>
    <button
      type="button"
      class="video-inspector-tab"
      class:is-active={$editorState.inspectorTab === 'adjust'}
      id="tabInspectorAdjust"
      role="tab"
      aria-selected={$editorState.inspectorTab === 'adjust'}
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
      class:is-active={$editorState.inspectorTab === 'effect'}
      id="inspectorPanelEffect"
      role="tabpanel"
      aria-labelledby="tabInspectorEffect"
      hidden={$editorState.inspectorTab !== 'effect'}
    >
      <ClipInspector />
    </div>
    <div
      class="video-inspector-panel"
      class:is-active={$editorState.inspectorTab === 'adjust'}
      id="inspectorPanelAdjust"
      role="tabpanel"
      aria-labelledby="tabInspectorAdjust"
      hidden={$editorState.inspectorTab !== 'adjust'}
    >
      <AdjustPanel />
    </div>
  </div>
</aside>
