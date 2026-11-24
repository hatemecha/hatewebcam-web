<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { editorState } from './editor-store';
  import EditAssistPanel from './EditAssistPanel.svelte';
  import ExportPanel from './ExportPanel.svelte';
  import type { ProjectActions } from './editor-state';

  let { projects }: { projects: ProjectActions } = $props();
  let videoInput: HTMLInputElement;
  let projectInput: HTMLInputElement;
  const importLabel = $derived(
    m($editorState.hasSource ? 'Cambiar video' : 'Importar video'),
  );

  function consumeFile(input: HTMLInputElement, load: (_file: File) => void) {
    const file = input.files?.[0];
    input.value = '';
    if (file) load(file);
  }
</script>

<div
  class="video-inspector-panel"
  class:is-active={$editorState.inspectorTab === 'project'}
  id="inspectorPanelProject"
  role="tabpanel"
  aria-labelledby="tabInspectorProject"
  hidden={$editorState.inspectorTab !== 'project'}
>
  <div class="panel-section video-import-section">
    <div class="section-title">{m('Archivo de video')}</div>
    <div class="help-text" id="videoProjectHelp">
      {m(
        $editorState.hasSource
          ? 'Reemplazá el video o exportá cuando termines.'
          : 'Importá un archivo local. MP4, WebM o MOV si el navegador lo soporta.',
      )}
    </div>
    <input
      type="file"
      id="videoFileInput"
      accept="video/*"
      class="hidden"
      bind:this={videoInput}
      onchange={(event) => consumeFile(event.currentTarget, projects.loadVideo)}
    />
    <button
      type="button"
      class="btn primary"
      id="btnChooseVideo"
      aria-label={importLabel}
      onclick={() => videoInput.click()}
      ><i class="fa-solid fa-folder-open"></i> {importLabel}</button
    >
    <div class="video-import-formats" aria-hidden="true">
      <span>MP4</span>
      <span>WebM</span>
      <span>MOV</span>
    </div>
    <div class="video-file-meta mono" id="videoFileMeta">
      {$editorState.sourceDetails
        ? `${$editorState.sourceDetails} ${m('estimado')}`
        : m('Ningún archivo cargado')}
    </div>
    <input
      type="file"
      id="projectFileInput"
      accept=".hatewebcam.json,application/json"
      class="hidden"
      bind:this={projectInput}
      onchange={(event) =>
        consumeFile(event.currentTarget, projects.loadProject)}
    />
    <div class="video-import-divider" aria-hidden="true"></div>
    <div class="video-project-resume">
      <p class="video-project-resume-title">{m('Retomar una edición')}</p>
      <p class="help-text">
        {m(
          'Abrí un proyecto .hatewebcam.json. Después te pediremos el video original.',
        )}
      </p>
    </div>
    <div class="btn-row video-project-actions">
      <button
        type="button"
        class="btn"
        id="btnSaveProject"
        disabled={!$editorState.hasSource || $editorState.exporting}
        onclick={() => projects.saveProject()}
      >
        <i class="fa-solid fa-floppy-disk"></i>
        {m('Guardar proyecto')}
      </button>
      <button
        type="button"
        class="btn"
        id="btnLoadProject"
        disabled={$editorState.exporting}
        onclick={() => projectInput.click()}
      >
        <i class="fa-solid fa-file-import"></i>
        {m('Cargar proyecto')}
      </button>
    </div>
    <div class="video-import-next">
      <p class="video-import-next-title">{m('Después de importar')}</p>
      <ol class="video-import-next-list">
        <li>
          <span class="video-import-next-index" aria-hidden="true">01</span>
          <span>{m('Recortá el clip y elegí el tramo.')}</span>
        </li>
        <li>
          <span class="video-import-next-index" aria-hidden="true">02</span>
          <span>{m('Sumá efectos, color y marcadores.')}</span>
        </li>
        <li>
          <span class="video-import-next-index" aria-hidden="true">03</span>
          <span>{m('Exportá en WebM sin subir nada.')}</span>
        </li>
      </ol>
    </div>
    <div
      class="status-msg hidden"
      id="videoEditorStatus"
      role="status"
      aria-live="polite"
    ></div>
    <div class="video-project-advanced">
      <div class="spacer-8"></div>
      <EditAssistPanel />
      <div class="spacer-8"></div>
      <ExportPanel {projects} />
    </div>
  </div>
</div>
