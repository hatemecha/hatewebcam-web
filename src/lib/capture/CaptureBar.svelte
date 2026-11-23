<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { webcamPanel } from '../webcam/panel-store';
  import { captureChrome } from './session-store';
  import type { CaptureBarAdapter } from './types';

  let { adapter }: { adapter: CaptureBarAdapter } = $props();
  const chrome = $derived($captureChrome);
</script>

<div class="preview-console-footer webcam-only">
  <div class="desktop-capture-bar" aria-label={m('Controles de captura')}>
    <label class="capture-timer-field" for="captureTimerSelect">
      <span class="capture-timer-label">{m('Temporizador')}</span>
      <span class="select-wrapper capture-timer-select">
        <select
          id="captureTimerSelect"
          aria-label={m('Temporizador de foto')}
          value={String($webcamPanel.image.captureTimerSeconds)}
          disabled={chrome.lockCaptureSettings}
          onchange={(event) =>
            adapter.setCaptureTimer(Number(event.currentTarget.value))}
        >
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
        aria-label={m(
          chrome.countdownActive
            ? 'Cancelar temporizador de foto'
            : 'Sacar foto',
        )}
        disabled={(!chrome.cameraRunning ||
          chrome.recording ||
          chrome.previewOpen) &&
          !chrome.countdownActive}
        onclick={() => adapter.takePhoto()}
      >
        <span
          class="photo-shutter-core"
          class:is-cancel={chrome.countdownActive}
          aria-hidden="true"
        >
          {#if chrome.countdownActive}<i class="fa-solid fa-xmark"></i>{/if}
        </span>
        <span class="capture-action-label"
          >{m(chrome.countdownActive ? 'Cancelar' : 'Foto')}</span
        >
      </button>
      <button
        type="button"
        class="record-trigger"
        class:recording={chrome.recording}
        id="btnRecord"
        aria-label={m('Grabar video')}
        disabled={(!chrome.cameraRunning && !chrome.recording) ||
          chrome.previewOpen ||
          chrome.countdownActive}
        onclick={() => adapter.toggleRecording()}
      >
        <span class="record-trigger-core" aria-hidden="true"></span>
        <span class="capture-action-label"
          >{m(chrome.recording ? 'Detener' : 'Grabar')}</span
        >
      </button>
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
