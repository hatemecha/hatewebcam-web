<script lang="ts">
  import { cameraSourceState } from './camera-source-store';
  import type { PerformanceMode } from './camera-source-bridge.mjs';
  import type { CameraSourceAdapter } from './types';

  let { adapter }: { adapter: CameraSourceAdapter } = $props();

  const performanceModes: { value: PerformanceMode; label: string }[] = [
    { value: 'auto', label: 'Automático' },
    { value: 'performance', label: 'Más fluido' },
    { value: 'normal', label: 'Balanceado' },
    { value: 'quality', label: 'Más detalle' },
  ];

  function handleDeviceChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    adapter.selectCamera(select.value);
  }

  function handlePerformanceChange(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    adapter.setPerformanceMode(select.value as PerformanceMode);
  }
</script>

<div class="panel-section webcam-only source-section" id="sourcePanel">
  <div class="section-title">Cámara</div>
  <button
    type="button"
    class={[
      'btn primary camera-toggle',
      { active: $cameraSourceState.running },
    ]}
    id="btnToggleCamera"
    onclick={() => adapter.toggleCamera()}
  >
    {#if $cameraSourceState.running}
      <span class="camera-live-label">
        <span class="camera-live-dot" aria-hidden="true"></span>Cámara activa
      </span>
      <span class="camera-off-action">Apagar</span>
    {:else}
      <i class="fa-solid fa-play"></i> Encender cámara
    {/if}
  </button>
  <div class="source-grid">
    <label class="control-field">
      <span>Dispositivo</span>
      <span class="select-wrapper">
        <select
          id="cameraSelect"
          title="Elegir dispositivo de cámara"
          value={$cameraSourceState.deviceId}
          disabled={$cameraSourceState.selectDisabled}
          onchange={handleDeviceChange}
        >
          {#if $cameraSourceState.devicesStatus === 'ready'}
            {#each $cameraSourceState.devices as device, index (`${device.id}:${index}`)}
              <option value={device.id}>{device.label}</option>
            {/each}
          {:else}
            <option value="">
              {$cameraSourceState.devicesStatus === 'empty'
                ? 'No se encontraron cámaras'
                : 'Cargando cámaras...'}
            </option>
          {/if}
        </select>
      </span>
    </label>
    <label class="control-field">
      <span>Rendimiento</span>
      <span class="select-wrapper">
        <select
          id="performanceModeSelect"
          title="Calidad y fluidez de la vista previa"
          value={$cameraSourceState.performanceMode}
          onchange={handlePerformanceChange}
        >
          {#each performanceModes as mode (mode.value)}
            <option value={mode.value}>{mode.label}</option>
          {/each}
        </select>
      </span>
    </label>
  </div>
  <p class="help-text source-help">
    Elegí la entrada y el equilibrio entre fluidez y detalle.
  </p>
  <button
    type="button"
    class={[
      'btn mirror-quick-btn',
      { 'is-active': $cameraSourceState.mirrored },
    ]}
    id="btnMirrorQuick"
    aria-pressed={$cameraSourceState.mirrored}
    title="Espejo horizontal en vista y captura"
    onclick={() => adapter.toggleMirror()}
  >
    <span class="mirror-quick-label">Espejo horizontal</span>
    <span class="mirror-quick-value" id="mirrorQuickValue">
      {$cameraSourceState.mirrored ? 'Activado' : 'Apagado'}
    </span>
  </button>
</div>
