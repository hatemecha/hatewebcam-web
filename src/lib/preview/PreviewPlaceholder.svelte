<script lang="ts">
  import { m } from '../i18n/text.svelte';
</script>

<div class="preview-placeholder" id="previewPlaceholder">
  <div
    class="preview-placeholder-view preview-placeholder-camera"
    id="previewPlaceholderCamera"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <i class="fa-solid fa-video fa-2x" id="cameraStateIcon" aria-hidden="true"
    ></i>
    <!-- svelte-ignore a11y_missing_content -->
    <h2 class="camera-state-title" id="cameraStateTitle"></h2>
    <p class="camera-state-message" id="previewPlaceholderCameraMessage"></p>
    <p class="camera-state-hint hidden" id="cameraStateHint"></p>
    <button
      type="button"
      class="btn primary camera-state-action"
      id="btnCameraStateAction"
      aria-label={m('Encender cámara')}
    >
      <i class="fa-solid fa-play" aria-hidden="true"></i>
      <span></span>
    </button>
    <p class="empty-state-footer">
      <i class="fa-solid fa-lock" aria-hidden="true"></i>
      {m('La imagen se procesa en este navegador.')}
    </p>
  </div>
  <div
    class="preview-placeholder-view preview-placeholder-video hidden"
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
      >
        {m('Importar video')}
      </button>
      <p class="preview-import-note">
        {m('Tu archivo no sale de este equipo.')}
      </p>
    </div>
  </div>
  <div
    class="preview-placeholder-view preview-placeholder-loading hidden"
    id="previewPlaceholderLoading"
  >
    <i class="fa-solid fa-spinner fa-spin fa-2x" aria-hidden="true"></i>
    <div id="previewPlaceholderLoadingMessage"></div>
  </div>
</div>
