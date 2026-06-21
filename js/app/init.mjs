/** @param {import('./controller.mjs').AppController} proto */
export function applyInitMixin(proto) {
  proto.init = async function () {
    const cfg = this.loadConfig();
    // Migration: default mirror OFF to keep natural camera orientation on launch.
    if (cfg.forceMirrorDefaultV3 !== true) {
      cfg.flipH = false;
      cfg.forceMirrorDefaultV3 = true;
      this.saveConfig(cfg);
    }
    if (cfg.forceMirrorDefaultV4 !== true) {
      cfg.flipH = false;
      cfg.forceMirrorDefaultV4 = true;
      this.saveConfig(cfg);
    }
    if (cfg.faceVisualModeDefaultV2 !== true) {
      const savedQuickDetectorSettings = cfg.quickDetectorSettings || {};
      const legacyFlags = this.normalizeFaceVisualFlags(savedQuickDetectorSettings);
      if (!savedQuickDetectorSettings.faceShowBox && !savedQuickDetectorSettings.faceShowBlur
        && (!savedQuickDetectorSettings.faceVisualMode || savedQuickDetectorSettings.faceVisualMode === 'pixelate')) {
        legacyFlags.showBox = true;
        legacyFlags.showBlur = false;
      }
      cfg.quickDetectorSettings = {
        ...savedQuickDetectorSettings,
        faceShowBox: legacyFlags.showBox,
        faceShowBlur: legacyFlags.showBlur,
      };
      cfg.faceVisualModeDefaultV2 = true;
      this.saveConfig(cfg);
    }
    if (this.migrateResponsiveEditorDefaults(cfg)) {
      this.saveConfig(cfg);
    }
    if (typeof cfg.flipH === 'boolean') this.flipH = cfg.flipH;
    else this.flipH = false;
    if (this.chkMirror) this.chkMirror.checked = this.flipH;

    if (typeof cfg.flipV === 'boolean') this.flipV = cfg.flipV;
    if (this.chkFlipV) this.chkFlipV.checked = this.flipV;

    if (cfg.rotation != null) {
      this.rotation = cfg.rotation;
      if (this.rotationSelect) this.rotationSelect.value = String(cfg.rotation);
    }
    this.setAdvancedOptionsVisible(!!cfg.showAdvancedOptions);
    this.loadQuickDetectorSettings(cfg);
    this.updateQuickDetectorControlsUI();
    this.loadImageSettings(cfg);
    this.updateImageControlsUI();
    this.mobileActivePreset = null;
    this.updateMobilePresetButtons(this.mobileActivePreset);
    this.preferredDeviceId = typeof cfg.deviceId === 'string' && cfg.deviceId ? cfg.deviceId : null;
    if (this.cameraSelect) {
      this.cameraSelect.innerHTML = '<option value="">Cargando cámaras...</option>';
      this.cameraSelect.disabled = true;
    }

    this.updateProfilesList();
    this.bindEvents();
    this.bindTimelinePaletteDrag();
    this.bindQuickDetectorEvents();
    this.bindImageControlEvents();
    this.syncMobileViewportState();
    this.setMobileFxPanelVisible(false);
    this.updateCaptureButtons();

    // Auto-start camera on load (if browser allows it) without blocking UI init.
    void this.toggleCamera(true);
    void this.refreshCameraDevices(this.preferredDeviceId);
  }

}
