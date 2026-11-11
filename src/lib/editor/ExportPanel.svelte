<script lang="ts">
  import { m } from '../i18n/text.svelte';
  import { editorState } from './editor-store';
</script>

<div class="section-title">{m('Exportación')}</div>
<div class="help-text">
  {m(
    'Se procesa localmente en resolución original. La preview no cambia la calidad final.',
  )}
</div>
<div class="video-export-summary mono" id="editorStableExportDetails"></div>
<div class="slider-label">
  <span>{m('Preset de exportación')}</span>
</div>
<div class="select-wrapper">
  <select id="editorExportPresetSelect">
    <option value="fast">{m('Rápido')}</option>
    <option value="balanced" selected>{m('Balanceado')}</option>
    <option value="high">{m('Alta calidad')}</option>
    <option value="chroma">{m('Chroma para composición')}</option>
    <option value="experimental-mp4">{m('Experimental MP4')}</option>
  </select>
</div>
<div class="spacer-8"></div>
<div class="slider-label"><span>{m('Salida del editor')}</span></div>
<div class="select-wrapper">
  <select id="videoExportModeSelect">
    <option value="full">{m('Video + efectos')}</option>
    <option value="effects-chroma">{m('Solo efectos chroma')}</option>
  </select>
</div>
<div class="spacer-8"></div>
<label class="checkbox-group">
  <input type="checkbox" id="chkExperimentalExportFeatures" />
  <span>{m('Mostrar opciones experimentales')}</span>
</label>
<div id="editorExperimentalExportGroup" class="hidden">
  <div class="spacer-8"></div>
  <div class="slider-label">
    <span>{m('Formato de exportación')}</span>
  </div>
  <div class="select-wrapper">
    <select id="editorExportFormatSelect">
      <option value="webm">WebM</option>
      <option value="auto">{m('Automático')}</option>
      <option value="mp4">{m('MP4 (Premiere, puede ser lento)')}</option>
    </select>
  </div>
  <div class="spacer-8"></div>
  <label class="checkbox-group">
    <input type="checkbox" id="chkEditorCopyAudio" />
    <span>{m('Copiar audio original si es compatible')}</span>
  </label>
</div>
<div class="spacer-8"></div>
<div id="effectsExportChromaGroup" class="hidden">
  <div class="slider-label"><span>{m('Chroma')}</span></div>
  <div class="select-wrapper">
    <select id="effectsExportChromaSelect">
      <option value="green">{m('Verde')}</option>
      <option value="blue">{m('Azul')}</option>
    </select>
  </div>
</div>
<div class="video-export-summary mono" id="videoExportDetails"></div>
<div class="video-export-diagnostics mono" id="videoExportDiagnostics"></div>
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
>
  <i class="fa-solid fa-download"></i>
  {m('Exportar video')}
</button>
