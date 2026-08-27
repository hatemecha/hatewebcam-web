import { normalizePreviewQuality } from './constants.mjs';
import { translate } from '../i18n.mjs';
/** @param {import('./controller.mjs').AppController} proto */
export function applyStorageMixin(proto) {
  proto.loadJsonStorage = function (key, fallbackValue) {
    return this.settingsStore.loadJson(key, fallbackValue);
  };

  proto.notifyStorageUnavailable = function (err) {
    console.warn(
      'HateWebcam: no se pudieron guardar los ajustes locales.',
      err,
    );
    if (this.storageWarningShown) return;
    this.storageWarningShown = true;
    this.showStatus(
      this.captureStatus || this.profileStatus,
      'No se pudieron guardar los ajustes locales en este navegador.',
      'warning',
    );
  };

  proto.saveJsonStorage = function (key, value) {
    return this.settingsStore.saveJson(key, value);
  };

  proto.loadConfig = function () {
    return this.settingsStore.loadObject(this.STORAGE_KEY);
  };
  proto.saveConfig = function (cfg) {
    return this.saveJsonStorage(this.STORAGE_KEY, cfg);
  };
  proto.loadProfiles = function () {
    return this.settingsStore.loadObject(this.PROFILES_KEY);
  };
  proto.saveProfiles = function (p) {
    return this.saveJsonStorage(this.PROFILES_KEY, p);
  };

  proto.clamp = function (v, min, max) {
    return Math.min(max, Math.max(min, v));
  };

  proto.toFiniteNumber = function (value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  proto.escapeHtml = function (value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  proto.normalizeHexColor = function (value, fallback = '#ffffff') {
    const color = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  };

  proto.normalizeFaceLabel = function (value) {
    const label = String(value || '').trim();
    return label ? label.slice(0, 28) : 'CARA';
  };

  proto.normalizeFaceVisualMode = function (value) {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    return ['pixelate', 'box', 'hybrid'].includes(normalized)
      ? normalized
      : 'box';
  };

  proto.faceVisualModeFromFlags = function (showBox, showBlur) {
    if (showBox && showBlur) return 'hybrid';
    if (showBlur) return 'pixelate';
    return 'box';
  };

  proto.faceFlagsFromVisualMode = function (mode) {
    const normalized = this.normalizeFaceVisualMode(mode);
    return {
      showBox: normalized === 'box' || normalized === 'hybrid',
      showBlur: normalized === 'pixelate' || normalized === 'hybrid',
    };
  };

  proto.normalizeFaceVisualFlags = function (
    settings = this.quickDetectorSettings,
  ) {
    let showBox = settings.faceShowBox;
    let showBlur = settings.faceShowBlur;
    if (
      showBox == null &&
      showBlur == null &&
      settings.faceVisualMode != null
    ) {
      const legacy = this.faceFlagsFromVisualMode(settings.faceVisualMode);
      showBox = legacy.showBox;
      showBlur = legacy.showBlur;
    }
    showBox = showBox !== false;
    showBlur = !!showBlur;
    if (!showBox && !showBlur) showBox = true;
    return { showBox, showBlur };
  };

  proto.getFaceVisualMode = function (settings = this.quickDetectorSettings) {
    const { showBox, showBlur } = this.normalizeFaceVisualFlags(settings);
    return this.faceVisualModeFromFlags(showBox, showBlur);
  };

  proto.normalizeCaptureTimerSeconds = function (value) {
    const seconds = parseInt(value, 10);
    return [0, 5, 10].includes(seconds) ? seconds : 0;
  };

  proto.getCurrentPreviewQualityPreset = function () {
    return this.PREVIEW_QUALITY_PRESETS[
      normalizePreviewQuality(this.imageSettings.previewQuality)
    ];
  };

  proto.isFaceBoxVisualMode = function (settings = this.quickDetectorSettings) {
    return this.normalizeFaceVisualFlags(settings).showBox;
  };

  proto.isFacePixelVisualMode = function (
    settings = this.quickDetectorSettings,
  ) {
    return this.normalizeFaceVisualFlags(settings).showBlur;
  };

  proto.applyFaceVisualFlags = function (showBox, showBlur, options = {}) {
    const normalized = this.normalizeFaceVisualFlags({
      faceShowBox: showBox,
      faceShowBlur: showBlur,
    });
    this.quickDetectorSettings.faceShowBox = normalized.showBox;
    this.quickDetectorSettings.faceShowBlur = normalized.showBlur;
    if (this.faceDetectionEffect) {
      this.faceDetectionEffect.showBox = normalized.showBox;
      this.faceDetectionEffect.showBlur = normalized.showBlur;
    }
    if (options.updateUI !== false) this.updateQuickDetectorControlsUI();
    if (options.renderConfig !== false) this.renderEffectConfig();
    if (options.updateInfo !== false) this.updateEffectsInfo();
    if (options.saveQuick !== false) this.scheduleSaveQuickDetectorSettings();
    if (options.saveEffect !== false) this.scheduleSaveActiveEffectSettings();
    if (this.sourceMode === 'video') this.scheduleSyncSelectedClipConfig();
  };

  proto.bindFaceVisualToggle = function (input, peerInput, changed) {
    if (!input) return;
    input.addEventListener('change', () => {
      let showBox = changed === 'box' ? input.checked : !!peerInput?.checked;
      let showBlur = changed === 'blur' ? input.checked : !!peerInput?.checked;
      if (!showBox && !showBlur) {
        input.checked = true;
        if (changed === 'box') showBox = true;
        else showBlur = true;
      }
      this.applyFaceVisualFlags(showBox, showBlur);
    });
  };

  proto.updateMobilePresetButtons = function (activePreset = null) {
    this.presetButtons.forEach((btn) => {
      const match = activePreset && btn.dataset.preset === activePreset;
      btn.classList.toggle('is-active', !!match);
      btn.setAttribute('aria-pressed', String(!!match));
    });
    this.mobilePresetButtons.forEach((btn) => {
      const match = activePreset && btn.dataset.mobilePreset === activePreset;
      btn.classList.toggle('is-active', !!match);
      btn.setAttribute('aria-pressed', String(!!match));
    });
  };

  proto.getMatchingImagePreset = function () {
    const keys = [
      'blackAndWhite',
      'exposure',
      'shadows',
      'highlights',
      'contrast',
      'saturation',
      'temperature',
      'detail',
      'sharpness',
    ];
    const presets = {
      natural: [false, 0, 0, 0, 100, 100, 0, 0, 0],
      vivid: [false, 8, 12, -10, 116, 135, 8, 24, 12],
      cinema: [false, -8, 18, -22, 112, 88, -6, 12, 8],
      bw: [true, 0, 12, -10, 118, 0, 0, 20, 10],
    };
    return (
      Object.entries(presets).find(([, values]) =>
        keys.every((key, index) => this.imageSettings[key] === values[index]),
      )?.[0] || null
    );
  };

  proto.isMobileViewport = function () {
    return window.matchMedia('(max-width: 900px)').matches;
  };

  proto.isMobileFxPanelVisible = function () {
    return (
      !!this.mobileFxPanel && !this.mobileFxPanel.classList.contains('hidden')
    );
  };

  proto.getEffectiveFlipH = function () {
    return !!this.flipH;
  };

  proto.setMobileFxPanelVisible = function (visible) {
    if (this.mobileFxPanel) {
      this.mobileFxPanel.classList.toggle('hidden', !visible);
    }
    if (this.mobileFxBackdrop) {
      this.mobileFxBackdrop.classList.toggle('hidden', !visible);
    }
    if (this.btnMobileEffectsDock) {
      this.btnMobileEffectsDock.classList.toggle('is-active', !!visible);
      this.btnMobileEffectsDock.setAttribute(
        'aria-expanded',
        String(!!visible),
      );
    }
    if (this.isRunning && this.isMobileViewport()) {
      if (this.videoEl && this.videoEl.paused) {
        void this.videoEl.play().catch(() => {});
      }
      this.requestPreviewRefresh(true);
    }
  };

  proto.syncMobileViewportState = function () {
    if (!this.isMobileViewport()) {
      this.setMobileFxPanelVisible(false);
    }
  };

  proto.shouldSuppressMediaPipeConsoleNoise = function (args) {
    if (!Array.isArray(args) || args.length === 0) return false;
    const joined = args.filter((arg) => typeof arg === 'string').join(' ');
    if (!joined) return false;
    const isMediaPipeLog =
      joined.includes('face_mesh_solution') || joined.includes('gl_context');
    if (!isMediaPipeLog) return false;
    return this.MEDIAPIPE_CONSOLE_NOISE_PATTERNS.some((pattern) =>
      joined.includes(pattern),
    );
  };

  proto.installMediaPipeConsoleNoiseFilter = function () {
    if (this.mediaPipeConsoleFilterInstalled) return;
    this.mediaPipeConsoleFilterInstalled = true;
    const controller = this;

    ['log', 'info', 'warn'].forEach((method) => {
      // eslint-disable-next-line no-console
      const original = console[method];
      if (typeof original !== 'function') return;
      // eslint-disable-next-line no-console
      console[method] = function patchedConsoleMethod(...args) {
        if (controller.shouldSuppressMediaPipeConsoleNoise(args)) return;
        return original.apply(this, args);
      };
    });
  };

  proto.ensureFaceMeshLoaded = function () {
    this.installMediaPipeConsoleNoiseFilter();
    globalThis.HATEWEBCAM_MEDIAPIPE_FACE_MESH_BASE_URL =
      this.MEDIAPIPE_FACE_MESH_BASE_URL;

    if (typeof FaceMesh !== 'undefined') {
      return Promise.resolve();
    }

    if (this.faceMeshScriptLoadPromise) {
      return this.faceMeshScriptLoadPromise;
    }

    const existing = Array.from(document.scripts).find((s) => {
      const src = s.getAttribute('src') || '';
      return src.endsWith('/face_mesh.js');
    });

    this.faceMeshScriptLoadPromise = new Promise((resolve, reject) => {
      const handleLoaded = () => {
        if (typeof FaceMesh === 'undefined') {
          reject(new Error('mediapipe_facemesh_unavailable'));
          return;
        }
        resolve();
      };

      const handleError = () => {
        reject(new Error('mediapipe_facemesh_load_failed'));
      };

      if (existing) {
        existing.addEventListener('load', handleLoaded, { once: true });
        existing.addEventListener('error', handleError, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = this.MEDIAPIPE_FACE_MESH_SRC;
      script.async = true;
      script.addEventListener('load', handleLoaded, { once: true });
      script.addEventListener('error', handleError, { once: true });
      document.head.appendChild(script);
    }).catch((err) => {
      this.faceMeshScriptLoadPromise = null;
      throw err;
    });

    return this.faceMeshScriptLoadPromise;
  };

  proto.loadQuickDetectorSettings = function (cfg) {
    const saved = cfg.quickDetectorSettings || {};
    this.quickDetectorSettings = {
      ...this.DEFAULT_QUICK_DETECTOR_SETTINGS,
      ...saved,
    };
    this.quickDetectorSettings.faceLabelText = this.normalizeFaceLabel(
      this.quickDetectorSettings.faceLabelText,
    );
    const faceFlags = this.normalizeFaceVisualFlags(this.quickDetectorSettings);
    this.quickDetectorSettings.faceShowBox = faceFlags.showBox;
    this.quickDetectorSettings.faceShowBlur = faceFlags.showBlur;
    this.quickDetectorSettings.facePixelationCellSize = this.clamp(
      parseInt(this.quickDetectorSettings.facePixelationCellSize, 10) || 14,
      4,
      48,
    );
    this.quickDetectorSettings.faceCensorPaddingPercent = this.clamp(
      parseInt(this.quickDetectorSettings.faceCensorPaddingPercent, 10) || 18,
      0,
      48,
    );
  };

  proto.saveQuickDetectorSettings = function () {
    const cfg = this.loadConfig();
    cfg.quickDetectorSettings = { ...this.quickDetectorSettings };
    this.saveConfig(cfg);
  };

  proto.scheduleSaveQuickDetectorSettings = function () {
    if (this.saveQuickDetectorSettingsTimer)
      clearTimeout(this.saveQuickDetectorSettingsTimer);
    this.saveQuickDetectorSettingsTimer = setTimeout(() => {
      this.saveQuickDetectorSettingsTimer = null;
      this.saveQuickDetectorSettings();
    }, 120);
  };

  proto.syncAdvancedQuickInputs = function () {
    const advBlobColorInput = document.querySelector('#inpBoxColor');
    const advBlobColorSwatch = document.querySelector('#boxColorSwatch');
    const advFaceColorInput = document.querySelector('#inpFaceColor');
    const advFaceColorSwatch = document.querySelector('#faceColorSwatch');
    const advFaceLabelInput = document.querySelector('#inpFaceLabel');

    if (advBlobColorInput)
      advBlobColorInput.value = this.quickDetectorSettings.blobBoxColor;
    if (advBlobColorSwatch)
      advBlobColorSwatch.style.background =
        this.quickDetectorSettings.blobBoxColor;
    if (advFaceColorInput)
      advFaceColorInput.value = this.quickDetectorSettings.faceBoxColor;
    if (advFaceColorSwatch)
      advFaceColorSwatch.style.background =
        this.quickDetectorSettings.faceBoxColor;
    if (advFaceLabelInput && document.activeElement !== advFaceLabelInput) {
      advFaceLabelInput.value = this.quickDetectorSettings.faceLabelText;
    }
  };

  proto.updateQuickDetectorControlsUI = function () {
    const faceFlags = this.normalizeFaceVisualFlags(this.quickDetectorSettings);
    this.quickDetectorSettings.faceShowBox = faceFlags.showBox;
    this.quickDetectorSettings.faceShowBlur = faceFlags.showBlur;
    const showFaceBoxVisuals = faceFlags.showBox;

    if (this.inpBlobQuickColor)
      this.inpBlobQuickColor.value = this.quickDetectorSettings.blobBoxColor;
    if (this.blobQuickColorSwatch)
      this.blobQuickColorSwatch.style.background =
        this.quickDetectorSettings.blobBoxColor;
    if (this.inpFaceQuickColor)
      this.inpFaceQuickColor.value = this.quickDetectorSettings.faceBoxColor;
    if (this.faceQuickColorSwatch)
      this.faceQuickColorSwatch.style.background =
        this.quickDetectorSettings.faceBoxColor;
    if (this.chkFaceShowBox) this.chkFaceShowBox.checked = faceFlags.showBox;
    if (this.chkFaceShowBlur) this.chkFaceShowBlur.checked = faceFlags.showBlur;
    if (
      this.inpFaceQuickLabel &&
      document.activeElement !== this.inpFaceQuickLabel
    ) {
      this.inpFaceQuickLabel.value = this.quickDetectorSettings.faceLabelText;
    }
    if (this.colorPickSection) {
      const showBlobControls =
        this.sourceMode === 'video'
          ? this.getSelectedVideoEffectItem()?.type === 'blob'
          : this.chkBlobTracking.checked;
      this.colorPickSection.classList.toggle('hidden', !showBlobControls);
    }
    if (this.faceQuickControls) {
      const showFaceControls =
        this.sourceMode === 'video'
          ? this.getSelectedVideoEffectItem()?.type === 'face'
          : this.chkFaceDetection.checked;
      this.faceQuickControls.classList.toggle('hidden', !showFaceControls);
    }
    if (this.faceQuickColorChip) {
      this.faceQuickColorChip.classList.toggle('hidden', !showFaceBoxVisuals);
    }
    if (this.faceQuickLabelWrap) {
      this.faceQuickLabelWrap.classList.toggle('hidden', !showFaceBoxVisuals);
    }
    if (this.inpFaceQuickLabel) {
      this.inpFaceQuickLabel.disabled = !showFaceBoxVisuals;
    }
    if (this.inpMobileBlobColor)
      this.inpMobileBlobColor.value = this.quickDetectorSettings.blobBoxColor;
    if (this.inpMobileFaceColor)
      this.inpMobileFaceColor.value = this.quickDetectorSettings.faceBoxColor;
    if (this.chkMobileFaceShowBox)
      this.chkMobileFaceShowBox.checked = faceFlags.showBox;
    if (this.chkMobileFaceShowBlur)
      this.chkMobileFaceShowBlur.checked = faceFlags.showBlur;
    if (
      this.inpMobileFaceLabel &&
      document.activeElement !== this.inpMobileFaceLabel
    ) {
      this.inpMobileFaceLabel.value = this.quickDetectorSettings.faceLabelText;
    }
    if (this.mobileFaceColorChip) {
      this.mobileFaceColorChip.classList.toggle('hidden', !showFaceBoxVisuals);
    }
    if (this.mobileFaceLabelWrap) {
      this.mobileFaceLabelWrap.classList.toggle('hidden', !showFaceBoxVisuals);
    }
    if (this.inpMobileFaceLabel) {
      this.inpMobileFaceLabel.disabled = !showFaceBoxVisuals;
    }
    if (this.btnMobileBlobToggle) {
      this.btnMobileBlobToggle.classList.toggle(
        'is-active',
        !!this.chkBlobTracking.checked,
      );
      this.btnMobileBlobToggle.setAttribute(
        'aria-pressed',
        String(!!this.chkBlobTracking.checked),
      );
    }
    if (this.btnMobileFaceToggle) {
      this.btnMobileFaceToggle.classList.toggle(
        'is-active',
        !!this.chkFaceDetection.checked,
      );
      this.btnMobileFaceToggle.setAttribute(
        'aria-pressed',
        String(!!this.chkFaceDetection.checked),
      );
    }
    if (this.btnMobileBlinkToggle) {
      this.btnMobileBlinkToggle.classList.toggle(
        'is-active',
        !!this.chkBlinkDetection.checked,
      );
      this.btnMobileBlinkToggle.setAttribute(
        'aria-pressed',
        String(!!this.chkBlinkDetection.checked),
      );
    }
    this.syncAdvancedQuickInputs();
    this.updateColorPaletteSelections?.();
    this.updateCaptureButtons();
    this.updateVideoEffectInspector();
    this.updateVideoEditorUI();
  };

  proto.applyQuickDetectorSettingsToEffects = function () {
    if (this.blobTrackingEffect)
      this.blobTrackingEffect.boxColor =
        this.quickDetectorSettings.blobBoxColor;
    if (this.faceDetectionEffect) {
      this.faceDetectionEffect.setConfig({
        boxColor: this.quickDetectorSettings.faceBoxColor,
        labelText: this.quickDetectorSettings.faceLabelText,
        showBox: this.quickDetectorSettings.faceShowBox,
        showBlur: this.quickDetectorSettings.faceShowBlur,
        pixelationCellSize: this.quickDetectorSettings.facePixelationCellSize,
        censorPaddingPercent:
          this.quickDetectorSettings.faceCensorPaddingPercent,
      });
    }
  };

  proto.syncQuickDetectorSettingsFromEffects = function () {
    if (this.blobTrackingEffect)
      this.quickDetectorSettings.blobBoxColor =
        this.blobTrackingEffect.boxColor ||
        this.quickDetectorSettings.blobBoxColor;
    if (this.faceDetectionEffect) {
      this.quickDetectorSettings.faceBoxColor =
        this.faceDetectionEffect.boxColor ||
        this.quickDetectorSettings.faceBoxColor;
      this.quickDetectorSettings.faceLabelText = this.normalizeFaceLabel(
        this.faceDetectionEffect.labelText,
      );
      this.quickDetectorSettings.faceShowBox =
        this.faceDetectionEffect.showBox !== false;
      this.quickDetectorSettings.faceShowBlur =
        !!this.faceDetectionEffect.showBlur;
      this.quickDetectorSettings.facePixelationCellSize = this.clamp(
        parseInt(this.faceDetectionEffect.pixelationCellSize, 10) ||
          this.quickDetectorSettings.facePixelationCellSize,
        4,
        48,
      );
      this.quickDetectorSettings.faceCensorPaddingPercent = this.clamp(
        parseInt(this.faceDetectionEffect.censorPaddingPercent, 10) ||
          this.quickDetectorSettings.faceCensorPaddingPercent,
        0,
        48,
      );
    }
    this.updateQuickDetectorControlsUI();
    this.saveQuickDetectorSettings();
  };

  proto.getSavedEffectConfig = function (type) {
    const cfg = this.loadConfig();
    return cfg.effectSettings && cfg.effectSettings[type]
      ? cfg.effectSettings[type]
      : null;
  };

  proto.saveActiveEffectSettings = function () {
    const cfg = this.loadConfig();
    cfg.effectSettings = {
      ...(cfg.effectSettings || {}),
    };

    if (this.blobTrackingEffect)
      cfg.effectSettings.blob = this.blobTrackingEffect.getConfig();
    if (this.faceDetectionEffect)
      cfg.effectSettings.face = this.faceDetectionEffect.getConfig();
    if (this.blinkDetectionEffect)
      cfg.effectSettings.blink = this.blinkDetectionEffect.getConfig();

    this.saveConfig(cfg);
  };

  proto.scheduleSaveActiveEffectSettings = function () {
    this.refreshPausedVideoPreview?.();
    if (this.saveEffectSettingsTimer)
      clearTimeout(this.saveEffectSettingsTimer);
    this.saveEffectSettingsTimer = setTimeout(() => {
      this.saveEffectSettingsTimer = null;
      this.saveActiveEffectSettings();
      this.scheduleSyncSelectedClipConfig();
    }, 140);
  };

  proto.syncSelectedClipConfig = function () {
    if (this.sourceMode !== 'video' || !this.selectedVideoEffectId) return;
    const item = this.videoTimeline.items.find(
      (candidate) => candidate.id === this.selectedVideoEffectId,
    );
    if (!item) return;
    try {
      this.videoTimeline.upsert({
        ...item,
        config: this.snapshotVideoEffectConfig(item.type),
      });
      if (item.type === 'look') {
        this.syncVideoTimelineLookNow({ force: true });
      } else {
        void this.syncVideoTimelineEffects(true);
      }
      this.refreshPausedVideoPreview?.();
    } catch (err) {
      console.warn('No se pudo actualizar el clip seleccionado:', err.message);
    }
  };

  proto.flushPendingClipConfigSync = function () {
    if (this.saveImageSettingsTimer) {
      clearTimeout(this.saveImageSettingsTimer);
      this.saveImageSettingsTimer = null;
      this.saveImageSettings();
    }
    if (this.syncSelectedClipConfigTimer) {
      clearTimeout(this.syncSelectedClipConfigTimer);
      this.syncSelectedClipConfigTimer = null;
    }
    this.syncLookClipConfigNow?.();
    this.syncSelectedClipConfig();
  };

  proto.scheduleSyncSelectedClipConfig = function () {
    if (this.sourceMode !== 'video' || !this.selectedVideoEffectId) return;
    if (this.syncSelectedClipConfigTimer)
      clearTimeout(this.syncSelectedClipConfigTimer);
    this.syncSelectedClipConfigTimer = setTimeout(() => {
      this.syncSelectedClipConfigTimer = null;
      this.syncSelectedClipConfig();
    }, 120);
  };

  proto.migrateResponsiveEditorDefaults = function (cfg) {
    if (cfg.responsiveEditorDefaultsV1 === true) return false;
    cfg.imageSettings = { ...(cfg.imageSettings || {}) };
    if (
      !cfg.imageSettings.previewQuality ||
      cfg.imageSettings.previewQuality === 'high'
    ) {
      cfg.imageSettings.previewQuality = 'balanced';
    }
    cfg.effectSettings = { ...(cfg.effectSettings || {}) };
    cfg.effectSettings.blob = {
      ...(cfg.effectSettings.blob || {}),
      processScale: 0.45,
      processIntervalMs: 33,
    };
    cfg.effectSettings.face = {
      ...(cfg.effectSettings.face || {}),
      processIntervalMs: 30,
      boxSmoothing: 0.5,
      detectionHoldMs: 120,
    };
    cfg.effectSettings.blink = {
      ...(cfg.effectSettings.blink || {}),
      processIntervalMs: 30,
      minClosedFrames: 1,
      earSmoothing: 0.35,
    };
    cfg.responsiveEditorDefaultsV1 = true;
    return true;
  };

  proto.loadImageSettings = function (cfg) {
    const saved = cfg.imageSettings || {};
    if (saved.performanceMode == null && saved.previewQuality != null) {
      const legacyQuality = normalizePreviewQuality(saved.previewQuality);
      saved.performanceMode =
        legacyQuality === 'draft'
          ? 'performance'
          : ['high', 'full'].includes(legacyQuality)
            ? 'quality'
            : 'normal';
    }
    this.imageSettings = {
      ...this.DEFAULT_IMAGE_SETTINGS,
      ...saved,
    };
    this.imageSettings.performanceMode = this.normalizePerformanceMode(
      this.imageSettings.performanceMode,
    );
    this.imageSettings.exposure = this.clamp(
      parseInt(this.imageSettings.exposure, 10) || 0,
      -100,
      100,
    );
    this.imageSettings.shadows = this.clamp(
      parseInt(this.imageSettings.shadows, 10) || 0,
      -100,
      100,
    );
    this.imageSettings.highlights = this.clamp(
      parseInt(this.imageSettings.highlights, 10) || 0,
      -100,
      100,
    );
    this.imageSettings.contrast = this.clamp(
      parseInt(this.imageSettings.contrast, 10) || 100,
      50,
      180,
    );
    this.imageSettings.saturation = this.clamp(
      parseInt(this.imageSettings.saturation, 10) || 100,
      0,
      200,
    );
    this.imageSettings.temperature = this.clamp(
      parseInt(this.imageSettings.temperature, 10) || 0,
      -100,
      100,
    );
    this.imageSettings.detail = this.clamp(
      parseInt(this.imageSettings.detail, 10) || 0,
      -100,
      100,
    );
    this.imageSettings.sharpness = this.clamp(
      parseInt(this.imageSettings.sharpness, 10) || 0,
      0,
      100,
    );
    this.imageSettings.jpegQuality = this.clamp(
      parseInt(this.imageSettings.jpegQuality, 10) || 92,
      60,
      100,
    );
    this.imageSettings.videoFormat = ['auto', 'mp4', 'webm'].includes(
      this.imageSettings.videoFormat,
    )
      ? this.imageSettings.videoFormat
      : 'auto';
    this.imageSettings.editorExportPreset = [
      'fast',
      'balanced',
      'high',
      'chroma',
      'experimental-mp4',
    ].includes(this.imageSettings.editorExportPreset)
      ? this.imageSettings.editorExportPreset
      : 'balanced';
    this.imageSettings.editorExportFormat = ['auto', 'mp4', 'webm'].includes(
      this.imageSettings.editorExportFormat,
    )
      ? this.imageSettings.editorExportFormat
      : 'webm';
    this.imageSettings.editorExportMode = ['full', 'effects-chroma'].includes(
      this.imageSettings.editorExportMode,
    )
      ? this.imageSettings.editorExportMode
      : 'full';
    this.imageSettings.experimentalExportFeatures =
      !!this.imageSettings.experimentalExportFeatures;
    this.imageSettings.editorCopyAudio =
      this.imageSettings.editorCopyAudio !== false;
    if (!this.imageSettings.experimentalExportFeatures) {
      this.imageSettings.editorExportFormat = 'webm';
      this.imageSettings.editorCopyAudio = false;
    }
    this.imageSettings.effectsExportChroma = ['green', 'blue'].includes(
      this.imageSettings.effectsExportChroma,
    )
      ? this.imageSettings.effectsExportChroma
      : 'green';
    this.imageSettings.previewQuality = normalizePreviewQuality(
      this.imageSettings.previewQuality,
    );
    this.imageSettings.captureTimerSeconds = this.normalizeCaptureTimerSeconds(
      this.imageSettings.captureTimerSeconds,
    );
    this.imageSettings.shutterSound = this.imageSettings.shutterSound !== false;
    this.imageSettings.qualityEnhancer = !!this.imageSettings.qualityEnhancer;
    const enhancerStrength = parseInt(
      this.imageSettings.qualityEnhancerStrength,
      10,
    );
    this.imageSettings.qualityEnhancerStrength = this.clamp(
      Number.isFinite(enhancerStrength) ? enhancerStrength : 35,
      0,
      100,
    );
    this.imageSettings.blackAndWhite = !!this.imageSettings.blackAndWhite;
  };

  proto.saveImageSettings = function () {
    const cfg = this.loadConfig();
    cfg.imageSettings = { ...this.imageSettings };
    this.saveConfig(cfg);
  };

  proto.scheduleSaveImageSettings = function () {
    this.syncLookClipConfigNow?.();
    this.refreshPausedVideoPreview?.();
    if (this.saveImageSettingsTimer) clearTimeout(this.saveImageSettingsTimer);
    this.saveImageSettingsTimer = setTimeout(() => {
      this.saveImageSettingsTimer = null;
      this.saveImageSettings();
    }, 100);
  };

  proto.updateImageControlsUI = function () {
    if (this.chkBlackWhite)
      this.chkBlackWhite.checked = !!this.imageSettings.blackAndWhite;
    if (this.sldExposure)
      this.sldExposure.value = String(this.imageSettings.exposure);
    if (this.valExposure)
      this.valExposure.textContent = `${this.imageSettings.exposure}`;
    if (this.sldShadows)
      this.sldShadows.value = String(this.imageSettings.shadows);
    if (this.valShadows)
      this.valShadows.textContent = `${this.imageSettings.shadows}`;
    if (this.sldHighlights)
      this.sldHighlights.value = String(this.imageSettings.highlights);
    if (this.valHighlights)
      this.valHighlights.textContent = `${this.imageSettings.highlights}`;
    if (this.sldContrast)
      this.sldContrast.value = String(this.imageSettings.contrast);
    if (this.valContrast)
      this.valContrast.textContent = `${this.imageSettings.contrast}%`;
    if (this.sldSaturation)
      this.sldSaturation.value = String(this.imageSettings.saturation);
    if (this.valSaturation)
      this.valSaturation.textContent = `${this.imageSettings.saturation}%`;
    if (this.sldTemperature)
      this.sldTemperature.value = String(this.imageSettings.temperature);
    if (this.valTemperature)
      this.valTemperature.textContent = `${this.imageSettings.temperature}`;
    if (this.sldDetail)
      this.sldDetail.value = String(this.imageSettings.detail);
    if (this.valDetail)
      this.valDetail.textContent = `${this.imageSettings.detail}`;
    if (this.sldSharpness)
      this.sldSharpness.value = String(this.imageSettings.sharpness);
    if (this.valSharpness)
      this.valSharpness.textContent = `${this.imageSettings.sharpness}`;

    if (this.sldJpegQuality)
      this.sldJpegQuality.value = String(this.imageSettings.jpegQuality);
    if (this.valJpegQuality)
      this.valJpegQuality.textContent = `${this.imageSettings.jpegQuality}%`;
    if (this.videoFormatSelect)
      this.videoFormatSelect.value = this.imageSettings.videoFormat;
    if (this.editorExportPresetSelect)
      this.editorExportPresetSelect.value =
        this.imageSettings.editorExportPreset;
    if (this.videoExportModeSelect)
      this.videoExportModeSelect.value = this.imageSettings.editorExportMode;
    if (this.editorExportFormatSelect)
      this.editorExportFormatSelect.value =
        this.imageSettings.editorExportFormat;
    if (this.chkEditorCopyAudio)
      this.chkEditorCopyAudio.checked = !!this.imageSettings.editorCopyAudio;
    if (this.chkExperimentalExportFeatures)
      this.chkExperimentalExportFeatures.checked =
        !!this.imageSettings.experimentalExportFeatures;
    if (this.effectsExportChromaSelect)
      this.effectsExportChromaSelect.value =
        this.imageSettings.effectsExportChroma;
    if (this.previewQualityDiagnostic) {
      this.previewQualityDiagnostic.textContent =
        this.getCurrentPreviewQualityPreset().label;
    }
    if (this.performanceModeSelect)
      this.performanceModeSelect.value = this.normalizePerformanceMode(
        this.imageSettings.performanceMode,
      );
    if (this.captureTimerSelect)
      this.captureTimerSelect.value = String(
        this.imageSettings.captureTimerSeconds,
      );
    if (this.selMobileCaptureTimer)
      this.selMobileCaptureTimer.value = String(
        this.imageSettings.captureTimerSeconds,
      );
    if (this.chkQualityEnhancer)
      this.chkQualityEnhancer.checked = !!this.imageSettings.qualityEnhancer;
    if (this.chkShutterSound)
      this.chkShutterSound.checked = this.imageSettings.shutterSound !== false;
    if (this.sldQualityEnhancerStrength)
      this.sldQualityEnhancerStrength.value = String(
        this.imageSettings.qualityEnhancerStrength,
      );
    if (this.valQualityEnhancerStrength)
      this.valQualityEnhancerStrength.textContent = `${this.imageSettings.qualityEnhancerStrength}%`;
    this.updateQualityEnhancerControls();
    this.updateEditorExportControls?.();
    this.updateBWDependentControls();
    this.mobileActivePreset = this.getMatchingImagePreset();
    this.updateMobilePresetButtons(this.mobileActivePreset);
  };

  proto.updateBWDependentControls = function () {
    const bw = !!this.imageSettings.blackAndWhite;
    if (this.sldSaturation) this.sldSaturation.disabled = bw;
    if (this.sldTemperature) this.sldTemperature.disabled = bw;
    if (this.valSaturation && bw) this.valSaturation.textContent = 'B/N';
    if (this.valTemperature && bw) this.valTemperature.textContent = 'B/N';
    if (!bw) {
      if (this.valSaturation)
        this.valSaturation.textContent = `${this.imageSettings.saturation}%`;
      if (this.valTemperature)
        this.valTemperature.textContent = `${this.imageSettings.temperature}`;
    }
  };

  proto.updateQualityEnhancerControls = function () {
    if (this.qualityEnhancerStrengthGroup) {
      this.qualityEnhancerStrengthGroup.classList.toggle(
        'hidden',
        !this.imageSettings.qualityEnhancer,
      );
    }
    if (this.sldQualityEnhancerStrength) {
      this.sldQualityEnhancerStrength.disabled =
        !this.imageSettings.qualityEnhancer;
    }
  };

  proto.bindImageControlEvents = function () {
    const bindIntSlider = (sliderEl, valueEl, key, suffix = '') => {
      if (!sliderEl || !valueEl) return;
      sliderEl.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        this.imageSettings[key] = value;
        valueEl.textContent = `${value}${suffix}`;
        this.mobileActivePreset = null;
        this.updateMobilePresetButtons(this.mobileActivePreset);
        this.scheduleSaveImageSettings();
      });
    };

    if (this.chkBlackWhite) {
      this.chkBlackWhite.addEventListener('change', (e) => {
        this.imageSettings.blackAndWhite = e.target.checked;
        this.updateBWDependentControls();
        this.mobileActivePreset = null;
        this.updateMobilePresetButtons(this.mobileActivePreset);
        this.scheduleSaveImageSettings();
      });
    }

    bindIntSlider(this.sldExposure, this.valExposure, 'exposure');
    bindIntSlider(this.sldShadows, this.valShadows, 'shadows');
    bindIntSlider(this.sldHighlights, this.valHighlights, 'highlights');
    bindIntSlider(this.sldContrast, this.valContrast, 'contrast', '%');
    bindIntSlider(this.sldSaturation, this.valSaturation, 'saturation', '%');
    bindIntSlider(this.sldTemperature, this.valTemperature, 'temperature');
    bindIntSlider(this.sldDetail, this.valDetail, 'detail');
    bindIntSlider(this.sldSharpness, this.valSharpness, 'sharpness');
    bindIntSlider(this.sldJpegQuality, this.valJpegQuality, 'jpegQuality', '%');
    bindIntSlider(
      this.sldQualityEnhancerStrength,
      this.valQualityEnhancerStrength,
      'qualityEnhancerStrength',
      '%',
    );

    if (this.videoFormatSelect) {
      this.videoFormatSelect.addEventListener('change', (e) => {
        this.imageSettings.videoFormat = e.target.value;
        this.saveImageSettings();
      });
    }

    if (this.videoExportModeSelect) {
      this.videoExportModeSelect.addEventListener('change', (e) => {
        this.imageSettings.editorExportMode = [
          'full',
          'effects-chroma',
        ].includes(e.target.value)
          ? e.target.value
          : 'full';
        this.updateEditorExportControls?.();
        this.updateVideoEditorUI?.();
        this.saveImageSettings();
      });
    }

    if (this.editorExportPresetSelect) {
      this.editorExportPresetSelect.addEventListener('change', (e) => {
        this.applyEditorExportPreset(e.target.value);
      });
    }

    if (this.editorExportFormatSelect) {
      this.editorExportFormatSelect.addEventListener('change', (e) => {
        this.imageSettings.editorExportFormat = [
          'auto',
          'mp4',
          'webm',
        ].includes(e.target.value)
          ? e.target.value
          : 'webm';
        this.updateVideoEditorUI?.();
        this.saveImageSettings();
      });
    }

    if (this.chkExperimentalExportFeatures) {
      this.chkExperimentalExportFeatures.addEventListener('change', (e) => {
        this.imageSettings.experimentalExportFeatures = !!e.target.checked;
        if (!this.imageSettings.experimentalExportFeatures) {
          this.imageSettings.editorExportFormat = 'webm';
          this.imageSettings.editorCopyAudio = false;
        }
        this.updateVideoEditorUI?.();
        this.saveImageSettings();
      });
    }

    if (this.chkEditorCopyAudio) {
      this.chkEditorCopyAudio.addEventListener('change', (e) => {
        this.imageSettings.editorCopyAudio = !!e.target.checked;
        this.updateVideoEditorUI?.();
        this.saveImageSettings();
      });
    }

    if (this.effectsExportChromaSelect) {
      this.effectsExportChromaSelect.addEventListener('change', (e) => {
        this.imageSettings.effectsExportChroma = ['green', 'blue'].includes(
          e.target.value,
        )
          ? e.target.value
          : 'green';
        this.saveImageSettings();
      });
    }

    if (this.performanceModeSelect) {
      this.performanceModeSelect.addEventListener('change', (e) => {
        void this.applyPerformanceMode(e.target.value, {
          restartCamera: true,
          notify: true,
        });
      });
    }

    const bindCaptureTimerSelect = (selectEl) => {
      if (!selectEl) return;
      selectEl.addEventListener('change', (e) => {
        this.imageSettings.captureTimerSeconds =
          this.normalizeCaptureTimerSeconds(e.target.value);
        this.updateImageControlsUI();
        this.saveImageSettings();
      });
    };
    bindCaptureTimerSelect(this.captureTimerSelect);
    bindCaptureTimerSelect(this.selMobileCaptureTimer);

    if (this.chkQualityEnhancer) {
      this.chkQualityEnhancer.addEventListener('change', (e) => {
        this.imageSettings.qualityEnhancer = e.target.checked;
        this.updateQualityEnhancerControls();
        this.saveImageSettings();
      });
    }

    if (this.chkShutterSound) {
      this.chkShutterSound.addEventListener('change', (e) => {
        this.imageSettings.shutterSound = !!e.target.checked;
        this.saveImageSettings();
      });
    }

    if (this.btnResetImageAdjustments) {
      this.btnResetImageAdjustments.addEventListener('click', () => {
        this.imageSettings = {
          ...this.DEFAULT_IMAGE_SETTINGS,
          jpegQuality: this.imageSettings.jpegQuality,
          videoFormat: this.imageSettings.videoFormat,
          editorExportPreset: this.imageSettings.editorExportPreset,
          editorExportFormat: this.imageSettings.editorExportFormat,
          editorExportMode: this.imageSettings.editorExportMode,
          editorCopyAudio: this.imageSettings.editorCopyAudio,
          experimentalExportFeatures:
            this.imageSettings.experimentalExportFeatures,
          effectsExportChroma: this.imageSettings.effectsExportChroma,
          previewQuality: this.imageSettings.previewQuality,
          performanceMode: this.imageSettings.performanceMode,
          qualityEnhancer: this.imageSettings.qualityEnhancer,
          qualityEnhancerStrength: this.imageSettings.qualityEnhancerStrength,
        };
        this.mobileActivePreset = null;
        this.updateMobilePresetButtons(this.mobileActivePreset);
        this.updateImageControlsUI();
        this.scheduleSaveImageSettings();
      });
    }

    this.presetButtons.forEach((btn) => {
      btn.addEventListener('click', () =>
        this.applyImagePreset(btn.dataset.preset),
      );
    });
    this.mobilePresetButtons.forEach((btn) => {
      btn.addEventListener('click', () =>
        this.applyImagePreset(btn.dataset.mobilePreset),
      );
    });
  };

  proto.bindQuickDetectorEvents = function () {
    if (this.inpBlobQuickColor) {
      this.inpBlobQuickColor.addEventListener('input', (e) => {
        this.quickDetectorSettings.blobBoxColor = e.target.value;
        if (this.blobTrackingEffect)
          this.blobTrackingEffect.boxColor = e.target.value;
        this.updateQuickDetectorControlsUI();
        this.scheduleSaveQuickDetectorSettings();
        this.scheduleSaveActiveEffectSettings();
      });
    }

    this.bindFaceVisualToggle(this.chkFaceShowBox, this.chkFaceShowBlur, 'box');
    this.bindFaceVisualToggle(
      this.chkFaceShowBlur,
      this.chkFaceShowBox,
      'blur',
    );

    if (this.inpFaceQuickColor) {
      this.inpFaceQuickColor.addEventListener('input', (e) => {
        this.quickDetectorSettings.faceBoxColor = e.target.value;
        if (this.faceDetectionEffect)
          this.faceDetectionEffect.boxColor = e.target.value;
        this.updateQuickDetectorControlsUI();
        this.scheduleSaveQuickDetectorSettings();
        this.scheduleSaveActiveEffectSettings();
      });
    }

    if (this.inpFaceQuickLabel) {
      this.inpFaceQuickLabel.addEventListener('input', (e) => {
        const value = String(e.target.value || '').slice(0, 28);
        this.quickDetectorSettings.faceLabelText = value || 'CARA';
        if (this.faceDetectionEffect)
          this.faceDetectionEffect.labelText = value;
        this.scheduleSaveQuickDetectorSettings();
        this.scheduleSaveActiveEffectSettings();
        this.syncAdvancedQuickInputs();
      });

      this.inpFaceQuickLabel.addEventListener('blur', (e) => {
        const normalized = this.normalizeFaceLabel(e.target.value);
        this.quickDetectorSettings.faceLabelText = normalized;
        e.target.value = normalized;
        if (this.faceDetectionEffect)
          this.faceDetectionEffect.labelText = normalized;
        this.saveQuickDetectorSettings();
        this.saveActiveEffectSettings();
        this.syncAdvancedQuickInputs();
      });
    }
  };

  proto.syncMirrorControls = function () {
    if (this.chkMirror) this.chkMirror.checked = !!this.flipH;
    for (const button of [this.btnMirrorQuick, this.btnMobileMirror]) {
      if (!button) continue;
      button.setAttribute('aria-pressed', String(!!this.flipH));
      button.classList.toggle('is-active', !!this.flipH);
    }
  };

  proto.toggleMirrorQuick = function () {
    this.flipH = !this.flipH;
    if (this.chkMirror) this.chkMirror.checked = this.flipH;
    this.onTransformChange();
  };

  proto.initializeColorPalettes = function () {
    const colors = ['#ff2222', '#ffb300', '#00c853', '#00b8d4', '#ffffff'];
    document
      .querySelectorAll('.color-palette[data-color-target]')
      .forEach((palette) => {
        if (palette.childElementCount) return;
        const input = document.getElementById(palette.dataset.colorTarget);
        if (!input) return;
        for (const color of colors) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'color-palette-swatch';
          button.dataset.color = color;
          button.style.setProperty('--swatch-color', color);
          button.setAttribute('aria-label', `Usar color ${color}`);
          button.addEventListener('click', () => {
            input.value = color;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            this.updateColorPaletteSelections();
          });
          palette.appendChild(button);
        }
        const custom = document.createElement('button');
        custom.type = 'button';
        custom.className = 'color-palette-custom';
        custom.textContent = 'Personalizado';
        custom.addEventListener('click', () => input.click());
        palette.appendChild(custom);
      });
    this.updateColorPaletteSelections();
  };

  proto.updateColorPaletteSelections = function () {
    document
      .querySelectorAll('.color-palette[data-color-target]')
      .forEach((palette) => {
        const input = document.getElementById(palette.dataset.colorTarget);
        const value = input?.value?.toLowerCase() || '';
        let matched = false;
        palette.querySelectorAll('.color-palette-swatch').forEach((button) => {
          const selected = button.dataset.color.toLowerCase() === value;
          matched ||= selected;
          button.classList.toggle('is-selected', selected);
          button.setAttribute('aria-pressed', String(selected));
        });
        palette
          .querySelector('.color-palette-custom')
          ?.classList.toggle('is-selected', !matched);
      });
  };

  proto.resetWebcamConfiguration = async function () {
    if (
      !confirm(
        translate(
          '¿Restablecer toda la configuración de webcam? Los perfiles guardados no se eliminarán.',
        ),
      )
    )
      return;
    this.cancelPhotoCountdown(false);
    const editorKeys = [
      'editorExportPreset',
      'editorExportFormat',
      'editorExportMode',
      'editorCopyAudio',
      'experimentalExportFeatures',
      'effectsExportChroma',
    ];
    const preservedEditorSettings = Object.fromEntries(
      editorKeys.map((key) => [key, this.imageSettings[key]]),
    );
    this.imageSettings = {
      ...this.DEFAULT_IMAGE_SETTINGS,
      ...preservedEditorSettings,
    };
    this.flipH = false;
    this.flipV = false;
    this.rotation = 0;
    this.quickDetectorSettings = { ...this.DEFAULT_QUICK_DETECTOR_SETTINGS };
    if (this.chkFlipV) this.chkFlipV.checked = false;
    if (this.rotationSelect) this.rotationSelect.value = '0';
    this.syncMirrorControls();

    for (const [input, type] of [
      [this.chkBlobTracking, 'blob'],
      [this.chkFaceDetection, 'face'],
      [this.chkBlinkDetection, 'blink'],
    ]) {
      if (input) input.checked = false;
      await this.toggleEffect(type);
    }

    await this.applyPerformanceMode(
      this.DEFAULT_IMAGE_SETTINGS.performanceMode,
      {
        restartCamera: false,
        notify: false,
        save: false,
      },
    );
    this.mobileActivePreset = 'natural';
    this.updateMobilePresetButtons(this.mobileActivePreset);
    this.updateImageControlsUI();
    this.updateQuickDetectorControlsUI();
    this.updateColorPaletteSelections();

    const cfg = this.loadConfig();
    cfg.flipH = false;
    cfg.flipV = false;
    cfg.rotation = 0;
    cfg.imageSettings = { ...this.imageSettings };
    cfg.quickDetectorSettings = { ...this.quickDetectorSettings };
    cfg.activeDetectors = { blob: false, face: false, blink: false };
    cfg.effectSettings = { ...(cfg.effectSettings || {}) };
    delete cfg.effectSettings.blob;
    delete cfg.effectSettings.face;
    delete cfg.effectSettings.blink;
    this.saveConfig(cfg);
    this.showStatus(
      this.captureStatus,
      'Configuración de webcam restablecida',
      'success',
    );
    setTimeout(() => this.hideStatus(this.captureStatus), 2200);
  };

  proto.applyImagePreset = function (name) {
    if (name === 'natural') {
      this.imageSettings = {
        ...this.imageSettings,
        blackAndWhite: false,
        exposure: 0,
        shadows: 0,
        highlights: 0,
        contrast: 100,
        saturation: 100,
        temperature: 0,
        detail: 0,
        sharpness: 0,
      };
    } else if (name === 'vivid') {
      this.imageSettings = {
        ...this.imageSettings,
        blackAndWhite: false,
        exposure: 8,
        shadows: 12,
        highlights: -10,
        contrast: 116,
        saturation: 135,
        temperature: 8,
        detail: 24,
        sharpness: 12,
      };
    } else if (name === 'cinema') {
      this.imageSettings = {
        ...this.imageSettings,
        blackAndWhite: false,
        exposure: -8,
        shadows: 18,
        highlights: -22,
        contrast: 112,
        saturation: 88,
        temperature: -6,
        detail: 12,
        sharpness: 8,
      };
    } else if (name === 'bw') {
      this.imageSettings = {
        ...this.imageSettings,
        blackAndWhite: true,
        exposure: 0,
        shadows: 12,
        highlights: -10,
        contrast: 118,
        saturation: 0,
        temperature: 0,
        detail: 20,
        sharpness: 10,
      };
    }
    this.mobileActivePreset = name;
    this.updateMobilePresetButtons(this.mobileActivePreset);
    this.updateImageControlsUI();
    this.scheduleSaveImageSettings();
  };

  proto.setAdvancedOptionsVisible = function (visible) {
    if (!this.advancedOptions || !this.btnToggleAdvancedOptions) return;

    this.advancedOptions.classList.toggle('hidden', !visible);
    this.btnToggleAdvancedOptions.classList.toggle('is-open', visible);
    this.btnToggleAdvancedOptions.setAttribute(
      'aria-expanded',
      String(visible),
    );

    if (this.advancedToggleLabel) {
      this.advancedToggleLabel.textContent = visible
        ? 'Ocultar ajustes avanzados'
        : 'Ajustes avanzados';
    }
  };

  proto.toggleAdvancedOptions = function () {
    if (!this.advancedOptions) return;

    const nextVisible = this.advancedOptions.classList.contains('hidden');
    this.setAdvancedOptionsVisible(nextVisible);

    const cfg = this.loadConfig();
    cfg.showAdvancedOptions = nextVisible;
    this.saveConfig(cfg);
  };

  proto.renderCameraSelectOptions = function (devices, preferredId = null) {
    if (!this.cameraSelect) return;

    const targetSelection =
      preferredId || this.cameraSelect.value || this.preferredDeviceId || '';
    this.cameraSelect.innerHTML = '';

    if (!devices || devices.length === 0) {
      this.cameraSelect.innerHTML =
        '<option value="">No se encontraron cámaras</option>';
      this.cameraSelect.disabled = true;
      return;
    }

    devices.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Cámara ${i + 1}`;
      this.cameraSelect.appendChild(opt);
    });

    if (targetSelection) this.cameraSelect.value = targetSelection;
    if (!this.cameraSelect.value && devices[0])
      this.cameraSelect.value = devices[0].deviceId;
    this.preferredDeviceId =
      this.cameraSelect.value || targetSelection || this.preferredDeviceId;
    this.cameraSelect.disabled = false;
  };

  proto.refreshCameraDevices = async function (preferredId = null) {
    const devices = await this.cameraManager.enumerateDevices();
    this.renderCameraSelectOptions(devices, preferredId);
  };
}
