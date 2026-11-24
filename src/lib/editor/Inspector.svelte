<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { editorActions, editorState } from './editor-store';
  import ProjectPanel from './ProjectPanel.svelte';
  import ClipInspector from './ClipInspector.svelte';
  import AdjustPanel from './AdjustPanel.svelte';
  import type { ProjectActions } from './editor-state';

  let { projects }: { projects: ProjectActions } = $props();
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
      onclick={() => $editorActions?.setInspectorTab('project')}
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
      onclick={() => $editorActions?.setInspectorTab('effect')}
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
      onclick={() => $editorActions?.setInspectorTab('adjust')}
    >
      {m('Ajustes')}
    </button>
  </div>
  <div
    class="inspector-clipboard-status mono"
    class:is-active={Boolean($editorState.clipboardStatus)}
    id="timelineClipboardStatus"
  >
    {$editorState.clipboardStatus}
  </div>
  <div class="video-inspector-panels">
    <ProjectPanel {projects} />
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
