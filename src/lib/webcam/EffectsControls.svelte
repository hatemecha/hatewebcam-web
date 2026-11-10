<script lang="ts">
  import { PALETTE_COLORS } from './panel-state';
  import { webcamPanel } from './panel-store';
  import type { WebcamControlsAdapter } from './types';

  let { adapter }: { adapter: WebcamControlsAdapter } = $props();

  const panel = $derived($webcamPanel);
  const videoMode = $derived(panel.sourceMode === 'video');
  const presets = [
    { id: 'natural', label: 'Natural' },
    { id: 'vivid', label: 'Vivo' },
    { id: 'cinema', label: 'Cine' },
    { id: 'bw', label: 'B/N' },
  ] as const;
  const contexts = [
    { id: 'look', label: 'Video / Look' },
    { id: 'blob', label: 'Color' },
    { id: 'face', label: 'Caras' },
    { id: 'blink', label: 'Ojos' },
  ] as const;

  function numberValue(event: Event) {
    return parseInt((event.currentTarget as HTMLInputElement).value, 10);
  }

  function checkedValue(event: Event) {
    return (event.currentTarget as HTMLInputElement).checked;
  }

  type PaletteAction = (_value: string) => void;
</script>

{#snippet palette(color: string, label: string, choose: PaletteAction)}
  <div class="color-palette" aria-label={label}>
    {#each PALETTE_COLORS as swatch (swatch)}
      <button
        type="button"
        class={[
          'color-palette-swatch',
          { 'is-selected': color.toLowerCase() === swatch },
        ]}
        data-color={swatch}
        style:--swatch-color={swatch}
        aria-label={`Usar color ${swatch}`}
        aria-pressed={color.toLowerCase() === swatch}
        onclick={() => choose(swatch)}
      ></button>
    {/each}
    <button
      type="button"
      class={[
        'color-palette-custom',
        {
          'is-selected': !PALETTE_COLORS.some(
            (swatch) => swatch === color.toLowerCase(),
          ),
        },
      ]}
      onclick={(event) => {
        const host = event.currentTarget.parentElement;
        const input = host?.parentElement?.querySelector('input[type="color"]');
        if (input instanceof HTMLInputElement) input.click();
      }}>Personalizado</button
    >
  </div>
{/snippet}

{#snippet slider(
  id: string,
  valueId: string,
  label: string,
  min: number,
  max: number,
  value: number,
  display: string,
  key: string,
  disabled = false,
)}
  <div class="slider-group">
    <div class="slider-label">
      <span>{label}</span><span class="value" id={valueId}>{display}</span>
    </div>
    <input
      type="range"
      {id}
      {min}
      {max}
      step="1"
      {value}
      {disabled}
      oninput={(event) => adapter.setImageNumber(key, numberValue(event))}
    />
  </div>
{/snippet}

<div
  class={[
    'panel-section',
    'adjust-context-nav',
    'video-only',
    { hidden: !videoMode },
  ]}
  id="adjustContextNav"
  aria-label="Ajustes por pista"
>
  <div class="adjust-context-tabs" role="tablist" aria-label="Tipo de ajustes">
    {#each contexts as context (context.id)}
      <button
        type="button"
        class={[
          'adjust-context-tab',
          { 'is-active': panel.adjustContext === context.id },
        ]}
        role="tab"
        data-adjust-context={context.id}
        aria-selected={panel.adjustContext === context.id}
        onclick={() => adapter.openAdjustContext(context.id)}
      >
        {context.label}
      </button>
    {/each}
  </div>
  <div class="help-text" id="adjustContextHelp">{panel.adjustHelp}</div>
  <div
    class={[
      'adjust-clip-status',
      'mono',
      'video-only',
      { hidden: !videoMode || !panel.adjustClipVisible },
    ]}
    id="adjustClipStatus"
  >
    {panel.adjustClipStatus}
  </div>
</div>

<div
  class={[
    'panel-section',
    'appearance-section',
    'adjust-context-group',
    { 'is-active': !panel.contextual || panel.adjustContext === 'look' },
  ]}
  data-adjust-context="look"
>
  <div class="section-title">
    <i class="fa-solid fa-circle-half-stroke"></i> Aspecto
  </div>
  <div
    class={[
      'help-text',
      'adjust-video-help',
      'video-only',
      { hidden: !videoMode },
    ]}
  >
    Presets y filtros del clip LOOK seleccionado. Previsualizá moviendo el
    cursor dentro de su tramo.
  </div>
  <div class="preset-grid">
    {#each presets as preset (preset.id)}
      <button
        type="button"
        class={[
          'btn',
          'preset-btn',
          { 'is-active': panel.activePreset === preset.id },
        ]}
        data-preset={preset.id}
        aria-pressed={panel.activePreset === preset.id}
        onclick={() => adapter.applyPreset(preset.id)}
      >
        {preset.label}
      </button>
    {/each}
  </div>
</div>

<div class="panel-section detectors-section">
  <div class="section-title detectors-section-title">Detectores</div>
  <div
    class={[
      'detector-unit',
      'adjust-context-group',
      { 'is-active': !panel.contextual || panel.adjustContext === 'blob' },
    ]}
    data-adjust-context="blob"
  >
    <div
      class={[
        'help-text',
        'adjust-video-help',
        'video-only',
        { hidden: !videoMode },
      ]}
    >
      Configurá el tracking de color del clip. El detector se enciende solo
      dentro de su tramo en la timeline.
    </div>
    <div class="quick-detector">
      <div class="quick-detector-row adjust-detector-toggle">
        <label class="checkbox-group">
          <input
            type="checkbox"
            id="chkBlobTracking"
            checked={panel.detectors.blob}
            onchange={(event) =>
              adapter.toggleDetector('blob', checkedValue(event))}
          />
          <span>Color</span>
        </label>
      </div>
      <span class="detector-desc">Sigue un color puntual en la escena.</span>
      <div
        class={['quick-detector-extra', { hidden: !panel.showBlobExtras }]}
        id="colorPickSection"
      >
        <div class="quick-action-copy"><strong>Color a seguir</strong></div>
        <button
          type="button"
          class="btn primary"
          id="btnColorPick"
          onclick={() => adapter.pickColor()}
        >
          <i class="fa-solid fa-eyedropper"></i> Elegir color en el video
        </button>
        <div class="quick-chip-label">Color del recuadro</div>
        <input
          class="visually-hidden"
          type="color"
          id="inpBlobQuickColor"
          value={panel.blobColor}
          aria-label="Color visual del recuadro"
          oninput={(event) =>
            adapter.setBlobColor(
              (event.currentTarget as HTMLInputElement).value,
            )}
        />
        {@render palette(
          panel.blobColor,
          'Paleta para el recuadro de color',
          (color) => adapter.setBlobColor(color),
        )}
        <div
          class="status-msg hidden"
          id="colorPickStatus"
          role="status"
          aria-live="polite"
        ></div>
      </div>
    </div>
  </div>

  <div
    class={[
      'detector-unit',
      'adjust-context-group',
      { 'is-active': !panel.contextual || panel.adjustContext === 'face' },
    ]}
    data-adjust-context="face"
  >
    <div
      class={[
        'help-text',
        'adjust-video-help',
        'video-only',
        { hidden: !videoMode },
      ]}
    >
      Personalizá recuadro, blur y etiqueta del clip CARAS. La detección se
      activa sola cuando el cursor entra en su tramo.
    </div>
    <div class="quick-detector">
      <div class="quick-detector-row adjust-detector-toggle">
        <label class="checkbox-group">
          <input
            type="checkbox"
            id="chkFaceDetection"
            checked={panel.detectors.face}
            disabled={panel.detectors.faceBusy}
            onchange={(event) =>
              adapter.toggleDetector('face', checkedValue(event))}
          />
          <span>Caras</span>
        </label>
      </div>
      <span class="detector-desc"
        >Detecta rostros y permite recuadro o blur.</span
      >
      <div
        class={['quick-detector-extra', { hidden: !panel.showFaceExtras }]}
        id="faceQuickControls"
      >
        <div class="face-visual-toggles">
          <label class="checkbox-group">
            <input
              type="checkbox"
              id="chkFaceShowBox"
              checked={panel.faceShowBox}
              onchange={(event) =>
                adapter.setFaceVisual('box', checkedValue(event))}
            />
            <span>Recuadro</span>
          </label>
          <label class="checkbox-group">
            <input
              type="checkbox"
              id="chkFaceShowBlur"
              checked={panel.faceShowBlur}
              onchange={(event) =>
                adapter.setFaceVisual('blur', checkedValue(event))}
            />
            <span>Desenfoque / pixelado</span>
          </label>
        </div>
        <div
          class={['face-color-row', { hidden: !panel.showFaceBoxVisuals }]}
          id="faceQuickColorChip"
        >
          <span class="quick-chip-label">Color del recuadro</span>
          {@render palette(
            panel.faceColor,
            'Paleta para el recuadro de caras',
            (color) => adapter.setFaceColor(color),
          )}
          <label class="visually-hidden">
            <span class="quick-chip-label">Recuadro</span>
            <input
              type="color"
              id="inpFaceQuickColor"
              value={panel.faceColor}
              aria-label="Color del recuadro de caras"
              oninput={(event) =>
                adapter.setFaceColor(
                  (event.currentTarget as HTMLInputElement).value,
                )}
            />
          </label>
        </div>
        <label
          class={['quick-text-field', { hidden: !panel.showFaceBoxVisuals }]}
          id="faceQuickLabelWrap"
        >
          <span class="quick-chip-label">Etiqueta</span>
          <input
            type="text"
            id="inpFaceQuickLabel"
            class="text-input compact-text-input"
            maxlength="28"
            placeholder="Texto del recuadro"
            value={panel.faceLabel}
            disabled={!panel.showFaceBoxVisuals}
            oninput={(event) =>
              adapter.setFaceLabel(
                (event.currentTarget as HTMLInputElement).value,
              )}
            onblur={(event) =>
              adapter.commitFaceLabel(
                (event.currentTarget as HTMLInputElement).value,
              )}
          />
        </label>
      </div>
    </div>
  </div>

  <div
    class={[
      'detector-unit',
      'adjust-context-group',
      { 'is-active': !panel.contextual || panel.adjustContext === 'blink' },
    ]}
    data-adjust-context="blink"
  >
    <div
      class={[
        'help-text',
        'adjust-video-help',
        'video-only',
        { hidden: !videoMode },
      ]}
    >
      Ajustá el detector del clip OJOS. Se activa solo dentro de su tramo en la
      timeline.
    </div>
    <div class="quick-detector">
      <div class="quick-detector-row adjust-detector-toggle">
        <label class="checkbox-group">
          <input
            type="checkbox"
            id="chkBlinkDetection"
            checked={panel.detectors.blink}
            disabled={panel.detectors.blinkBusy}
            onchange={(event) =>
              adapter.toggleDetector('blink', checkedValue(event))}
          />
          <span>Pestañeos</span>
        </label>
      </div>
      <span class="detector-desc">Reacciona cuando se cierran los ojos.</span>
    </div>
  </div>
</div>

<div class="panel-section adjust-advanced-toggle">
  <button
    class={['btn', 'toggle-btn', { 'is-open': panel.advancedOpen }]}
    id="btnToggleAdvancedOptions"
    type="button"
    aria-expanded={panel.advancedOpen}
    aria-controls="advancedOptions"
    onclick={() => adapter.toggleAdvanced()}
  >
    <span class="toggle-btn-leading">
      <i class="fa-solid fa-sliders"></i>
      <span class="toggle-copy">
        <span id="advancedToggleLabel">
          {panel.advancedOpen
            ? 'Ocultar ajustes avanzados'
            : 'Ajustes avanzados'}
        </span>
        <small>Calidad, imagen, perfiles y diagnóstico.</small>
      </span>
    </span>
    <i class="fa-solid fa-chevron-down toggle-chevron"></i>
  </button>
</div>

<div
  id="advancedOptions"
  class={['advanced-options', { hidden: !panel.advancedOpen }]}
>
  <div class={['panel-section', 'adjust-webcam-only', { hidden: videoMode }]}>
    <div class="section-title">
      <i class="fa-solid fa-film"></i> Calidad de salida
    </div>
    <div class="help-text photo-only">
      Las fotos se descargan en JPEG. La grabación de cámara intenta MP4 y, si
      no está disponible, usa WebM.
    </div>
    <div class={['help-text', 'video-only', { hidden: !videoMode }]}>
      La exportación del editor se configura en Proyecto → Exportación.
    </div>
    {@render slider(
      'sldJpegQuality',
      'valJpegQuality',
      'Calidad foto JPEG',
      60,
      100,
      panel.image.jpegQuality,
      `${panel.image.jpegQuality}%`,
      'jpegQuality',
    )}
    <div class="slider-label photo-only"><span>Formato de grabación</span></div>
    <div class="select-wrapper photo-only">
      <select
        id="videoFormatSelect"
        value={panel.image.videoFormat}
        onchange={(event) =>
          adapter.setVideoFormat(
            (event.currentTarget as HTMLSelectElement).value,
          )}
      >
        <option value="auto">Automático (MP4 preferido)</option>
        <option value="mp4">MP4 (si el navegador lo soporta)</option>
        <option value="webm">WebM</option>
      </select>
    </div>
    <div class="spacer-8"></div>
    <label class="checkbox-group">
      <input
        type="checkbox"
        id="chkQualityEnhancer"
        checked={panel.image.qualityEnhancer}
        onchange={(event) => adapter.setQualityEnhancer(checkedValue(event))}
      />
      <span>Mejorador de calidad opcional</span>
    </label>
    <label class="checkbox-group photo-only">
      <input
        type="checkbox"
        id="chkShutterSound"
        checked={panel.image.shutterSound}
        onchange={(event) => adapter.setShutterSound(checkedValue(event))}
      />
      <span>Sonido de obturador</span>
    </label>
    <div
      class={['slider-group', { hidden: !panel.image.qualityEnhancer }]}
      id="qualityEnhancerStrengthGroup"
    >
      {@render slider(
        'sldQualityEnhancerStrength',
        'valQualityEnhancerStrength',
        'Intensidad del mejorador',
        0,
        100,
        panel.image.qualityEnhancerStrength,
        `${panel.image.qualityEnhancerStrength}%`,
        'qualityEnhancerStrength',
        !panel.image.qualityEnhancer,
      )}
    </div>
    <div class="help-text section-note photo-only">
      Aplica limpieza y nitidez extra al archivo final.
    </div>
    <div
      class={[
        'help-text',
        'section-note',
        'video-only',
        { hidden: !videoMode },
      ]}
    >
      Aplica limpieza y nitidez extra al video exportado.
    </div>
  </div>

  <div
    class={[
      'panel-section',
      'adjust-context-group',
      { 'is-active': !panel.contextual || panel.adjustContext === 'look' },
    ]}
    data-adjust-context="look"
  >
    <div class="section-title"><i class="fa-solid fa-image"></i> Imagen</div>
    <div class={['help-text', 'webcam-only', { hidden: videoMode }]}>
      Ajustá orientación y encuadre de la cámara.
    </div>
    <div class={['help-text', 'video-only', { hidden: !videoMode }]}>
      Ajustá orientación y encuadre del video.
    </div>
    <label class="checkbox-group">
      <input
        type="checkbox"
        id="chkMirror"
        checked={panel.orientation.flipH}
        onchange={(event) => adapter.setFlipH(checkedValue(event))}
      />
      <span>Espejo (invertir horizontalmente)</span>
    </label>
    <label class="checkbox-group">
      <input
        type="checkbox"
        id="chkFlipV"
        checked={panel.orientation.flipV}
        onchange={(event) => adapter.setFlipV(checkedValue(event))}
      />
      <span>Invertir verticalmente</span>
    </label>
    <div class="spacer-6"></div>
    <div class="slider-label"><span>Rotación</span></div>
    <div class="select-wrapper">
      <select
        id="rotationSelect"
        value={String(panel.orientation.rotation)}
        onchange={(event) =>
          adapter.setRotation(
            Number((event.currentTarget as HTMLSelectElement).value),
          )}
      >
        <option value="0">Sin rotación</option>
        <option value="90">90° (girar derecha)</option>
        <option value="180">180° (invertir)</option>
        <option value="270">270° (girar izquierda)</option>
      </select>
    </div>
  </div>

  <div
    class={[
      'panel-section',
      'adjust-context-group',
      { 'is-active': !panel.contextual || panel.adjustContext === 'look' },
    ]}
    data-adjust-context="look"
  >
    <div class="section-title accent">
      <i class="fa-solid fa-screwdriver-wrench"></i> Ajuste fino
    </div>
    <div class={['help-text', 'webcam-only', { hidden: videoMode }]}>
      Personalizá el look en tiempo real. También aplica a foto y grabación.
    </div>
    <div class={['help-text', 'video-only', { hidden: !videoMode }]}>
      Personalizá el look que se aplica a la preview y a la exportación.
    </div>
    <label class="checkbox-group monochrome-toggle">
      <input
        type="checkbox"
        id="chkBlackWhite"
        checked={panel.image.blackAndWhite}
        onchange={(event) => adapter.setBlackAndWhite(checkedValue(event))}
      />
      <span>Monocromo</span>
    </label>
    {@render slider(
      'sldExposure',
      'valExposure',
      'Exposición',
      -100,
      100,
      panel.image.exposure,
      String(panel.image.exposure),
      'exposure',
    )}
    {@render slider(
      'sldShadows',
      'valShadows',
      'Sombras',
      -100,
      100,
      panel.image.shadows,
      String(panel.image.shadows),
      'shadows',
    )}
    {@render slider(
      'sldHighlights',
      'valHighlights',
      'Luces altas',
      -100,
      100,
      panel.image.highlights,
      String(panel.image.highlights),
      'highlights',
    )}
    {@render slider(
      'sldContrast',
      'valContrast',
      'Contraste',
      50,
      180,
      panel.image.contrast,
      `${panel.image.contrast}%`,
      'contrast',
    )}
    {@render slider(
      'sldSaturation',
      'valSaturation',
      'Saturación',
      0,
      200,
      panel.image.saturation,
      panel.image.blackAndWhite ? 'B/N' : `${panel.image.saturation}%`,
      'saturation',
      panel.image.blackAndWhite,
    )}
    {@render slider(
      'sldTemperature',
      'valTemperature',
      'Temperatura',
      -100,
      100,
      panel.image.temperature,
      panel.image.blackAndWhite ? 'B/N' : String(panel.image.temperature),
      'temperature',
      panel.image.blackAndWhite,
    )}
    {@render slider(
      'sldDetail',
      'valDetail',
      'Detalle',
      -100,
      100,
      panel.image.detail,
      String(panel.image.detail),
      'detail',
    )}
    {@render slider(
      'sldSharpness',
      'valSharpness',
      'Nitidez',
      0,
      100,
      panel.image.sharpness,
      String(panel.image.sharpness),
      'sharpness',
    )}
    <button
      type="button"
      class="btn"
      id="btnResetImageAdjustments"
      onclick={() => adapter.resetImage()}
    >
      <i class="fa-solid fa-rotate-left"></i> Restablecer ajustes de imagen
    </button>
  </div>

  <div
    id="effectConfigBlob"
    class={[
      'adjust-context-group',
      { 'is-active': !panel.contextual || panel.adjustContext === 'blob' },
    ]}
    data-adjust-context="blob"
  ></div>
  <div
    id="effectConfigFace"
    class={[
      'adjust-context-group',
      { 'is-active': !panel.contextual || panel.adjustContext === 'face' },
    ]}
    data-adjust-context="face"
  ></div>
  <div
    id="effectConfigBlink"
    class={[
      'adjust-context-group',
      { 'is-active': !panel.contextual || panel.adjustContext === 'blink' },
    ]}
    data-adjust-context="blink"
  ></div>

  <div class={['panel-section', 'adjust-webcam-only', { hidden: videoMode }]}>
    <div class="section-title">
      <i class="fa-solid fa-bookmark"></i> Ajustes guardados
    </div>
    <div class="help-text">
      Guardá detectores, transforms y ajustes de imagen para reutilizarlos
      rápido.
    </div>
    <div class="profile-row">
      <div class="select-wrapper flex-1">
        <select
          id="profileSelect"
          value={panel.selectedProfile}
          onchange={(event) =>
            adapter.selectProfile(
              (event.currentTarget as HTMLSelectElement).value,
            )}
        >
          <option value="">-</option>
          {#each panel.profiles as name (name)}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </div>
      <button
        type="button"
        class="btn btn-icon"
        id="btnSaveProfile"
        title="Guardar configuración actual"
        onclick={() => adapter.saveProfile()}
      >
        <i class="fa-solid fa-floppy-disk"></i>
      </button>
      <button
        type="button"
        class="btn btn-icon danger"
        id="btnDeleteProfile"
        title="Eliminar"
        onclick={() => adapter.deleteProfile()}
      >
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
    <div
      class="status-msg hidden"
      id="profileStatus"
      role="status"
      aria-live="polite"
    ></div>
    <button
      type="button"
      class="btn danger-outline"
      id="btnDeleteAllProfiles"
      onclick={() => adapter.deleteAllProfiles()}
    >
      <i class="fa-solid fa-trash-can" aria-hidden="true"></i> Eliminar todos los
      perfiles guardados
    </button>
  </div>

  <div
    class={[
      'panel-section',
      'adjust-webcam-only',
      'webcam-diagnostics',
      { hidden: videoMode },
    ]}
  >
    <div class="section-title">
      <i class="fa-solid fa-gauge-high"></i> Diagnóstico
    </div>
    <div class="diagnostic-row">
      <span>Calidad efectiva de preview</span>
      <strong id="previewQualityDiagnostic">{panel.previewQualityLabel}</strong>
    </div>
    <button
      type="button"
      class="btn danger-outline"
      id="btnResetWebcamConfig"
      onclick={() => adapter.resetWebcam()}
    >
      <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Restablecer configuración
      de webcam
    </button>
  </div>
</div>
