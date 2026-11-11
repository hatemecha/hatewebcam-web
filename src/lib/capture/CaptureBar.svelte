<script lang="ts">
  import { m } from '../i18n/text.svelte';
</script>

<div class="preview-console-footer webcam-only">
  <div class="desktop-capture-bar" aria-label={m('Controles de captura')}>
    <label class="capture-timer-field" for="captureTimerSelect">
      <span class="capture-timer-label">{m('Temporizador')}</span>
      <span class="select-wrapper capture-timer-select">
        <select id="captureTimerSelect" aria-label={m('Temporizador de foto')}>
          <option value="0">0 s</option>
          <option value="5">5 s</option>
          <option value="10">10 s</option>
        </select>
      </span>
    </label>
    <div
      class="capture-bar-status"
      id="captureStatus"
      role="status"
      aria-live="polite"
    ></div>
    <div class="capture-actions">
      <button
        type="button"
        class="photo-shutter"
        id="btnTakePhoto"
        aria-label={m('Sacar foto')}
      ></button>
      <button
        type="button"
        class="record-trigger"
        id="btnRecord"
        aria-label={m('Grabar video')}
      ></button>
    </div>
  </div>
  <div class="preview-status-bar">
    <div
      class="preview-diagnostics"
      id="previewMetricsMount"
      data-i18n-owner="svelte"
    ></div>
    <div
      class="detector-chips"
      id="effectsInfo"
      aria-label={m('Estado de detectores')}
    ></div>
  </div>
</div>
