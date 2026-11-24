import { bindSlider, createSection, slider } from './ui-helpers.ts';
import { translateCurrent } from '../../src/lib/i18n/translate.ts';

function bindDetectorSliders(app) {
  return (element, input, label, apply) => {
    bindSlider(element, input, label, (value) => {
      apply(value);
      app.preferences.scheduleSaveActiveEffectSettings();
    });
  };
}

/** @param {import('./controller.mjs').AppController} proto */
export function applyEffectConfigUIMixin(proto) {
  proto.renderEffectConfig = function () {
    if (this.effectConfigBlob) {
      this.effectConfigBlob.innerHTML = '';
      if (this.detectors.blob)
        this.effectConfigBlob.appendChild(this.buildBlobConfig());
    }
    if (this.effectConfigFace) {
      this.effectConfigFace.innerHTML = '';
      if (this.detectors.face)
        this.effectConfigFace.appendChild(this.buildFaceConfig());
    }
    if (this.effectConfigBlink) {
      this.effectConfigBlink.innerHTML = '';
      if (this.detectors.blink)
        this.effectConfigBlink.appendChild(this.buildBlinkConfig());
    }
  };

  // --- Blob Tracking Config ---
  proto.buildBlobConfig = function () {
    const bindConfigSlider = bindDetectorSliders(this);
    const bt = this.detectors.blob;
    const boxColor = this.normalizeHexColor(
      bt.boxColor,
      this.DEFAULT_QUICK_DETECTOR_SETTINGS.blobBoxColor,
    );
    const targetColor = this.normalizeHexColor(bt.targetColor, '#00c853');
    bt.boxColor = boxColor;
    bt.targetColor = targetColor;
    const el = createSection(
      'Detector de objetos por color',
      `
      <div class="config-block">
        <div class="config-block-title">${translateCurrent('¿Qué detectar?')}</div>
        <div class="help-text">${translateCurrent('Elegí si querés buscar un color específico, zonas de mucha luz o zonas oscuras.')}</div>
        <div class="radio-group">
          <label class="radio-option ${bt.detectionMode === 'manual' ? 'selected' : ''}">
            <input type="radio" name="detMode" value="manual" ${bt.detectionMode === 'manual' ? 'checked' : ''}>
            <span>${translateCurrent('Un color específico')}</span>
          </label>
          <label class="radio-option ${bt.detectionMode === 'lights' ? 'selected' : ''}">
            <input type="radio" name="detMode" value="lights" ${bt.detectionMode === 'lights' ? 'checked' : ''}>
            <span>${translateCurrent('Zonas de mucha luz')}</span>
          </label>
          <label class="radio-option ${bt.detectionMode === 'shadows' ? 'selected' : ''}">
            <input type="radio" name="detMode" value="shadows" ${bt.detectionMode === 'shadows' ? 'checked' : ''}>
            <span>${translateCurrent('Zonas oscuras / sombras')}</span>
          </label>
        </div>
      </div>

      <div class="config-block ${bt.detectionMode === 'manual' ? '' : 'hidden'}" id="cfgColorBlock">
        <div class="config-block-title">${translateCurrent('Color objetivo')}</div>
        <div class="target-color-control">
          <label class="color-picker-btn target-color-picker">
            <span class="color-swatch" id="targetColorSwatch" style="background:${targetColor}"></span>
            <span class="target-color-copy">
              <strong>${translateCurrent('Color a detectar')}</strong>
              <small id="targetColorValue">${targetColor.toUpperCase()}</small>
            </span>
            <input type="color" id="inpTargetColor" value="${targetColor}" aria-label="${translateCurrent('Color a detectar')}">
          </label>
          <button type="button" class="btn target-color-eyedropper" id="btnPickTargetColor">
            <i class="fa-solid fa-eye-dropper" aria-hidden="true"></i>
            ${translateCurrent('Elegir en el video')}
          </button>
        </div>
        <div class="status-msg hidden" id="cfgTargetColorStatus" role="status" aria-live="polite"></div>
        <div class="config-subsection-title">${translateCurrent('Sensibilidad')}</div>
        <div class="help-text">${translateCurrent('Si la detección es demasiado estricta, subí este valor. Si detecta demasiado, bajalo.')}</div>
        ${slider('sldTolerance', 'valTolerance', 'Tolerancia', bt._tolerance, 10, 100)}

        <button type="button" class="btn config-advanced-toggle" id="btnAdvancedHsv">${translateCurrent('Ajustes avanzados (HSV manual)')}</button>
        <div id="hsvAdvanced" class="config-advanced-panel hidden">
          <div class="help-text">${translateCurrent('Estos controles permiten ajustar el rango de color manualmente usando el modelo HSV (Tono, Saturación, Brillo).')}</div>
          ${slider('sldHMin', 'valHMin', 'Tono mínimo (H)', bt.hsvMin[0], 0, 180)}
          ${slider('sldSMin', 'valSMin', 'Saturación mín. (S)', bt.hsvMin[1], 0, 255)}
          ${slider('sldVMin', 'valVMin', 'Brillo mínimo (V)', bt.hsvMin[2], 0, 255)}
          ${slider('sldHMax', 'valHMax', 'Tono máximo (H)', bt.hsvMax[0], 0, 180)}
          ${slider('sldSMax', 'valSMax', 'Saturación máx. (S)', bt.hsvMax[1], 0, 255)}
          ${slider('sldVMax', 'valVMax', 'Brillo máx. (V)', bt.hsvMax[2], 0, 255)}
        </div>
      </div>

      <div class="config-block">
        <div class="config-block-title">${translateCurrent('Cantidad y tamaño')}</div>
        <div class="help-text">${translateCurrent('Limitá cuántos objetos detectar y qué tan grandes deben ser para ser considerados.')}</div>
        ${slider('sldMaxObj', 'valMaxObj', 'Máximo de objetos', bt.maxObjects, 1, 50)}
        ${slider('sldMinArea', 'valMinArea', 'Tamaño mínimo (píxeles)', bt.minArea, 0, 5000, 10)}
      </div>

      <div class="config-block">
        <div class="config-block-title">${translateCurrent('Limpieza de imagen')}</div>
        <div class="help-text">${translateCurrent('Si aparecen detecciones falsas o ruido, subí este valor para limpiar la imagen.')}</div>
        ${slider('sldErode', 'valErode', 'Nivel de limpieza', bt.erodeIterations, 0, 5)}
      </div>

      <div class="config-block">
        <div class="config-block-title">${translateCurrent('Respuesta')}</div>
        <div class="help-text">${translateCurrent('Bajá la resolución de análisis si notás retraso. Subirla da más precisión, pero consume más CPU.')}</div>
        ${slider('sldBlobProcessScale', 'valBlobProcessScale', 'Resolución de análisis (%)', Math.round((bt.processScale || 0.45) * 100), 25, 100)}
      </div>

      <div class="config-block">
        <div class="config-block-title">${translateCurrent('Aspecto visual')}</div>
        <label class="color-picker-btn" style="position:relative">
          <div class="color-swatch" id="boxColorSwatch" style="background:${boxColor}"></div>
          <span>${translateCurrent('Color del recuadro')}</span>
          <input type="color" id="inpBoxColor" value="${boxColor}">
        </label>
        <div style="height:6px"></div>
        <label class="checkbox-group"><input type="checkbox" id="chkShowCoords" ${bt.showCoordinates ? 'checked' : ''}><span>${translateCurrent('Mostrar posición (X, Y)')}</span></label>
        <label class="checkbox-group"><input type="checkbox" id="chkShowCentroid" ${bt.showCentroid ? 'checked' : ''}><span>${translateCurrent('Mostrar punto central')}</span></label>
        ${slider('sldBlobLabelSize', 'valBlobLabelSize', 'Tamaño del texto', bt.labelSize || 12, 8, 32)}
        ${slider('sldThickness', 'valThickness', 'Grosor del recuadro', bt.boxThickness, 1, 8)}
      </div>
    `,
    );

    requestAnimationFrame(() => {
      // Mode radios
      el.querySelectorAll('input[name="detMode"]').forEach((r) => {
        r.addEventListener('change', (e) => {
          bt.detectionMode = e.target.value;
          el.querySelector('#cfgColorBlock').classList.toggle(
            'hidden',
            bt.detectionMode !== 'manual',
          );
          el.querySelectorAll('.radio-option').forEach((o) =>
            o.classList.remove('selected'),
          );
          e.target.closest('.radio-option').classList.add('selected');
          this.preferences.scheduleSaveActiveEffectSettings();
        });
      });

      bindConfigSlider(
        el,
        'sldTolerance',
        'valTolerance',
        (v) => (bt._tolerance = v),
      );

      const btnAdv = el.querySelector('#btnAdvancedHsv');
      const hsvAdv = el.querySelector('#hsvAdvanced');
      btnAdv.addEventListener('click', () => hsvAdv.classList.toggle('hidden'));

      const targetInput = el.querySelector('#inpTargetColor');
      const targetSwatch = el.querySelector('#targetColorSwatch');
      const targetValue = el.querySelector('#targetColorValue');
      const targetStatus = el.querySelector('#cfgTargetColorStatus');
      targetInput.addEventListener('input', (event) => {
        if (!bt.setColorFromHex(event.target.value)) return;
        targetSwatch.style.background = bt.targetColor;
        targetValue.textContent = bt.targetColor.toUpperCase();
        this.showStatus(targetStatus, 'Color objetivo actualizado.', 'success');
        this.preferences.scheduleSaveActiveEffectSettings();
      });
      el.querySelector('#btnPickTargetColor').addEventListener('click', () =>
        this.colorPicker.start(targetStatus),
      );

      bindConfigSlider(el, 'sldHMin', 'valHMin', (v) => (bt.hsvMin[0] = v));
      bindConfigSlider(el, 'sldSMin', 'valSMin', (v) => (bt.hsvMin[1] = v));
      bindConfigSlider(el, 'sldVMin', 'valVMin', (v) => (bt.hsvMin[2] = v));
      bindConfigSlider(el, 'sldHMax', 'valHMax', (v) => (bt.hsvMax[0] = v));
      bindConfigSlider(el, 'sldSMax', 'valSMax', (v) => (bt.hsvMax[1] = v));
      bindConfigSlider(el, 'sldVMax', 'valVMax', (v) => (bt.hsvMax[2] = v));
      bindConfigSlider(
        el,
        'sldMaxObj',
        'valMaxObj',
        (v) => (bt.maxObjects = v),
      );
      bindConfigSlider(el, 'sldMinArea', 'valMinArea', (v) => (bt.minArea = v));
      bindConfigSlider(
        el,
        'sldErode',
        'valErode',
        (v) => (bt.erodeIterations = v),
      );
      bindConfigSlider(
        el,
        'sldBlobProcessScale',
        'valBlobProcessScale',
        (v) => {
          bt.processScale = this.clamp(v / 100, 0.25, 1);
        },
      );
      bindConfigSlider(
        el,
        'sldBlobLabelSize',
        'valBlobLabelSize',
        (v) => (bt.labelSize = this.clamp(Math.round(v), 8, 32)),
      );
      bindConfigSlider(
        el,
        'sldThickness',
        'valThickness',
        (v) => (bt.boxThickness = v),
      );

      const inpColor = el.querySelector('#inpBoxColor');
      const swatch = el.querySelector('#boxColorSwatch');
      inpColor.addEventListener('input', (e) => {
        bt.boxColor = e.target.value;
        this.quickDetectorSettings.blobBoxColor = e.target.value;
        swatch.style.background = e.target.value;
        this.preferences.updateQuickDetectorControlsUI();
        this.preferences.scheduleSaveQuickDetectorSettings();
        this.preferences.scheduleSaveActiveEffectSettings();
      });

      el.querySelector('#chkShowCoords').addEventListener('change', (e) => {
        bt.showCoordinates = e.target.checked;
        this.preferences.scheduleSaveActiveEffectSettings();
      });
      el.querySelector('#chkShowCentroid').addEventListener('change', (e) => {
        bt.showCentroid = e.target.checked;
        this.preferences.scheduleSaveActiveEffectSettings();
      });
    });

    return el;
  };

  // --- Face Detection Config ---
  proto.buildFaceConfig = function () {
    const bindConfigSlider = bindDetectorSliders(this);
    const fd = this.detectors.face;
    const showBoxVisuals = fd.showBox !== false;
    const showPixelVisuals = !!fd.showBlur;
    const faceBoxColor = this.normalizeHexColor(
      fd.boxColor,
      this.DEFAULT_QUICK_DETECTOR_SETTINGS.faceBoxColor,
    );
    fd.boxColor = faceBoxColor;
    const el = createSection(
      'Detector de caras',
      `
      <div class="config-block">
        <div class="config-block-title">Configuración</div>
        <div class="help-text">${translateCurrent('Activá recuadro, blur/pixelado o ambos a la vez sobre cada cara detectada.')}</div>
        ${slider('sldMaxFaces', 'valMaxFaces', 'Máximo de caras a detectar', fd.maxFaces, 1, 5)}
        <div class="face-visual-toggles">
          <label class="checkbox-group"><input type="checkbox" id="chkAdvFaceShowBox" ${showBoxVisuals ? 'checked' : ''}><span>${translateCurrent('Recuadro')}</span></label>
          <label class="checkbox-group"><input type="checkbox" id="chkAdvFaceShowBlur" ${showPixelVisuals ? 'checked' : ''}><span>${translateCurrent('Blur / pixelado')}</span></label>
        </div>
        <div id="facePixelControls" class="${showPixelVisuals ? '' : 'hidden'}">
          ${slider('sldFacePixelation', 'valFacePixelation', 'Tamaño del pixelado', fd.pixelationCellSize, 4, 32)}
          ${slider('sldFacePadding', 'valFacePadding', 'Margen extra de censura (%)', fd.censorPaddingPercent, 0, 40)}
        </div>
        <div id="faceBoxControls" class="${showBoxVisuals ? '' : 'hidden'}">
          <div class="slider-group">
            <div class="slider-label"><span>${translateCurrent('Texto del recuadro')}</span></div>
            <input type="text" id="inpFaceLabel" class="text-input" maxlength="28" placeholder="Ej: Cliente VIP">
          </div>
          <label class="color-picker-btn" style="position:relative;margin-top:6px">
            <div class="color-swatch" id="faceColorSwatch" style="background:${faceBoxColor}"></div>
            <span>${translateCurrent('Color del recuadro')}</span>
            <input type="color" id="inpFaceColor" value="${faceBoxColor}">
          </label>
          <div style="height:6px"></div>
          ${slider('sldFaceLabelSize', 'valFaceLabelSize', 'Tamaño del texto', fd.labelSize || 12, 8, 32)}
          ${slider('sldFaceThickness', 'valFaceThickness', 'Grosor del recuadro', fd.boxThickness, 1, 8)}
        </div>
        <label class="checkbox-group"><input type="checkbox" id="chkShowLandmarks" ${fd.showLandmarks ? 'checked' : ''}><span>${translateCurrent('Mostrar puntos faciales')}</span></label>
      </div>
      <div class="config-block">
        <div class="config-block-title">${translateCurrent('Respuesta')}</div>
        <div class="help-text">${translateCurrent('Menos suavizado y menos retención responden más rápido. Si vibra demasiado, subilos un poco.')}</div>
        ${slider('sldFaceInterval', 'valFaceInterval', 'Intervalo de análisis (ms)', fd.processIntervalMs, 16, 120)}
        ${slider('sldFaceSmoothing', 'valFaceSmoothing', 'Suavizado del recuadro (%)', Math.round((fd.boxSmoothing || 0) * 100), 0, 95)}
        ${slider('sldFaceHold', 'valFaceHold', 'Retención al perder cara (ms)', fd.detectionHoldMs, 80, 300, 10)}
      </div>
    `,
    );

    requestAnimationFrame(() => {
      const chkAdvFaceShowBox = el.querySelector('#chkAdvFaceShowBox');
      const chkAdvFaceShowBlur = el.querySelector('#chkAdvFaceShowBlur');
      const faceBoxControls = el.querySelector('#faceBoxControls');
      const facePixelControls = el.querySelector('#facePixelControls');
      const syncFaceModeUI = () => {
        const showBox = fd.showBox !== false;
        const showBlur = !!fd.showBlur;
        if (chkAdvFaceShowBox) chkAdvFaceShowBox.checked = showBox;
        if (chkAdvFaceShowBlur) chkAdvFaceShowBlur.checked = showBlur;
        if (faceBoxControls)
          faceBoxControls.classList.toggle('hidden', !showBox);
        if (facePixelControls)
          facePixelControls.classList.toggle('hidden', !showBlur);
      };

      const onAdvFaceVisualChange = (changed) => {
        let showBox = chkAdvFaceShowBox?.checked ?? fd.showBox;
        let showBlur = chkAdvFaceShowBlur?.checked ?? fd.showBlur;
        if (!showBox && !showBlur) {
          if (changed === 'box' && chkAdvFaceShowBox)
            chkAdvFaceShowBox.checked = true;
          if (changed === 'blur' && chkAdvFaceShowBlur)
            chkAdvFaceShowBlur.checked = true;
          showBox = chkAdvFaceShowBox?.checked ?? true;
          showBlur = chkAdvFaceShowBlur?.checked ?? false;
        }
        fd.showBox = showBox;
        fd.showBlur = showBlur;
        this.quickDetectorSettings.faceShowBox = showBox;
        this.quickDetectorSettings.faceShowBlur = showBlur;
        syncFaceModeUI();
        this.preferences.updateQuickDetectorControlsUI();
        this.detectors.updateInfo();
        this.preferences.scheduleSaveQuickDetectorSettings();
        this.preferences.scheduleSaveActiveEffectSettings();
      };

      if (chkAdvFaceShowBox)
        chkAdvFaceShowBox.addEventListener('change', () =>
          onAdvFaceVisualChange('box'),
        );
      if (chkAdvFaceShowBlur)
        chkAdvFaceShowBlur.addEventListener('change', () =>
          onAdvFaceVisualChange('blur'),
        );

      bindConfigSlider(el, 'sldMaxFaces', 'valMaxFaces', (v) => {
        fd.maxFaces = v;
        if (fd.faceMesh) fd.faceMesh.setOptions({ maxNumFaces: v });
      });
      bindConfigSlider(el, 'sldFacePixelation', 'valFacePixelation', (v) => {
        fd.pixelationCellSize = v;
        this.quickDetectorSettings.facePixelationCellSize = v;
        this.preferences.scheduleSaveQuickDetectorSettings();
      });
      bindConfigSlider(el, 'sldFacePadding', 'valFacePadding', (v) => {
        fd.censorPaddingPercent = v;
        this.quickDetectorSettings.faceCensorPaddingPercent = v;
        this.preferences.scheduleSaveQuickDetectorSettings();
      });
      bindConfigSlider(
        el,
        'sldFaceLabelSize',
        'valFaceLabelSize',
        (v) => (fd.labelSize = this.clamp(Math.round(v), 8, 32)),
      );
      bindConfigSlider(
        el,
        'sldFaceThickness',
        'valFaceThickness',
        (v) => (fd.boxThickness = v),
      );
      bindConfigSlider(el, 'sldFaceInterval', 'valFaceInterval', (v) => {
        fd.processIntervalMs = this.clamp(Math.round(v), 16, 120);
      });
      bindConfigSlider(el, 'sldFaceSmoothing', 'valFaceSmoothing', (v) => {
        fd.boxSmoothing = this.clamp(v / 100, 0, 0.95);
      });
      bindConfigSlider(el, 'sldFaceHold', 'valFaceHold', (v) => {
        fd.detectionHoldMs = this.clamp(Math.round(v), 80, 300);
      });

      const inpLabel = el.querySelector('#inpFaceLabel');
      if (inpLabel) {
        inpLabel.value = fd.labelText || 'CARA';
        inpLabel.addEventListener('input', (e) => {
          const value = String(e.target.value || '').slice(0, 28);
          fd.labelText = value;
          this.quickDetectorSettings.faceLabelText = value || 'CARA';
          if (
            this.inpFaceQuickLabel &&
            document.activeElement !== this.inpFaceQuickLabel
          ) {
            this.inpFaceQuickLabel.value =
              this.quickDetectorSettings.faceLabelText;
          }
          this.preferences.scheduleSaveQuickDetectorSettings();
          this.preferences.scheduleSaveActiveEffectSettings();
        });
        inpLabel.addEventListener('blur', (e) => {
          const normalized = this.normalizeFaceLabel(e.target.value);
          fd.labelText = normalized;
          this.quickDetectorSettings.faceLabelText = normalized;
          e.target.value = fd.labelText;
          this.preferences.updateQuickDetectorControlsUI();
          this.preferences.saveQuickDetectorSettings();
          this.preferences.saveActiveEffectSettings();
        });
      }

      const inpColor = el.querySelector('#inpFaceColor');
      const swatch = el.querySelector('#faceColorSwatch');
      if (inpColor && swatch) {
        inpColor.addEventListener('input', (e) => {
          fd.boxColor = e.target.value;
          this.quickDetectorSettings.faceBoxColor = e.target.value;
          swatch.style.background = e.target.value;
          this.preferences.updateQuickDetectorControlsUI();
          this.preferences.scheduleSaveQuickDetectorSettings();
          this.preferences.scheduleSaveActiveEffectSettings();
        });
      }

      el.querySelector('#chkShowLandmarks').addEventListener('change', (e) => {
        fd.showLandmarks = e.target.checked;
        this.preferences.scheduleSaveActiveEffectSettings();
      });
      syncFaceModeUI();
    });

    return el;
  };

  // --- Blink Detection Config ---
  proto.buildBlinkConfig = function () {
    const bindConfigSlider = bindDetectorSliders(this);
    const bd = this.detectors.blink;
    const el = createSection(
      'Detección de pestañeos',
      `
      <div class="config-block">
        <div class="config-block-title">Configuración</div>
        <div class="help-text">${translateCurrent('Cuando cerrás un ojo, se dibujan líneas entre los objetos detectados. Necesitás tener el detector de objetos activado para ver las conexiones.')}</div>
        ${slider('sldEar', 'valEar', 'Sensibilidad (cuanto más alto, más fácil detectar)', bd.eyeArThreshold, 0.1, 0.4, 0.01)}
        ${slider('sldBlinkInterval', 'valBlinkInterval', 'Intervalo de análisis (ms)', bd.processIntervalMs, 16, 120)}
        ${slider('sldBlinkClosedFrames', 'valBlinkClosedFrames', 'Frames cerrados mínimos', bd.minClosedFrames, 1, 4)}
        ${slider('sldBlinkSmoothing', 'valBlinkSmoothing', 'Suavizado del párpado (%)', Math.round((bd._earSmoothing || 0) * 100), 0, 90)}
      </div>
    `,
    );

    requestAnimationFrame(() => {
      const sld = el.querySelector('#sldEar');
      const val = el.querySelector('#valEar');
      sld.addEventListener('input', (e) => {
        bd.eyeArThreshold = parseFloat(e.target.value);
        val.textContent = bd.eyeArThreshold.toFixed(2);
        this.preferences.scheduleSaveActiveEffectSettings();
      });
      bindConfigSlider(el, 'sldBlinkInterval', 'valBlinkInterval', (v) => {
        bd.processIntervalMs = this.clamp(Math.round(v), 16, 120);
      });
      bindConfigSlider(
        el,
        'sldBlinkClosedFrames',
        'valBlinkClosedFrames',
        (v) => {
          bd.minClosedFrames = this.clamp(Math.round(v), 1, 4);
        },
      );
      bindConfigSlider(el, 'sldBlinkSmoothing', 'valBlinkSmoothing', (v) => {
        bd._earSmoothing = this.clamp(v / 100, 0, 0.9);
      });
    });

    return el;
  };
}
