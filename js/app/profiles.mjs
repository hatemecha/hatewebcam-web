/** @param {import('./controller.mjs').AppController} proto */
export function applyProfilesMixin(proto) {
  proto.updateProfilesList = function () {
    const profiles = this.loadProfiles();
    this.profileSelect.innerHTML = '<option value="">—</option>';
    for (const name of Object.keys(profiles)) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      this.profileSelect.appendChild(opt);
    }
  }

  proto.saveCurrentProfile = function () {
    const name = prompt('Nombre para este ajuste:');
    if (!name) return;
    const profiles = this.loadProfiles();
    const config = {};
    config.display = {
      flipH: this.flipH,
      flipV: this.flipV,
      rotation: this.rotation,
      imageSettings: { ...this.imageSettings },
    };
    if (this.blobTrackingEffect) config.blob = this.blobTrackingEffect.getConfig();
    if (this.faceDetectionEffect) config.face = this.faceDetectionEffect.getConfig();
    if (this.blinkDetectionEffect) config.blink = this.blinkDetectionEffect.getConfig();
    profiles[name] = config;
    this.saveProfiles(profiles);
    this.updateProfilesList();
    this.profileSelect.value = name;
    this.showStatus(this.profileStatus, `"${name}" guardado ✓`, 'success');
    setTimeout(() => this.hideStatus(this.profileStatus), 2500);
  }

  proto.loadProfile = function () {
    const name = this.profileSelect.value;
    if (!name) return;
    const profiles = this.loadProfiles();
    const config = profiles[name];
    if (!config) return;
    if (config.display) {
      if (typeof config.display.flipH === 'boolean') {
        this.flipH = config.display.flipH;
        this.chkMirror.checked = this.flipH;
      }
      if (typeof config.display.flipV === 'boolean') {
        this.flipV = config.display.flipV;
        this.chkFlipV.checked = this.flipV;
      }
      if (typeof config.display.rotation === 'number') {
        this.rotation = config.display.rotation;
        this.rotationSelect.value = String(this.rotation);
      }
      if (config.display.imageSettings) {
        this.imageSettings = { ...this.imageSettings, ...config.display.imageSettings };
        this.updateImageControlsUI();
        this.saveImageSettings();
      }
    }
    if (config.blob) {
      if (config.blob.boxColor) this.quickDetectorSettings.blobBoxColor = config.blob.boxColor;
      if (this.blobTrackingEffect) this.blobTrackingEffect.setConfig(config.blob);
    }
    if (config.face) {
      if (config.face.boxColor) this.quickDetectorSettings.faceBoxColor = config.face.boxColor;
      if (config.face.labelText != null) this.quickDetectorSettings.faceLabelText = this.normalizeFaceLabel(config.face.labelText);
      if (config.face.showBox != null) this.quickDetectorSettings.faceShowBox = !!config.face.showBox;
      if (config.face.showBlur != null) this.quickDetectorSettings.faceShowBlur = !!config.face.showBlur;
      if (config.face.visualMode != null) {
        const legacy = this.faceFlagsFromVisualMode(config.face.visualMode);
        if (config.face.showBox == null) this.quickDetectorSettings.faceShowBox = legacy.showBox;
        if (config.face.showBlur == null) this.quickDetectorSettings.faceShowBlur = legacy.showBlur;
      }
      if (config.face.pixelationCellSize != null) {
        this.quickDetectorSettings.facePixelationCellSize = this.clamp(parseInt(config.face.pixelationCellSize, 10) || this.quickDetectorSettings.facePixelationCellSize, 4, 48);
      }
      if (config.face.censorPaddingPercent != null) {
        this.quickDetectorSettings.faceCensorPaddingPercent = this.clamp(parseInt(config.face.censorPaddingPercent, 10) || this.quickDetectorSettings.faceCensorPaddingPercent, 0, 48);
      }
      if (this.faceDetectionEffect) this.faceDetectionEffect.setConfig(config.face);
    }
    if (config.blink && this.blinkDetectionEffect) this.blinkDetectionEffect.setConfig(config.blink);
    this.applyQuickDetectorSettingsToEffects();
    this.updateQuickDetectorControlsUI();
    this.saveQuickDetectorSettings();
    this.renderEffectConfig();
    this.showStatus(this.profileStatus, `"${name}" cargado ✓`, 'success');
    setTimeout(() => this.hideStatus(this.profileStatus), 2500);
  }

  proto.deleteProfile = function () {
    const name = this.profileSelect.value;
    if (!name) return;
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    const profiles = this.loadProfiles();
    delete profiles[name];
    this.saveProfiles(profiles);
    this.updateProfilesList();
    this.showStatus(this.profileStatus, `"${name}" eliminado`, 'warning');
    setTimeout(() => this.hideStatus(this.profileStatus), 2500);
  }

}
