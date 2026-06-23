/** @param {import('./controller.mjs').AppController} proto */
export function applyEffectConfigUIMixin(proto) {
  proto.renderEffectConfig = function () {
    if (this.effectConfigBlob) {
      this.effectConfigBlob.innerHTML = '';
      if (this.blobTrackingEffect) this.effectConfigBlob.appendChild(this.buildBlobConfig());
    }
    if (this.effectConfigFace) {
      this.effectConfigFace.innerHTML = '';
      if (this.faceDetectionEffect) this.effectConfigFace.appendChild(this.buildFaceConfig());
    }
    if (this.effectConfigBlink) {
      this.effectConfigBlink.innerHTML = '';
      if (this.blinkDetectionEffect) this.effectConfigBlink.appendChild(this.buildBlinkConfig());
    }
  }

  // --- Blob Tracking Config ---
  proto.buildBlobConfig = function () {
    const bt = this.blobTrackingEffect;
    const boxColor = this.normalizeHexColor(bt.boxColor, this.DEFAULT_QUICK_DETECTOR_SETTINGS.blobBoxColor);
    bt.boxColor = boxColor;
    const el = this.createSection('Detector de objetos por color', `
      <div class="config-block">
        <div class="config-block-title">¿Qué detectar?</div>
        <div class="help-text">Elegí si querés buscar un color específico, zonas de mucha luz o zonas oscuras.</div>
        <div class="radio-group">
          <label class="radio-option ${bt.detectionMode === 'manual' ? 'selected' : ''}">
            <input type="radio" name="detMode" value="manual" ${bt.detectionMode === 'manual' ? 'checked' : ''}>
            <span>Un color específico</span>
          </label>
          <label class="radio-option ${bt.detectionMode === 'lights' ? 'selected' : ''}">
            <input type="radio" name="detMode" value="lights" ${bt.detectionMode === 'lights' ? 'checked' : ''}>
            <span>Zonas de mucha luz</span>
          </label>
          <label class="radio-option ${bt.detectionMode === 'shadows' ? 'selected' : ''}">
            <input type="radio" name="detMode" value="shadows" ${bt.detectionMode === 'shadows' ? 'checked' : ''}>
            <span>Zonas oscuras / sombras</span>
          </label>
        </div>
      </div>

      <div class="config-block" id="cfgColorBlock" ${bt.detectionMode !== 'manual' ? 'style="display:none"' : ''}>
        <div class="config-block-title">Sensibilidad del color</div>
        <div class="help-text">Si la detección es demasiado estricta, subí este valor. Si detecta demasiado, bajalo.</div>
        ${this.slider('sldTolerance', 'valTolerance', 'Tolerancia', bt._tolerance, 10, 100)}

        <button class="btn" id="btnAdvancedHsv" style="font-size:11px;margin-top:4px">Ajustes avanzados (HSV manual)</button>
        <div id="hsvAdvanced" class="hidden" style="margin-top:8px">
          <div class="help-text">Estos controles permiten ajustar el rango de color manualmente usando el modelo HSV (Tono, Saturación, Brillo).</div>
          ${this.slider('sldHMin', 'valHMin', 'Tono mínimo (H)', bt.hsvMin[0], 0, 180)}
          ${this.slider('sldSMin', 'valSMin', 'Saturación mín. (S)', bt.hsvMin[1], 0, 255)}
          ${this.slider('sldVMin', 'valVMin', 'Brillo mínimo (V)', bt.hsvMin[2], 0, 255)}
          ${this.slider('sldHMax', 'valHMax', 'Tono máximo (H)', bt.hsvMax[0], 0, 180)}
          ${this.slider('sldSMax', 'valSMax', 'Saturación máx. (S)', bt.hsvMax[1], 0, 255)}
          ${this.slider('sldVMax', 'valVMax', 'Brillo máx. (V)', bt.hsvMax[2], 0, 255)}
        </div>
      </div>

      <div class="config-block">
        <div class="config-block-title">Cantidad y tamaño</div>
        <div class="help-text">Limitá cuántos objetos detectar y qué tan grandes deben ser para ser considerados.</div>
        ${this.slider('sldMaxObj', 'valMaxObj', 'Máximo de objetos', bt.maxObjects, 1, 50)}
        ${this.slider('sldMinArea', 'valMinArea', 'Tamaño mínimo (píxeles)', bt.minArea, 0, 5000, 10)}
      </div>

      <div class="config-block">
        <div class="config-block-title">Limpieza de imagen</div>
        <div class="help-text">Si aparecen detecciones falsas o ruido, subí este valor para limpiar la imagen.</div>
        ${this.slider('sldErode', 'valErode', 'Nivel de limpieza', bt.erodeIterations, 0, 5)}
      </div>

      <div class="config-block">
        <div class="config-block-title">Respuesta</div>
        <div class="help-text">Bajá la resolución de análisis si notás retraso. Subirla da más precisión, pero consume más CPU.</div>
        ${this.slider('sldBlobProcessScale', 'valBlobProcessScale', 'Resolución de análisis (%)', Math.round((bt.processScale || 0.45) * 100), 25, 100)}
      </div>

      <div class="config-block">
        <div class="config-block-title">Aspecto visual</div>
        <label class="color-picker-btn" style="position:relative">
          <div class="color-swatch" id="boxColorSwatch" style="background:${boxColor}"></div>
          <span>Color del recuadro</span>
          <input type="color" id="inpBoxColor" value="${boxColor}">
        </label>
        <div style="height:6px"></div>
        <label class="checkbox-group"><input type="checkbox" id="chkShowCoords" ${bt.showCoordinates ? 'checked' : ''}><span>Mostrar posición (X, Y)</span></label>
        <label class="checkbox-group"><input type="checkbox" id="chkShowCentroid" ${bt.showCentroid ? 'checked' : ''}><span>Mostrar punto central</span></label>
        ${this.slider('sldBlobLabelSize', 'valBlobLabelSize', 'Tamaño del texto', bt.labelSize || 12, 8, 32)}
        ${this.slider('sldThickness', 'valThickness', 'Grosor del recuadro', bt.boxThickness, 1, 8)}
      </div>
    `);

    requestAnimationFrame(() => {
      // Mode radios
      el.querySelectorAll('input[name="detMode"]').forEach(r => {
        r.addEventListener('change', (e) => {
          bt.detectionMode = e.target.value;
          el.querySelector('#cfgColorBlock').style.display = bt.detectionMode === 'manual' ? '' : 'none';
          el.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
          e.target.closest('.radio-option').classList.add('selected');
          this.scheduleSaveActiveEffectSettings();
        });
      });

      this.bindSlider(el, 'sldTolerance', 'valTolerance', v => bt._tolerance = v);

      const btnAdv = el.querySelector('#btnAdvancedHsv');
      const hsvAdv = el.querySelector('#hsvAdvanced');
      btnAdv.addEventListener('click', () => hsvAdv.classList.toggle('hidden'));

      this.bindSlider(el, 'sldHMin', 'valHMin', v => bt.hsvMin[0] = v);
      this.bindSlider(el, 'sldSMin', 'valSMin', v => bt.hsvMin[1] = v);
      this.bindSlider(el, 'sldVMin', 'valVMin', v => bt.hsvMin[2] = v);
      this.bindSlider(el, 'sldHMax', 'valHMax', v => bt.hsvMax[0] = v);
      this.bindSlider(el, 'sldSMax', 'valSMax', v => bt.hsvMax[1] = v);
      this.bindSlider(el, 'sldVMax', 'valVMax', v => bt.hsvMax[2] = v);
      this.bindSlider(el, 'sldMaxObj', 'valMaxObj', v => bt.maxObjects = v);
      this.bindSlider(el, 'sldMinArea', 'valMinArea', v => bt.minArea = v);
      this.bindSlider(el, 'sldErode', 'valErode', v => bt.erodeIterations = v);
      this.bindSlider(el, 'sldBlobProcessScale', 'valBlobProcessScale', v => {
        bt.processScale = this.clamp(v / 100, 0.25, 1);
      });
      this.bindSlider(el, 'sldBlobLabelSize', 'valBlobLabelSize', v => bt.labelSize = this.clamp(Math.round(v), 8, 32));
      this.bindSlider(el, 'sldThickness', 'valThickness', v => bt.boxThickness = v);

      const inpColor = el.querySelector('#inpBoxColor');
      const swatch = el.querySelector('#boxColorSwatch');
      inpColor.addEventListener('input', e => {
        bt.boxColor = e.target.value;
        this.quickDetectorSettings.blobBoxColor = e.target.value;
        swatch.style.background = e.target.value;
        this.updateQuickDetectorControlsUI();
        this.scheduleSaveQuickDetectorSettings();
        this.scheduleSaveActiveEffectSettings();
      });

      el.querySelector('#chkShowCoords').addEventListener('change', e => {
        bt.showCoordinates = e.target.checked;
        this.scheduleSaveActiveEffectSettings();
      });
      el.querySelector('#chkShowCentroid').addEventListener('change', e => {
        bt.showCentroid = e.target.checked;
        this.scheduleSaveActiveEffectSettings();
      });
    });

    return el;
  }

  // --- Face Detection Config ---
  proto.buildFaceConfig = function () {
    const fd = this.faceDetectionEffect;
    const showBoxVisuals = fd.showBox !== false;
    const showPixelVisuals = !!fd.showBlur;
    const faceBoxColor = this.normalizeHexColor(fd.boxColor, this.DEFAULT_QUICK_DETECTOR_SETTINGS.faceBoxColor);
    fd.boxColor = faceBoxColor;
    const el = this.createSection('Detector de caras', `
      <div class="config-block">
        <div class="config-block-title">Configuración</div>
        <div class="help-text">Activá recuadro, blur/pixelado o ambos a la vez sobre cada cara detectada.</div>
        ${this.slider('sldMaxFaces', 'valMaxFaces', 'Máximo de caras a detectar', fd.maxFaces, 1, 5)}
        <div class="face-visual-toggles">
          <label class="checkbox-group"><input type="checkbox" id="chkAdvFaceShowBox" ${showBoxVisuals ? 'checked' : ''}><span>Recuadro</span></label>
          <label class="checkbox-group"><input type="checkbox" id="chkAdvFaceShowBlur" ${showPixelVisuals ? 'checked' : ''}><span>Blur / pixelado</span></label>
        </div>
        <div id="facePixelControls" class="${showPixelVisuals ? '' : 'hidden'}">
          ${this.slider('sldFacePixelation', 'valFacePixelation', 'Tamaño del pixelado', fd.pixelationCellSize, 4, 32)}
          ${this.slider('sldFacePadding', 'valFacePadding', 'Margen extra de censura (%)', fd.censorPaddingPercent, 0, 40)}
        </div>
        <div id="faceBoxControls" class="${showBoxVisuals ? '' : 'hidden'}">
          <div class="slider-group">
            <div class="slider-label"><span>Texto del recuadro</span></div>
            <input type="text" id="inpFaceLabel" class="text-input" maxlength="28" placeholder="Ej: Cliente VIP">
          </div>
          <label class="color-picker-btn" style="position:relative;margin-top:6px">
            <div class="color-swatch" id="faceColorSwatch" style="background:${faceBoxColor}"></div>
            <span>Color del recuadro</span>
            <input type="color" id="inpFaceColor" value="${faceBoxColor}">
          </label>
          <div style="height:6px"></div>
          ${this.slider('sldFaceLabelSize', 'valFaceLabelSize', 'Tamaño del texto', fd.labelSize || 12, 8, 32)}
          ${this.slider('sldFaceThickness', 'valFaceThickness', 'Grosor del recuadro', fd.boxThickness, 1, 8)}
        </div>
        <label class="checkbox-group"><input type="checkbox" id="chkShowLandmarks" ${fd.showLandmarks ? 'checked' : ''}><span>Mostrar puntos faciales</span></label>
      </div>
      <div class="config-block">
        <div class="config-block-title">Respuesta</div>
        <div class="help-text">Menos suavizado y menos retención responden más rápido. Si vibra demasiado, subilos un poco.</div>
        ${this.slider('sldFaceInterval', 'valFaceInterval', 'Intervalo de análisis (ms)', fd.processIntervalMs, 16, 80)}
        ${this.slider('sldFaceSmoothing', 'valFaceSmoothing', 'Suavizado del recuadro (%)', Math.round((fd.boxSmoothing || 0) * 100), 0, 95)}
        ${this.slider('sldFaceHold', 'valFaceHold', 'Retención al perder cara (ms)', fd.detectionHoldMs, 80, 300, 10)}
      </div>
    `);

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
        if (faceBoxControls) faceBoxControls.classList.toggle('hidden', !showBox);
        if (facePixelControls) facePixelControls.classList.toggle('hidden', !showBlur);
      };

      const onAdvFaceVisualChange = (changed) => {
        let showBox = chkAdvFaceShowBox?.checked ?? fd.showBox;
        let showBlur = chkAdvFaceShowBlur?.checked ?? fd.showBlur;
        if (!showBox && !showBlur) {
          if (changed === 'box' && chkAdvFaceShowBox) chkAdvFaceShowBox.checked = true;
          if (changed === 'blur' && chkAdvFaceShowBlur) chkAdvFaceShowBlur.checked = true;
          showBox = chkAdvFaceShowBox?.checked ?? true;
          showBlur = chkAdvFaceShowBlur?.checked ?? false;
        }
        fd.showBox = showBox;
        fd.showBlur = showBlur;
        this.quickDetectorSettings.faceShowBox = showBox;
        this.quickDetectorSettings.faceShowBlur = showBlur;
        syncFaceModeUI();
        this.updateQuickDetectorControlsUI();
        this.updateEffectsInfo();
        this.scheduleSaveQuickDetectorSettings();
        this.scheduleSaveActiveEffectSettings();
      };

      if (chkAdvFaceShowBox) chkAdvFaceShowBox.addEventListener('change', () => onAdvFaceVisualChange('box'));
      if (chkAdvFaceShowBlur) chkAdvFaceShowBlur.addEventListener('change', () => onAdvFaceVisualChange('blur'));

      this.bindSlider(el, 'sldMaxFaces', 'valMaxFaces', v => {
        fd.maxFaces = v;
        if (fd.faceMesh) fd.faceMesh.setOptions({ maxNumFaces: v });
      });
      this.bindSlider(el, 'sldFacePixelation', 'valFacePixelation', v => {
        fd.pixelationCellSize = v;
        this.quickDetectorSettings.facePixelationCellSize = v;
        this.scheduleSaveQuickDetectorSettings();
      });
      this.bindSlider(el, 'sldFacePadding', 'valFacePadding', v => {
        fd.censorPaddingPercent = v;
        this.quickDetectorSettings.faceCensorPaddingPercent = v;
        this.scheduleSaveQuickDetectorSettings();
      });
      this.bindSlider(el, 'sldFaceLabelSize', 'valFaceLabelSize', v => fd.labelSize = this.clamp(Math.round(v), 8, 32));
      this.bindSlider(el, 'sldFaceThickness', 'valFaceThickness', v => fd.boxThickness = v);
      this.bindSlider(el, 'sldFaceInterval', 'valFaceInterval', v => {
        fd.processIntervalMs = this.clamp(Math.round(v), 16, 80);
      });
      this.bindSlider(el, 'sldFaceSmoothing', 'valFaceSmoothing', v => {
        fd.boxSmoothing = this.clamp(v / 100, 0, 0.95);
      });
      this.bindSlider(el, 'sldFaceHold', 'valFaceHold', v => {
        fd.detectionHoldMs = this.clamp(Math.round(v), 80, 300);
      });

      const inpLabel = el.querySelector('#inpFaceLabel');
      if (inpLabel) {
        inpLabel.value = fd.labelText || 'CARA';
        inpLabel.addEventListener('input', e => {
          const value = String(e.target.value || '').slice(0, 28);
          fd.labelText = value;
          this.quickDetectorSettings.faceLabelText = value || 'CARA';
          if (this.inpFaceQuickLabel && document.activeElement !== this.inpFaceQuickLabel) {
            this.inpFaceQuickLabel.value = this.quickDetectorSettings.faceLabelText;
          }
          this.scheduleSaveQuickDetectorSettings();
          this.scheduleSaveActiveEffectSettings();
        });
        inpLabel.addEventListener('blur', e => {
          const normalized = this.normalizeFaceLabel(e.target.value);
          fd.labelText = normalized;
          this.quickDetectorSettings.faceLabelText = normalized;
          e.target.value = fd.labelText;
          this.updateQuickDetectorControlsUI();
          this.saveQuickDetectorSettings();
          this.saveActiveEffectSettings();
        });
      }

      const inpColor = el.querySelector('#inpFaceColor');
      const swatch = el.querySelector('#faceColorSwatch');
      if (inpColor && swatch) {
        inpColor.addEventListener('input', e => {
          fd.boxColor = e.target.value;
          this.quickDetectorSettings.faceBoxColor = e.target.value;
          swatch.style.background = e.target.value;
          this.updateQuickDetectorControlsUI();
          this.scheduleSaveQuickDetectorSettings();
          this.scheduleSaveActiveEffectSettings();
        });
      }

      el.querySelector('#chkShowLandmarks').addEventListener('change', e => {
        fd.showLandmarks = e.target.checked;
        this.scheduleSaveActiveEffectSettings();
      });
      syncFaceModeUI();
    });

    return el;
  }

  // --- Blink Detection Config ---
  proto.buildBlinkConfig = function () {
    const bd = this.blinkDetectionEffect;
    const el = this.createSection('Detección de pestañeos', `
      <div class="config-block">
        <div class="config-block-title">Configuración</div>
        <div class="help-text">Cuando cerrás un ojo, se dibujan líneas entre los objetos detectados. Necesitás tener el detector de objetos activado para ver las conexiones.</div>
        ${this.slider('sldEar', 'valEar', 'Sensibilidad (cuanto más alto, más fácil detectar)', bd.eyeArThreshold, 0.10, 0.40, 0.01)}
        ${this.slider('sldBlinkInterval', 'valBlinkInterval', 'Intervalo de análisis (ms)', bd.processIntervalMs, 16, 80)}
        ${this.slider('sldBlinkClosedFrames', 'valBlinkClosedFrames', 'Frames cerrados mínimos', bd.minClosedFrames, 1, 4)}
        ${this.slider('sldBlinkSmoothing', 'valBlinkSmoothing', 'Suavizado del párpado (%)', Math.round((bd._earSmoothing || 0) * 100), 0, 90)}
      </div>
    `);

    requestAnimationFrame(() => {
      const sld = el.querySelector('#sldEar');
      const val = el.querySelector('#valEar');
      sld.addEventListener('input', e => {
        bd.eyeArThreshold = parseFloat(e.target.value);
        val.textContent = bd.eyeArThreshold.toFixed(2);
        this.scheduleSaveActiveEffectSettings();
      });
      this.bindSlider(el, 'sldBlinkInterval', 'valBlinkInterval', v => {
        bd.processIntervalMs = this.clamp(Math.round(v), 16, 80);
      });
      this.bindSlider(el, 'sldBlinkClosedFrames', 'valBlinkClosedFrames', v => {
        bd.minClosedFrames = this.clamp(Math.round(v), 1, 4);
      });
      this.bindSlider(el, 'sldBlinkSmoothing', 'valBlinkSmoothing', v => {
        bd._earSmoothing = this.clamp(v / 100, 0, 0.9);
      });
    });

    return el;
  }

}
