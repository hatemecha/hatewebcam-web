/**
 * HateWebcam Web — Main Application Controller
 */
(function () {
  'use strict';

  // ─── DOM ───
  const $ = (s) => document.querySelector(s);
  const videoEl = $('#videoElement');
  const canvas = $('#previewCanvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
  const placeholder = $('#previewPlaceholder');
  const statusIndicator = $('#statusIndicator');
  const resolutionInfo = $('#resolutionInfo');
  const fpsInfo = $('#fpsInfo');
  const effectsInfo = $('#effectsInfo');

  const btnToggleCamera = $('#btnToggleCamera');
  const cameraSelect = $('#cameraSelect');
  const btnTakePhoto = $('#btnTakePhoto');
  const btnRecord = $('#btnRecord');
  const captureStatus = $('#captureStatus');
  const sldJpegQuality = $('#sldJpegQuality');
  const valJpegQuality = $('#valJpegQuality');
  const videoFormatSelect = $('#videoFormatSelect');
  const chkQualityEnhancer = $('#chkQualityEnhancer');
  const sldQualityEnhancerStrength = $('#sldQualityEnhancerStrength');
  const valQualityEnhancerStrength = $('#valQualityEnhancerStrength');
  const qualityEnhancerStrengthGroup = $('#qualityEnhancerStrengthGroup');

  const capturePreviewModal = $('#capturePreviewModal');
  const capturePreviewTitle = $('#capturePreviewTitle');
  const capturePreviewFilename = $('#capturePreviewFilename');
  const capturePreviewImage = $('#capturePreviewImage');
  const capturePreviewVideo = $('#capturePreviewVideo');
  const capturePreviewInfo = $('#capturePreviewInfo');
  const capturePreviewPhotoTools = $('#capturePreviewPhotoTools');
  const chkPreviewPhotoEnhancer = $('#chkPreviewPhotoEnhancer');
  const sldPreviewPhotoEnhancerStrength = $('#sldPreviewPhotoEnhancerStrength');
  const valPreviewPhotoEnhancerStrength = $('#valPreviewPhotoEnhancerStrength');
  const previewPhotoEnhancerStrengthGroup = $('#previewPhotoEnhancerStrengthGroup');
  const btnDownloadCapture = $('#btnDownloadCapture');
  const btnDiscardCapture = $('#btnDiscardCapture');
  const btnCloseCapturePreview = $('#btnCloseCapturePreview');

  const chkMirror = $('#chkMirror');
  const chkFlipV = $('#chkFlipV');
  const rotationSelect = $('#rotationSelect');
  const chkBlackWhite = $('#chkBlackWhite');
  const sldExposure = $('#sldExposure');
  const valExposure = $('#valExposure');
  const sldShadows = $('#sldShadows');
  const valShadows = $('#valShadows');
  const sldHighlights = $('#sldHighlights');
  const valHighlights = $('#valHighlights');
  const sldContrast = $('#sldContrast');
  const valContrast = $('#valContrast');
  const sldSaturation = $('#sldSaturation');
  const valSaturation = $('#valSaturation');
  const sldTemperature = $('#sldTemperature');
  const valTemperature = $('#valTemperature');
  const sldDetail = $('#sldDetail');
  const valDetail = $('#valDetail');
  const sldSharpness = $('#sldSharpness');
  const valSharpness = $('#valSharpness');
  const btnResetImageAdjustments = $('#btnResetImageAdjustments');
  const presetButtons = document.querySelectorAll('.preset-btn');

  const chkBlobTracking = $('#chkBlobTracking');
  const chkFaceDetection = $('#chkFaceDetection');
  const chkBlinkDetection = $('#chkBlinkDetection');
  const inpBlobQuickColor = $('#inpBlobQuickColor');
  const blobQuickColorSwatch = $('#blobQuickColorSwatch');
  const inpFaceQuickColor = $('#inpFaceQuickColor');
  const faceQuickColorSwatch = $('#faceQuickColorSwatch');
  const faceQuickControls = $('#faceQuickControls');
  const inpFaceQuickLabel = $('#inpFaceQuickLabel');
  const colorPickSection = $('#colorPickSection');
  const btnColorPick = $('#btnColorPick');
  const colorPickStatus = $('#colorPickStatus');
  const btnToggleAdvancedOptions = $('#btnToggleAdvancedOptions');
  const advancedToggleLabel = $('#advancedToggleLabel');
  const advancedOptions = $('#advancedOptions');
  const effectConfigContainer = $('#effectConfigContainer');
  const profileSelect = $('#profileSelect');
  const btnSaveProfile = $('#btnSaveProfile');
  const btnDeleteProfile = $('#btnDeleteProfile');
  const profileStatus = $('#profileStatus');

  // ─── Core ───
  const cameraManager = new CameraManager();
  const effectManager = new EffectManager();

  let blobTrackingEffect = null;
  let faceDetectionEffect = null;
  let blinkDetectionEffect = null;

  let isRunning = false;
  let colorPickMode = false;
  let animFrameId = null;
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let flipH = false;
  let flipV = false;
  let rotation = 0;

  // Capture state
  let mediaRecorder = null;
  let recordingStream = null;
  let recordingChunks = [];
  let isRecording = false;
  let recordingStartTs = 0;
  let recordingTimer = null;
  let currentRecordingMimeType = '';
  let currentRecordingExt = 'webm';
  let currentRecordingBitrate = 6000000;
  let currentRecordingFps = 30;
  let pendingCapture = null;
  let recordingCanvas = null;
  let recordingCtx = null;
  let recordingEnhancerCanvas = null;
  let recordingEnhancerCtx = null;
  let lastRecordingDurationSec = 0;
  let previewScale = 1;
  let lastPreviewRenderTs = 0;
  let photoPreviewRenderToken = 0;
  let previewPhotoEnhancerDebounceId = null;
  let postFxCanvas = null;
  let postFxCtx = null;
  let captureFxCanvas = null;
  let captureFxCtx = null;
  let recordingFxCanvas = null;
  let recordingFxCtx = null;
  let upscalerInstance = null;
  let upscalerInitPromise = null;
  let upscalerDisabled = false;

  const DEFAULT_IMAGE_SETTINGS = {
    blackAndWhite: false,
    exposure: 0,
    shadows: 0,
    highlights: 0,
    contrast: 100,
    saturation: 100,
    temperature: 0,
    detail: 0,
    sharpness: 0,
    jpegQuality: 92,
    videoFormat: 'auto',
    qualityEnhancer: false,
    qualityEnhancerStrength: 35,
  };
  const PREVIEW_TARGET_FPS = 30;
  const PREVIEW_MAX_PIXELS = 640 * 360;
  const PREVIEW_MIN_WIDTH = 320;
  const PREVIEW_MIN_HEIGHT = 180;
  const DEFAULT_QUICK_DETECTOR_SETTINGS = {
    blobBoxColor: '#00ffff',
    faceBoxColor: '#e53935',
    faceLabelText: 'CARA',
  };
  let imageSettings = { ...DEFAULT_IMAGE_SETTINGS };
  let quickDetectorSettings = { ...DEFAULT_QUICK_DETECTOR_SETTINGS };

  // ─── Storage ───
  const STORAGE_KEY = 'hatewebcam_config';
  const PROFILES_KEY = 'hatewebcam_profiles';

  function loadConfig() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }
  function saveConfig(cfg) { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }
  function loadProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) || {}; }
    catch { return {}; }
  }
  function saveProfiles(p) { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function normalizeFaceLabel(value) {
    const label = String(value || '').trim();
    return label ? label.slice(0, 28) : 'CARA';
  }

  function loadQuickDetectorSettings(cfg) {
    const saved = cfg.quickDetectorSettings || {};
    quickDetectorSettings = {
      ...DEFAULT_QUICK_DETECTOR_SETTINGS,
      ...saved,
    };
    quickDetectorSettings.faceLabelText = normalizeFaceLabel(quickDetectorSettings.faceLabelText);
  }

  function saveQuickDetectorSettings() {
    const cfg = loadConfig();
    cfg.quickDetectorSettings = { ...quickDetectorSettings };
    saveConfig(cfg);
  }

  function syncAdvancedQuickInputs() {
    const advBlobColorInput = $('#inpBoxColor');
    const advBlobColorSwatch = $('#boxColorSwatch');
    const advFaceColorInput = $('#inpFaceColor');
    const advFaceColorSwatch = $('#faceColorSwatch');
    const advFaceLabelInput = $('#inpFaceLabel');

    if (advBlobColorInput) advBlobColorInput.value = quickDetectorSettings.blobBoxColor;
    if (advBlobColorSwatch) advBlobColorSwatch.style.background = quickDetectorSettings.blobBoxColor;
    if (advFaceColorInput) advFaceColorInput.value = quickDetectorSettings.faceBoxColor;
    if (advFaceColorSwatch) advFaceColorSwatch.style.background = quickDetectorSettings.faceBoxColor;
    if (advFaceLabelInput && document.activeElement !== advFaceLabelInput) {
      advFaceLabelInput.value = quickDetectorSettings.faceLabelText;
    }
  }

  function updateQuickDetectorControlsUI() {
    if (inpBlobQuickColor) inpBlobQuickColor.value = quickDetectorSettings.blobBoxColor;
    if (blobQuickColorSwatch) blobQuickColorSwatch.style.background = quickDetectorSettings.blobBoxColor;
    if (inpFaceQuickColor) inpFaceQuickColor.value = quickDetectorSettings.faceBoxColor;
    if (faceQuickColorSwatch) faceQuickColorSwatch.style.background = quickDetectorSettings.faceBoxColor;
    if (inpFaceQuickLabel && document.activeElement !== inpFaceQuickLabel) {
      inpFaceQuickLabel.value = quickDetectorSettings.faceLabelText;
    }
    if (faceQuickControls) {
      faceQuickControls.classList.toggle('hidden', !chkFaceDetection.checked);
    }
    syncAdvancedQuickInputs();
  }

  function applyQuickDetectorSettingsToEffects() {
    if (blobTrackingEffect) blobTrackingEffect.boxColor = quickDetectorSettings.blobBoxColor;
    if (faceDetectionEffect) {
      faceDetectionEffect.boxColor = quickDetectorSettings.faceBoxColor;
      faceDetectionEffect.labelText = quickDetectorSettings.faceLabelText;
    }
  }

  function syncQuickDetectorSettingsFromEffects() {
    if (blobTrackingEffect) quickDetectorSettings.blobBoxColor = blobTrackingEffect.boxColor || quickDetectorSettings.blobBoxColor;
    if (faceDetectionEffect) {
      quickDetectorSettings.faceBoxColor = faceDetectionEffect.boxColor || quickDetectorSettings.faceBoxColor;
      quickDetectorSettings.faceLabelText = normalizeFaceLabel(faceDetectionEffect.labelText);
    }
    updateQuickDetectorControlsUI();
    saveQuickDetectorSettings();
  }

  function loadImageSettings(cfg) {
    const saved = cfg.imageSettings || {};
    imageSettings = {
      ...DEFAULT_IMAGE_SETTINGS,
      ...saved,
    };
    imageSettings.exposure = clamp(parseInt(imageSettings.exposure, 10) || 0, -100, 100);
    imageSettings.shadows = clamp(parseInt(imageSettings.shadows, 10) || 0, -100, 100);
    imageSettings.highlights = clamp(parseInt(imageSettings.highlights, 10) || 0, -100, 100);
    imageSettings.contrast = clamp(parseInt(imageSettings.contrast, 10) || 100, 50, 180);
    imageSettings.saturation = clamp(parseInt(imageSettings.saturation, 10) || 100, 0, 200);
    imageSettings.temperature = clamp(parseInt(imageSettings.temperature, 10) || 0, -100, 100);
    imageSettings.detail = clamp(parseInt(imageSettings.detail, 10) || 0, -100, 100);
    imageSettings.sharpness = clamp(parseInt(imageSettings.sharpness, 10) || 0, 0, 100);
    imageSettings.jpegQuality = clamp(parseInt(imageSettings.jpegQuality, 10) || 92, 60, 100);
    imageSettings.videoFormat = ['auto', 'mp4', 'webm'].includes(imageSettings.videoFormat)
      ? imageSettings.videoFormat
      : 'auto';
    imageSettings.qualityEnhancer = !!imageSettings.qualityEnhancer;
    const enhancerStrength = parseInt(imageSettings.qualityEnhancerStrength, 10);
    imageSettings.qualityEnhancerStrength = clamp(Number.isFinite(enhancerStrength) ? enhancerStrength : 35, 0, 100);
    imageSettings.blackAndWhite = !!imageSettings.blackAndWhite;
  }

  function saveImageSettings() {
    const cfg = loadConfig();
    cfg.imageSettings = { ...imageSettings };
    saveConfig(cfg);
  }

  function updateImageControlsUI() {
    if (chkBlackWhite) chkBlackWhite.checked = !!imageSettings.blackAndWhite;
    if (sldExposure) sldExposure.value = String(imageSettings.exposure);
    if (valExposure) valExposure.textContent = `${imageSettings.exposure}`;
    if (sldShadows) sldShadows.value = String(imageSettings.shadows);
    if (valShadows) valShadows.textContent = `${imageSettings.shadows}`;
    if (sldHighlights) sldHighlights.value = String(imageSettings.highlights);
    if (valHighlights) valHighlights.textContent = `${imageSettings.highlights}`;
    if (sldContrast) sldContrast.value = String(imageSettings.contrast);
    if (valContrast) valContrast.textContent = `${imageSettings.contrast}%`;
    if (sldSaturation) sldSaturation.value = String(imageSettings.saturation);
    if (valSaturation) valSaturation.textContent = `${imageSettings.saturation}%`;
    if (sldTemperature) sldTemperature.value = String(imageSettings.temperature);
    if (valTemperature) valTemperature.textContent = `${imageSettings.temperature}`;
    if (sldDetail) sldDetail.value = String(imageSettings.detail);
    if (valDetail) valDetail.textContent = `${imageSettings.detail}`;
    if (sldSharpness) sldSharpness.value = String(imageSettings.sharpness);
    if (valSharpness) valSharpness.textContent = `${imageSettings.sharpness}`;

    if (sldJpegQuality) sldJpegQuality.value = String(imageSettings.jpegQuality);
    if (valJpegQuality) valJpegQuality.textContent = `${imageSettings.jpegQuality}%`;
    if (videoFormatSelect) videoFormatSelect.value = imageSettings.videoFormat;
    if (chkQualityEnhancer) chkQualityEnhancer.checked = !!imageSettings.qualityEnhancer;
    if (sldQualityEnhancerStrength) sldQualityEnhancerStrength.value = String(imageSettings.qualityEnhancerStrength);
    if (valQualityEnhancerStrength) valQualityEnhancerStrength.textContent = `${imageSettings.qualityEnhancerStrength}%`;
    updateQualityEnhancerControls();
    updateBWDependentControls();
  }

  function updateBWDependentControls() {
    const bw = !!imageSettings.blackAndWhite;
    if (sldSaturation) sldSaturation.disabled = bw;
    if (sldTemperature) sldTemperature.disabled = bw;
    if (valSaturation && bw) valSaturation.textContent = 'B/N';
    if (valTemperature && bw) valTemperature.textContent = 'B/N';
    if (!bw) {
      if (valSaturation) valSaturation.textContent = `${imageSettings.saturation}%`;
      if (valTemperature) valTemperature.textContent = `${imageSettings.temperature}`;
    }
  }

  function updateQualityEnhancerControls() {
    if (qualityEnhancerStrengthGroup) {
      qualityEnhancerStrengthGroup.classList.toggle('hidden', !imageSettings.qualityEnhancer);
    }
    if (sldQualityEnhancerStrength) {
      sldQualityEnhancerStrength.disabled = !imageSettings.qualityEnhancer;
    }
  }

  function bindImageControlEvents() {
    const bindIntSlider = (sliderEl, valueEl, key, suffix = '') => {
      if (!sliderEl || !valueEl) return;
      sliderEl.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        imageSettings[key] = value;
        valueEl.textContent = `${value}${suffix}`;
        saveImageSettings();
      });
    };

    if (chkBlackWhite) {
      chkBlackWhite.addEventListener('change', (e) => {
        imageSettings.blackAndWhite = e.target.checked;
        updateBWDependentControls();
        saveImageSettings();
      });
    }

    bindIntSlider(sldExposure, valExposure, 'exposure');
    bindIntSlider(sldShadows, valShadows, 'shadows');
    bindIntSlider(sldHighlights, valHighlights, 'highlights');
    bindIntSlider(sldContrast, valContrast, 'contrast', '%');
    bindIntSlider(sldSaturation, valSaturation, 'saturation', '%');
    bindIntSlider(sldTemperature, valTemperature, 'temperature');
    bindIntSlider(sldDetail, valDetail, 'detail');
    bindIntSlider(sldSharpness, valSharpness, 'sharpness');
    bindIntSlider(sldJpegQuality, valJpegQuality, 'jpegQuality', '%');
    bindIntSlider(sldQualityEnhancerStrength, valQualityEnhancerStrength, 'qualityEnhancerStrength', '%');

    if (videoFormatSelect) {
      videoFormatSelect.addEventListener('change', (e) => {
        imageSettings.videoFormat = e.target.value;
        saveImageSettings();
      });
    }

    if (chkQualityEnhancer) {
      chkQualityEnhancer.addEventListener('change', (e) => {
        imageSettings.qualityEnhancer = e.target.checked;
        updateQualityEnhancerControls();
        saveImageSettings();
      });
    }

    if (btnResetImageAdjustments) {
      btnResetImageAdjustments.addEventListener('click', () => {
        imageSettings = {
          ...DEFAULT_IMAGE_SETTINGS,
          jpegQuality: imageSettings.jpegQuality,
          videoFormat: imageSettings.videoFormat,
          qualityEnhancer: imageSettings.qualityEnhancer,
          qualityEnhancerStrength: imageSettings.qualityEnhancerStrength,
        };
        updateImageControlsUI();
        saveImageSettings();
      });
    }

    presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => applyImagePreset(btn.dataset.preset));
    });
  }

  function bindQuickDetectorEvents() {
    if (inpBlobQuickColor) {
      inpBlobQuickColor.addEventListener('input', (e) => {
        quickDetectorSettings.blobBoxColor = e.target.value;
        if (blobTrackingEffect) blobTrackingEffect.boxColor = e.target.value;
        updateQuickDetectorControlsUI();
        saveQuickDetectorSettings();
      });
    }

    if (inpFaceQuickColor) {
      inpFaceQuickColor.addEventListener('input', (e) => {
        quickDetectorSettings.faceBoxColor = e.target.value;
        if (faceDetectionEffect) faceDetectionEffect.boxColor = e.target.value;
        updateQuickDetectorControlsUI();
        saveQuickDetectorSettings();
      });
    }

    if (inpFaceQuickLabel) {
      inpFaceQuickLabel.addEventListener('input', (e) => {
        const value = String(e.target.value || '').slice(0, 28);
        quickDetectorSettings.faceLabelText = value || 'CARA';
        if (faceDetectionEffect) faceDetectionEffect.labelText = value;
        saveQuickDetectorSettings();
        syncAdvancedQuickInputs();
      });

      inpFaceQuickLabel.addEventListener('blur', (e) => {
        const normalized = normalizeFaceLabel(e.target.value);
        quickDetectorSettings.faceLabelText = normalized;
        e.target.value = normalized;
        if (faceDetectionEffect) faceDetectionEffect.labelText = normalized;
        saveQuickDetectorSettings();
        syncAdvancedQuickInputs();
      });
    }
  }

  function applyImagePreset(name) {
    if (name === 'natural') {
      imageSettings = { ...imageSettings, blackAndWhite: false, exposure: 0, shadows: 0, highlights: 0, contrast: 100, saturation: 100, temperature: 0, detail: 0, sharpness: 0 };
    } else if (name === 'vivid') {
      imageSettings = { ...imageSettings, blackAndWhite: false, exposure: 8, shadows: 12, highlights: -10, contrast: 116, saturation: 135, temperature: 8, detail: 24, sharpness: 12 };
    } else if (name === 'cinema') {
      imageSettings = { ...imageSettings, blackAndWhite: false, exposure: -8, shadows: 18, highlights: -22, contrast: 112, saturation: 88, temperature: -6, detail: 12, sharpness: 8 };
    } else if (name === 'bw') {
      imageSettings = { ...imageSettings, blackAndWhite: true, exposure: 0, shadows: 12, highlights: -10, contrast: 118, saturation: 0, temperature: 0, detail: 20, sharpness: 10 };
    }
    updateImageControlsUI();
    saveImageSettings();
  }

  function setAdvancedOptionsVisible(visible) {
    if (!advancedOptions || !btnToggleAdvancedOptions) return;

    advancedOptions.classList.toggle('hidden', !visible);
    btnToggleAdvancedOptions.classList.toggle('is-open', visible);
    btnToggleAdvancedOptions.setAttribute('aria-expanded', String(visible));

    if (advancedToggleLabel) {
      advancedToggleLabel.textContent = visible
        ? 'Ocultar opciones avanzadas'
        : 'Mostrar opciones avanzadas';
    }
  }

  function toggleAdvancedOptions() {
    if (!advancedOptions) return;

    const nextVisible = advancedOptions.classList.contains('hidden');
    setAdvancedOptionsVisible(nextVisible);

    const cfg = loadConfig();
    cfg.showAdvancedOptions = nextVisible;
    saveConfig(cfg);
  }

  // ─── Init ───
  async function init() {
    const cfg = loadConfig();
    if (cfg.flipH) { flipH = true; chkMirror.checked = true; }
    if (cfg.flipV) { flipV = true; chkFlipV.checked = true; }
    if (cfg.rotation != null) { rotation = cfg.rotation; rotationSelect.value = String(cfg.rotation); }
    setAdvancedOptionsVisible(!!cfg.showAdvancedOptions);
    loadQuickDetectorSettings(cfg);
    updateQuickDetectorControlsUI();
    loadImageSettings(cfg);
    updateImageControlsUI();

    const devices = await cameraManager.enumerateDevices();
    cameraSelect.innerHTML = '';
    if (devices.length === 0) {
      cameraSelect.innerHTML = '<option value="">No se encontraron cámaras</option>';
    } else {
      devices.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Cámara ${i + 1}`;
        cameraSelect.appendChild(opt);
      });
    }
    if (cfg.deviceId) cameraSelect.value = cfg.deviceId;

    updateProfilesList();
    bindEvents();
    bindQuickDetectorEvents();
    bindImageControlEvents();
    updateCaptureButtons();

    // Auto-start camera on load (if browser allows it)
    await toggleCamera(true);
  }

  // ─── Events ───
  function bindEvents() {
    btnToggleCamera.addEventListener('click', () => toggleCamera(false));
    cameraSelect.addEventListener('change', onCameraChange);
    chkMirror.addEventListener('change', onTransformChange);
    chkFlipV.addEventListener('change', onTransformChange);
    rotationSelect.addEventListener('change', onTransformChange);

    chkBlobTracking.addEventListener('change', () => toggleEffect('blob'));
    chkFaceDetection.addEventListener('change', () => toggleEffect('face'));
    chkBlinkDetection.addEventListener('change', () => toggleEffect('blink'));

    btnColorPick.addEventListener('click', enableColorPick);
    if (btnToggleAdvancedOptions) btnToggleAdvancedOptions.addEventListener('click', toggleAdvancedOptions);
    canvas.addEventListener('click', onCanvasClick);

    if (btnTakePhoto) btnTakePhoto.addEventListener('click', takePhoto);
    if (btnRecord) btnRecord.addEventListener('click', toggleRecording);
    if (btnDownloadCapture) btnDownloadCapture.addEventListener('click', downloadPendingCapture);
    if (btnDiscardCapture) btnDiscardCapture.addEventListener('click', () => closeCapturePreview(true));
    if (btnCloseCapturePreview) btnCloseCapturePreview.addEventListener('click', () => closeCapturePreview(true));
    if (chkPreviewPhotoEnhancer) {
      chkPreviewPhotoEnhancer.addEventListener('change', onPreviewPhotoEnhancerToggle);
    }
    if (sldPreviewPhotoEnhancerStrength) {
      sldPreviewPhotoEnhancerStrength.addEventListener('input', onPreviewPhotoEnhancerStrengthInput);
    }
    if (capturePreviewModal) {
      capturePreviewModal.addEventListener('click', (e) => {
        if (e.target === capturePreviewModal) closeCapturePreview(true);
      });
    }

    btnSaveProfile.addEventListener('click', saveCurrentProfile);
    btnDeleteProfile.addEventListener('click', deleteProfile);
    profileSelect.addEventListener('change', loadProfile);
    window.addEventListener('keydown', onGlobalKeyDown);

    window.addEventListener('beforeunload', () => {
      stopRecording(false);
      clearPendingCapture(true);
      if (isRunning) cameraManager.stop();
    });
  }

  // ─── Camera ───
  async function toggleCamera(forceStart = false) {
    if (isRunning && !forceStart) {
      if (isRecording) stopRecording(true);

      cameraManager.stop();
      isRunning = false;
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
      btnToggleCamera.innerHTML = '<i class="fa-solid fa-play"></i> Encender Cámara';
      btnToggleCamera.classList.remove('active');
      statusIndicator.innerHTML = '<i class="fa-solid fa-circle fa-xs"></i> APAGADO';
      statusIndicator.classList.remove('active');
      placeholder.classList.remove('hidden');
      resolutionInfo.textContent = '—';
      fpsInfo.textContent = '—';
      updateCaptureButtons();
      return;
    }

    if (!isRunning) {
      const ok = await cameraManager.start(videoEl, cameraSelect.value || null);
      if (ok) {
        isRunning = true;
        placeholder.classList.add('hidden');
        btnToggleCamera.innerHTML = '<i class="fa-solid fa-stop"></i> Apagar Cámara';
        btnToggleCamera.classList.add('active');
        statusIndicator.innerHTML = '<i class="fa-solid fa-circle fa-xs"></i> EN VIVO';
        statusIndicator.classList.add('active');

        videoEl.addEventListener('loadedmetadata', () => {
          const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
          const { width: previewWidth, height: previewHeight, scale } = getPreviewFrameDimensions(sourceWidth, sourceHeight);
          previewScale = scale;
          canvas.width = previewWidth;
          canvas.height = previewHeight;
          resolutionInfo.textContent = buildResolutionLabel(sourceWidth, sourceHeight, previewWidth, previewHeight);
        }, { once: true });

        frameCount = 0;
        lastFpsTime = performance.now();
        lastPreviewRenderTs = 0;
        renderLoop();

        const cfg = loadConfig();
        cfg.deviceId = cameraSelect.value;
        saveConfig(cfg);
      } else {
        placeholder.classList.remove('hidden');
        const msg = placeholder.querySelector('div');
        if (msg) msg.textContent = 'No se pudo activar la cámara. Revisá permisos y reintentá.';
      }
      updateCaptureButtons();
    }
  }

  function onCameraChange() {
    const cfg = loadConfig();
    cfg.deviceId = cameraSelect.value;
    saveConfig(cfg);
    if (isRunning) cameraManager.switchCamera(cameraSelect.value);
  }

  function onTransformChange() {
    flipH = chkMirror.checked;
    flipV = chkFlipV.checked;
    rotation = parseInt(rotationSelect.value, 10);
    const cfg = loadConfig();
    cfg.flipH = flipH;
    cfg.flipV = flipV;
    cfg.rotation = rotation;
    saveConfig(cfg);
  }

  // ─── Effects ───
  function toggleEffect(type) {
    if (type === 'blob') {
      if (chkBlobTracking.checked) {
        blobTrackingEffect = new BlobTracking();
        blobTrackingEffect.boxColor = quickDetectorSettings.blobBoxColor;
        effectManager.addEffect(blobTrackingEffect);
        if (blinkDetectionEffect) {
          blinkDetectionEffect.setBlinkCallback((eye) => blobTrackingEffect.triggerConnection(eye));
        }
        colorPickSection.style.display = '';
      } else {
        if (blobTrackingEffect) effectManager.removeEffect(blobTrackingEffect);
        blobTrackingEffect = null;
        colorPickSection.style.display = 'none';
      }
    } else if (type === 'face') {
      if (chkFaceDetection.checked) {
        faceDetectionEffect = new FaceDetection();
        faceDetectionEffect.boxColor = quickDetectorSettings.faceBoxColor;
        faceDetectionEffect.labelText = quickDetectorSettings.faceLabelText;
        effectManager.addEffect(faceDetectionEffect);
      } else {
        if (faceDetectionEffect) effectManager.removeEffect(faceDetectionEffect);
        faceDetectionEffect = null;
      }
    } else if (type === 'blink') {
      if (chkBlinkDetection.checked) {
        blinkDetectionEffect = new BlinkDetection();
        effectManager.addEffect(blinkDetectionEffect);
        if (blobTrackingEffect) {
          blinkDetectionEffect.setBlinkCallback((eye) => blobTrackingEffect.triggerConnection(eye));
        }
      } else {
        if (blinkDetectionEffect) effectManager.removeEffect(blinkDetectionEffect);
        blinkDetectionEffect = null;
      }
    }
    syncQuickDetectorSettingsFromEffects();
    renderEffectConfig();
    updateEffectsInfo();
  }

  function updateEffectsInfo() {
    const names = [];
    if (blobTrackingEffect) names.push('Color');
    if (faceDetectionEffect) names.push('Caras');
    if (blinkDetectionEffect) names.push('Pestañeos');
    effectsInfo.textContent = names.length > 0 ? names.join(' · ') : 'Sin detectores';
  }

  // ─── Render Loop ───
  function getSourceFrameDimensions() {
    return {
      sourceWidth: Math.max(1, videoEl.videoWidth || canvas.width || 1),
      sourceHeight: Math.max(1, videoEl.videoHeight || canvas.height || 1),
    };
  }

  function getPreviewFrameDimensions(sourceWidth, sourceHeight) {
    const sourcePixels = Math.max(1, sourceWidth * sourceHeight);
    const scale = sourcePixels > PREVIEW_MAX_PIXELS
      ? Math.sqrt(PREVIEW_MAX_PIXELS / sourcePixels)
      : 1;

    const width = Math.max(PREVIEW_MIN_WIDTH, Math.round(sourceWidth * scale));
    const height = Math.max(PREVIEW_MIN_HEIGHT, Math.round(sourceHeight * scale));
    return { width, height, scale };
  }

  function buildResolutionLabel(sourceWidth, sourceHeight, previewWidth, previewHeight) {
    if (sourceWidth === previewWidth && sourceHeight === previewHeight) {
      return `${sourceWidth}×${sourceHeight}`;
    }
    return `${sourceWidth}×${sourceHeight} (preview ${previewWidth}×${previewHeight})`;
  }
  function renderLoop(ts = performance.now()) {
    if (!isRunning) return;

    try {
      const minPreviewFrameInterval = 1000 / PREVIEW_TARGET_FPS;
      if (ts - lastPreviewRenderTs < minPreviewFrameInterval) {
        animFrameId = requestAnimationFrame(renderLoop);
        return;
      }
      lastPreviewRenderTs = ts;

      if (videoEl.readyState >= 2) {
        const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
        const { width: previewWidth, height: previewHeight, scale } = getPreviewFrameDimensions(sourceWidth, sourceHeight);
        if (canvas.width !== previewWidth || canvas.height !== previewHeight) {
          canvas.width = previewWidth;
          canvas.height = previewHeight;
        }
        if (previewScale !== scale || frameCount % 30 === 0) {
          previewScale = scale;
          resolutionInfo.textContent = buildResolutionLabel(sourceWidth, sourceHeight, previewWidth, previewHeight);
        }

        try {
          renderProcessedFrame(canvas, ctx, 'preview');
        } catch (renderErr) {
          console.error('Render frame fallback error:', renderErr);
          drawBaseFrame(ctx, canvas);
        }
        syncRecordingCanvasFrame();

        // FPS
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
          fpsInfo.textContent = `${frameCount} FPS`;
          frameCount = 0;
          lastFpsTime = now;
        }
      }
    } catch (err) {
      console.error('Render loop error:', err);
    }

    animFrameId = requestAnimationFrame(renderLoop);
  }

  function buildCanvasFilter() {
    const exposureBoost = clamp(100 + imageSettings.exposure * 0.8, 35, 200);
    const contrast = clamp(imageSettings.contrast, 50, 180);
    const saturation = imageSettings.blackAndWhite
      ? 0
      : clamp(imageSettings.saturation, 0, 200);
    const grayscale = imageSettings.blackAndWhite ? 100 : 0;

    return `brightness(${exposureBoost}%) contrast(${contrast}%) saturate(${saturation}%) grayscale(${grayscale}%)`;
  }

  function needsAdvancedPixelAdjustments() {
    const temperature = imageSettings.blackAndWhite ? 0 : imageSettings.temperature;
    return (
      imageSettings.shadows !== 0 ||
      imageSettings.highlights !== 0 ||
      imageSettings.detail !== 0 ||
      temperature !== 0 ||
      imageSettings.sharpness !== 0
    );
  }

  function ensurePostFxBuffers(workspace, w, h, scale) {
    if (!workspace.canvas) {
      workspace.canvas = document.createElement('canvas');
      workspace.ctx = workspace.canvas.getContext('2d', { willReadFrequently: true });
    }

    const pw = Math.max(320, Math.round(w * scale));
    const ph = Math.max(180, Math.round(h * scale));

    if (workspace.canvas.width !== pw || workspace.canvas.height !== ph) {
      workspace.canvas.width = pw;
      workspace.canvas.height = ph;
    }
    return { pw, ph, fxCanvas: workspace.canvas, fxCtx: workspace.ctx };
  }

  function getFxWorkspace(mode) {
    if (mode === 'recording') {
      return {
        canvas: recordingFxCanvas,
        ctx: recordingFxCtx,
        commit(nextCanvas, nextCtx) {
          recordingFxCanvas = nextCanvas;
          recordingFxCtx = nextCtx;
        },
      };
    }
    if (mode === 'capture') {
      return {
        canvas: captureFxCanvas,
        ctx: captureFxCtx,
        commit(nextCanvas, nextCtx) {
          captureFxCanvas = nextCanvas;
          captureFxCtx = nextCtx;
        },
      };
    }
    return {
      canvas: postFxCanvas,
      ctx: postFxCtx,
      commit(nextCanvas, nextCtx) {
        postFxCanvas = nextCanvas;
        postFxCtx = nextCtx;
      },
    };
  }

  function drawBaseFrame(targetCtx, targetCanvas) {
    targetCtx.save();
    targetCtx.filter = buildCanvasFilter();
    if (rotation !== 0) {
      targetCtx.translate(targetCanvas.width / 2, targetCanvas.height / 2);
      targetCtx.rotate((rotation * Math.PI) / 180);
      targetCtx.translate(-targetCanvas.width / 2, -targetCanvas.height / 2);
    }
    let sx = 1;
    let sy = 1;
    if (flipH) sx = -1;
    if (flipV) sy = -1;
    if (sx !== 1 || sy !== 1) {
      targetCtx.translate(sx === -1 ? targetCanvas.width : 0, sy === -1 ? targetCanvas.height : 0);
      targetCtx.scale(sx, sy);
    }
    targetCtx.drawImage(videoEl, 0, 0, targetCanvas.width, targetCanvas.height);
    targetCtx.restore();
  }

  function applyAdvancedPixelAdjustments(targetCanvas = canvas, targetCtx = ctx, mode = 'preview') {
    const w = targetCanvas.width;
    const h = targetCanvas.height;
    if (w === 0 || h === 0) return;

    let postFxScale = imageSettings.sharpness > 0 ? 0.78 : 0.86;
    if (w * h > 1920 * 1080) postFxScale *= 0.92;
    postFxScale = clamp(postFxScale, 0.72, 0.90);

    const workspace = getFxWorkspace(mode);
    const { pw, ph, fxCanvas, fxCtx } = ensurePostFxBuffers(workspace, w, h, postFxScale);
    workspace.commit(fxCanvas, fxCtx);
    fxCtx.drawImage(targetCanvas, 0, 0, pw, ph);

    const imageData = fxCtx.getImageData(0, 0, pw, ph);
    const data = imageData.data;

    const shadows = imageSettings.shadows / 100;
    const highlights = imageSettings.highlights / 100;
    const detail = imageSettings.detail / 100;
    const temperature = imageSettings.blackAndWhite ? 0 : imageSettings.temperature / 100;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const shadowMask = (1 - luma) * (1 - luma);
      const highlightMask = luma * luma;

      const toneShift = shadows * shadowMask * 48 + highlights * highlightMask * 48;
      const detailShift = detail * (luma - 0.5) * 52;
      const tempShift = temperature * 22;

      r = clamp(Math.round(r + toneShift + detailShift + tempShift), 0, 255);
      g = clamp(Math.round(g + toneShift + detailShift * 0.8), 0, 255);
      b = clamp(Math.round(b + toneShift + detailShift - tempShift), 0, 255);

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }

    if (imageSettings.sharpness >= 8) {
      applySharpenFilter(imageData, imageSettings.sharpness / 100);
    }

    fxCtx.putImageData(imageData, 0, 0);
    targetCtx.save();
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.drawImage(fxCanvas, 0, 0, w, h);
    targetCtx.restore();
  }

  function renderProcessedFrame(targetCanvas, targetCtx, mode = 'preview') {
    if (!videoEl || videoEl.readyState < 2 || targetCanvas.width === 0 || targetCanvas.height === 0) return;
    drawBaseFrame(targetCtx, targetCanvas);
    if (needsAdvancedPixelAdjustments()) {
      applyAdvancedPixelAdjustments(targetCanvas, targetCtx, mode);
    }

    if (faceDetectionEffect) {
      faceDetectionEffect.flipH = flipH;
      faceDetectionEffect.flipV = flipV;
    }

    if (blobTrackingEffect && blinkDetectionEffect) {
      blinkDetectionEffect.setFeedbackColor(blobTrackingEffect.boxColor);
      blobTrackingEffect.connectionColor = blobTrackingEffect.boxColor;
    }

    effectManager.processFrame(targetCtx, targetCanvas, videoEl);
  }

  function applySharpenFilter(imageData, amount) {
    const { width, height, data } = imageData;
    const src = new Uint8ClampedArray(data);
    const rowSize = width * 4;
    const strength = clamp(amount, 0, 1) * 1.2;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * rowSize + x * 4;
        for (let c = 0; c < 3; c++) {
          const center = src[idx + c];
          const north = src[idx - rowSize + c];
          const south = src[idx + rowSize + c];
          const west = src[idx - 4 + c];
          const east = src[idx + 4 + c];
          const blurred = (center * 4 + north + south + west + east) / 8;
          data[idx + c] = clamp(Math.round(center + (center - blurred) * strength), 0, 255);
        }
      }
    }
  }

  // ─── Color Pick ───
  function enableColorPick() {
    if (!blobTrackingEffect) {
      showStatus(colorPickStatus, 'Primero activá "Detectar objetos por color"', 'warning');
      return;
    }
    colorPickMode = true;
    canvas.classList.add('color-pick-mode');
    showStatus(colorPickStatus, 'Hacé click en el video para elegir un color', 'info');
  }

  function onCanvasClick(e) {
    if (!colorPickMode || !blobTrackingEffect) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.round((e.clientY - rect.top) * (canvas.height / rect.height));

    if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      blobTrackingEffect.setColorFromPixel(pixel[0], pixel[1], pixel[2]);
      colorPickMode = false;
      canvas.classList.remove('color-pick-mode');
      showStatus(colorPickStatus, '✓ Color seleccionado', 'success');
      renderEffectConfig();
      setTimeout(() => hideStatus(colorPickStatus), 2500);
    }
  }

  // ─── Effect Config UI ───
  function renderEffectConfig() {
    effectConfigContainer.innerHTML = '';
    if (blobTrackingEffect) effectConfigContainer.appendChild(buildBlobConfig());
    if (faceDetectionEffect) effectConfigContainer.appendChild(buildFaceConfig());
    if (blinkDetectionEffect) effectConfigContainer.appendChild(buildBlinkConfig());
  }

  // --- Blob Tracking Config ---
  function buildBlobConfig() {
    const bt = blobTrackingEffect;
    const el = createSection('Detector de objetos por color', `
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
        ${slider('sldTolerance', 'valTolerance', 'Tolerancia', bt._tolerance, 10, 100)}

        <button class="btn" id="btnAdvancedHsv" style="font-size:11px;margin-top:4px">Ajustes avanzados (HSV manual)</button>
        <div id="hsvAdvanced" class="hidden" style="margin-top:8px">
          <div class="help-text">Estos controles permiten ajustar el rango de color manualmente usando el modelo HSV (Tono, Saturación, Brillo).</div>
          ${slider('sldHMin', 'valHMin', 'Tono mínimo (H)', bt.hsvMin[0], 0, 180)}
          ${slider('sldSMin', 'valSMin', 'Saturación mín. (S)', bt.hsvMin[1], 0, 255)}
          ${slider('sldVMin', 'valVMin', 'Brillo mínimo (V)', bt.hsvMin[2], 0, 255)}
          ${slider('sldHMax', 'valHMax', 'Tono máximo (H)', bt.hsvMax[0], 0, 180)}
          ${slider('sldSMax', 'valSMax', 'Saturación máx. (S)', bt.hsvMax[1], 0, 255)}
          ${slider('sldVMax', 'valVMax', 'Brillo máx. (V)', bt.hsvMax[2], 0, 255)}
        </div>
      </div>

      <div class="config-block">
        <div class="config-block-title">Cantidad y tamaño</div>
        <div class="help-text">Limitá cuántos objetos detectar y qué tan grandes deben ser para ser considerados.</div>
        ${slider('sldMaxObj', 'valMaxObj', 'Máximo de objetos', bt.maxObjects, 1, 50)}
        ${slider('sldMinArea', 'valMinArea', 'Tamaño mínimo (píxeles)', bt.minArea, 0, 5000, 10)}
      </div>

      <div class="config-block">
        <div class="config-block-title">Limpieza de imagen</div>
        <div class="help-text">Si aparecen detecciones falsas o ruido, subí este valor para limpiar la imagen.</div>
        ${slider('sldErode', 'valErode', 'Nivel de limpieza', bt.erodeIterations, 0, 5)}
      </div>

      <div class="config-block">
        <div class="config-block-title">Aspecto visual</div>
        <label class="color-picker-btn" style="position:relative">
          <div class="color-swatch" id="boxColorSwatch" style="background:${bt.boxColor}"></div>
          <span>Color del recuadro</span>
          <input type="color" id="inpBoxColor" value="${bt.boxColor}">
        </label>
        <div style="height:6px"></div>
        <label class="checkbox-group"><input type="checkbox" id="chkShowCoords" ${bt.showCoordinates ? 'checked' : ''}><span>Mostrar posición (X, Y)</span></label>
        <label class="checkbox-group"><input type="checkbox" id="chkShowCentroid" ${bt.showCentroid ? 'checked' : ''}><span>Mostrar punto central</span></label>
        ${slider('sldThickness', 'valThickness', 'Grosor del recuadro', bt.boxThickness, 1, 8)}
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
        });
      });

      bindSlider(el, 'sldTolerance', 'valTolerance', v => bt._tolerance = v);

      const btnAdv = el.querySelector('#btnAdvancedHsv');
      const hsvAdv = el.querySelector('#hsvAdvanced');
      btnAdv.addEventListener('click', () => hsvAdv.classList.toggle('hidden'));

      bindSlider(el, 'sldHMin', 'valHMin', v => bt.hsvMin[0] = v);
      bindSlider(el, 'sldSMin', 'valSMin', v => bt.hsvMin[1] = v);
      bindSlider(el, 'sldVMin', 'valVMin', v => bt.hsvMin[2] = v);
      bindSlider(el, 'sldHMax', 'valHMax', v => bt.hsvMax[0] = v);
      bindSlider(el, 'sldSMax', 'valSMax', v => bt.hsvMax[1] = v);
      bindSlider(el, 'sldVMax', 'valVMax', v => bt.hsvMax[2] = v);
      bindSlider(el, 'sldMaxObj', 'valMaxObj', v => bt.maxObjects = v);
      bindSlider(el, 'sldMinArea', 'valMinArea', v => bt.minArea = v);
      bindSlider(el, 'sldErode', 'valErode', v => bt.erodeIterations = v);
      bindSlider(el, 'sldThickness', 'valThickness', v => bt.boxThickness = v);

      const inpColor = el.querySelector('#inpBoxColor');
      const swatch = el.querySelector('#boxColorSwatch');
      inpColor.addEventListener('input', e => {
        bt.boxColor = e.target.value;
        quickDetectorSettings.blobBoxColor = e.target.value;
        swatch.style.background = e.target.value;
        updateQuickDetectorControlsUI();
        saveQuickDetectorSettings();
      });

      el.querySelector('#chkShowCoords').addEventListener('change', e => bt.showCoordinates = e.target.checked);
      el.querySelector('#chkShowCentroid').addEventListener('change', e => bt.showCentroid = e.target.checked);
    });

    return el;
  }

  // --- Face Detection Config ---
  function buildFaceConfig() {
    const fd = faceDetectionEffect;
    const el = createSection('Detector de caras', `
      <div class="config-block">
        <div class="config-block-title">Configuración</div>
        <div class="help-text">Detecta caras en el video y dibuja un recuadro alrededor de cada una.</div>
        ${slider('sldMaxFaces', 'valMaxFaces', 'Máximo de caras a detectar', fd.maxFaces, 1, 5)}
        <div class="slider-group">
          <div class="slider-label"><span>Texto del recuadro</span></div>
          <input type="text" id="inpFaceLabel" class="text-input" maxlength="28" placeholder="Ej: Cliente VIP">
        </div>
        <label class="color-picker-btn" style="position:relative;margin-top:6px">
          <div class="color-swatch" id="faceColorSwatch" style="background:${fd.boxColor}"></div>
          <span>Color del recuadro</span>
          <input type="color" id="inpFaceColor" value="${fd.boxColor}">
        </label>
        <div style="height:6px"></div>
        ${slider('sldFaceThickness', 'valFaceThickness', 'Grosor del recuadro', fd.boxThickness, 1, 8)}
        <label class="checkbox-group"><input type="checkbox" id="chkShowLandmarks" ${fd.showLandmarks ? 'checked' : ''}><span>Mostrar puntos faciales</span></label>
      </div>
    `);

    requestAnimationFrame(() => {
      bindSlider(el, 'sldMaxFaces', 'valMaxFaces', v => {
        fd.maxFaces = v;
        if (fd.faceMesh) fd.faceMesh.setOptions({ maxNumFaces: v });
      });
      bindSlider(el, 'sldFaceThickness', 'valFaceThickness', v => fd.boxThickness = v);

      const inpLabel = el.querySelector('#inpFaceLabel');
      if (inpLabel) {
        inpLabel.value = fd.labelText || 'CARA';
        inpLabel.addEventListener('input', e => {
          const value = String(e.target.value || '').slice(0, 28);
          fd.labelText = value;
          quickDetectorSettings.faceLabelText = value || 'CARA';
          if (inpFaceQuickLabel && document.activeElement !== inpFaceQuickLabel) {
            inpFaceQuickLabel.value = quickDetectorSettings.faceLabelText;
          }
          saveQuickDetectorSettings();
        });
        inpLabel.addEventListener('blur', e => {
          const normalized = normalizeFaceLabel(e.target.value);
          fd.labelText = normalized;
          quickDetectorSettings.faceLabelText = normalized;
          e.target.value = fd.labelText;
          updateQuickDetectorControlsUI();
          saveQuickDetectorSettings();
        });
      }

      const inpColor = el.querySelector('#inpFaceColor');
      const swatch = el.querySelector('#faceColorSwatch');
      inpColor.addEventListener('input', e => {
        fd.boxColor = e.target.value;
        quickDetectorSettings.faceBoxColor = e.target.value;
        swatch.style.background = e.target.value;
        updateQuickDetectorControlsUI();
        saveQuickDetectorSettings();
      });

      el.querySelector('#chkShowLandmarks').addEventListener('change', e => fd.showLandmarks = e.target.checked);
    });

    return el;
  }

  // --- Blink Detection Config ---
  function buildBlinkConfig() {
    const bd = blinkDetectionEffect;
    const el = createSection('Detección de pestañeos', `
      <div class="config-block">
        <div class="config-block-title">Configuración</div>
        <div class="help-text">Cuando cerrás un ojo, se dibujan líneas entre los objetos detectados. Necesitás tener el detector de objetos activado para ver las conexiones.</div>
        ${slider('sldEar', 'valEar', 'Sensibilidad (cuanto más alto, más fácil detectar)', bd.eyeArThreshold, 0.10, 0.40, 0.01)}
      </div>
    `);

    requestAnimationFrame(() => {
      const sld = el.querySelector('#sldEar');
      const val = el.querySelector('#valEar');
      sld.addEventListener('input', e => {
        bd.eyeArThreshold = parseFloat(e.target.value);
        val.textContent = bd.eyeArThreshold.toFixed(2);
      });
    });

    return el;
  }

  // ─── UI Helpers ───
  function createSection(title, html) {
    const div = document.createElement('div');
    div.className = 'panel-section fade-in';
    div.innerHTML = `<div class="section-title accent">${title}</div><div class="effect-config">${html}</div>`;
    return div;
  }

  function slider(id, valId, label, value, min, max, step = 1) {
    const displayVal = Number.isInteger(value) ? value : parseFloat(value).toFixed(2);
    return `
      <div class="slider-group">
        <div class="slider-label">
          <span>${label}</span>
          <span class="value" id="${valId}">${displayVal}</span>
        </div>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
      </div>`;
  }

  function bindSlider(parent, sliderId, valueId, callback) {
    const sld = parent.querySelector(`#${sliderId}`);
    const val = parent.querySelector(`#${valueId}`);
    if (!sld || !val) return;
    sld.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      val.textContent = Number.isInteger(v) ? v : v.toFixed(2);
      callback(v);
    });
  }

  // ─── Profiles ───
  function updateProfilesList() {
    const profiles = loadProfiles();
    profileSelect.innerHTML = '<option value="">—</option>';
    for (const name of Object.keys(profiles)) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      profileSelect.appendChild(opt);
    }
  }

  function saveCurrentProfile() {
    const name = prompt('Nombre para este ajuste:');
    if (!name) return;
    const profiles = loadProfiles();
    const config = {};
    config.display = {
      flipH,
      flipV,
      rotation,
      imageSettings: { ...imageSettings },
    };
    if (blobTrackingEffect) config.blob = blobTrackingEffect.getConfig();
    if (faceDetectionEffect) config.face = faceDetectionEffect.getConfig();
    if (blinkDetectionEffect) config.blink = blinkDetectionEffect.getConfig();
    profiles[name] = config;
    saveProfiles(profiles);
    updateProfilesList();
    profileSelect.value = name;
    showStatus(profileStatus, `"${name}" guardado ✓`, 'success');
    setTimeout(() => hideStatus(profileStatus), 2500);
  }

  function loadProfile() {
    const name = profileSelect.value;
    if (!name) return;
    const profiles = loadProfiles();
    const config = profiles[name];
    if (!config) return;
    if (config.display) {
      if (typeof config.display.flipH === 'boolean') {
        flipH = config.display.flipH;
        chkMirror.checked = flipH;
      }
      if (typeof config.display.flipV === 'boolean') {
        flipV = config.display.flipV;
        chkFlipV.checked = flipV;
      }
      if (typeof config.display.rotation === 'number') {
        rotation = config.display.rotation;
        rotationSelect.value = String(rotation);
      }
      if (config.display.imageSettings) {
        imageSettings = { ...imageSettings, ...config.display.imageSettings };
        updateImageControlsUI();
        saveImageSettings();
      }
    }
    if (config.blob) {
      if (config.blob.boxColor) quickDetectorSettings.blobBoxColor = config.blob.boxColor;
      if (blobTrackingEffect) blobTrackingEffect.setConfig(config.blob);
    }
    if (config.face) {
      if (config.face.boxColor) quickDetectorSettings.faceBoxColor = config.face.boxColor;
      if (config.face.labelText != null) quickDetectorSettings.faceLabelText = normalizeFaceLabel(config.face.labelText);
      if (faceDetectionEffect) faceDetectionEffect.setConfig(config.face);
    }
    if (config.blink && blinkDetectionEffect) blinkDetectionEffect.setConfig(config.blink);
    applyQuickDetectorSettingsToEffects();
    updateQuickDetectorControlsUI();
    saveQuickDetectorSettings();
    renderEffectConfig();
    showStatus(profileStatus, `"${name}" cargado ✓`, 'success');
    setTimeout(() => hideStatus(profileStatus), 2500);
  }

  function deleteProfile() {
    const name = profileSelect.value;
    if (!name) return;
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    const profiles = loadProfiles();
    delete profiles[name];
    saveProfiles(profiles);
    updateProfilesList();
    showStatus(profileStatus, `"${name}" eliminado`, 'warning');
    setTimeout(() => hideStatus(profileStatus), 2500);
  }

  // ─── Capture ───
  function isCapturePreviewOpen() {
    return !!capturePreviewModal && !capturePreviewModal.classList.contains('hidden');
  }

  function onGlobalKeyDown(e) {
    if (e.key === 'Escape' && isCapturePreviewOpen()) {
      closeCapturePreview(true);
    }
  }

  function isPendingPhotoCapture() {
    return !!pendingCapture && pendingCapture.kind === 'photo';
  }

  function updatePreviewPhotoEnhancerControls() {
    if (!previewPhotoEnhancerStrengthGroup || !sldPreviewPhotoEnhancerStrength) return;
    const enabled = isPendingPhotoCapture() && !!pendingCapture.previewEnhancerEnabled;
    previewPhotoEnhancerStrengthGroup.classList.toggle('hidden', !enabled);
    sldPreviewPhotoEnhancerStrength.disabled = !enabled;
  }

  function syncPreviewPhotoTools() {
    const isPhoto = isPendingPhotoCapture();
    if (capturePreviewPhotoTools) {
      capturePreviewPhotoTools.classList.toggle('hidden', !isPhoto);
    }

    if (!isPhoto) {
      if (chkPreviewPhotoEnhancer) chkPreviewPhotoEnhancer.checked = false;
      if (sldPreviewPhotoEnhancerStrength) {
        sldPreviewPhotoEnhancerStrength.value = String(imageSettings.qualityEnhancerStrength);
      }
      if (valPreviewPhotoEnhancerStrength) {
        valPreviewPhotoEnhancerStrength.textContent = `${imageSettings.qualityEnhancerStrength}%`;
      }
      updatePreviewPhotoEnhancerControls();
      return;
    }

    const enabled = !!pendingCapture.previewEnhancerEnabled;
    const parsedStrength = parseInt(pendingCapture.previewEnhancerStrength, 10);
    const strength = clamp(
      Number.isFinite(parsedStrength) ? parsedStrength : imageSettings.qualityEnhancerStrength,
      0,
      100
    );
    pendingCapture.previewEnhancerEnabled = enabled;
    pendingCapture.previewEnhancerStrength = strength;

    if (chkPreviewPhotoEnhancer) chkPreviewPhotoEnhancer.checked = enabled;
    if (sldPreviewPhotoEnhancerStrength) sldPreviewPhotoEnhancerStrength.value = String(strength);
    if (valPreviewPhotoEnhancerStrength) valPreviewPhotoEnhancerStrength.textContent = `${strength}%`;
    updatePreviewPhotoEnhancerControls();
  }

  async function rebuildPendingPhotoPreview() {
    if (!isPendingPhotoCapture() || !pendingCapture.baseCanvas) return;
    const token = ++photoPreviewRenderToken;
    const enabled = !!pendingCapture.previewEnhancerEnabled;
    const strength = clamp(parseInt(pendingCapture.previewEnhancerStrength, 10) || 0, 0, 100);

    try {
      const {
        blob: nextBlob,
        width: nextWidth,
        height: nextHeight,
        enhancerEngine,
      } = await buildPhotoBlobFromCanvas(pendingCapture.baseCanvas, enabled, strength);
      if (token !== photoPreviewRenderToken || !isPendingPhotoCapture()) return;

      if (pendingCapture.objectUrl) {
        URL.revokeObjectURL(pendingCapture.objectUrl);
      }

      const nextObjectUrl = URL.createObjectURL(nextBlob);
      pendingCapture.objectUrl = nextObjectUrl;
      pendingCapture.blob = nextBlob;
      pendingCapture.meta = {
        ...(pendingCapture.meta || {}),
        width: nextWidth,
        height: nextHeight,
        size: nextBlob.size,
        enhanced: enabled,
        enhancerStrength: enabled ? strength : 0,
        enhancerEngine: enabled ? enhancerEngine : 'off',
      };

      if (capturePreviewImage) {
        capturePreviewImage.src = nextObjectUrl;
      }
      renderCapturePreviewInfo(pendingCapture.meta || {}, 'photo');
    } catch (err) {
      console.error('Error rebuilding photo preview:', err);
      showStatus(captureStatus, 'No se pudo aplicar el mejorador a la foto', 'error');
    }
  }

  function onPreviewPhotoEnhancerToggle(e) {
    if (!isPendingPhotoCapture()) return;
    if (previewPhotoEnhancerDebounceId) {
      clearTimeout(previewPhotoEnhancerDebounceId);
      previewPhotoEnhancerDebounceId = null;
    }
    pendingCapture.previewEnhancerEnabled = !!e.target.checked;
    updatePreviewPhotoEnhancerControls();
    rebuildPendingPhotoPreview();
  }

  function onPreviewPhotoEnhancerStrengthInput(e) {
    if (!isPendingPhotoCapture()) return;
    const strength = clamp(parseInt(e.target.value, 10) || 0, 0, 100);
    pendingCapture.previewEnhancerStrength = strength;
    if (valPreviewPhotoEnhancerStrength) {
      valPreviewPhotoEnhancerStrength.textContent = `${strength}%`;
    }
    if (pendingCapture.previewEnhancerEnabled) {
      if (previewPhotoEnhancerDebounceId) {
        clearTimeout(previewPhotoEnhancerDebounceId);
      }
      previewPhotoEnhancerDebounceId = setTimeout(() => {
        previewPhotoEnhancerDebounceId = null;
        rebuildPendingPhotoPreview();
      }, 180);
    }
  }

  function updateCaptureButtons() {
    if (!btnTakePhoto || !btnRecord) return;
    const previewOpen = isCapturePreviewOpen();
    const lockCaptureSettings = isRecording || previewOpen;

    btnTakePhoto.disabled = !isRunning || isRecording || previewOpen;
    btnRecord.disabled = (!isRunning && !isRecording) || previewOpen;
    if (videoFormatSelect) videoFormatSelect.disabled = lockCaptureSettings;
    if (sldJpegQuality) sldJpegQuality.disabled = lockCaptureSettings;
    if (chkQualityEnhancer) chkQualityEnhancer.disabled = lockCaptureSettings;
    if (sldQualityEnhancerStrength) {
      sldQualityEnhancerStrength.disabled = lockCaptureSettings || !imageSettings.qualityEnhancer;
    }

    if (isRecording) {
      btnRecord.classList.add('recording');
      btnRecord.innerHTML = '<i class="fa-solid fa-stop"></i> Detener';
    } else {
      btnRecord.classList.remove('recording');
      btnRecord.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Grabar';
    }
  }

  function canvasToBlobAsync(sourceCanvas, mimeType, quality) {
    return new Promise((resolve) => {
      sourceCanvas.toBlob((blob) => resolve(blob), mimeType, quality);
    });
  }

  function isUpscalerRuntimeAvailable() {
    if (upscalerDisabled) return false;
    return typeof window !== 'undefined'
      && typeof window.Upscaler === 'function'
      && typeof window.DefaultUpscalerJSModel !== 'undefined';
  }

  async function ensureUpscalerInstance() {
    if (upscalerDisabled) return null;
    if (upscalerInstance) return upscalerInstance;
    if (upscalerInitPromise) return upscalerInitPromise;
    if (!isUpscalerRuntimeAvailable()) return null;

    upscalerInitPromise = (async () => {
      try {
        const instance = new window.Upscaler({
          model: window.DefaultUpscalerJSModel,
        });
        upscalerInstance = instance;
        return instance;
      } catch (err) {
        console.error('No se pudo inicializar UpscalerJS:', err);
        upscalerDisabled = true;
        return null;
      } finally {
        upscalerInitPromise = null;
      }
    })();

    return upscalerInitPromise;
  }

  function loadImageFromSrc(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('upscaled_image_load_failed'));
      img.src = src;
    });
  }

  async function upscaleCanvasWithUpscaler(sourceCanvas) {
    const upscaler = await ensureUpscalerInstance();
    if (!upscaler) return null;

    const upscaledSrc = await upscaler.upscale(sourceCanvas, {
      patchSize: 64,
      padding: 2,
    });
    if (!upscaledSrc || typeof upscaledSrc !== 'string') return null;

    const upscaledImage = await loadImageFromSrc(upscaledSrc);
    const upscaledCanvas = document.createElement('canvas');
    upscaledCanvas.width = Math.max(1, upscaledImage.naturalWidth || upscaledImage.width || sourceCanvas.width);
    upscaledCanvas.height = Math.max(1, upscaledImage.naturalHeight || upscaledImage.height || sourceCanvas.height);
    const upscaledCtx = upscaledCanvas.getContext('2d', { willReadFrequently: false });
    if (!upscaledCtx) return null;
    upscaledCtx.drawImage(upscaledImage, 0, 0, upscaledCanvas.width, upscaledCanvas.height);
    return upscaledCanvas;
  }

  function ensureRecordingCanvas() {
    if (!recordingCanvas) {
      recordingCanvas = document.createElement('canvas');
      recordingCtx = recordingCanvas.getContext('2d', { willReadFrequently: false });
    }

    const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
    if (recordingCanvas.width !== sourceWidth || recordingCanvas.height !== sourceHeight) {
      recordingCanvas.width = sourceWidth;
      recordingCanvas.height = sourceHeight;
    }

    return recordingCanvas;
  }

  function ensureRecordingEnhancerBuffer(width, height) {
    if (!recordingEnhancerCanvas) {
      recordingEnhancerCanvas = document.createElement('canvas');
      recordingEnhancerCtx = recordingEnhancerCanvas.getContext('2d', { willReadFrequently: false });
    }
    if (recordingEnhancerCanvas.width !== width || recordingEnhancerCanvas.height !== height) {
      recordingEnhancerCanvas.width = width;
      recordingEnhancerCanvas.height = height;
    }
    return recordingEnhancerCanvas;
  }

  function getPreferredRecordingFps() {
    const streamSettings = cameraManager.getStreamSettings();
    const rawFps = Math.round(streamSettings.frameRate || 30);
    return clamp(rawFps, 24, 60);
  }

  function getRecommendedVideoBitrate(width, height, fps) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const safeFps = clamp(fps || 30, 24, 60);
    const bitsPerPixelFrame = imageSettings.qualityEnhancer ? 0.22 : 0.18;
    const estimate = Math.round(safeWidth * safeHeight * safeFps * bitsPerPixelFrame);
    return clamp(estimate, 8000000, 32000000);
  }

  function drawEnhancedFrameToContext(targetCtx, sourceCanvas, width, height, strengthPct, forExport = false) {
    const amount = clamp((strengthPct || 0) / 100, 0, 1);
    const brightness = 100 + amount * 4;
    const contrast = 100 + amount * 14;
    const saturation = 100 + amount * 12;

    targetCtx.save();
    targetCtx.clearRect(0, 0, width, height);
    targetCtx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
    targetCtx.restore();

    if (forExport && amount > 0.05) {
      const imageData = targetCtx.getImageData(0, 0, width, height);
      applySharpenFilter(imageData, clamp(0.18 + amount * 0.62, 0, 1));
      targetCtx.putImageData(imageData, 0, 0);
    } else if (!forExport && amount >= 0.22) {
      targetCtx.save();
      targetCtx.globalCompositeOperation = 'overlay';
      targetCtx.globalAlpha = 0.05 + amount * 0.10;
      targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
      targetCtx.restore();
    }
  }

  function copyFrameToRecordingCanvas() {
    if (!recordingCanvas || !recordingCtx || videoEl.readyState < 2) return;

    ensureRecordingCanvas();
    renderProcessedFrame(recordingCanvas, recordingCtx, 'recording');

    if (imageSettings.qualityEnhancer) {
      const enhancerBuffer = ensureRecordingEnhancerBuffer(recordingCanvas.width, recordingCanvas.height);
      if (recordingEnhancerCtx) {
        recordingEnhancerCtx.clearRect(0, 0, enhancerBuffer.width, enhancerBuffer.height);
        recordingEnhancerCtx.drawImage(recordingCanvas, 0, 0, enhancerBuffer.width, enhancerBuffer.height);
        drawEnhancedFrameToContext(
          recordingCtx,
          enhancerBuffer,
          recordingCanvas.width,
          recordingCanvas.height,
          imageSettings.qualityEnhancerStrength,
          false
        );
      }
    }
  }

  function syncRecordingCanvasFrame() {
    if (!isRecording || !recordingCanvas || !recordingCtx) return;
    copyFrameToRecordingCanvas();
  }

  async function buildPhotoBlobFromCanvas(baseCanvas, enhancerEnabled, enhancerStrength) {
    if (!baseCanvas || baseCanvas.width === 0 || baseCanvas.height === 0) {
      throw new Error('photo_base_canvas_invalid');
    }

    if (!enhancerEnabled) {
      const rawBlob = await canvasToBlobAsync(baseCanvas, 'image/jpeg', imageSettings.jpegQuality / 100);
      if (!rawBlob) throw new Error('photo_blob_failed');
      return {
        blob: rawBlob,
        width: baseCanvas.width,
        height: baseCanvas.height,
        enhancerEngine: 'off',
      };
    }

    let workingCanvas = baseCanvas;
    let enhancerEngine = 'classic';

    if (isUpscalerRuntimeAvailable()) {
      try {
        const upscaledCanvas = await upscaleCanvasWithUpscaler(baseCanvas);
        if (upscaledCanvas) {
          workingCanvas = upscaledCanvas;
          enhancerEngine = 'upscalerjs';
        }
      } catch (err) {
        console.error('UpscalerJS fallo. Se usa fallback clasico:', err);
      }
    }

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = workingCanvas.width;
    exportCanvas.height = workingCanvas.height;
    const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: true });
    drawEnhancedFrameToContext(
      exportCtx,
      workingCanvas,
      exportCanvas.width,
      exportCanvas.height,
      enhancerStrength,
      true
    );

    const blob = await canvasToBlobAsync(exportCanvas, 'image/jpeg', imageSettings.jpegQuality / 100);
    if (!blob) throw new Error('photo_blob_failed');
    return {
      blob,
      width: exportCanvas.width,
      height: exportCanvas.height,
      enhancerEngine,
    };
  }

  async function buildPhotoCaptureSnapshot(enhancerEnabled, enhancerStrength) {
    const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
    if (sourceWidth <= 1 || sourceHeight <= 1) {
      throw new Error('source_frame_unavailable');
    }

    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = sourceWidth;
    baseCanvas.height = sourceHeight;
    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
    renderProcessedFrame(baseCanvas, baseCtx, 'capture');

    const {
      blob,
      width,
      height,
      enhancerEngine,
    } = await buildPhotoBlobFromCanvas(baseCanvas, enhancerEnabled, enhancerStrength);
    return {
      blob,
      width,
      height,
      baseCanvas,
      enhancerEngine,
    };
  }

  async function takePhoto() {
    if (!isRunning) {
      showStatus(captureStatus, 'Primero enciende la camara', 'warning');
      return;
    }
    if (isCapturePreviewOpen()) {
      showStatus(captureStatus, 'Primero cierra la vista previa actual', 'info');
      return;
    }
    const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
    if (videoEl.readyState < 2 || sourceWidth <= 1 || sourceHeight <= 1) {
      showStatus(captureStatus, 'Espera un momento y vuelve a sacar la foto', 'info');
      return;
    }

    try {
      const initialEnhancerEnabled = !!imageSettings.qualityEnhancer;
      const initialEnhancerStrength = imageSettings.qualityEnhancerStrength;
      const {
        blob, width, height, baseCanvas, enhancerEngine,
      } = await buildPhotoCaptureSnapshot(initialEnhancerEnabled, initialEnhancerStrength);
      const filename = `hatewebcam-photo-${timestamp()}.jpg`;
      openCapturePreview({
        kind: 'photo',
        blob,
        baseCanvas,
        filename,
        meta: {
          width,
          height,
          size: blob.size,
          format: 'JPEG',
          jpegQuality: imageSettings.jpegQuality,
          enhanced: initialEnhancerEnabled,
          enhancerStrength: initialEnhancerStrength,
          enhancerEngine: initialEnhancerEnabled ? enhancerEngine : 'off',
        },
      });
      showStatus(captureStatus, 'Foto lista en vista previa', 'info');
    } catch (err) {
      console.error('Error taking photo:', err);
      showStatus(captureStatus, 'No se pudo tomar la foto', 'error');
    }
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording(true);
    } else {
      startRecording();
    }
  }

  function startRecording() {
    if (!isRunning) {
      showStatus(captureStatus, 'Primero enciende la camara', 'warning');
      return;
    }
    if (isCapturePreviewOpen()) {
      showStatus(captureStatus, 'Primero cierra la vista previa actual', 'info');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      showStatus(captureStatus, 'Tu navegador no soporta grabacion', 'error');
      return;
    }

    const recordingProfile = getRecordingProfile();
    if (!recordingProfile) {
      showStatus(captureStatus, 'No hay formato de video compatible', 'error');
      return;
    }

    try {
      recordingChunks = [];

      ensureRecordingCanvas();
      if (recordingCanvas.width === 0 || recordingCanvas.height === 0) {
        showStatus(captureStatus, 'Espera un momento y reintenta la grabacion', 'info');
        return;
      }
      currentRecordingMimeType = recordingProfile.mimeType;
      currentRecordingExt = recordingProfile.extension;
      copyFrameToRecordingCanvas();
      currentRecordingFps = getPreferredRecordingFps();
      currentRecordingBitrate = getRecommendedVideoBitrate(
        recordingCanvas.width,
        recordingCanvas.height,
        currentRecordingFps
      );

      recordingStream = recordingCanvas.captureStream(currentRecordingFps);
      mediaRecorder = new MediaRecorder(recordingStream, {
        mimeType: recordingProfile.mimeType,
        videoBitsPerSecond: currentRecordingBitrate,
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordingChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const chunks = recordingChunks;
        recordingChunks = [];
        const recordedWidth = recordingCanvas ? recordingCanvas.width : canvas.width;
        const recordedHeight = recordingCanvas ? recordingCanvas.height : canvas.height;

        if (recordingStream) {
          recordingStream.getTracks().forEach((t) => t.stop());
          recordingStream = null;
        }

        const shouldSave = chunks.length > 0;
        mediaRecorder = null;
        const savedMimeType = currentRecordingMimeType;
        const savedExtension = currentRecordingExt;
        currentRecordingMimeType = '';
        currentRecordingExt = 'webm';

        if (shouldSave) {
          const blob = new Blob(chunks, { type: savedMimeType || 'video/webm' });
          const filename = `hatewebcam-record-${timestamp()}.${savedExtension}`;
          openCapturePreview({
            kind: 'video',
            blob,
            filename,
            meta: {
              width: recordedWidth,
              height: recordedHeight,
              size: blob.size,
              format: savedExtension.toUpperCase(),
              durationSec: lastRecordingDurationSec,
              fps: currentRecordingFps,
              bitrate: currentRecordingBitrate,
              enhanced: !!imageSettings.qualityEnhancer,
              enhancerStrength: imageSettings.qualityEnhancerStrength,
            },
          });
          showStatus(captureStatus, 'Video listo en vista previa', 'info');
        }

        currentRecordingBitrate = 6000000;
        currentRecordingFps = 30;
        lastRecordingDurationSec = 0;
      };

      if (recordingProfile.fallbackMessage) {
        showStatus(captureStatus, recordingProfile.fallbackMessage, 'info');
      }

      mediaRecorder.start(250);
      isRecording = true;
      recordingStartTs = Date.now();
      if (recordingTimer) clearInterval(recordingTimer);
      recordingTimer = setInterval(() => {
        if (!isRecording) return;
        const sec = Math.floor((Date.now() - recordingStartTs) / 1000);
        showStatus(captureStatus, `Grabando ${formatDuration(sec)}`, 'warning');
      }, 300);

      updateCaptureButtons();
    } catch (err) {
      console.error('Error starting recording:', err);
      showStatus(captureStatus, 'No se pudo iniciar la grabacion', 'error');
      isRecording = false;
      if (recordingStream) {
        recordingStream.getTracks().forEach((t) => t.stop());
        recordingStream = null;
      }
      mediaRecorder = null;
      currentRecordingMimeType = '';
      currentRecordingExt = 'webm';
      currentRecordingBitrate = 6000000;
      currentRecordingFps = 30;
      lastRecordingDurationSec = 0;
      updateCaptureButtons();
    }
  }

  function stopRecording(saveFile) {
    if (!isRecording && !mediaRecorder) return;

    isRecording = false;
    if (saveFile && recordingStartTs > 0) {
      lastRecordingDurationSec = Math.max(0, (Date.now() - recordingStartTs) / 1000);
    } else {
      lastRecordingDurationSec = 0;
    }
    recordingStartTs = 0;

    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }

    updateCaptureButtons();

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    if (!saveFile) {
      recordingChunks = [];
      if (recordingStream) {
        recordingStream.getTracks().forEach((t) => t.stop());
        recordingStream = null;
      }
      mediaRecorder = null;
      currentRecordingMimeType = '';
      currentRecordingExt = 'webm';
      currentRecordingBitrate = 6000000;
      currentRecordingFps = 30;
      lastRecordingDurationSec = 0;
    }
  }

  function openCapturePreview(capture) {
    if (!capturePreviewModal || !capture) return;

    clearPendingCapture(true);
    const objectUrl = URL.createObjectURL(capture.blob);
    const initialPreviewEnhancerEnabled = capture.kind === 'photo'
      ? !!((capture.meta && typeof capture.meta.enhanced === 'boolean')
        ? capture.meta.enhanced
        : imageSettings.qualityEnhancer)
      : false;
    const parsedPreviewEnhancerStrength = parseInt(capture.meta && capture.meta.enhancerStrength, 10);
    const initialPreviewEnhancerStrength = capture.kind === 'photo'
      ? clamp(
        Number.isFinite(parsedPreviewEnhancerStrength)
          ? parsedPreviewEnhancerStrength
          : imageSettings.qualityEnhancerStrength,
        0,
        100
      )
      : 0;

    pendingCapture = {
      ...capture,
      objectUrl,
      previewEnhancerEnabled: initialPreviewEnhancerEnabled,
      previewEnhancerStrength: initialPreviewEnhancerStrength,
    };
    photoPreviewRenderToken++;

    if (capturePreviewTitle) {
      capturePreviewTitle.innerHTML = capture.kind === 'video'
        ? '<i class="fa-solid fa-film"></i> Vista previa de video'
        : '<i class="fa-solid fa-image"></i> Vista previa de foto';
    }
    if (capturePreviewFilename) {
      capturePreviewFilename.textContent = capture.filename;
    }
    if (btnDownloadCapture) {
      btnDownloadCapture.innerHTML = capture.kind === 'video'
        ? '<i class="fa-solid fa-download"></i> Descargar video'
        : '<i class="fa-solid fa-download"></i> Descargar foto';
    }

    if (capturePreviewImage) {
      capturePreviewImage.classList.toggle('hidden', capture.kind !== 'photo');
      if (capture.kind === 'photo') capturePreviewImage.src = objectUrl;
      else capturePreviewImage.removeAttribute('src');
    }

    if (capturePreviewVideo) {
      capturePreviewVideo.classList.toggle('hidden', capture.kind !== 'video');
      if (capture.kind === 'video') {
        capturePreviewVideo.src = objectUrl;
        capturePreviewVideo.currentTime = 0;
        capturePreviewVideo.load();
      } else {
        capturePreviewVideo.pause();
        capturePreviewVideo.removeAttribute('src');
        capturePreviewVideo.load();
      }
    }

    syncPreviewPhotoTools();
    renderCapturePreviewInfo(capture.meta || {}, capture.kind);
    capturePreviewModal.classList.remove('hidden');
    updateCaptureButtons();
  }

  function renderCapturePreviewInfo(meta, kind) {
    if (!capturePreviewInfo) return;
    capturePreviewInfo.innerHTML = '';

    const rows = [
      ['Tipo', kind === 'video' ? 'Video' : 'Foto'],
      ['Resolucion', `${meta.width || 0}x${meta.height || 0}`],
      ['Formato', meta.format || (kind === 'video' ? 'WEBM/MP4' : 'JPEG')],
      ['Tamano', formatBytes(meta.size || 0)],
    ];

    if (meta.durationSec != null) rows.push(['Duracion', formatDurationDetailed(meta.durationSec)]);
    if (meta.jpegQuality != null) rows.push(['Calidad JPEG', `${meta.jpegQuality}%`]);
    if (meta.fps != null) rows.push(['FPS', `${meta.fps}`]);
    if (meta.bitrate != null) rows.push(['Bitrate', `${(meta.bitrate / 1000000).toFixed(1)} Mbps`]);

    const enhancerLabel = meta.enhanced
      ? `Activo (${meta.enhancerStrength || 0}%)`
      : 'Desactivado';
    rows.push(['Mejorador', enhancerLabel]);
    if (meta.enhanced) {
      const enhancerEngineLabel = meta.enhancerEngine === 'upscalerjs'
        ? 'UpscalerJS + ajuste fino'
        : meta.enhancerEngine === 'classic'
          ? 'Clasico'
          : 'Clasico';
      rows.push(['Motor', enhancerEngineLabel]);
    }

    for (const [key, value] of rows) {
      const row = document.createElement('div');
      row.className = 'capture-preview-row';
      const keyEl = document.createElement('div');
      keyEl.className = 'capture-preview-key';
      keyEl.textContent = key;
      const valueEl = document.createElement('div');
      valueEl.className = 'capture-preview-value';
      valueEl.textContent = value;
      row.appendChild(keyEl);
      row.appendChild(valueEl);
      capturePreviewInfo.appendChild(row);
    }
  }

  function clearPendingCapture(silent = false) {
    photoPreviewRenderToken++;
    if (previewPhotoEnhancerDebounceId) {
      clearTimeout(previewPhotoEnhancerDebounceId);
      previewPhotoEnhancerDebounceId = null;
    }
    if (!pendingCapture) {
      syncPreviewPhotoTools();
      return;
    }

    if (pendingCapture.objectUrl) {
      URL.revokeObjectURL(pendingCapture.objectUrl);
    }

    if (capturePreviewImage) {
      capturePreviewImage.removeAttribute('src');
      capturePreviewImage.classList.add('hidden');
    }

    if (capturePreviewVideo) {
      capturePreviewVideo.pause();
      capturePreviewVideo.removeAttribute('src');
      capturePreviewVideo.load();
      capturePreviewVideo.classList.add('hidden');
    }

    pendingCapture = null;
    if (!silent && capturePreviewFilename) {
      capturePreviewFilename.textContent = '-';
    }
    if (capturePreviewInfo) {
      capturePreviewInfo.innerHTML = '';
    }
    if (btnDownloadCapture) {
      btnDownloadCapture.innerHTML = '<i class="fa-solid fa-download"></i> Descargar';
    }
    if (capturePreviewTitle) {
      capturePreviewTitle.innerHTML = '<i class="fa-solid fa-image"></i> Vista previa de captura';
    }
    syncPreviewPhotoTools();
  }

  function closeCapturePreview(showDiscardStatus) {
    if (!capturePreviewModal || capturePreviewModal.classList.contains('hidden')) return;
    capturePreviewModal.classList.add('hidden');
    clearPendingCapture(false);
    updateCaptureButtons();

    if (showDiscardStatus) {
      showStatus(captureStatus, 'Captura descartada', 'warning');
      setTimeout(() => hideStatus(captureStatus), 1800);
    }
  }

  function downloadPendingCapture() {
    if (!pendingCapture) return;

    downloadBlob(pendingCapture.blob, pendingCapture.filename);
    const label = pendingCapture.kind === 'video' ? 'Video' : 'Foto';
    showStatus(captureStatus, `${label} guardado: ${pendingCapture.filename}`, 'success');
    setTimeout(() => hideStatus(captureStatus), 2600);
    closeCapturePreview(false);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** exp);
    const digits = exp === 0 ? 0 : (value >= 100 ? 0 : value >= 10 ? 1 : 2);
    return `${value.toFixed(digits)} ${units[exp]}`;
  }

  function formatDurationDetailed(seconds) {
    const safe = Math.max(0, Math.round(seconds || 0));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function pickSupportedMimeType(list) {
    for (const t of list) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

  function getRecordingProfile() {
    const mp4List = [
      'video/mp4;codecs=avc1.64001F,mp4a.40.2',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=h264,aac',
      'video/mp4',
    ];
    const webmList = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];

    const desired = imageSettings.videoFormat || 'auto';
    let mimeType = '';
    let extension = 'webm';
    let fallbackMessage = '';

    if (desired === 'mp4') {
      mimeType = pickSupportedMimeType(mp4List);
      if (!mimeType) {
        mimeType = pickSupportedMimeType(webmList);
        extension = 'webm';
        if (mimeType) {
          fallbackMessage = 'MP4 no disponible en este navegador. Se usará WebM.';
        }
      } else {
        extension = 'mp4';
      }
    } else if (desired === 'webm') {
      mimeType = pickSupportedMimeType(webmList);
      if (mimeType) {
        extension = 'webm';
      } else {
        mimeType = pickSupportedMimeType(mp4List);
        extension = 'mp4';
        if (mimeType) {
          fallbackMessage = 'WebM no disponible en este navegador. Se usará MP4.';
        }
      }
    } else {
      mimeType = pickSupportedMimeType(mp4List);
      if (mimeType) {
        extension = 'mp4';
      } else {
        mimeType = pickSupportedMimeType(webmList);
        extension = 'webm';
      }
    }

    if (!mimeType) return null;
    return { mimeType, extension, fallbackMessage };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function timestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function showStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className = `status-msg ${type}`;
    el.classList.remove('hidden');
  }

  function hideStatus(el) {
    if (!el) return;
    el.classList.add('hidden');
  }

  // ─── Go ───
  init();
})();
