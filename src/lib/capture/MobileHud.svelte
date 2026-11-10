<script lang="ts">
  import { onMount } from 'svelte';
  import { PALETTE_COLORS } from '../webcam/panel-state';
  import { webcamPanel } from '../webcam/panel-store';
  import { captureChrome } from './session-store';
  import type { MobileHudAdapter } from './types';
  import type { DetectorKind } from '../webcam/types';

  let { adapter }: { adapter: MobileHudAdapter } = $props();

  const panel = $derived($webcamPanel);
  const chrome = $derived($captureChrome);
  let effectsOpen = $state(false);
  const presets = [
    { id: 'natural', label: 'Natural' },
    { id: 'vivid', label: 'Vivo' },
    { id: 'cinema', label: 'Cine' },
    { id: 'bw', label: 'B/N' },
  ] as const;

  onMount(() =>
    captureChrome.subscribe((value) => {
      if (value.mobileFxOpen !== effectsOpen) effectsOpen = value.mobileFxOpen;
    }),
  );

  $effect(() => {
    if (!effectsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') adapter.closeEffects();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function checkedValue(event: Event): boolean {
    return (event.currentTarget as HTMLInputElement).checked;
  }

  function numberValue(event: Event): number {
    return parseInt((event.currentTarget as HTMLSelectElement).value, 10);
  }

  function toggleDetector(type: DetectorKind, enabled: boolean) {
    adapter.toggleDetector(type, !enabled);
  }
</script>

{#snippet palette(
  color: string,
  label: string,
  inputId: string,
  choose: (_next: string) => void,
)}
  <div class="color-palette mobile-color-palette" aria-label={label}>
    {#each PALETTE_COLORS as swatch (swatch)}
      <button
        type="button"
        class="color-palette-swatch"
        class:is-selected={color.toLowerCase() === swatch}
        data-color={swatch}
        style:--swatch-color={swatch}
        aria-label={`Usar color ${swatch}`}
        aria-pressed={color.toLowerCase() === swatch}
        onclick={() => choose(swatch)}
      ></button>
    {/each}
    <button
      type="button"
      class="color-palette-custom"
      onclick={(event) => {
        const host = event.currentTarget.parentElement?.parentElement;
        host?.querySelector<HTMLInputElement>(`#${inputId}`)?.click();
      }}
    >
      Personalizado
    </button>
  </div>
{/snippet}

<div
  class="mobile-hud"
  id="mobileHud"
  aria-label="Controles rápidos para mobile"
>
  <div
    class="mobile-fx-backdrop"
    class:hidden={!effectsOpen}
    id="mobileFxBackdrop"
    role="button"
    tabindex="-1"
    aria-label="Cerrar panel de efectos"
    onclick={() => adapter.closeEffects()}
    onkeydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') adapter.closeEffects();
    }}
  ></div>
  <div class="mobile-fx-panel" class:hidden={!effectsOpen} id="mobileFxPanel">
    <div class="mobile-fx-header">
      <span>Ajustes</span>
      <button
        type="button"
        class="mobile-fx-close"
        id="btnMobileFxClose"
        aria-label="Cerrar panel de efectos"
        onclick={() => adapter.closeEffects()}
      >
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <span class="mobile-fx-group-title">Aspecto</span>
    <div class="mobile-preset-row">
      {#each presets as preset (preset.id)}
        <button
          type="button"
          class="mobile-preset-chip"
          class:is-active={panel.activePreset === preset.id}
          data-mobile-preset={preset.id}
          aria-pressed={panel.activePreset === preset.id}
          onclick={() => adapter.applyPreset(preset.id)}
        >
          {preset.label}
        </button>
      {/each}
    </div>
    <label class="mobile-inline-field">
      <span>Temporizador</span>
      <div class="select-wrapper mobile-select-wrapper">
        <select
          id="selMobileCaptureTimer"
          aria-label="Temporizador de foto"
          disabled={chrome.lockCaptureSettings}
          value={panel.image.captureTimerSeconds}
          onchange={(event) => adapter.setCaptureTimer(numberValue(event))}
        >
          <option value="0">Sin temporizador</option>
          <option value="5">5 segundos</option>
          <option value="10">10 segundos</option>
        </select>
      </div>
    </label>
    <span class="mobile-fx-group-title">Detectores</span>
    <div class="mobile-fx-grid">
      <button
        type="button"
        class="mobile-chip-btn"
        class:is-active={panel.detectors.blob}
        id="btnMobileBlobToggle"
        aria-pressed={panel.detectors.blob}
        disabled={chrome.lockDetectors}
        onclick={() => toggleDetector('blob', panel.detectors.blob)}
      >
        Color
      </button>
      <button
        type="button"
        class="mobile-chip-btn"
        class:is-active={panel.detectors.face}
        id="btnMobileFaceToggle"
        aria-pressed={panel.detectors.face}
        disabled={chrome.lockDetectors || panel.detectors.faceBusy}
        onclick={() => toggleDetector('face', panel.detectors.face)}
      >
        Caras
      </button>
      <button
        type="button"
        class="mobile-chip-btn"
        class:is-active={panel.detectors.blink}
        id="btnMobileBlinkToggle"
        aria-pressed={panel.detectors.blink}
        disabled={chrome.lockDetectors || panel.detectors.blinkBusy}
        onclick={() => toggleDetector('blink', panel.detectors.blink)}
      >
        Pestañeos
      </button>
      <button
        type="button"
        class="mobile-chip-btn"
        id="btnMobileColorPick"
        disabled={!chrome.blobEnabled ||
          !chrome.cameraRunning ||
          chrome.lockDetectors}
        onclick={() => adapter.pickColor()}
      >
        <i class="fa-solid fa-eyedropper"></i>
        <span>Elegir color</span>
      </button>
    </div>
    <label class="mobile-inline-field face-visual-toggles">
      <span>Caras</span>
      <div class="face-visual-toggle-row">
        <label class="checkbox-group">
          <input
            type="checkbox"
            id="chkMobileFaceShowBox"
            checked={panel.faceShowBox}
            onchange={(event) =>
              adapter.setFaceVisual('box', checkedValue(event))}
          />
          <span>Recuadro</span>
        </label>
        <label class="checkbox-group">
          <input
            type="checkbox"
            id="chkMobileFaceShowBlur"
            checked={panel.faceShowBlur}
            onchange={(event) =>
              adapter.setFaceVisual('blur', checkedValue(event))}
          />
          <span>Desenfoque</span>
        </label>
      </div>
    </label>
    <div class="mobile-color-row">
      <label class="mobile-color-chip">
        <span>Color</span>
        <input
          type="color"
          id="inpMobileBlobColor"
          value={panel.blobColor}
          aria-label="Color tracking objetos"
          disabled={!chrome.blobEnabled || chrome.lockDetectors}
          oninput={(event) =>
            adapter.setBlobColor(
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
      </label>
      {@render palette(
        panel.blobColor,
        'Paleta de objetos',
        'inpMobileBlobColor',
        (color) => adapter.setBlobColor(color),
      )}
      <label
        class="mobile-color-chip"
        class:hidden={!panel.showFaceBoxVisuals}
        id="mobileFaceColorChip"
      >
        <span>Cara</span>
        <input
          type="color"
          id="inpMobileFaceColor"
          value={panel.faceColor}
          aria-label="Color tracking caras"
          disabled={!chrome.faceEnabled || chrome.lockDetectors}
          oninput={(event) =>
            adapter.setFaceColor(
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
      </label>
      {@render palette(
        panel.faceColor,
        'Paleta de caras',
        'inpMobileFaceColor',
        (color) => adapter.setFaceColor(color),
      )}
    </div>
    <div
      class="mobile-face-label-wrap"
      class:hidden={!panel.showFaceBoxVisuals}
      id="mobileFaceLabelWrap"
    >
      <input
        type="text"
        id="inpMobileFaceLabel"
        class="mobile-text-input"
        maxlength="28"
        placeholder="Nombre recuadro cara"
        value={panel.faceLabel}
        disabled={!chrome.faceEnabled || chrome.lockDetectors}
        oninput={(event) =>
          adapter.setFaceLabel((event.currentTarget as HTMLInputElement).value)}
        onblur={(event) =>
          adapter.commitFaceLabel(
            (event.currentTarget as HTMLInputElement).value,
          )}
      />
    </div>
  </div>
  <div class="mobile-hud-bottom">
    <button
      type="button"
      class="mobile-dock-btn"
      class:is-active={effectsOpen}
      id="btnMobileEffectsDock"
      aria-controls="mobileFxPanel"
      aria-expanded={effectsOpen}
      disabled={chrome.previewOpen}
      onclick={() => adapter.toggleEffects()}
    >
      <i class="fa-solid fa-sliders"></i>
      <span>Ajustes</span>
    </button>
    <button
      type="button"
      class="mobile-dock-btn mobile-mirror-btn"
      class:is-active={panel.orientation.flipH}
      id="btnMobileMirror"
      aria-pressed={panel.orientation.flipH}
      title="Espejo en vista y captura"
      onclick={() => adapter.toggleMirror()}
    >
      <i class="fa-solid fa-arrows-left-right" aria-hidden="true"></i>
      <span>Espejo</span>
    </button>
    <button
      type="button"
      class="mobile-capture-btn"
      class:is-countdown={chrome.countdownActive}
      id="btnMobileTakePhoto"
      aria-label={chrome.countdownActive
        ? 'Cancelar temporizador de foto'
        : 'Sacar foto'}
      disabled={(!chrome.cameraRunning ||
        chrome.recording ||
        chrome.previewOpen) &&
        !chrome.countdownActive}
      onclick={() => adapter.takePhoto()}
    >
      {#if chrome.countdownActive}
        <i class="fa-solid fa-xmark"></i>
      {:else}
        <i class="fa-solid fa-camera"></i>
      {/if}
    </button>
    <button
      type="button"
      class="mobile-capture-btn record"
      class:is-recording={chrome.recording}
      id="btnMobileRecord"
      aria-label={chrome.recording ? 'Detener grabación' : 'Grabar video'}
      disabled={(!chrome.cameraRunning && !chrome.recording) ||
        chrome.previewOpen ||
        chrome.countdownActive}
      onclick={() => adapter.toggleRecording()}
    >
      {#if chrome.recording}
        <i class="fa-solid fa-stop"></i>
      {:else}
        <i class="fa-solid fa-circle-dot"></i>
      {/if}
    </button>
  </div>
</div>
