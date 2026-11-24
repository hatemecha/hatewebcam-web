<script lang="ts">
  import { untrack } from 'svelte';
  import { readable } from 'svelte/store';
  import { m } from '../i18n/text.svelte';
  import {
    getPlaceholderState,
    subscribePlaceholderState,
    type PreviewPlaceholderActions,
  } from './placeholder-state';

  let { actions }: { actions: PreviewPlaceholderActions } = $props();
  const placeholder = readable(
    getPlaceholderState(),
    subscribePlaceholderState,
  );
  const camera = $derived($placeholder.camera);
  const focusRequest = $derived($placeholder.focusRequest);
  let cameraAction: HTMLButtonElement | undefined = $state();

  $effect(() => {
    if (focusRequest) untrack(() => cameraAction?.focus());
  });
</script>

<div
  class="preview-placeholder"
  class:hidden={$placeholder.view === 'hidden'}
  class:is-solid={$placeholder.view === 'video' ||
    $placeholder.view === 'loading'}
  id="previewPlaceholder"
>
  <div
    class="preview-placeholder-view preview-placeholder-camera"
    class:hidden={$placeholder.view !== 'camera'}
    id="previewPlaceholderCamera"
    data-state={camera.state}
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <i
      class="fa-solid {camera.icon} fa-2x"
      id="cameraStateIcon"
      aria-hidden="true"
    ></i>
    <h2 class="camera-state-title" id="cameraStateTitle">{m(camera.title)}</h2>
    <p class="camera-state-message" id="previewPlaceholderCameraMessage">
      {m($placeholder.cameraMessage ?? camera.message)}
    </p>
    <p
      class="camera-state-hint"
      class:hidden={!camera.hint}
      id="cameraStateHint"
    >
      {camera.hint ? m(camera.hint) : ''}
    </p>
    <button
      type="button"
      class="btn primary camera-state-action"
      class:hidden={!camera.action}
      id="btnCameraStateAction"
      aria-label={m(camera.action ?? 'Encender cámara')}
      bind:this={cameraAction}
      onclick={() => actions.startCamera()}
    >
      <i class="fa-solid fa-play" aria-hidden="true"></i>
      <span>{camera.action ? m(camera.action) : ''}</span>
    </button>
    <p class="empty-state-footer">
      <i class="fa-solid fa-lock" aria-hidden="true"></i>
      {m('La imagen se procesa en este navegador.')}
    </p>
  </div>
  <div
    class="preview-placeholder-view preview-placeholder-video"
    class:hidden={$placeholder.view !== 'video'}
    id="previewPlaceholderVideo"
  >
    <div class="preview-import-card">
      <div class="preview-import-icon" aria-hidden="true">
        <i class="fa-solid fa-clapperboard"></i>
      </div>
      <p class="preview-import-title">{m('Empezá con un video')}</p>
      <p class="preview-import-hint">
        {m(
          'Importá un archivo local para recortarlo, sumar efectos y exportarlo.',
        )}
      </p>
      <div class="preview-import-formats" aria-hidden="true">
        <span>MP4</span>
        <span>WebM</span>
        <span>MOV</span>
      </div>
      <button
        type="button"
        class="btn primary preview-import-btn"
        id="btnPreviewImportVideo"
        onclick={() => actions.chooseVideo()}
      >
        {m('Importar video')}
      </button>
      <p class="preview-import-note">
        {m('Tu archivo no sale de este equipo.')}
      </p>
    </div>
  </div>
  <div
    class="preview-placeholder-view preview-placeholder-loading"
    class:hidden={$placeholder.view !== 'loading'}
    id="previewPlaceholderLoading"
  >
    <i class="fa-solid fa-spinner fa-spin fa-2x" aria-hidden="true"></i>
    <div id="previewPlaceholderLoadingMessage">
      {m($placeholder.loadingMessage)}
    </div>
  </div>
</div>
