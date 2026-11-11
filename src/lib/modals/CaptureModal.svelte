<script lang="ts">
  import { m } from '../i18n/text.svelte.ts';
  import { onMount } from 'svelte';
  import { isMessageKey } from '../i18n/translate';
  import { capturePreview } from '../capture/session-store';
  import type { CaptureModalAdapter } from '../capture/types';
  import { trapModalFocus } from './focus-trap';

  let { adapter }: { adapter: CaptureModalAdapter } = $props();

  const preview = $derived($capturePreview);
  let dialog = $state<HTMLDivElement | null>(null);
  let downloadButton = $state<HTMLButtonElement | null>(null);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let open = $state(false);
  let mediaUrl = $state('');

  onMount(() =>
    capturePreview.subscribe((value) => {
      if (value.open !== open) open = value.open;
      if (value.mediaUrl !== mediaUrl) mediaUrl = value.mediaUrl;
    }),
  );

  $effect(() => {
    const node = dialog;
    if (!node || !open) return;
    return trapModalFocus(node, downloadButton);
  });

  $effect(() => {
    const node = videoEl;
    const url = mediaUrl;
    const kind = preview.kind;
    if (!node) return;
    if (kind === 'video' && url) {
      if (node.src !== url) {
        node.src = url;
        node.load();
      }
      return;
    }
    if (node.getAttribute('src')) {
      node.pause();
      node.removeAttribute('src');
      node.load();
    }
  });

  function message(value: string) {
    return isMessageKey(value) ? m(value) : value;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') adapter.discard();
  }

  function onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) adapter.discard();
  }
</script>

<div
  class="capture-preview-modal"
  class:hidden={!preview.open}
  id="capturePreviewModal"
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-labelledby="capturePreviewTitle"
  bind:this={dialog}
  onclick={onBackdrop}
  onkeydown={onKeyDown}
>
  <div class="capture-preview-card">
    <div class="capture-preview-header">
      <div class="section-title" id="capturePreviewTitle">
        {message(preview.title)}
      </div>
      <button
        class="btn btn-icon"
        id="btnCloseCapturePreview"
        type="button"
        aria-label={m('Cerrar vista previa')}
        onclick={() => adapter.discard()}
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="capture-preview-media">
      <img
        id="capturePreviewImage"
        class:hidden={preview.kind !== 'photo'}
        alt={m('Vista previa de foto capturada')}
        src={preview.kind === 'photo' ? preview.mediaUrl : undefined}
      />
      <video
        id="capturePreviewVideo"
        class:hidden={preview.kind !== 'video'}
        controls
        playsinline
        preload="metadata"
        bind:this={videoEl}
      ></video>
    </div>
    <div class="capture-preview-meta">
      <div class="capture-preview-filename mono" id="capturePreviewFilename">
        {preview.filename}
      </div>
      <div class="capture-preview-info" id="capturePreviewInfo">
        {#each preview.rows as row (row.key)}
          <div class="capture-preview-row">
            <div class="capture-preview-key">{message(row.key)}</div>
            <div class="capture-preview-value">{message(row.value)}</div>
          </div>
        {/each}
      </div>
      <div
        class="capture-preview-photo-tools"
        class:hidden={preview.kind !== 'photo'}
        id="capturePreviewPhotoTools"
      >
        <div class="capture-preview-tools-title">{m('Mejora de foto')}</div>
        <label class="checkbox-group">
          <input
            type="checkbox"
            id="chkPreviewPhotoEnhancer"
            checked={preview.enhancerEnabled}
            onchange={(event) =>
              adapter.setEnhancer(
                (event.currentTarget as HTMLInputElement).checked,
              )}
          />
          <span>{m('Mejorar antes de descargar')}</span>
        </label>
        <div
          class="slider-group"
          class:hidden={!preview.enhancerEnabled || preview.kind !== 'photo'}
          id="previewPhotoEnhancerStrengthGroup"
        >
          <div class="slider-label">
            <span>{m('Intensidad')}</span>
            <span class="value" id="valPreviewPhotoEnhancerStrength"
              >{preview.enhancerStrength}%</span
            >
          </div>
          <input
            type="range"
            id="sldPreviewPhotoEnhancerStrength"
            min="0"
            max="100"
            step="1"
            value={preview.enhancerStrength}
            disabled={!preview.enhancerEnabled}
            oninput={(event) =>
              adapter.setEnhancerStrength(
                parseInt((event.currentTarget as HTMLInputElement).value, 10),
              )}
          />
        </div>
      </div>
      <div class="btn-row">
        <button
          class="btn primary"
          id="btnDownloadCapture"
          type="button"
          bind:this={downloadButton}
          onclick={() => adapter.download()}
        >
          {message(preview.downloadLabel)}
        </button>
        <button
          class="btn"
          id="btnDiscardCapture"
          type="button"
          onclick={() => adapter.discard()}
        >
          {m('Descartar')}
        </button>
      </div>
    </div>
  </div>
</div>
