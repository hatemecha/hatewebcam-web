<script lang="ts">
  import { onMount } from 'svelte';
  import { exportModal } from '../capture/session-store';
  import type { ExportModalAdapter } from '../capture/types';
  import { trapModalFocus } from './focus-trap';

  let { adapter }: { adapter: ExportModalAdapter } = $props();

  const modal = $derived($exportModal);
  let dialog = $state<HTMLDivElement | null>(null);
  let cancelButton = $state<HTMLButtonElement | null>(null);
  let closeButton = $state<HTMLButtonElement | null>(null);
  let focusMode = $state('');

  onMount(() =>
    exportModal.subscribe((value) => {
      const next = value.open ? (value.showCancel ? 'cancel' : 'close') : '';
      if (next !== focusMode) focusMode = next;
    }),
  );

  $effect(() => {
    const node = dialog;
    const mode = focusMode;
    if (!node || !mode) return;
    const preferred = mode === 'cancel' ? cancelButton : closeButton;
    return trapModalFocus(node, preferred);
  });

  const title = $derived.by(() => {
    switch (modal.titleState) {
      case 'success':
        return 'Exportación terminada';
      case 'muted':
        return 'Exportación cancelada';
      case 'error':
        return 'Error de exportación';
      case 'running':
      case 'idle':
        return 'Exportando video';
      default: {
        const unreachable: never = modal.titleState;
        return unreachable;
      }
    }
  });
</script>

<div
  class="capture-preview-modal video-export-modal"
  class:hidden={!modal.open}
  id="videoExportModal"
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-labelledby="videoExportTitle"
  bind:this={dialog}
>
  <div class="video-export-card">
    <div
      class="section-title accent"
      id="videoExportTitle"
      data-state={modal.titleState}
    >
      {#if modal.titleState === 'success'}
        <i class="fa-solid fa-circle-check"></i>
      {:else if modal.titleState === 'muted'}
        <i class="fa-solid fa-ban"></i>
      {:else if modal.titleState === 'error'}
        <i class="fa-solid fa-triangle-exclamation"></i>
      {:else}
        <i class="fa-solid fa-file-export"></i>
      {/if}
      {title}
    </div>
    <div class="video-export-summary mono" id="videoExportSummary">
      {modal.summary}
    </div>
    <progress id="videoExportProgress" max="1" value={modal.progress}
    ></progress>
    <div class="video-export-debug mono" id="videoExportDebug">
      {modal.debug}
    </div>
    <div class="help-text" id="videoExportHelp">{modal.help}</div>
    <button
      type="button"
      class="btn danger"
      class:hidden={!modal.showCancel}
      id="btnCancelVideoExport"
      bind:this={cancelButton}
      onclick={() => adapter.cancel()}
    >
      Cancelar
    </button>
    <button
      type="button"
      class="btn primary"
      class:hidden={!modal.showClose}
      id="btnCloseVideoExportModal"
      bind:this={closeButton}
      onclick={() => adapter.close()}
    >
      Listo
    </button>
  </div>
</div>
