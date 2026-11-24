<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { editorState } from './editor-store';
  import type { ProjectActions } from './editor-state';

  let { projects }: { projects: ProjectActions } = $props();
  const settings = $derived($editorState.exportSettings);
  const effectsOnly = $derived(settings.editorExportMode === 'effects-chroma');
  const experimentalDisabled = $derived(
    !settings.experimentalExportFeatures ||
      effectsOnly ||
      $editorState.exporting,
  );
</script>

<div class="section-title">{m('Exportación')}</div>
<div class="help-text">
  {m(
    'Se procesa localmente en resolución original. La preview no cambia la calidad final.',
  )}
</div>
<div class="video-export-summary mono" id="editorStableExportDetails">
  {m(
    effectsOnly
      ? 'Estable: WebM · solo efectos chroma'
      : 'Estable: WebM · sin audio',
  )}
</div>
<div class="slider-label">
  <span>{m('Preset de exportación')}</span>
</div>
<div class="select-wrapper">
  <select
    id="editorExportPresetSelect"
    aria-label={m('Preset de exportación')}
    value={settings.editorExportPreset}
    disabled={$editorState.exporting}
    onchange={(event) =>
      projects.setExportSetting(
        'editorExportPreset',
        event.currentTarget.value,
      )}
  >
    <option value="fast">{m('Rápido')}</option>
    <option value="balanced">{m('Balanceado')}</option>
    <option value="high">{m('Alta calidad')}</option>
    <option value="chroma">{m('Chroma para composición')}</option>
    <option value="experimental-mp4">{m('Experimental MP4')}</option>
  </select>
</div>
<div class="spacer-8"></div>
<div class="slider-label"><span>{m('Salida del editor')}</span></div>
<div class="select-wrapper">
  <select
    id="videoExportModeSelect"
    aria-label={m('Salida del editor')}
    value={settings.editorExportMode}
    disabled={$editorState.exporting}
    onchange={(event) =>
      projects.setExportSetting('editorExportMode', event.currentTarget.value)}
  >
    <option value="full">{m('Video + efectos')}</option>
    <option value="effects-chroma">{m('Solo efectos chroma')}</option>
  </select>
</div>
<div class="spacer-8"></div>
<label class="checkbox-group">
  <input
    type="checkbox"
    id="chkExperimentalExportFeatures"
    checked={settings.experimentalExportFeatures}
    disabled={$editorState.exporting}
    onchange={(event) =>
      projects.setExportSetting(
        'experimentalExportFeatures',
        event.currentTarget.checked,
      )}
  />
  <span>{m('Mostrar opciones experimentales')}</span>
</label>
<div
  id="editorExperimentalExportGroup"
  class:hidden={!settings.experimentalExportFeatures}
>
  <div class="spacer-8"></div>
  <div class="slider-label">
    <span>{m('Formato de exportación')}</span>
  </div>
  <div class="select-wrapper">
    <select
      id="editorExportFormatSelect"
      aria-label={m('Formato de exportación')}
      value={settings.editorExportFormat}
      disabled={experimentalDisabled}
      onchange={(event) =>
        projects.setExportSetting(
          'editorExportFormat',
          event.currentTarget.value,
        )}
    >
      <option value="webm">WebM</option>
      <option value="auto">{m('Automático')}</option>
      <option value="mp4">{m('MP4 (Premiere, puede ser lento)')}</option>
    </select>
  </div>
  <div class="spacer-8"></div>
  <label class="checkbox-group">
    <input
      type="checkbox"
      id="chkEditorCopyAudio"
      checked={settings.editorCopyAudio}
      disabled={experimentalDisabled}
      onchange={(event) =>
        projects.setExportSetting(
          'editorCopyAudio',
          event.currentTarget.checked,
        )}
    />
    <span>{m('Copiar audio original si es compatible')}</span>
  </label>
</div>
<div class="spacer-8"></div>
<div id="effectsExportChromaGroup" class:hidden={!effectsOnly}>
  <div class="slider-label"><span>{m('Chroma')}</span></div>
  <div class="select-wrapper">
    <select
      id="effectsExportChromaSelect"
      aria-label={m('Chroma')}
      value={settings.effectsExportChroma}
      disabled={!effectsOnly || $editorState.exporting}
      onchange={(event) =>
        projects.setExportSetting(
          'effectsExportChroma',
          event.currentTarget.value,
        )}
    >
      <option value="green">{m('Verde')}</option>
      <option value="blue">{m('Azul')}</option>
    </select>
  </div>
</div>
<div class="video-export-summary mono" id="videoExportDetails">
  {$editorState.exportDetails ||
    m('Importá un video para habilitar la exportación.')}
</div>
<div class="video-export-diagnostics mono" id="videoExportDiagnostics">
  {$editorState.exportDiagnostics}
</div>
<p class="help-text video-export-nle-hint">
  {m(
    'Para Premiere o DaVinci Resolve: el preset Chroma exporta solo efectos sobre verde o azul para hacer key sobre tu master. Balanceado o Alta entregan el clip completo en WebM. Activá opciones experimentales para MP4 H.264 y copia de audio cuando el navegador lo permita',
  )}
</p>
<button
  type="button"
  class="btn primary"
  id="btnExportVideo"
  disabled={!$editorState.canExport || $editorState.exporting}
  onclick={() => projects.startExport()}
>
  <i class="fa-solid fa-download"></i>
  {m('Exportar video')}
</button>
