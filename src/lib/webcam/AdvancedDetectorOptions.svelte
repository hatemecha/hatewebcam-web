<script lang="ts">
  import type { MessageKey } from '../i18n/catalog.ts';
  import { isMessageKey } from '../i18n/translate.ts';
  import { m } from '../i18n/text.svelte.ts';
  import { colorPickFeedback } from './color-pick-feedback.ts';
  import type { WebcamPanelState } from './panel-state.ts';
  import type { FaceVisualKind, WebcamControlsAdapter } from './types.ts';

  let {
    options,
    adapter,
    contextual,
    context,
  }: {
    options: WebcamPanelState['detectorOptions'];
    adapter: WebcamControlsAdapter;
    contextual: boolean;
    context: string;
  } = $props();

  let hsvOpen = $state(false);
  const modes = [
    ['manual', 'Un color específico'],
    ['lights', 'Zonas de mucha luz'],
    ['shadows', 'Zonas oscuras / sombras'],
  ] as const;

  function replaceChannel(channels: number[], index: number, value: number) {
    return channels.map((channel, current) =>
      current === index ? value : channel,
    );
  }

  function guardFaceVisual(
    kind: FaceVisualKind,
    event: MouseEvent,
    checked: boolean,
  ) {
    const { face } = options;
    if (!checked && face && (kind === 'box' ? !face.showBlur : !face.showBox)) {
      event.preventDefault();
    }
  }
</script>

{#snippet slider(
  id: string,
  valueId: string,
  label: MessageKey,
  value: number,
  min: number,
  max: number,
  update: (_value: number) => void,
  step: number,
)}
  <div class="slider-group">
    <div class="slider-label">
      <span>{m(label)}</span>
      <span class="value" id={valueId}
        >{Number.isInteger(value) ? value : value.toFixed(2)}</span
      >
    </div>
    <input
      type="range"
      {id}
      {min}
      {max}
      {step}
      {value}
      aria-label={m(label)}
      oninput={(event) => update(event.currentTarget.valueAsNumber)}
    />
  </div>
{/snippet}

<div
  id="effectConfigBlob"
  class={[
    'adjust-context-group',
    { 'is-active': !contextual || context === 'blob' },
  ]}
  data-adjust-context="blob"
>
  {#if options.blob}
    {@const blob = options.blob}
    <div class="panel-section fade-in">
      <div class="section-title accent">
        {m('Detector de objetos por color')}
      </div>
      <div class="effect-config">
        <div class="config-block">
          <div class="config-block-title">{m('¿Qué detectar?')}</div>
          <div class="help-text">
            {m(
              'Elegí si querés buscar un color específico, zonas de mucha luz o zonas oscuras.',
            )}
          </div>
          <div class="radio-group">
            {#each modes as [mode, label] (mode)}
              <label
                class={[
                  'radio-option',
                  { selected: blob.detectionMode === mode },
                ]}
              >
                <input
                  type="radio"
                  name="detMode"
                  value={mode}
                  checked={blob.detectionMode === mode}
                  onchange={() =>
                    adapter.setDetectorOptions('blob', { detectionMode: mode })}
                />
                <span>{m(label)}</span>
              </label>
            {/each}
          </div>
        </div>

        <div
          class={['config-block', { hidden: blob.detectionMode !== 'manual' }]}
          id="cfgColorBlock"
        >
          <div class="config-block-title">{m('Color objetivo')}</div>
          <div class="target-color-control">
            <label class="color-picker-btn target-color-picker">
              <span
                class="color-swatch"
                id="targetColorSwatch"
                style:background={blob.targetColor}
              ></span>
              <span class="target-color-copy">
                <strong>{m('Color a detectar')}</strong>
                <small id="targetColorValue"
                  >{blob.targetColor.toUpperCase()}</small
                >
              </span>
              <input
                type="color"
                id="inpTargetColor"
                value={blob.targetColor}
                aria-label={m('Color a detectar')}
                oninput={(event) =>
                  adapter.setTargetColor(event.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              class="btn target-color-eyedropper"
              id="btnPickTargetColor"
              onclick={() => adapter.pickColor('advanced')}
            >
              <i class="fa-solid fa-eye-dropper" aria-hidden="true"></i>
              {m('Elegir en el video')}
            </button>
          </div>
          <div
            class={[
              'status-msg',
              $colorPickFeedback.advanced?.type ?? 'hidden',
            ]}
            id="cfgTargetColorStatus"
            role="status"
            aria-live="polite"
          >
            {#if $colorPickFeedback.advanced && isMessageKey($colorPickFeedback.advanced.message)}
              {m($colorPickFeedback.advanced.message)}
            {/if}
          </div>
          <div class="config-subsection-title">{m('Sensibilidad')}</div>
          <div class="help-text">
            {m(
              'Si la detección es demasiado estricta, subí este valor. Si detecta demasiado, bajalo.',
            )}
          </div>
          {@render slider(
            'sldTolerance',
            'valTolerance',
            'Tolerancia',
            blob.tolerance,
            10,
            100,
            (value) => adapter.setDetectorOptions('blob', { tolerance: value }),
            1,
          )}

          <button
            type="button"
            class="btn config-advanced-toggle"
            id="btnAdvancedHsv"
            aria-expanded={hsvOpen}
            aria-controls="hsvAdvanced"
            onclick={() => (hsvOpen = !hsvOpen)}
            >{m('Ajustes avanzados (HSV manual)')}</button
          >
          <div
            id="hsvAdvanced"
            class={['config-advanced-panel', { hidden: !hsvOpen }]}
          >
            <div class="help-text">
              {m(
                'Estos controles permiten ajustar el rango de color manualmente usando el modelo HSV (Tono, Saturación, Brillo).',
              )}
            </div>
            {@render slider(
              'sldHMin',
              'valHMin',
              'Tono mínimo (H)',
              blob.hsvMin[0],
              0,
              180,
              (value) =>
                adapter.setDetectorOptions('blob', {
                  hsvMin: replaceChannel(blob.hsvMin, 0, value),
                }),
              1,
            )}
            {@render slider(
              'sldSMin',
              'valSMin',
              'Saturación mín. (S)',
              blob.hsvMin[1],
              0,
              255,
              (value) =>
                adapter.setDetectorOptions('blob', {
                  hsvMin: replaceChannel(blob.hsvMin, 1, value),
                }),
              1,
            )}
            {@render slider(
              'sldVMin',
              'valVMin',
              'Brillo mínimo (V)',
              blob.hsvMin[2],
              0,
              255,
              (value) =>
                adapter.setDetectorOptions('blob', {
                  hsvMin: replaceChannel(blob.hsvMin, 2, value),
                }),
              1,
            )}
            {@render slider(
              'sldHMax',
              'valHMax',
              'Tono máximo (H)',
              blob.hsvMax[0],
              0,
              180,
              (value) =>
                adapter.setDetectorOptions('blob', {
                  hsvMax: replaceChannel(blob.hsvMax, 0, value),
                }),
              1,
            )}
            {@render slider(
              'sldSMax',
              'valSMax',
              'Saturación máx. (S)',
              blob.hsvMax[1],
              0,
              255,
              (value) =>
                adapter.setDetectorOptions('blob', {
                  hsvMax: replaceChannel(blob.hsvMax, 1, value),
                }),
              1,
            )}
            {@render slider(
              'sldVMax',
              'valVMax',
              'Brillo máx. (V)',
              blob.hsvMax[2],
              0,
              255,
              (value) =>
                adapter.setDetectorOptions('blob', {
                  hsvMax: replaceChannel(blob.hsvMax, 2, value),
                }),
              1,
            )}
          </div>
        </div>

        <div class="config-block">
          <div class="config-block-title">{m('Cantidad y tamaño')}</div>
          <div class="help-text">
            {m(
              'Limitá cuántos objetos detectar y qué tan grandes deben ser para ser considerados.',
            )}
          </div>
          {@render slider(
            'sldMaxObj',
            'valMaxObj',
            'Máximo de objetos',
            blob.maxObjects,
            1,
            50,
            (value) =>
              adapter.setDetectorOptions('blob', { maxObjects: value }),
            1,
          )}
          {@render slider(
            'sldMinArea',
            'valMinArea',
            'Tamaño mínimo (píxeles)',
            blob.minArea,
            0,
            5000,
            (value) => adapter.setDetectorOptions('blob', { minArea: value }),
            10,
          )}
        </div>

        <div class="config-block">
          <div class="config-block-title">{m('Limpieza de imagen')}</div>
          <div class="help-text">
            {m(
              'Si aparecen detecciones falsas o ruido, subí este valor para limpiar la imagen.',
            )}
          </div>
          {@render slider(
            'sldErode',
            'valErode',
            'Nivel de limpieza',
            blob.erodeIterations,
            0,
            5,
            (value) =>
              adapter.setDetectorOptions('blob', { erodeIterations: value }),
            1,
          )}
        </div>

        <div class="config-block">
          <div class="config-block-title">{m('Respuesta')}</div>
          <div class="help-text">
            {m(
              'Bajá la resolución de análisis si notás retraso. Subirla da más precisión, pero consume más CPU.',
            )}
          </div>
          {@render slider(
            'sldBlobProcessScale',
            'valBlobProcessScale',
            'Resolución de análisis (%)',
            Math.round(blob.processScale * 100),
            25,
            100,
            (value) =>
              adapter.setDetectorOptions('blob', { processScale: value / 100 }),
            1,
          )}
        </div>

        <div class="config-block">
          <div class="config-block-title">{m('Aspecto visual')}</div>
          <label class="color-picker-btn" style="position:relative">
            <div
              class="color-swatch"
              id="boxColorSwatch"
              style:background={blob.boxColor}
            ></div>
            <span>{m('Color del recuadro')}</span>
            <input
              type="color"
              id="inpBoxColor"
              value={blob.boxColor}
              oninput={(event) =>
                adapter.setBlobColor(event.currentTarget.value)}
            />
          </label>
          <div style="height:6px"></div>
          <label class="checkbox-group"
            ><input
              type="checkbox"
              id="chkShowCoords"
              checked={blob.showCoordinates}
              onchange={(event) =>
                adapter.setDetectorOptions('blob', {
                  showCoordinates: event.currentTarget.checked,
                })}
            /><span>{m('Mostrar posición (X, Y)')}</span></label
          >
          <label class="checkbox-group"
            ><input
              type="checkbox"
              id="chkShowCentroid"
              checked={blob.showCentroid}
              onchange={(event) =>
                adapter.setDetectorOptions('blob', {
                  showCentroid: event.currentTarget.checked,
                })}
            /><span>{m('Mostrar punto central')}</span></label
          >
          {@render slider(
            'sldBlobLabelSize',
            'valBlobLabelSize',
            'Tamaño del texto',
            blob.labelSize,
            8,
            32,
            (value) => adapter.setDetectorOptions('blob', { labelSize: value }),
            1,
          )}
          {@render slider(
            'sldThickness',
            'valThickness',
            'Grosor del recuadro',
            blob.boxThickness,
            1,
            8,
            (value) =>
              adapter.setDetectorOptions('blob', { boxThickness: value }),
            1,
          )}
        </div>
      </div>
    </div>
  {/if}
</div>

<div
  id="effectConfigFace"
  class={[
    'adjust-context-group',
    { 'is-active': !contextual || context === 'face' },
  ]}
  data-adjust-context="face"
>
  {#if options.face}
    {@const face = options.face}
    <div class="panel-section fade-in">
      <div class="section-title accent">{m('Detector de caras')}</div>
      <div class="effect-config">
        <div class="config-block">
          <div class="config-block-title">{m('Configuración')}</div>
          <div class="help-text">
            {m(
              'Activá recuadro, blur/pixelado o ambos a la vez sobre cada cara detectada.',
            )}
          </div>
          {@render slider(
            'sldMaxFaces',
            'valMaxFaces',
            'Máximo de caras a detectar',
            face.maxFaces,
            1,
            5,
            (value) => adapter.setDetectorOptions('face', { maxFaces: value }),
            1,
          )}
          <div class="face-visual-toggles">
            <label class="checkbox-group"
              ><input
                type="checkbox"
                id="chkAdvFaceShowBox"
                checked={face.showBox}
                onclick={(event) =>
                  guardFaceVisual('box', event, event.currentTarget.checked)}
                onchange={(event) =>
                  adapter.setFaceVisual('box', event.currentTarget.checked)}
              /><span>{m('Recuadro')}</span></label
            >
            <label class="checkbox-group"
              ><input
                type="checkbox"
                id="chkAdvFaceShowBlur"
                checked={face.showBlur}
                onclick={(event) =>
                  guardFaceVisual('blur', event, event.currentTarget.checked)}
                onchange={(event) =>
                  adapter.setFaceVisual('blur', event.currentTarget.checked)}
              /><span>{m('Blur / pixelado')}</span></label
            >
          </div>
          <div id="facePixelControls" class:hidden={!face.showBlur}>
            {@render slider(
              'sldFacePixelation',
              'valFacePixelation',
              'Tamaño del pixelado',
              face.pixelationCellSize,
              4,
              32,
              (value) =>
                adapter.setDetectorOptions('face', {
                  pixelationCellSize: value,
                }),
              1,
            )}
            {@render slider(
              'sldFacePadding',
              'valFacePadding',
              'Margen extra de censura (%)',
              face.censorPaddingPercent,
              0,
              40,
              (value) =>
                adapter.setDetectorOptions('face', {
                  censorPaddingPercent: value,
                }),
              1,
            )}
          </div>
          <div id="faceBoxControls" class:hidden={!face.showBox}>
            <div class="slider-group">
              <div class="slider-label">
                <span>{m('Texto del recuadro')}</span>
              </div>
              <input
                type="text"
                id="inpFaceLabel"
                class="text-input"
                maxlength="28"
                placeholder={m('Ej: Cliente VIP')}
                aria-label={m('Texto del recuadro')}
                value={face.labelText}
                oninput={(event) =>
                  adapter.setFaceLabel(event.currentTarget.value)}
                onblur={(event) =>
                  adapter.commitFaceLabel(event.currentTarget.value)}
              />
            </div>
            <label
              class="color-picker-btn"
              style="position:relative;margin-top:6px"
            >
              <div
                class="color-swatch"
                id="faceColorSwatch"
                style:background={face.boxColor}
              ></div>
              <span>{m('Color del recuadro')}</span>
              <input
                type="color"
                id="inpFaceColor"
                value={face.boxColor}
                oninput={(event) =>
                  adapter.setFaceColor(event.currentTarget.value)}
              />
            </label>
            <div style="height:6px"></div>
            {@render slider(
              'sldFaceLabelSize',
              'valFaceLabelSize',
              'Tamaño del texto',
              face.labelSize,
              8,
              32,
              (value) =>
                adapter.setDetectorOptions('face', { labelSize: value }),
              1,
            )}
            {@render slider(
              'sldFaceThickness',
              'valFaceThickness',
              'Grosor del recuadro',
              face.boxThickness,
              1,
              8,
              (value) =>
                adapter.setDetectorOptions('face', { boxThickness: value }),
              1,
            )}
          </div>
          <label class="checkbox-group"
            ><input
              type="checkbox"
              id="chkShowLandmarks"
              checked={face.showLandmarks}
              onchange={(event) =>
                adapter.setDetectorOptions('face', {
                  showLandmarks: event.currentTarget.checked,
                })}
            /><span>{m('Mostrar puntos faciales')}</span></label
          >
        </div>
        <div class="config-block">
          <div class="config-block-title">{m('Respuesta')}</div>
          <div class="help-text">
            {m(
              'Menos suavizado y menos retención responden más rápido. Si vibra demasiado, subilos un poco.',
            )}
          </div>
          {@render slider(
            'sldFaceInterval',
            'valFaceInterval',
            'Intervalo de análisis (ms)',
            face.processIntervalMs,
            16,
            120,
            (value) =>
              adapter.setDetectorOptions('face', { processIntervalMs: value }),
            1,
          )}
          {@render slider(
            'sldFaceSmoothing',
            'valFaceSmoothing',
            'Suavizado del recuadro (%)',
            Math.round(face.boxSmoothing * 100),
            0,
            95,
            (value) =>
              adapter.setDetectorOptions('face', { boxSmoothing: value / 100 }),
            1,
          )}
          {@render slider(
            'sldFaceHold',
            'valFaceHold',
            'Retención al perder cara (ms)',
            face.detectionHoldMs,
            80,
            300,
            (value) =>
              adapter.setDetectorOptions('face', { detectionHoldMs: value }),
            10,
          )}
        </div>
      </div>
    </div>
  {/if}
</div>

<div
  id="effectConfigBlink"
  class={[
    'adjust-context-group',
    { 'is-active': !contextual || context === 'blink' },
  ]}
  data-adjust-context="blink"
>
  {#if options.blink}
    {@const blink = options.blink}
    <div class="panel-section fade-in">
      <div class="section-title accent">{m('Detección de pestañeos')}</div>
      <div class="effect-config">
        <div class="config-block">
          <div class="config-block-title">{m('Configuración')}</div>
          <div class="help-text">
            {m(
              'Cuando cerrás un ojo, se dibujan líneas entre los objetos detectados. Necesitás tener el detector de objetos activado para ver las conexiones.',
            )}
          </div>
          {@render slider(
            'sldEar',
            'valEar',
            'Sensibilidad (cuanto más alto, más fácil detectar)',
            blink.eyeArThreshold,
            0.1,
            0.4,
            (value) =>
              adapter.setDetectorOptions('blink', { eyeArThreshold: value }),
            0.01,
          )}
          {@render slider(
            'sldBlinkInterval',
            'valBlinkInterval',
            'Intervalo de análisis (ms)',
            blink.processIntervalMs,
            16,
            120,
            (value) =>
              adapter.setDetectorOptions('blink', { processIntervalMs: value }),
            1,
          )}
          {@render slider(
            'sldBlinkClosedFrames',
            'valBlinkClosedFrames',
            'Frames cerrados mínimos',
            blink.minClosedFrames,
            1,
            4,
            (value) =>
              adapter.setDetectorOptions('blink', { minClosedFrames: value }),
            1,
          )}
          {@render slider(
            'sldBlinkSmoothing',
            'valBlinkSmoothing',
            'Suavizado del párpado (%)',
            Math.round(blink.earSmoothing * 100),
            0,
            90,
            (value) =>
              adapter.setDetectorOptions('blink', {
                earSmoothing: value / 100,
              }),
            1,
          )}
        </div>
      </div>
    </div>
  {/if}
</div>
