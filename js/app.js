/**
 * HateWebcam Web — Main Application Controller
 */
(function () {
  'use strict';

  // ─── DOM ───
  const $ = (s) => document.querySelector(s);
  const videoEl = $('#videoElement');
  const canvas = $('#previewCanvas');
  const previewWrapper = $('#previewWrapper');
  const captureCountdown = $('#captureCountdown');
  const captureCountdownValue = $('#captureCountdownValue');
  const ctx = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
  const placeholder = $('#previewPlaceholder');
  const resolutionInfo = $('#resolutionInfo');
  const fpsInfo = $('#fpsInfo');
  const effectsInfo = $('#effectsInfo');
  const previewQualitySelect = $('#previewQualitySelect');
  const btnWebcamMode = $('#btnWebcamMode');
  const btnVideoMode = $('#btnVideoMode');
  const videoFileInput = $('#videoFileInput');
  const btnChooseVideo = $('#btnChooseVideo');
  const videoFileMeta = $('#videoFileMeta');
  const videoEditorStatus = $('#videoEditorStatus');
  const btnVideoStart = $('#btnVideoStart');
  const btnVideoBack = $('#btnVideoBack');
  const btnVideoPlay = $('#btnVideoPlay');
  const btnVideoForward = $('#btnVideoForward');
  const btnVideoEnd = $('#btnVideoEnd');
  const btnVideoMute = $('#btnVideoMute');
  const videoSeek = $('#videoSeek');
  const videoTimeLabel = $('#videoTimeLabel');
  const videoTimelineEl = $('#videoTimeline');
  const timelineTrim = $('#timelineTrim');
  const timelineTrimStartHandle = $('#timelineTrimStartHandle');
  const timelineTrimEndHandle = $('#timelineTrimEndHandle');
  const timelinePlayhead = $('#timelinePlayhead');
  const timelineItems = $('#timelineItems');
  const timelineEffectPalette = $('#timelineEffectPalette');
  const videoEffectRangeLabel = $('#videoEffectRangeLabel');
  const videoTrimStart = $('#videoTrimStart');
  const videoTrimEnd = $('#videoTrimEnd');
  const btnSetTrimFromPlayhead = $('#btnSetTrimFromPlayhead');
  const btnSetTrimEndFromPlayhead = $('#btnSetTrimEndFromPlayhead');
  const videoEffectType = $('#videoEffectType');
  const videoEffectStart = $('#videoEffectStart');
  const videoEffectEnd = $('#videoEffectEnd');
  const videoEffectClipMeta = $('#videoEffectClipMeta');
  const videoEffectTypeLabel = $('#videoEffectTypeLabel');
  const videoEffectDurationLabel = $('#videoEffectDurationLabel');
  const btnOpenEffectAdjust = $('#btnOpenEffectAdjust');
  const btnDeleteVideoEffect = $('#btnDeleteVideoEffect');
  const videoExportDetails = $('#videoExportDetails');
  const videoExportModal = $('#videoExportModal');
  const videoExportTitle = $('#videoExportTitle');
  const videoExportSummary = $('#videoExportSummary');
  const videoExportProgress = $('#videoExportProgress');
  const btnExportVideo = $('#btnExportVideo');
  const btnHeaderExportVideo = $('#btnHeaderExportVideo');
  const btnCancelVideoExport = $('#btnCancelVideoExport');
  const btnCloseVideoExportModal = $('#btnCloseVideoExportModal');
  const btnToolSelect = $('#btnToolSelect');
  const btnToolTrim = $('#btnToolTrim');
  const btnTimelineZoomIn = $('#btnTimelineZoomIn');
  const btnTimelineZoomOut = $('#btnTimelineZoomOut');
  const timelineZoomInput = $('#timelineZoom');
  const timelineViewport = $('#timelineViewport');
  const timelineScroll = $('#timelineScroll');
  const timelineTimeRuler = $('#timelineTimeRuler');
  const timelineTrackArea = videoTimelineEl ? videoTimelineEl.querySelector('.timeline-track-area') : null;
  const timelineVideoClip = $('#timelineVideoClip');
  const timelineTrimOutsideStart = $('#timelineTrimOutsideStart');
  const timelineTrimOutsideEnd = $('#timelineTrimOutsideEnd');
  const timelinePlayheadHandle = $('#timelinePlayheadHandle');
  const timelineHintText = $('#timelineHintText');
  const chkTimelineSnap = $('#chkTimelineSnap');
  const btnEditorUndo = $('#btnEditorUndo');
  const btnEditorRedo = $('#btnEditorRedo');
  const videoInspector = $('#videoInspector');
  const inspectorAdjustmentsHost = $('#inspectorAdjustmentsHost');
  const inspectorAdjustmentsEmpty = $('#inspectorAdjustmentsEmpty');
  const effectsControlsSlot = $('#effectsControlsSlot');
  const videoEffectEmptyHint = $('#videoEffectEmptyHint');
  const inspectorTabs = document.querySelectorAll('.video-inspector-tab');
  const inspectorPanels = document.querySelectorAll('.video-inspector-panel');

  const btnToggleCamera = $('#btnToggleCamera');
  const cameraSelect = $('#cameraSelect');
  const btnTakePhoto = $('#btnTakePhoto');
  const btnRecord = $('#btnRecord');
  const captureStatus = $('#captureStatus');
  const captureTimerSelect = $('#captureTimerSelect');
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
  const controlPanel = $('#controlPanel');

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
  const mobilePresetButtons = document.querySelectorAll('.mobile-preset-chip');

  const chkBlobTracking = $('#chkBlobTracking');
  const chkFaceDetection = $('#chkFaceDetection');
  const chkBlinkDetection = $('#chkBlinkDetection');
  const inpBlobQuickColor = $('#inpBlobQuickColor');
  const blobQuickColorSwatch = $('#blobQuickColorSwatch');
  const inpFaceQuickColor = $('#inpFaceQuickColor');
  const faceQuickColorChip = $('#faceQuickColorChip');
  const faceQuickColorSwatch = $('#faceQuickColorSwatch');
  const faceQuickControls = $('#faceQuickControls');
  const faceQuickLabelWrap = $('#faceQuickLabelWrap');
  const chkFaceShowBox = $('#chkFaceShowBox');
  const chkFaceShowBlur = $('#chkFaceShowBlur');
  const inpFaceQuickLabel = $('#inpFaceQuickLabel');
  const colorPickSection = $('#colorPickSection');
  const btnColorPick = $('#btnColorPick');
  const colorPickStatus = $('#colorPickStatus');
  const btnToggleAdvancedOptions = $('#btnToggleAdvancedOptions');
  const advancedToggleLabel = $('#advancedToggleLabel');
  const advancedOptions = $('#advancedOptions');
  const effectConfigBlob = $('#effectConfigBlob');
  const effectConfigFace = $('#effectConfigFace');
  const effectConfigBlink = $('#effectConfigBlink');
  const adjustContextNav = $('#adjustContextNav');
  const adjustContextHelp = $('#adjustContextHelp');
  const profileSelect = $('#profileSelect');
  const btnSaveProfile = $('#btnSaveProfile');
  const btnDeleteProfile = $('#btnDeleteProfile');
  const profileStatus = $('#profileStatus');
  const btnMobileEffectsDock = $('#btnMobileEffectsDock');
  const mobileFxBackdrop = $('#mobileFxBackdrop');
  const mobileFxPanel = $('#mobileFxPanel');
  const btnMobileFxClose = $('#btnMobileFxClose');
  const btnMobileTakePhoto = $('#btnMobileTakePhoto');
  const btnMobileRecord = $('#btnMobileRecord');
  const selMobileCaptureTimer = $('#selMobileCaptureTimer');
  const btnMobileBlobToggle = $('#btnMobileBlobToggle');
  const btnMobileFaceToggle = $('#btnMobileFaceToggle');
  const btnMobileBlinkToggle = $('#btnMobileBlinkToggle');
  const btnMobileColorPick = $('#btnMobileColorPick');
  const inpMobileBlobColor = $('#inpMobileBlobColor');
  const inpMobileFaceColor = $('#inpMobileFaceColor');
  const mobileFaceColorChip = $('#mobileFaceColorChip');
  const mobileFaceLabelWrap = $('#mobileFaceLabelWrap');
  const chkMobileFaceShowBox = $('#chkMobileFaceShowBox');
  const chkMobileFaceShowBlur = $('#chkMobileFaceShowBlur');
  const inpMobileFaceLabel = $('#inpMobileFaceLabel');

  if (!videoEl || !canvas || !ctx || !btnToggleCamera || !cameraSelect || !btnTakePhoto || !btnRecord) {
    console.error('HateWebcam: faltan elementos base del DOM para iniciar la app.');
    return;
  }

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
  let mobileActivePreset = null;

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
  let photoPreviewRenderToken = 0;
  let previewPhotoEnhancerDebounceId = null;
  let photoCountdownTimer = null;
  let photoCountdownRemaining = 0;
  let isPhotoCountdownActive = false;
  let postFxCanvas = null;
  let postFxCtx = null;
  let captureFxCanvas = null;
  let captureFxCtx = null;
  let recordingFxCanvas = null;
  let recordingFxCtx = null;
  let preferredDeviceId = null;
  let faceMeshScriptLoadPromise = null;
  let mediaPipeConsoleFilterInstalled = false;
  let faceLoadRequestId = 0;
  let blinkLoadRequestId = 0;
  let isPageVisible = document.visibilityState !== 'hidden';
  let sourceMode = 'camera';
  let videoObjectUrl = '';
  let videoSourceFile = null;
  let videoSourceFps = 30;
  let videoSourceAverageBitrate = 0;
  let videoTimeline = new VideoTimeline();
  let editorHistory = typeof EditorHistory !== 'undefined' ? new EditorHistory() : null;
  let editorTool = 'select';
  let adjustmentsContext = 'look';
  let timelineZoom = 1;
  let timelineHistorySuspended = false;
  let selectedVideoEffectId = '';
  let paletteDragState = null;
  let timelineDragGhost = null;
  const TIMELINE_EFFECT_META = Object.freeze({
    look: { label: 'Look', trackLabel: 'LOOK', row: 1 },
    blob: { label: 'Color', trackLabel: 'COLOR', row: 2 },
    face: { label: 'Caras', trackLabel: 'CARAS', row: 3 },
    blink: { label: 'Ojos', trackLabel: 'OJOS', row: 4 },
  });
  const DEFAULT_TIMELINE_EFFECT_DURATION = 3;
  let appliedTimelineItemIds = {};
  let videoBaseImageSettings = null;
  let isVideoExporting = false;
  let videoExportFileName = '';
  let videoExportWakeLock = null;
  let webcamSessionState = null;

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
    previewQuality: 'balanced',
    captureTimerSeconds: 0,
    qualityEnhancer: false,
    qualityEnhancerStrength: 35,
  };
  const DEFAULT_CAMERA_FPS = 30;
  const COMMON_VIDEO_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
  const DEFAULT_PREVIEW_QUALITY = 'balanced';
  const PREVIEW_QUALITY_PRESETS = Object.freeze({
    draft: { label: 'Borrador', maxPixels: 432 * 243, maxScale: 0.45 },
    balanced: { label: 'Balanceada', maxPixels: 640 * 360, maxScale: 0.66 },
    high: { label: 'Alta', maxPixels: 1600 * 900, maxScale: 0.9 },
    full: { label: 'Exacta', maxPixels: Number.POSITIVE_INFINITY, maxScale: 1 },
  });
  const PREVIEW_MIN_WIDTH = 320;
  const PREVIEW_MIN_HEIGHT = 180;
  const MEDIAPIPE_FACE_MESH_VERSION = '0.4.1633559619';
  const MEDIAPIPE_FACE_MESH_SRC = `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${MEDIAPIPE_FACE_MESH_VERSION}/face_mesh.js`;
  const MEDIAPIPE_CONSOLE_NOISE_PATTERNS = [
    'gl_context_webgl.cc',
    'gl_context.cc:351',
    'gl_context.cc:821',
    'OpenGL error checking is disabled',
    'GL version: 3.0 (OpenGL ES 3.0',
  ];
  const DETECTOR_DEFAULT_BOX_COLOR = '#ff2222';
  const DEFAULT_QUICK_DETECTOR_SETTINGS = {
    blobBoxColor: DETECTOR_DEFAULT_BOX_COLOR,
    faceBoxColor: DETECTOR_DEFAULT_BOX_COLOR,
    faceLabelText: 'CARA',
    faceShowBox: true,
    faceShowBlur: false,
    facePixelationCellSize: 14,
    faceCensorPaddingPercent: 18,
  };
  const ADJUST_CONTEXT_HELP = {
    look: 'Orientación, encuadre, presets y ajuste fino para la pista VIDEO y tramos LOOK.',
    blob: 'Seguimiento por color para tramos en la pista COLOR.',
    face: 'Detección y estilo de caras en la pista CARAS.',
    blink: 'Detección de pestañeos en la pista OJOS.',
  };
  let imageSettings = { ...DEFAULT_IMAGE_SETTINGS };
  let quickDetectorSettings = { ...DEFAULT_QUICK_DETECTOR_SETTINGS };
  let saveImageSettingsTimer = null;
  let saveQuickDetectorSettingsTimer = null;
  let saveEffectSettingsTimer = null;
  let syncSelectedClipConfigTimer = null;
  let storageWarningShown = false;

  // ─── Storage ───
  const STORAGE_KEY = 'hatewebcam_config';
  const PROFILES_KEY = 'hatewebcam_profiles';

  function loadJsonStorage(key, fallbackValue) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallbackValue;
    } catch (err) {
      console.warn(`HateWebcam: no se pudo leer ${key} desde localStorage.`, err);
      return fallbackValue;
    }
  }

  function notifyStorageUnavailable(err) {
    console.warn('HateWebcam: no se pudieron guardar los ajustes locales.', err);
    if (storageWarningShown) return;
    storageWarningShown = true;
    showStatus(captureStatus || profileStatus, 'No se pudieron guardar los ajustes locales en este navegador.', 'warning');
  }

  function saveJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      notifyStorageUnavailable(err);
      return false;
    }
  }

  function loadConfig() {
    return loadJsonStorage(STORAGE_KEY, {});
  }
  function saveConfig(cfg) { return saveJsonStorage(STORAGE_KEY, cfg); }
  function loadProfiles() {
    return loadJsonStorage(PROFILES_KEY, {});
  }
  function saveProfiles(p) { return saveJsonStorage(PROFILES_KEY, p); }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function toFiniteNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeHexColor(value, fallback = '#ffffff') {
    const color = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
  }

  function normalizeFaceLabel(value) {
    const label = String(value || '').trim();
    return label ? label.slice(0, 28) : 'CARA';
  }

  function normalizeFaceVisualMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ['pixelate', 'box', 'hybrid'].includes(normalized) ? normalized : 'box';
  }

  function faceVisualModeFromFlags(showBox, showBlur) {
    if (showBox && showBlur) return 'hybrid';
    if (showBlur) return 'pixelate';
    return 'box';
  }

  function faceFlagsFromVisualMode(mode) {
    const normalized = normalizeFaceVisualMode(mode);
    return {
      showBox: normalized === 'box' || normalized === 'hybrid',
      showBlur: normalized === 'pixelate' || normalized === 'hybrid',
    };
  }

  function normalizeFaceVisualFlags(settings = quickDetectorSettings) {
    let showBox = settings.faceShowBox;
    let showBlur = settings.faceShowBlur;
    if (showBox == null && showBlur == null && settings.faceVisualMode != null) {
      const legacy = faceFlagsFromVisualMode(settings.faceVisualMode);
      showBox = legacy.showBox;
      showBlur = legacy.showBlur;
    }
    showBox = showBox !== false;
    showBlur = !!showBlur;
    if (!showBox && !showBlur) showBox = true;
    return { showBox, showBlur };
  }

  function getFaceVisualMode(settings = quickDetectorSettings) {
    const { showBox, showBlur } = normalizeFaceVisualFlags(settings);
    return faceVisualModeFromFlags(showBox, showBlur);
  }

  function normalizePreviewQuality(value) {
    return Object.prototype.hasOwnProperty.call(PREVIEW_QUALITY_PRESETS, value)
      ? value
      : DEFAULT_PREVIEW_QUALITY;
  }

  function normalizeCaptureTimerSeconds(value) {
    const seconds = parseInt(value, 10);
    return [0, 5, 10].includes(seconds) ? seconds : 0;
  }

  function getCurrentPreviewQualityPreset() {
    return PREVIEW_QUALITY_PRESETS[normalizePreviewQuality(imageSettings.previewQuality)];
  }

  function isFaceBoxVisualMode(settings = quickDetectorSettings) {
    return normalizeFaceVisualFlags(settings).showBox;
  }

  function isFacePixelVisualMode(settings = quickDetectorSettings) {
    return normalizeFaceVisualFlags(settings).showBlur;
  }

  function applyFaceVisualFlags(showBox, showBlur, options = {}) {
    const normalized = normalizeFaceVisualFlags({ faceShowBox: showBox, faceShowBlur: showBlur });
    quickDetectorSettings.faceShowBox = normalized.showBox;
    quickDetectorSettings.faceShowBlur = normalized.showBlur;
    if (faceDetectionEffect) {
      faceDetectionEffect.showBox = normalized.showBox;
      faceDetectionEffect.showBlur = normalized.showBlur;
    }
    if (options.updateUI !== false) updateQuickDetectorControlsUI();
    if (options.renderConfig !== false) renderEffectConfig();
    if (options.updateInfo !== false) updateEffectsInfo();
    if (options.saveQuick !== false) scheduleSaveQuickDetectorSettings();
    if (options.saveEffect !== false) scheduleSaveActiveEffectSettings();
    if (sourceMode === 'video') scheduleSyncSelectedClipConfig();
  }

  function bindFaceVisualToggle(input, peerInput, changed) {
    if (!input) return;
    input.addEventListener('change', () => {
      let showBox = changed === 'box' ? input.checked : !!peerInput?.checked;
      let showBlur = changed === 'blur' ? input.checked : !!peerInput?.checked;
      if (!showBox && !showBlur) {
        input.checked = true;
        if (changed === 'box') showBox = true;
        else showBlur = true;
      }
      applyFaceVisualFlags(showBox, showBlur);
    });
  }

  function updateMobilePresetButtons(activePreset = null) {
    mobilePresetButtons.forEach((btn) => {
      const match = activePreset && btn.dataset.mobilePreset === activePreset;
      btn.classList.toggle('is-active', !!match);
    });
  }

  function isMobileViewport() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  function isMobileFxPanelVisible() {
    return !!mobileFxPanel && !mobileFxPanel.classList.contains('hidden');
  }

  function getEffectiveFlipH() {
    return !!flipH;
  }

  function setMobileFxPanelVisible(visible) {
    if (mobileFxPanel) {
      mobileFxPanel.classList.toggle('hidden', !visible);
    }
    if (mobileFxBackdrop) {
      mobileFxBackdrop.classList.toggle('hidden', !visible);
    }
    if (btnMobileEffectsDock) {
      btnMobileEffectsDock.classList.toggle('is-active', !!visible);
      btnMobileEffectsDock.setAttribute('aria-expanded', String(!!visible));
    }
    if (isRunning && isMobileViewport()) {
      if (videoEl && videoEl.paused) {
        void videoEl.play().catch(() => {});
      }
      requestPreviewRefresh(true);
    }
  }

  function syncMobileViewportState() {
    if (!isMobileViewport()) {
      setMobileFxPanelVisible(false);
    }
  }

  function shouldSuppressMediaPipeConsoleNoise(args) {
    if (!Array.isArray(args) || args.length === 0) return false;
    const joined = args
      .filter((arg) => typeof arg === 'string')
      .join(' ');
    if (!joined) return false;
    const isMediaPipeLog = joined.includes('face_mesh_solution')
      || joined.includes('gl_context');
    if (!isMediaPipeLog) return false;
    return MEDIAPIPE_CONSOLE_NOISE_PATTERNS.some((pattern) => joined.includes(pattern));
  }

  function installMediaPipeConsoleNoiseFilter() {
    if (mediaPipeConsoleFilterInstalled) return;
    mediaPipeConsoleFilterInstalled = true;

    ['log', 'info', 'warn'].forEach((method) => {
      const original = console[method];
      if (typeof original !== 'function') return;
      console[method] = function patchedConsoleMethod(...args) {
        if (shouldSuppressMediaPipeConsoleNoise(args)) return;
        return original.apply(this, args);
      };
    });
  }

  function ensureFaceMeshLoaded() {
    installMediaPipeConsoleNoiseFilter();

    if (typeof FaceMesh !== 'undefined') {
      return Promise.resolve();
    }

    if (faceMeshScriptLoadPromise) {
      return faceMeshScriptLoadPromise;
    }

    const existing = Array.from(document.scripts).find((s) => {
      const src = s.getAttribute('src') || '';
      return src.includes('@mediapipe/face_mesh') && src.endsWith('/face_mesh.js');
    });

    faceMeshScriptLoadPromise = new Promise((resolve, reject) => {
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
      script.src = MEDIAPIPE_FACE_MESH_SRC;
      script.crossOrigin = 'anonymous';
      script.async = true;
      script.addEventListener('load', handleLoaded, { once: true });
      script.addEventListener('error', handleError, { once: true });
      document.head.appendChild(script);
    }).catch((err) => {
      faceMeshScriptLoadPromise = null;
      throw err;
    });

    return faceMeshScriptLoadPromise;
  }

  function loadQuickDetectorSettings(cfg) {
    const saved = cfg.quickDetectorSettings || {};
    quickDetectorSettings = {
      ...DEFAULT_QUICK_DETECTOR_SETTINGS,
      ...saved,
    };
    quickDetectorSettings.faceLabelText = normalizeFaceLabel(quickDetectorSettings.faceLabelText);
    const faceFlags = normalizeFaceVisualFlags(quickDetectorSettings);
    quickDetectorSettings.faceShowBox = faceFlags.showBox;
    quickDetectorSettings.faceShowBlur = faceFlags.showBlur;
    quickDetectorSettings.facePixelationCellSize = clamp(parseInt(quickDetectorSettings.facePixelationCellSize, 10) || 14, 4, 48);
    quickDetectorSettings.faceCensorPaddingPercent = clamp(parseInt(quickDetectorSettings.faceCensorPaddingPercent, 10) || 18, 0, 48);
  }

  function saveQuickDetectorSettings() {
    const cfg = loadConfig();
    cfg.quickDetectorSettings = { ...quickDetectorSettings };
    saveConfig(cfg);
  }

  function scheduleSaveQuickDetectorSettings() {
    if (saveQuickDetectorSettingsTimer) clearTimeout(saveQuickDetectorSettingsTimer);
    saveQuickDetectorSettingsTimer = setTimeout(() => {
      saveQuickDetectorSettingsTimer = null;
      saveQuickDetectorSettings();
    }, 120);
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
    const faceFlags = normalizeFaceVisualFlags(quickDetectorSettings);
    quickDetectorSettings.faceShowBox = faceFlags.showBox;
    quickDetectorSettings.faceShowBlur = faceFlags.showBlur;
    const showFaceBoxVisuals = faceFlags.showBox;

    if (inpBlobQuickColor) inpBlobQuickColor.value = quickDetectorSettings.blobBoxColor;
    if (blobQuickColorSwatch) blobQuickColorSwatch.style.background = quickDetectorSettings.blobBoxColor;
    if (inpFaceQuickColor) inpFaceQuickColor.value = quickDetectorSettings.faceBoxColor;
    if (faceQuickColorSwatch) faceQuickColorSwatch.style.background = quickDetectorSettings.faceBoxColor;
    if (chkFaceShowBox) chkFaceShowBox.checked = faceFlags.showBox;
    if (chkFaceShowBlur) chkFaceShowBlur.checked = faceFlags.showBlur;
    if (inpFaceQuickLabel && document.activeElement !== inpFaceQuickLabel) {
      inpFaceQuickLabel.value = quickDetectorSettings.faceLabelText;
    }
    if (faceQuickControls) {
      faceQuickControls.classList.toggle('hidden', !chkFaceDetection.checked);
    }
    if (faceQuickColorChip) {
      faceQuickColorChip.classList.toggle('hidden', !showFaceBoxVisuals);
    }
    if (faceQuickLabelWrap) {
      faceQuickLabelWrap.classList.toggle('hidden', !showFaceBoxVisuals);
    }
    if (inpFaceQuickLabel) {
      inpFaceQuickLabel.disabled = !showFaceBoxVisuals;
    }
    if (inpMobileBlobColor) inpMobileBlobColor.value = quickDetectorSettings.blobBoxColor;
    if (inpMobileFaceColor) inpMobileFaceColor.value = quickDetectorSettings.faceBoxColor;
    if (chkMobileFaceShowBox) chkMobileFaceShowBox.checked = faceFlags.showBox;
    if (chkMobileFaceShowBlur) chkMobileFaceShowBlur.checked = faceFlags.showBlur;
    if (inpMobileFaceLabel && document.activeElement !== inpMobileFaceLabel) {
      inpMobileFaceLabel.value = quickDetectorSettings.faceLabelText;
    }
    if (mobileFaceColorChip) {
      mobileFaceColorChip.classList.toggle('hidden', !showFaceBoxVisuals);
    }
    if (mobileFaceLabelWrap) {
      mobileFaceLabelWrap.classList.toggle('hidden', !showFaceBoxVisuals);
    }
    if (inpMobileFaceLabel) {
      inpMobileFaceLabel.disabled = !showFaceBoxVisuals;
    }
    if (btnMobileBlobToggle) {
      btnMobileBlobToggle.classList.toggle('is-active', !!chkBlobTracking.checked);
      btnMobileBlobToggle.setAttribute('aria-pressed', String(!!chkBlobTracking.checked));
    }
    if (btnMobileFaceToggle) {
      btnMobileFaceToggle.classList.toggle('is-active', !!chkFaceDetection.checked);
      btnMobileFaceToggle.setAttribute('aria-pressed', String(!!chkFaceDetection.checked));
    }
    if (btnMobileBlinkToggle) {
      btnMobileBlinkToggle.classList.toggle('is-active', !!chkBlinkDetection.checked);
      btnMobileBlinkToggle.setAttribute('aria-pressed', String(!!chkBlinkDetection.checked));
    }
    syncAdvancedQuickInputs();
    updateCaptureButtons();
    updateVideoEffectInspector();
    updateVideoEditorUI();
  }

  function applyQuickDetectorSettingsToEffects() {
    if (blobTrackingEffect) blobTrackingEffect.boxColor = quickDetectorSettings.blobBoxColor;
    if (faceDetectionEffect) {
      faceDetectionEffect.setConfig({
        boxColor: quickDetectorSettings.faceBoxColor,
        labelText: quickDetectorSettings.faceLabelText,
        showBox: quickDetectorSettings.faceShowBox,
        showBlur: quickDetectorSettings.faceShowBlur,
        pixelationCellSize: quickDetectorSettings.facePixelationCellSize,
        censorPaddingPercent: quickDetectorSettings.faceCensorPaddingPercent,
      });
    }
  }

  function syncQuickDetectorSettingsFromEffects() {
    if (blobTrackingEffect) quickDetectorSettings.blobBoxColor = blobTrackingEffect.boxColor || quickDetectorSettings.blobBoxColor;
    if (faceDetectionEffect) {
      quickDetectorSettings.faceBoxColor = faceDetectionEffect.boxColor || quickDetectorSettings.faceBoxColor;
      quickDetectorSettings.faceLabelText = normalizeFaceLabel(faceDetectionEffect.labelText);
      quickDetectorSettings.faceShowBox = faceDetectionEffect.showBox !== false;
      quickDetectorSettings.faceShowBlur = !!faceDetectionEffect.showBlur;
      quickDetectorSettings.facePixelationCellSize = clamp(parseInt(faceDetectionEffect.pixelationCellSize, 10) || quickDetectorSettings.facePixelationCellSize, 4, 48);
      quickDetectorSettings.faceCensorPaddingPercent = clamp(parseInt(faceDetectionEffect.censorPaddingPercent, 10) || quickDetectorSettings.faceCensorPaddingPercent, 0, 48);
    }
    updateQuickDetectorControlsUI();
    saveQuickDetectorSettings();
  }

  function getSavedEffectConfig(type) {
    const cfg = loadConfig();
    return cfg.effectSettings && cfg.effectSettings[type] ? cfg.effectSettings[type] : null;
  }

  function saveActiveEffectSettings() {
    const cfg = loadConfig();
    cfg.effectSettings = {
      ...(cfg.effectSettings || {}),
    };

    if (blobTrackingEffect) cfg.effectSettings.blob = blobTrackingEffect.getConfig();
    if (faceDetectionEffect) cfg.effectSettings.face = faceDetectionEffect.getConfig();
    if (blinkDetectionEffect) cfg.effectSettings.blink = blinkDetectionEffect.getConfig();

    saveConfig(cfg);
  }

  function scheduleSaveActiveEffectSettings() {
    if (saveEffectSettingsTimer) clearTimeout(saveEffectSettingsTimer);
    saveEffectSettingsTimer = setTimeout(() => {
      saveEffectSettingsTimer = null;
      saveActiveEffectSettings();
      scheduleSyncSelectedClipConfig();
    }, 140);
  }

  function syncSelectedClipConfig() {
    if (sourceMode !== 'video' || !selectedVideoEffectId) return;
    const item = videoTimeline.items.find((candidate) => candidate.id === selectedVideoEffectId);
    if (!item) return;
    try {
      videoTimeline.upsert({
        ...item,
        config: snapshotVideoEffectConfig(item.type),
      });
      void syncVideoTimelineEffects(true);
    } catch (err) {
      console.warn('No se pudo actualizar el clip seleccionado:', err.message);
    }
  }

  function scheduleSyncSelectedClipConfig() {
    if (sourceMode !== 'video' || !selectedVideoEffectId) return;
    if (syncSelectedClipConfigTimer) clearTimeout(syncSelectedClipConfigTimer);
    syncSelectedClipConfigTimer = setTimeout(() => {
      syncSelectedClipConfigTimer = null;
      syncSelectedClipConfig();
    }, 120);
  }

  function migrateResponsiveEditorDefaults(cfg) {
    if (cfg.responsiveEditorDefaultsV1 === true) return false;
    cfg.imageSettings = { ...(cfg.imageSettings || {}) };
    if (!cfg.imageSettings.previewQuality || cfg.imageSettings.previewQuality === 'high') {
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
    imageSettings.previewQuality = normalizePreviewQuality(imageSettings.previewQuality);
    imageSettings.captureTimerSeconds = normalizeCaptureTimerSeconds(imageSettings.captureTimerSeconds);
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

  function scheduleSaveImageSettings() {
    if (saveImageSettingsTimer) clearTimeout(saveImageSettingsTimer);
    saveImageSettingsTimer = setTimeout(() => {
      saveImageSettingsTimer = null;
      saveImageSettings();
      scheduleSyncSelectedClipConfig();
    }, 100);
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
    if (previewQualitySelect) previewQualitySelect.value = normalizePreviewQuality(imageSettings.previewQuality);
    if (captureTimerSelect) captureTimerSelect.value = String(imageSettings.captureTimerSeconds);
    if (selMobileCaptureTimer) selMobileCaptureTimer.value = String(imageSettings.captureTimerSeconds);
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
        mobileActivePreset = null;
        updateMobilePresetButtons(mobileActivePreset);
        scheduleSaveImageSettings();
      });
    };

    if (chkBlackWhite) {
      chkBlackWhite.addEventListener('change', (e) => {
        imageSettings.blackAndWhite = e.target.checked;
        updateBWDependentControls();
        mobileActivePreset = null;
        updateMobilePresetButtons(mobileActivePreset);
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

    if (previewQualitySelect) {
      previewQualitySelect.addEventListener('change', (e) => {
        imageSettings.previewQuality = normalizePreviewQuality(e.target.value);
        e.target.value = imageSettings.previewQuality;
        requestPreviewRefresh(true);
        saveImageSettings();
      });
    }

    const bindCaptureTimerSelect = (selectEl) => {
      if (!selectEl) return;
      selectEl.addEventListener('change', (e) => {
        imageSettings.captureTimerSeconds = normalizeCaptureTimerSeconds(e.target.value);
        updateImageControlsUI();
        saveImageSettings();
      });
    };
    bindCaptureTimerSelect(captureTimerSelect);
    bindCaptureTimerSelect(selMobileCaptureTimer);

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
          previewQuality: imageSettings.previewQuality,
          qualityEnhancer: imageSettings.qualityEnhancer,
          qualityEnhancerStrength: imageSettings.qualityEnhancerStrength,
        };
        mobileActivePreset = null;
        updateMobilePresetButtons(mobileActivePreset);
        updateImageControlsUI();
        saveImageSettings();
      });
    }

    presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => applyImagePreset(btn.dataset.preset));
    });
    mobilePresetButtons.forEach((btn) => {
      btn.addEventListener('click', () => applyImagePreset(btn.dataset.mobilePreset));
    });
  }

  function bindQuickDetectorEvents() {
    if (inpBlobQuickColor) {
      inpBlobQuickColor.addEventListener('input', (e) => {
        quickDetectorSettings.blobBoxColor = e.target.value;
        if (blobTrackingEffect) blobTrackingEffect.boxColor = e.target.value;
        updateQuickDetectorControlsUI();
        scheduleSaveQuickDetectorSettings();
        scheduleSaveActiveEffectSettings();
      });
    }

    bindFaceVisualToggle(chkFaceShowBox, chkFaceShowBlur, 'box');
    bindFaceVisualToggle(chkFaceShowBlur, chkFaceShowBox, 'blur');

    if (inpFaceQuickColor) {
      inpFaceQuickColor.addEventListener('input', (e) => {
        quickDetectorSettings.faceBoxColor = e.target.value;
        if (faceDetectionEffect) faceDetectionEffect.boxColor = e.target.value;
        updateQuickDetectorControlsUI();
        scheduleSaveQuickDetectorSettings();
        scheduleSaveActiveEffectSettings();
      });
    }

    if (inpFaceQuickLabel) {
      inpFaceQuickLabel.addEventListener('input', (e) => {
        const value = String(e.target.value || '').slice(0, 28);
        quickDetectorSettings.faceLabelText = value || 'CARA';
        if (faceDetectionEffect) faceDetectionEffect.labelText = value;
        scheduleSaveQuickDetectorSettings();
        scheduleSaveActiveEffectSettings();
        syncAdvancedQuickInputs();
      });

      inpFaceQuickLabel.addEventListener('blur', (e) => {
        const normalized = normalizeFaceLabel(e.target.value);
        quickDetectorSettings.faceLabelText = normalized;
        e.target.value = normalized;
        if (faceDetectionEffect) faceDetectionEffect.labelText = normalized;
        saveQuickDetectorSettings();
        saveActiveEffectSettings();
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
    mobileActivePreset = name;
    updateMobilePresetButtons(mobileActivePreset);
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

  function renderCameraSelectOptions(devices, preferredId = null) {
    if (!cameraSelect) return;

    const targetSelection = preferredId || cameraSelect.value || preferredDeviceId || '';
    cameraSelect.innerHTML = '';

    if (!devices || devices.length === 0) {
      cameraSelect.innerHTML = '<option value="">No se encontraron cámaras</option>';
      cameraSelect.disabled = true;
      return;
    }

    devices.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Cámara ${i + 1}`;
      cameraSelect.appendChild(opt);
    });

    if (targetSelection) cameraSelect.value = targetSelection;
    if (!cameraSelect.value && devices[0]) cameraSelect.value = devices[0].deviceId;
    preferredDeviceId = cameraSelect.value || targetSelection || preferredDeviceId;
    cameraSelect.disabled = false;
  }

  async function refreshCameraDevices(preferredId = null) {
    const devices = await cameraManager.enumerateDevices();
    renderCameraSelectOptions(devices, preferredId);
  }

  // ─── Local video editor ───
  function setSourceMode(mode) {
    if (mode === sourceMode) return;
    if (isVideoExporting) return;

    if (mode === 'video') {
      webcamSessionState = {
        imageSettings: { ...imageSettings },
        blob: chkBlobTracking.checked,
        face: chkFaceDetection.checked,
        blink: chkBlinkDetection.checked,
        blobConfig: blobTrackingEffect?.getConfig() || null,
        faceConfig: faceDetectionEffect?.getConfig() || null,
        blinkConfig: blinkDetectionEffect?.getConfig() || null,
      };
      if (isRunning) {
        cameraManager.stop();
        isRunning = false;
        cancelRenderLoop();
      }
      sourceMode = 'video';
      document.body.classList.add('video-mode');
      document.querySelectorAll('.webcam-only').forEach((el) => el.classList.add('hidden'));
      document.querySelectorAll('.video-only').forEach((el) => el.classList.remove('hidden'));
      mountVideoEffectsControls();
      setEditorTool('select');
      setInspectorTab('project');
      applyTimelineZoom();
      btnWebcamMode.classList.remove('is-active');
      btnVideoMode.classList.add('is-active');
      btnWebcamMode.setAttribute('aria-selected', 'false');
      btnVideoMode.setAttribute('aria-selected', 'true');
      setCameraPlaceholderMessage('Elegí un video para editar.');
      placeholder.classList.remove('hidden');
      updateVideoEditorUI();
      return;
    }

    disposeVideoSource();
    sourceMode = 'camera';
    document.body.classList.remove('video-mode');
    delete document.body.dataset.editorTool;
    unmountVideoEffectsControls();
    document.querySelectorAll('.video-only').forEach((el) => el.classList.add('hidden'));
    document.querySelectorAll('.webcam-only').forEach((el) => el.classList.remove('hidden'));
    btnVideoMode.classList.remove('is-active');
    btnWebcamMode.classList.add('is-active');
    btnVideoMode.setAttribute('aria-selected', 'false');
    btnWebcamMode.setAttribute('aria-selected', 'true');
    setCameraPlaceholderMessage('Iniciando cámara automáticamente...');
    void restoreWebcamSessionState();
    void toggleCamera(true);
  }

  async function restoreWebcamSessionState() {
    if (!webcamSessionState) return;
    imageSettings = { ...webcamSessionState.imageSettings };
    updateImageControlsUI();
    for (const [type, checkbox] of [['blob', chkBlobTracking], ['face', chkFaceDetection], ['blink', chkBlinkDetection]]) {
      if (checkbox.checked) {
        checkbox.checked = false;
        await toggleEffect(type);
      }
      if (webcamSessionState[type]) {
        checkbox.checked = true;
        await toggleEffect(type);
        const effect = type === 'blob' ? blobTrackingEffect : type === 'face' ? faceDetectionEffect : blinkDetectionEffect;
        const config = webcamSessionState[`${type}Config`];
        if (effect && config) effect.setConfig(config);
      }
    }
    webcamSessionState = null;
    updateQuickDetectorControlsUI();
    updateEffectsInfo();
  }

  function disposeVideoSource() {
    if (isVideoExporting) cancelVideoExport();
    videoEl.pause();
    cancelRenderLoop();
    isRunning = false;
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    videoObjectUrl = '';
    videoSourceFile = null;
    videoSourceFps = 30;
    videoSourceAverageBitrate = 0;
    videoEl.removeAttribute('src');
    videoEl.load();
    videoTimeline = new VideoTimeline();
    editorHistory?.clear();
    updateEditorHistoryButtons();
    timelineZoom = 1;
    selectedVideoEffectId = '';
    appliedTimelineItemIds = {};
    videoBaseImageSettings = null;
    timelineItems.innerHTML = '';
    if (sourceMode === 'video') {
      setCameraPlaceholderMessage('Elegí un video para editar.');
    }
    placeholder.classList.remove('hidden');
  }

  async function loadVideoFile(file) {
    if (!file || !(file instanceof File)) return;
    if (!file.type.startsWith('video/')) {
      showStatus(videoEditorStatus, 'Elegí un archivo de video válido.', 'error');
      return;
    }

    disposeVideoSource();
    videoSourceFile = file;
    videoObjectUrl = URL.createObjectURL(file);
    videoEl.srcObject = null;
    videoEl.src = videoObjectUrl;
    videoEl.muted = true;
    videoEl.preload = 'auto';
    setCameraPlaceholderMessage('Leyendo metadata del video...');

    try {
      await new Promise((resolve, reject) => {
        const loaded = () => {
          videoEl.removeEventListener('error', failed);
          resolve();
        };
        const failed = () => {
          videoEl.removeEventListener('loadedmetadata', loaded);
          reject(new Error('video_decode_failed'));
        };
        videoEl.addEventListener('loadedmetadata', loaded, { once: true });
        videoEl.addEventListener('error', failed, { once: true });
        videoEl.load();
      });
      if (!Number.isFinite(videoEl.duration) || videoEl.duration <= 0 || !videoEl.videoWidth || !videoEl.videoHeight) {
        throw new Error('video_metadata_invalid');
      }
      videoEl.currentTime = Math.min(0.001, videoEl.duration);

      const { calculateFrameRateFromMediaTimes, calculateSourceAverageBitrate } = await import('./video-export.mjs');
      videoSourceFps = await detectVideoSourceFps(videoEl, calculateFrameRateFromMediaTimes);
      videoSourceAverageBitrate = calculateSourceAverageBitrate(file.size, videoEl.duration);
      videoTimeline.setDuration(videoEl.duration);
      videoBaseImageSettings = { ...imageSettings };
      isRunning = true;
      placeholder.classList.add('hidden');
      videoSeek.max = String(videoEl.duration);
      videoTrimStart.max = String(videoEl.duration);
      videoTrimEnd.max = String(videoEl.duration);
      videoEffectStart.max = String(videoEl.duration);
      videoEffectEnd.max = String(videoEl.duration);
      videoTrimStart.value = '0';
      videoTrimEnd.value = videoEl.duration.toFixed(2);
      videoEffectStart.value = '0';
      videoEffectEnd.value = videoEl.duration.toFixed(2);
      videoFileMeta.textContent = `${file.name} · ${formatBytes(file.size)} · ${videoEl.videoWidth}×${videoEl.videoHeight} · ${formatDurationDetailed(videoEl.duration)} · ${formatVideoFps(videoSourceFps)} FPS · ${formatVideoBitrate(videoSourceAverageBitrate)} estimado`;
      frameCount = 0;
      lastFpsTime = performance.now();
      syncPreviewCanvasMetrics(videoEl.videoWidth, videoEl.videoHeight, true);
      scheduleRenderLoop();
      renderVideoTimeline();
      updateVideoEditorUI();
      applyTimelineZoom();
      showStatus(videoEditorStatus, 'Video listo.', 'success');
      setTimeout(() => hideStatus(videoEditorStatus), 1800);
    } catch (err) {
      console.error('Error loading video:', err);
      disposeVideoSource();
      setCameraPlaceholderMessage('No se pudo abrir este video.');
      const message = err?.message === 'video_metadata_invalid'
        ? 'El video no contiene resolución o duración válidas.'
        : 'El navegador no puede decodificar este archivo.';
      showStatus(videoEditorStatus, message, 'error');
      updateVideoEditorUI();
    }
  }

  function applyVideoTrim(resetSelection = true) {
    if (!videoSourceFile) return;
    try {
      videoTimeline.setTrim(videoTrimStart.value, videoTrimEnd.value);
      videoEl.currentTime = clamp(videoEl.currentTime, videoTimeline.trimStart, videoTimeline.trimEnd);
      if (resetSelection) {
        videoEffectStart.value = videoTimeline.trimStart.toFixed(2);
        videoEffectEnd.value = videoTimeline.trimEnd.toFixed(2);
      }
      renderVideoTimeline();
      updateVideoEditorUI();
    } catch (err) {
      videoTrimStart.value = videoTimeline.trimStart.toFixed(2);
      videoTrimEnd.value = videoTimeline.trimEnd.toFixed(2);
      showStatus(videoEditorStatus, err.message, 'error');
    }
  }

  function getSelectedVideoEffectItem() {
    return videoTimeline.items.find((candidate) => candidate.id === selectedVideoEffectId) || null;
  }

  function updateAdjustmentsPanelState() {
    const item = getSelectedVideoEffectItem();
    const hasSelection = !!item;
    if (inspectorAdjustmentsEmpty) inspectorAdjustmentsEmpty.classList.toggle('hidden', hasSelection);
    if (inspectorAdjustmentsHost) inspectorAdjustmentsHost.classList.toggle('hidden', !hasSelection);
    if (adjustContextNav) adjustContextNav.classList.toggle('hidden', !hasSelection);
    if (hasSelection) updateAdjustmentsContext();
  }

  function snapshotVideoEffectConfig(type) {
    if (type === 'look') {
      const {
        previewQuality,
        jpegQuality,
        videoFormat,
        captureTimerSeconds,
        qualityEnhancer,
        qualityEnhancerStrength,
        ...lookSettings
      } = imageSettings;
      return lookSettings;
    }
    if (type === 'blob') return blobTrackingEffect ? blobTrackingEffect.getConfig() : {
      boxColor: quickDetectorSettings.blobBoxColor,
    };
    if (type === 'face') return faceDetectionEffect ? faceDetectionEffect.getConfig() : {
      boxColor: quickDetectorSettings.faceBoxColor,
      labelText: quickDetectorSettings.faceLabelText,
      showBox: quickDetectorSettings.faceShowBox,
      showBlur: quickDetectorSettings.faceShowBlur,
      visualMode: getFaceVisualMode(),
      pixelationCellSize: quickDetectorSettings.facePixelationCellSize,
      censorPaddingPercent: quickDetectorSettings.faceCensorPaddingPercent,
    };
    return blinkDetectionEffect ? blinkDetectionEffect.getConfig() : {};
  }

  function applyVideoEffectItemConfig(item) {
    if (!item?.config) return;
    if (item.type === 'look') {
      const {
        previewQuality,
        jpegQuality,
        videoFormat,
        captureTimerSeconds,
        qualityEnhancer,
        qualityEnhancerStrength,
        ...lookSettings
      } = item.config;
      imageSettings = { ...imageSettings, ...lookSettings };
      updateImageControlsUI();
      saveImageSettings();
      return;
    }
    if (item.type === 'blob' && blobTrackingEffect) {
      blobTrackingEffect.setConfig(item.config);
    } else if (item.type === 'face' && faceDetectionEffect) {
      faceDetectionEffect.setConfig(item.config);
    } else if (item.type === 'blink' && blinkDetectionEffect) {
      blinkDetectionEffect.setConfig(item.config);
    }
    syncQuickDetectorSettingsFromEffects();
    renderEffectConfig();
  }

  function commitSelectedEffectTiming(options = {}) {
    if (!selectedVideoEffectId) return;
    const item = videoTimeline.items.find((candidate) => candidate.id === selectedVideoEffectId);
    if (!item) return;
    const minSpan = 0.05;
    const startTime = clamp(Number(videoEffectStart.value) || 0, videoTimeline.trimStart, videoTimeline.trimEnd - minSpan);
    const endTime = clamp(Number(videoEffectEnd.value) || 0, startTime + minSpan, videoTimeline.trimEnd);
    videoEffectStart.value = startTime.toFixed(2);
    videoEffectEnd.value = endTime.toFixed(2);
    try {
      if (options.pushHistory) pushTimelineHistory();
      videoTimeline.upsert({ ...item, startTime, endTime });
      renderVideoTimeline();
      void syncVideoTimelineEffects(true);
    } catch (err) {
      showStatus(videoEditorStatus, err.message, 'error');
      selectVideoEffect(item.id);
    }
  }

  async function addTimelineEffectClip(type, anchorTime, duration = DEFAULT_TIMELINE_EFFECT_DURATION) {
    if (!videoSourceFile || !TIMELINE_EFFECT_META[type]) return null;
    const span = Math.max(0.05, Math.min(duration, videoTimeline.trimEnd - videoTimeline.trimStart));
    let startTime = snapTimelineTime(anchorTime - span / 2);
    startTime = clamp(startTime, videoTimeline.trimStart, videoTimeline.trimEnd - span);
    let endTime = clamp(startTime + span, startTime + 0.05, videoTimeline.trimEnd);
    if (endTime <= startTime) {
      showStatus(videoEditorStatus, 'No hay espacio libre en esa pista.', 'error');
      return null;
    }
    try {
      pushTimelineHistory();
      const saved = videoTimeline.upsert({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        type,
        startTime,
        endTime,
        config: snapshotVideoEffectConfig(type),
      });
      if (type === 'face' || type === 'blink') {
        try { await ensureFaceMeshLoaded(); } catch (err) { console.warn('Detector preload failed:', err); }
      }
      selectVideoEffect(saved.id);
      void syncVideoTimelineEffects(true);
      showStatus(videoEditorStatus, `${TIMELINE_EFFECT_META[type].label} agregado.`, 'success');
      setTimeout(() => hideStatus(videoEditorStatus), 1200);
      setInspectorTab('adjust');
      return saved;
    } catch (err) {
      showStatus(videoEditorStatus, err.message, 'error');
      return null;
    }
  }

  function getTimelineRowFromClientY(clientY) {
    if (!timelineTrackArea) return null;
    const bounds = timelineTrackArea.getBoundingClientRect();
    if (clientY < bounds.top || clientY > bounds.bottom) return null;
    const ratio = clamp((clientY - bounds.top) / bounds.height, 0, 0.999);
    const row = Math.floor(ratio * 5);
    if (row <= 0) return null;
    return Object.keys(TIMELINE_EFFECT_META).find((type) => TIMELINE_EFFECT_META[type].row === row) || null;
  }

  function clearTimelineDropTargets() {
    videoTimelineEl?.querySelectorAll('.timeline-track-effects.is-drop-target').forEach((track) => {
      track.classList.remove('is-drop-target');
    });
  }

  function setTimelineDropTarget(type) {
    clearTimelineDropTargets();
    if (!type || !videoTimelineEl) return;
    const track = videoTimelineEl.querySelector(`.timeline-track-effects[data-track="${type}"]`);
    track?.classList.add('is-drop-target');
  }

  function updateTimelineDragGhost(clientX, clientY, label) {
    if (!timelineDragGhost) {
      timelineDragGhost = document.createElement('div');
      timelineDragGhost.className = 'timeline-drag-ghost';
      document.body.appendChild(timelineDragGhost);
    }
    timelineDragGhost.textContent = label;
    timelineDragGhost.style.left = `${clientX}px`;
    timelineDragGhost.style.top = `${clientY}px`;
  }

  function removeTimelineDragGhost() {
    timelineDragGhost?.remove();
    timelineDragGhost = null;
  }

  function finishPaletteDrag(event) {
    if (!paletteDragState) return;
    const chip = paletteDragState.chip;
    chip?.classList.remove('is-dragging');
    if (chip?.hasPointerCapture?.(event.pointerId)) chip.releasePointerCapture(event.pointerId);
    const type = paletteDragState.type;
    const moved = paletteDragState.moved;
    paletteDragState = null;
    removeTimelineDragGhost();
    clearTimelineDropTargets();
    updateEffectTrackHighlight();
    if (!moved || !videoSourceFile) return;
    const rowType = getTimelineRowFromClientY(event.clientY);
    if (rowType !== type) {
      showStatus(videoEditorStatus, `Soltá ${TIMELINE_EFFECT_META[type].label} en la pista ${TIMELINE_EFFECT_META[type].trackLabel}.`, 'warning');
      setTimeout(() => hideStatus(videoEditorStatus), 1800);
      return;
    }
    void addTimelineEffectClip(type, getTimelineTime(event.clientX));
  }

  function bindTimelinePaletteDrag() {
    if (!timelineEffectPalette) return;
    timelineEffectPalette.querySelectorAll('.timeline-palette-chip').forEach((chip) => {
      chip.addEventListener('pointerdown', (event) => {
        if (!videoSourceFile || isVideoExporting || event.button !== 0 || chip.disabled) return;
        event.preventDefault();
        const type = chip.dataset.effectType;
        if (!TIMELINE_EFFECT_META[type]) return;
        paletteDragState = { type, chip, moved: false };
        chip.classList.add('is-dragging');
        chip.setPointerCapture(event.pointerId);
        updateTimelineDragGhost(event.clientX, event.clientY, TIMELINE_EFFECT_META[type].label);
        setTimelineDropTarget(type);
      });
      chip.addEventListener('pointermove', (event) => {
        if (!paletteDragState || paletteDragState.chip !== chip) return;
        paletteDragState.moved = true;
        updateTimelineDragGhost(event.clientX, event.clientY, TIMELINE_EFFECT_META[paletteDragState.type].label);
        const rowType = getTimelineRowFromClientY(event.clientY);
        setTimelineDropTarget(rowType === paletteDragState.type ? rowType : null);
      });
      chip.addEventListener('pointerup', finishPaletteDrag);
      chip.addEventListener('pointercancel', finishPaletteDrag);
      chip.addEventListener('dragstart', (event) => event.preventDefault());
    });

    videoTimelineEl?.querySelectorAll('.timeline-track-effects').forEach((track) => {
      track.addEventListener('dblclick', (event) => {
        if (!videoSourceFile || event.target.closest('.timeline-item')) return;
        event.preventDefault();
        void addTimelineEffectClip(track.dataset.track, videoEl.currentTime || videoTimeline.trimStart);
      });
    });
  }

  function selectVideoEffect(id) {
    selectedVideoEffectId = id || '';
    const item = videoTimeline.items.find((candidate) => candidate.id === selectedVideoEffectId);
    if (item) {
      videoEffectType.value = item.type;
      videoEffectStart.value = item.startTime.toFixed(2);
      videoEffectEnd.value = item.endTime.toFixed(2);
      applyVideoEffectItemConfig(item);
    }
    renderVideoTimeline();
    updateVideoEffectInspector();
    updateAdjustmentsPanelState();
    updateEffectTrackHighlight();
    updateTimelineHint();
    if (item) setInspectorTab('effect');
  }

  function deleteSelectedVideoEffect() {
    if (!selectedVideoEffectId) return;
    pushTimelineHistory();
    videoTimeline.remove(selectedVideoEffectId);
    selectedVideoEffectId = '';
    renderVideoTimeline();
    updateVideoEffectInspector();
    updateAdjustmentsPanelState();
    void syncVideoTimelineEffects(true);
  }

  function updateVideoEffectInspector() {
    const item = videoTimeline.items.find((candidate) => candidate.id === selectedVideoEffectId);
    const editing = !!item;
    if (videoEffectEmptyHint) videoEffectEmptyHint.classList.toggle('hidden', editing);
    if (videoEffectClipMeta) videoEffectClipMeta.classList.toggle('hidden', !editing);
    if (item && videoEffectTypeLabel) {
      videoEffectTypeLabel.textContent = `${TIMELINE_EFFECT_META[item.type]?.trackLabel || item.type} · ${TIMELINE_EFFECT_META[item.type]?.label || item.type}`;
    }
    if (item && videoEffectDurationLabel) {
      const duration = Math.max(0, item.endTime - item.startTime);
      videoEffectDurationLabel.textContent = `Duración: ${duration.toFixed(2)} s`;
    }
    if (btnDeleteVideoEffect) btnDeleteVideoEffect.disabled = !editing;
    if (btnOpenEffectAdjust) btnOpenEffectAdjust.disabled = !editing;
  }

  function mountVideoEffectsControls() {
    if (!effectsControlsSlot || !inspectorAdjustmentsHost) return;
    if (effectsControlsSlot.parentElement !== inspectorAdjustmentsHost) {
      inspectorAdjustmentsHost.appendChild(effectsControlsSlot);
    }
    effectsControlsSlot.classList.add('is-contextual');
    setAdvancedOptionsVisible(true);
    updateAdjustmentsPanelState();
  }

  function unmountVideoEffectsControls() {
    if (!effectsControlsSlot || !controlPanel) return;
    effectsControlsSlot.classList.remove('is-contextual');
    delete effectsControlsSlot.dataset.adjustContext;
    adjustContextNav?.classList.add('hidden');
    effectsControlsSlot.querySelectorAll('.adjust-context-group').forEach((group) => {
      group.classList.remove('is-active');
    });
    videoTimelineEl?.querySelectorAll('.timeline-track-label[data-adjust-context]').forEach((label) => {
      label.classList.remove('is-active');
    });
    const cfg = loadConfig();
    setAdvancedOptionsVisible(!!cfg.showAdvancedOptions);
    const captureSection = controlPanel.querySelector('.panel-section.webcam-only:nth-of-type(2)');
    if (captureSection && effectsControlsSlot.parentElement !== controlPanel) {
      captureSection.insertAdjacentElement('afterend', effectsControlsSlot);
    }
  }

  function resolveAdjustmentsContext() {
    const selected = getSelectedVideoEffectItem();
    if (selected) return selected.type;
    return 'look';
  }

  function setAdjustmentsContext(context, options = {}) {
    if (!getSelectedVideoEffectItem()) return;
    if (context === 'video') context = 'look';
    if (!context || !ADJUST_CONTEXT_HELP[context]) return;
    adjustmentsContext = context;
    if (effectsControlsSlot) {
      effectsControlsSlot.dataset.adjustContext = context;
    }
    adjustContextNav?.querySelectorAll('.adjust-context-tab').forEach((tab) => {
      const active = tab.dataset.adjustContext === context;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    effectsControlsSlot?.querySelectorAll('.adjust-context-group').forEach((group) => {
      group.classList.toggle('is-active', group.dataset.adjustContext === context);
    });
    videoTimelineEl?.querySelectorAll('.timeline-track-label[data-adjust-context]').forEach((label) => {
      label.classList.toggle('is-active', label.dataset.adjustContext === context);
    });
    if (adjustContextHelp) {
      adjustContextHelp.textContent = ADJUST_CONTEXT_HELP[context];
    }
    if (options.syncEffectType && videoEffectType) {
      videoEffectType.value = options.effectType || context;
      updateEffectTrackHighlight();
      updateTimelineHint();
    }
    if (options.syncTool) {
      if (options.tool === 'trim') {
        setEditorTool('trim', { skipTab: true });
      } else if (options.tool === 'effect') {
        setEditorTool('select', { skipTab: true });
        if (videoEffectType) {
          videoEffectType.value = options.effectType || (context === 'look' ? 'look' : context);
        }
        updateEffectTrackHighlight();
        updateTimelineHint();
      }
    }
  }

  function updateAdjustmentsContext(options = {}) {
    if (sourceMode !== 'video') return;
    if (!getSelectedVideoEffectItem()) {
      updateAdjustmentsPanelState();
      return;
    }
    setAdjustmentsContext(resolveAdjustmentsContext(), options);
  }

  function openAdjustmentsForContext(context, options = {}) {
    if (sourceMode !== 'video') return;
    setAdjustmentsContext(context, options);
    setInspectorTab('adjust');
  }

  function updateEffectTrackHighlight(activeType = null) {
    if (!videoTimelineEl) return;
    const selected = videoTimeline.items.find((item) => item.id === selectedVideoEffectId);
    const type = activeType || paletteDragState?.type || selected?.type || null;
    videoTimelineEl.querySelectorAll('.timeline-track-effects').forEach((track) => {
      track.classList.toggle('is-target-track', !!type && track.dataset.track === type);
    });
  }

  function setInspectorTab(tabName) {
    inspectorTabs.forEach((tab) => {
      const active = tab.dataset.tab === tabName;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    inspectorPanels.forEach((panel) => {
      const active = panel.id === `inspectorPanel${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}`;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    if (tabName === 'adjust' && sourceMode === 'video') {
      updateAdjustmentsPanelState();
    }
  }

  function setEditorTool(tool, options = {}) {
    editorTool = tool;
    document.body.dataset.editorTool = tool;
    if (videoTimelineEl) videoTimelineEl.dataset.editorTool = tool;
    [btnToolSelect, btnToolTrim].forEach((button) => {
      if (!button) return;
      button.classList.toggle('is-active', button.dataset.tool === tool);
    });
    updateTimelineHint();
    updateEffectTrackHighlight();
    if (sourceMode === 'video' && document.querySelector('.video-inspector-tab[data-tab="adjust"]')?.classList.contains('is-active')) {
      updateAdjustmentsPanelState();
    }
  }

  function updateTimelineHint() {
    if (!timelineHintText) return;
    if (!videoSourceFile) {
      timelineHintText.textContent = '';
      return;
    }
    const hints = {
      select: 'Arrastrá efectos a la timeline o mové los clips con el mouse.',
      trim: 'Arrastrá los bordes rojos en VIDEO.',
    };
    timelineHintText.textContent = hints[editorTool] || hints.select;
  }

  function pushTimelineHistory() {
    if (!editorHistory || timelineHistorySuspended || !videoSourceFile) return;
    editorHistory.push(videoTimeline);
    updateEditorHistoryButtons();
  }

  function undoTimelineEdit() {
    if (!editorHistory?.undo(videoTimeline)) return;
    selectedVideoEffectId = '';
    applyVideoTrim(false);
    renderVideoTimeline();
    updateVideoEffectInspector();
    void syncVideoTimelineEffects(true);
  }

  function redoTimelineEdit() {
    if (!editorHistory?.redo(videoTimeline)) return;
    selectedVideoEffectId = '';
    applyVideoTrim(false);
    renderVideoTimeline();
    updateVideoEffectInspector();
    void syncVideoTimelineEffects(true);
  }

  function updateEditorHistoryButtons() {
    if (btnEditorUndo) btnEditorUndo.disabled = !editorHistory?.canUndo || isVideoExporting;
    if (btnEditorRedo) btnEditorRedo.disabled = !editorHistory?.canRedo || isVideoExporting;
  }

  function applyTimelineZoom() {
    if (!timelineScroll || !timelineTrackArea) return;
    const baseWidth = timelineViewport ? timelineViewport.clientWidth - 72 : 800;
    const width = Math.max(baseWidth, baseWidth * timelineZoom);
    timelineScroll.style.width = `${width + 72}px`;
    if (timelineZoomInput) timelineZoomInput.value = String(timelineZoom);
    renderVideoTimeline();
    renderTimelineRuler();
  }

  function getTimelineTrackAreaBounds() {
    if (!timelineTrackArea) return { left: 0, width: 1 };
    const rect = timelineTrackArea.getBoundingClientRect();
    return { left: rect.left, width: Math.max(1, rect.width) };
  }

  function snapTimelineTime(time) {
    if (!chkTimelineSnap?.checked) return time;
    const points = new Set([
      videoTimeline.trimStart,
      videoTimeline.trimEnd,
      videoEl.currentTime || 0,
    ]);
    videoTimeline.items.forEach((item) => {
      points.add(item.startTime);
      points.add(item.endTime);
    });
    let closest = time;
    let minDelta = 0.12 / Math.max(1, timelineZoom);
    points.forEach((point) => {
      const delta = Math.abs(point - time);
      if (delta < minDelta) {
        minDelta = delta;
        closest = point;
      }
    });
    return closest;
  }

  function renderTimelineRuler() {
    if (!timelineTimeRuler || !timelineTrackArea) return;
    const duration = Math.max(0.001, videoTimeline.duration);
    const width = timelineTrackArea.offsetWidth;
    timelineTimeRuler.style.width = `${width}px`;
    timelineTimeRuler.innerHTML = '';
    const interval = duration <= 20 ? 1 : duration <= 60 ? 5 : duration <= 180 ? 10 : 30;
    for (let t = 0; t <= duration + 0.001; t += interval) {
      const tick = document.createElement('div');
      tick.className = 'timeline-time-tick';
      tick.style.left = `${(t / duration) * 100}%`;
      timelineTimeRuler.appendChild(tick);
      const label = document.createElement('div');
      label.className = 'timeline-time-label';
      label.style.left = `${(t / duration) * 100}%`;
      label.textContent = formatDurationDetailed(t);
      timelineTimeRuler.appendChild(label);
    }
  }

  function positionTimelineElement(el, startTime, endTime = null) {
    const duration = Math.max(0.001, videoTimeline.duration);
    const left = (startTime / duration) * 100;
    el.style.left = `${clamp(left, 0, 100)}%`;
    if (endTime != null) {
      el.style.width = `${clamp(((endTime - startTime) / duration) * 100, 0, 100)}%`;
    }
  }

  function positionTimelineRowElement(el, startTime, endTime, rowIndex) {
    positionTimelineElement(el, startTime, endTime);
    el.style.top = `calc(${rowIndex} * 20% + 3px)`;
    el.style.height = 'calc(20% - 6px)';
  }

  function renderVideoTimeline() {
    if (!timelineItems || !videoTimelineEl || !timelineTrackArea) return;
    const duration = Math.max(0.001, videoTimeline.duration);
    const percent = (time) => `${clamp((time / duration) * 100, 0, 100)}%`;

    if (timelineVideoClip) {
      timelineVideoClip.style.left = '0';
      timelineVideoClip.style.width = '100%';
    }
    timelineTrim.style.left = percent(videoTimeline.trimStart);
    timelineTrim.style.width = percent(videoTimeline.trimEnd - videoTimeline.trimStart);
    timelineTrimStartHandle.style.left = percent(videoTimeline.trimStart);
    timelineTrimEndHandle.style.left = percent(videoTimeline.trimEnd);
    if (timelineTrimOutsideStart) {
      timelineTrimOutsideStart.style.width = percent(videoTimeline.trimStart);
    }
    if (timelineTrimOutsideEnd) {
      timelineTrimOutsideEnd.style.left = percent(videoTimeline.trimEnd);
      timelineTrimOutsideEnd.style.width = percent(duration - videoTimeline.trimEnd);
    }

    const selectionStart = selectedVideoEffectId
      ? clamp(Number(videoEffectStart.value) || 0, videoTimeline.trimStart, videoTimeline.trimEnd)
      : (videoEl.currentTime || 0);
    const selectionEnd = selectedVideoEffectId
      ? clamp(Number(videoEffectEnd.value) || 0, selectionStart, videoTimeline.trimEnd)
      : selectionStart;
    if (selectedVideoEffectId) {
      videoEffectStart.value = selectionStart.toFixed(2);
      videoEffectEnd.value = selectionEnd.toFixed(2);
    }
    if (videoEffectRangeLabel) {
      if (selectedVideoEffectId) {
        videoEffectRangeLabel.textContent = `${formatDurationDetailed(selectionStart)} — ${formatDurationDetailed(selectionEnd)}`;
      } else {
        videoEffectRangeLabel.textContent = `Cursor: ${formatDurationDetailed(videoEl.currentTime || 0)}`;
      }
    }
    timelinePlayhead.style.left = percent(videoEl.currentTime || 0);

    timelineItems.innerHTML = '';
    videoTimeline.items.forEach((item) => {
      const meta = TIMELINE_EFFECT_META[item.type] || { trackLabel: item.type, row: 1 };
      const el = document.createElement('div');
      el.className = `timeline-item${item.id === selectedVideoEffectId ? ' is-selected' : ''}`;
      el.dataset.id = item.id;
      el.dataset.type = item.type;
      el.innerHTML = `
        <span class="timeline-item-handle start" aria-hidden="true"></span>
        <span class="timeline-item-label">${meta.trackLabel}</span>
        <span class="timeline-item-handle end" aria-hidden="true"></span>
      `;
      positionTimelineRowElement(el, item.startTime, item.endTime, meta.row);
      el.addEventListener('pointerdown', (event) => beginTimelineDrag(event, item, el));
      timelineItems.appendChild(el);
    });
    renderTimelineRuler();
    updateEffectTrackHighlight();
  }

  function getTimelineTime(clientX) {
    const bounds = getTimelineTrackAreaBounds();
    const ratio = clamp((clientX - bounds.left) / bounds.width, 0, 1);
    return snapTimelineTime(ratio * videoTimeline.duration);
  }

  function getTimelineTime(clientX) {
    const bounds = getTimelineTrackAreaBounds();
    const ratio = clamp((clientX - bounds.left) / bounds.width, 0, 1);
    return snapTimelineTime(ratio * videoTimeline.duration);
  }

  function beginTimelineSelection(event) {
    if (!videoSourceFile || isVideoExporting || event.button !== 0) return;
    if (event.target.closest('.timeline-item, .timeline-item-handle, .timeline-trim-handle, .timeline-playhead-handle')) return;
    event.preventDefault();

    if (editorTool === 'trim') {
      seekVideo(getTimelineTime(event.clientX));
      return;
    }

    seekVideo(getTimelineTime(event.clientX));

    if (editorTool === 'select' && event.target.closest('.timeline-track-effects') && !event.target.closest('.timeline-item')) {
      selectVideoEffect('');
    }
  }

  function beginTrimDrag(event, edge) {
    if (!videoSourceFile || isVideoExporting || editorTool !== 'trim') return;
    event.preventDefault();
    event.stopPropagation();
    pushTimelineHistory();
    const itemStarts = videoTimeline.items.map((item) => item.startTime);
    const itemEnds = videoTimeline.items.map((item) => item.endTime);
    const minEnd = itemEnds.length ? Math.max(...itemEnds) : 0.05;
    const maxStart = itemStarts.length ? Math.min(...itemStarts) : videoTimeline.duration - 0.05;

    const move = (moveEvent) => {
      const time = getTimelineTime(moveEvent.clientX);
      if (edge === 'start') {
        videoTrimStart.value = clamp(time, 0, Math.min(maxStart, videoTimeline.trimEnd - 0.05)).toFixed(2);
      } else {
        videoTrimEnd.value = clamp(time, Math.max(minEnd, videoTimeline.trimStart + 0.05), videoTimeline.duration).toFixed(2);
      }
      applyVideoTrim(false);
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  }

  function beginTimelineDrag(event, item, element) {
    if (!videoSourceFile || isVideoExporting || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (editorTool !== 'select') setEditorTool('select', { skipTab: true });
    selectedVideoEffectId = item.id;
    videoEffectType.value = item.type;
    videoEffectStart.value = item.startTime.toFixed(2);
    videoEffectEnd.value = item.endTime.toFixed(2);
    timelineItems.querySelectorAll('.timeline-item').forEach((candidate) => {
      candidate.classList.toggle('is-selected', candidate === element);
    });
    updateVideoEffectInspector();
    setInspectorTab('effect');
    const bounds = getTimelineTrackAreaBounds();
    const originX = event.clientX;
    const original = { ...item };
    const handleStart = event.target.closest('.timeline-item-handle.start');
    const handleEnd = event.target.closest('.timeline-item-handle.end');
    let edge = 'move';
    if (handleStart) edge = 'start';
    else if (handleEnd) edge = 'end';
    element.classList.add('is-dragging');

    const move = (moveEvent) => {
      const delta = ((moveEvent.clientX - originX) / bounds.width) * videoTimeline.duration;
      let startTime = original.startTime;
      let endTime = original.endTime;
      if (edge === 'start') startTime = clamp(original.startTime + delta, videoTimeline.trimStart, original.endTime - 0.05);
      else if (edge === 'end') endTime = clamp(original.endTime + delta, original.startTime + 0.05, videoTimeline.trimEnd);
      else {
        const length = original.endTime - original.startTime;
        startTime = clamp(original.startTime + delta, videoTimeline.trimStart, videoTimeline.trimEnd - length);
        endTime = startTime + length;
      }
      startTime = snapTimelineTime(startTime);
      endTime = snapTimelineTime(endTime);
      videoEffectStart.value = startTime.toFixed(2);
      videoEffectEnd.value = endTime.toFixed(2);
      positionTimelineRowElement(element, startTime, endTime, TIMELINE_EFFECT_META[item.type]?.row || 1);
      if (videoEffectRangeLabel) {
        videoEffectRangeLabel.textContent = `${formatDurationDetailed(startTime)} — ${formatDurationDetailed(endTime)}`;
      }
      if (videoEffectDurationLabel) {
        videoEffectDurationLabel.textContent = `Duración: ${Math.max(0, endTime - startTime).toFixed(2)} s`;
      }
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      element.classList.remove('is-dragging');
      try {
        pushTimelineHistory();
        videoTimeline.upsert({ ...item, startTime: Number(videoEffectStart.value), endTime: Number(videoEffectEnd.value) });
      } catch (err) {
        showStatus(videoEditorStatus, err.message, 'error');
      }
      selectVideoEffect(item.id);
      void syncVideoTimelineEffects(true);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  }

  function beginPlayheadDrag(event) {
    if (!videoSourceFile || isVideoExporting || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    seekVideo(getTimelineTime(event.clientX));
    const move = (moveEvent) => seekVideo(getTimelineTime(moveEvent.clientX));
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end, { once: true });
  }

  function handleVideoEditorKeydown(event) {
    if (sourceMode !== 'video' || isVideoExporting) return;
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable) return;

    if (event.ctrlKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoTimelineEdit();
      else undoTimelineEdit();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redoTimelineEdit();
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      void toggleVideoPlayback();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      jumpVideo(event.shiftKey ? -5 : -0.04);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      jumpVideo(event.shiftKey ? 5 : 0.04);
      return;
    }
    if (event.key.toLowerCase() === 'i') {
      event.preventDefault();
      videoTrimStart.value = String(videoEl.currentTime || 0);
      pushTimelineHistory();
      applyVideoTrim();
      setEditorTool('trim');
      return;
    }
    if (event.key.toLowerCase() === 'o') {
      event.preventDefault();
      videoTrimEnd.value = String(videoEl.currentTime || 0);
      pushTimelineHistory();
      applyVideoTrim();
      setEditorTool('trim');
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selectedVideoEffectId) {
        event.preventDefault();
        deleteSelectedVideoEffect();
      }
      return;
    }
    if (event.key.toLowerCase() === 'v') {
      setEditorTool('select');
      return;
    }
    if (event.key.toLowerCase() === 't') {
      setEditorTool('trim');
    }
  }

  async function setTimelineDetector(type, item) {
    const checkbox = type === 'blob' ? chkBlobTracking : type === 'face' ? chkFaceDetection : chkBlinkDetection;
    if (!checkbox) return;
    const shouldEnable = !!item;
    if (checkbox.checked !== shouldEnable) {
      checkbox.checked = shouldEnable;
      await toggleEffect(type);
    }
    const effect = type === 'blob' ? blobTrackingEffect : type === 'face' ? faceDetectionEffect : blinkDetectionEffect;
    if (item && effect && typeof effect.setConfig === 'function') effect.setConfig(item.config || {});
  }

  function syncVideoTimelineLookAt(mediaTime) {
    if (sourceMode !== 'video' || !videoSourceFile) return;
    const active = videoTimeline.activeAt(mediaTime);
    const lookItem = active.find((item) => item.type === 'look');
    if (appliedTimelineItemIds.look === (lookItem?.id || '')) return;
    const operationalSettings = {
      previewQuality: imageSettings.previewQuality,
      jpegQuality: imageSettings.jpegQuality,
      videoFormat: imageSettings.videoFormat,
      captureTimerSeconds: imageSettings.captureTimerSeconds,
      qualityEnhancer: imageSettings.qualityEnhancer,
      qualityEnhancerStrength: imageSettings.qualityEnhancerStrength,
    };
    imageSettings = {
      ...(videoBaseImageSettings || DEFAULT_IMAGE_SETTINGS),
      ...(lookItem?.config || {}),
      ...operationalSettings,
    };
    appliedTimelineItemIds.look = lookItem?.id || '';
    updateEffectsInfo();
  }

  function timelineDetectorIdsAt(mediaTime) {
    const active = videoTimeline.activeAt(mediaTime);
    return Object.fromEntries(['blob', 'face', 'blink'].map((type) => {
      const item = active.find((entry) => entry.type === type);
      return [type, item?.id || ''];
    }));
  }

  function needsTimelineDetectorSync(mediaTime) {
    const ids = timelineDetectorIdsAt(mediaTime);
    return ['blob', 'face', 'blink'].some((type) => appliedTimelineItemIds[type] !== ids[type]);
  }

  async function syncVideoTimelineEffects(force = false) {
    if (sourceMode !== 'video' || !videoSourceFile) return;
    const active = videoTimeline.activeAt(videoEl.currentTime);
    const byType = Object.fromEntries(active.map((item) => [item.type, item]));
    if (force || appliedTimelineItemIds.look !== byType.look?.id) {
      const operationalSettings = {
        previewQuality: imageSettings.previewQuality,
        jpegQuality: imageSettings.jpegQuality,
        videoFormat: imageSettings.videoFormat,
        captureTimerSeconds: imageSettings.captureTimerSeconds,
        qualityEnhancer: imageSettings.qualityEnhancer,
        qualityEnhancerStrength: imageSettings.qualityEnhancerStrength,
      };
      imageSettings = {
        ...(videoBaseImageSettings || DEFAULT_IMAGE_SETTINGS),
        ...(byType.look?.config || {}),
        ...operationalSettings,
      };
      appliedTimelineItemIds.look = byType.look?.id || '';
    }
    for (const type of ['blob', 'face', 'blink']) {
      if (force || appliedTimelineItemIds[type] !== byType[type]?.id) {
        appliedTimelineItemIds[type] = byType[type]?.id || '';
        await setTimelineDetector(type, byType[type]);
      }
    }
    updateEffectsInfo();
  }

  function updateVideoEditorUI() {
    const loaded = !!videoSourceFile;
    [btnVideoStart, btnVideoBack, btnVideoPlay, btnVideoForward, btnVideoEnd, btnVideoMute]
      .forEach((button) => { if (button) button.disabled = !loaded || isVideoExporting; });
    if (videoSeek) videoSeek.disabled = !loaded || isVideoExporting;
    if (btnExportVideo) btnExportVideo.disabled = !loaded || isVideoExporting;
    if (btnHeaderExportVideo) btnHeaderExportVideo.disabled = !loaded || isVideoExporting;
    if (videoTrimStart) videoTrimStart.disabled = !loaded || isVideoExporting;
    if (videoTrimEnd) videoTrimEnd.disabled = !loaded || isVideoExporting;
    timelineEffectPalette?.querySelectorAll('.timeline-palette-chip').forEach((chip) => {
      chip.disabled = !loaded || isVideoExporting;
    });
    updateVideoEffectInspector();
    updateEditorHistoryButtons();
    if (!loaded) {
      if (videoFileMeta) videoFileMeta.textContent = 'Ningún archivo cargado';
      if (videoExportDetails) videoExportDetails.textContent = 'Cargá un video para exportar.';
      if (sourceMode === 'video') {
        setCameraPlaceholderMessage('Elegí un video para editar.');
        placeholder.classList.remove('hidden');
      }
      updateTimelineHint();
      return;
    }
    placeholder.classList.add('hidden');
    if (videoExportDetails) {
      const bitrate = getRecommendedVideoBitrate(videoEl.videoWidth, videoEl.videoHeight, videoSourceFps);
      const exportLabel = typeof VideoEncoder !== 'undefined' ? 'WebM · WebCodecs' : 'WebCodecs no disponible';
      videoExportDetails.textContent = `${videoEl.videoWidth}×${videoEl.videoHeight} · ${formatVideoFps(videoSourceFps)} FPS · ${formatVideoBitrate(bitrate)} · ${exportLabel} · sin audio`;
    }
    updateTimelineHint();
  }

  function updateVideoTransport() {
    if (sourceMode !== 'video') return;
    const duration = videoTimeline.duration || 0;
    videoSeek.value = String(videoEl.currentTime || 0);
    videoTimeLabel.textContent = `${formatDurationDetailed(videoEl.currentTime || 0)} / ${formatDurationDetailed(duration)}`;
    btnVideoPlay.innerHTML = videoEl.paused
      ? '<i class="fa-solid fa-play"></i>'
      : '<i class="fa-solid fa-pause"></i>';
    updateVideoMuteButton();
    if (duration > 0) timelinePlayhead.style.left = `${clamp((videoEl.currentTime / duration) * 100, 0, 100)}%`;
    if (isVideoExporting) {
      const range = Math.max(0.001, videoTimeline.trimEnd - videoTimeline.trimStart);
      const progress = clamp((videoEl.currentTime - videoTimeline.trimStart) / range, 0, 1);
      videoExportProgress.value = progress;
      const remaining = Math.max(0, videoTimeline.trimEnd - videoEl.currentTime);
      videoExportSummary.textContent = `Exportando ${Math.round(progress * 100)}% · quedan ${formatDurationDetailed(remaining)}`;
    }
  }

  async function toggleVideoPlayback() {
    if (!videoSourceFile || isVideoExporting) return;
    if (videoEl.paused) {
      if (videoEl.currentTime < videoTimeline.trimStart || videoEl.currentTime >= videoTimeline.trimEnd) {
        videoEl.currentTime = videoTimeline.trimStart;
      }
      await videoEl.play().catch(() => showStatus(videoEditorStatus, 'No se pudo reproducir el video.', 'error'));
      if (!animFrameId) scheduleRenderLoop();
    } else {
      videoEl.pause();
    }
    updateVideoTransport();
  }

  function seekVideo(time) {
    if (!videoSourceFile || isVideoExporting) return;
    videoEl.currentTime = clamp(Number(time) || 0, videoTimeline.trimStart, videoTimeline.trimEnd);
    updateVideoTransport();
    if (!animFrameId) scheduleRenderLoop();
  }

  function jumpVideo(seconds) {
    seekVideo((videoEl.currentTime || 0) + seconds);
  }

  function updateVideoMuteButton() {
    btnVideoMute.setAttribute('aria-pressed', String(videoEl.muted));
    btnVideoMute.setAttribute('aria-label', videoEl.muted ? 'Activar audio' : 'Silenciar audio');
    btnVideoMute.innerHTML = videoEl.muted
      ? '<i class="fa-solid fa-volume-xmark"></i>'
      : '<i class="fa-solid fa-volume-high"></i>';
  }

  async function renderVideoExportFrame(frameIndex, fps) {
    const start = videoTimeline.trimStart;
    const time = start + frameIndex / fps;
    await seekVideoForExport(time);
    if (needsTimelineDetectorSync(time)) {
      await syncVideoTimelineEffects(true);
    } else {
      syncVideoTimelineLookAt(time);
    }
    renderSourceFrameBuffer(true);
  }

  async function runVideoExportViaWebCodecs() {
    const { calculateExportBitrate, calculateExportFrameCount, encodeCanvasSequence } = await import('./video-export.mjs');
    const fps = getVideoExportFps();
    const start = videoTimeline.trimStart;
    const end = videoTimeline.trimEnd;
    const totalFrames = calculateExportFrameCount(end - start, fps);
    ensureRecordingCanvas();

    const baseName = videoSourceFile.name.replace(/\.[^.]+$/, '') || 'hatewebcam-video';
    videoExportFileName = `${baseName}-editado.webm`;

    return encodeCanvasSequence({
      canvas: recordingCanvas,
      width: recordingCanvas.width,
      height: recordingCanvas.height,
      fps,
      totalFrames,
      duration: end - start,
      bitrate: calculateExportBitrate(
        videoSourceAverageBitrate,
        recordingCanvas.width,
        recordingCanvas.height,
        fps,
        imageSettings.qualityEnhancer
      ),
      renderFrame: (frameIndex) => renderVideoExportFrame(frameIndex, fps),
      onProgress: (done, total) => {
        videoExportProgress.value = done / total;
        const remainingSec = Math.max(0, (total - done) / fps);
        videoExportSummary.textContent = `Exportando ${Math.round((done / total) * 100)}% · ${formatVideoFps(fps)} FPS · ${formatDurationDetailed(remainingSec)} restantes`;
      },
      shouldCancel: () => !isVideoExporting,
    });
  }

  async function finalizeVideoExportBlob(blob) {
    downloadBlob(blob, videoExportFileName);
    showStatus(videoEditorStatus, 'Exportación terminada y guardada.', 'success');
    videoExportProgress.value = 1;
    videoExportTitle.innerHTML = '<i class="fa-solid fa-circle-check"></i> Exportación terminada';
    videoExportSummary.textContent = `${videoExportFileName} · ${formatBytes(blob.size)} · descarga iniciada`;
    btnCancelVideoExport.classList.add('hidden');
    btnCloseVideoExportModal.classList.remove('hidden');
    cleanupVideoExport(true);
  }

  async function startVideoExport() {
    if (!videoSourceFile || isVideoExporting) return;
    if (typeof HTMLCanvasElement === 'undefined') {
      showStatus(videoEditorStatus, 'Este navegador no puede exportar el video.', 'error');
      return;
    }

    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      showStatus(videoEditorStatus, 'La exportación requiere Chrome o Edge actualizado con WebCodecs.', 'error');
      return;
    }

    try {
      ensureRecordingCanvas();
      isVideoExporting = true;
      videoExportProgress.value = 0;
      videoExportTitle.innerHTML = '<i class="fa-solid fa-file-export"></i> Exportando video';
      videoExportSummary.textContent = 'Preparando exportación…';
      btnCancelVideoExport.classList.remove('hidden');
      btnCloseVideoExportModal.classList.add('hidden');
      videoExportModal.classList.remove('hidden');
      updateVideoEditorUI();
      cancelRenderLoop();
      if ('wakeLock' in navigator) {
        videoExportWakeLock = await navigator.wakeLock.request('screen').catch(() => null);
      }

      const blob = await runVideoExportViaWebCodecs();
      await finalizeVideoExportBlob(blob);
    } catch (err) {
      if (err?.message === 'export_cancelled') {
        cleanupVideoExport(true);
        return;
      }
      failVideoExport(err);
    }
  }

  function seekVideoForExport(time) {
    const target = clamp(time, 0, Math.max(0, videoTimeline.duration - 0.000001));
    if (Math.abs(videoEl.currentTime - target) < 0.00005) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('video_seek_timeout')), 10000);
      videoEl.addEventListener('seeked', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      videoEl.currentTime = target;
    });
  }

  async function cancelVideoExport(showMessage = true) {
    if (!isVideoExporting) return;
    isVideoExporting = false;
    videoEl.pause();
    videoEl.playbackRate = 1;
    if (showMessage) showStatus(videoEditorStatus, 'Exportación cancelada.', 'warning');
    videoExportTitle.innerHTML = '<i class="fa-solid fa-ban"></i> Exportación cancelada';
    videoExportSummary.textContent = 'No se descargó ningún archivo.';
    btnCancelVideoExport.classList.add('hidden');
    btnCloseVideoExportModal.classList.remove('hidden');
    cleanupVideoExport(true);
  }

  function failVideoExport(err) {
    console.error('Video export failed:', err);
    const messages = {
      webcodecs_codec_unsupported: 'No hay un codec WebM compatible para este video.',
      video_seek_timeout: 'No se pudo leer un frame del video a tiempo.',
      video_decode_failed: 'El navegador no pudo decodificar el video.',
    };
    const message = messages[err?.message] || 'La exportación falló. Revisá espacio libre y permisos.';
    showStatus(videoEditorStatus, message, 'error');
    void cancelVideoExport(false).then(() => {
      videoExportTitle.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Error de exportación';
      videoExportSummary.textContent = 'La exportación falló. Probá con un tramo más corto.';
    });
  }

  function cleanupVideoExport(keepModal = false) {
    isVideoExporting = false;
    videoExportFileName = '';
    if (!keepModal) {
      videoExportProgress.value = 0;
      videoExportModal.classList.add('hidden');
    }
    if (videoExportWakeLock) videoExportWakeLock.release().catch(() => {});
    videoExportWakeLock = null;
    updateVideoEditorUI();
    updateVideoTransport();
    if (isRunning && videoSourceFile && !animFrameId) scheduleRenderLoop();
  }

  function closeVideoExportModal() {
    if (isVideoExporting) return;
    videoExportModal.classList.add('hidden');
    videoExportProgress.value = 0;
  }

  // ─── Init ───
  async function init() {
    const cfg = loadConfig();
    // Migration: default mirror OFF to keep natural camera orientation on launch.
    if (cfg.forceMirrorDefaultV3 !== true) {
      cfg.flipH = false;
      cfg.forceMirrorDefaultV3 = true;
      saveConfig(cfg);
    }
    if (cfg.forceMirrorDefaultV4 !== true) {
      cfg.flipH = false;
      cfg.forceMirrorDefaultV4 = true;
      saveConfig(cfg);
    }
    if (cfg.faceVisualModeDefaultV2 !== true) {
      const savedQuickDetectorSettings = cfg.quickDetectorSettings || {};
      const legacyFlags = normalizeFaceVisualFlags(savedQuickDetectorSettings);
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
      saveConfig(cfg);
    }
    if (migrateResponsiveEditorDefaults(cfg)) {
      saveConfig(cfg);
    }
    if (typeof cfg.flipH === 'boolean') flipH = cfg.flipH;
    else flipH = false;
    if (chkMirror) chkMirror.checked = flipH;

    if (typeof cfg.flipV === 'boolean') flipV = cfg.flipV;
    if (chkFlipV) chkFlipV.checked = flipV;

    if (cfg.rotation != null) {
      rotation = cfg.rotation;
      if (rotationSelect) rotationSelect.value = String(cfg.rotation);
    }
    setAdvancedOptionsVisible(!!cfg.showAdvancedOptions);
    loadQuickDetectorSettings(cfg);
    updateQuickDetectorControlsUI();
    loadImageSettings(cfg);
    updateImageControlsUI();
    mobileActivePreset = null;
    updateMobilePresetButtons(mobileActivePreset);
    preferredDeviceId = typeof cfg.deviceId === 'string' && cfg.deviceId ? cfg.deviceId : null;
    if (cameraSelect) {
      cameraSelect.innerHTML = '<option value="">Cargando cámaras...</option>';
      cameraSelect.disabled = true;
    }

    updateProfilesList();
    bindEvents();
    bindTimelinePaletteDrag();
    bindQuickDetectorEvents();
    bindImageControlEvents();
    syncMobileViewportState();
    setMobileFxPanelVisible(false);
    updateCaptureButtons();

    // Auto-start camera on load (if browser allows it) without blocking UI init.
    void toggleCamera(true);
    void refreshCameraDevices(preferredDeviceId);
  }

  // ─── Events ───
  function bindEvents() {
    btnWebcamMode.addEventListener('click', () => setSourceMode('camera'));
    btnVideoMode.addEventListener('click', () => setSourceMode('video'));
    btnChooseVideo.addEventListener('click', () => videoFileInput.click());
    if (videoEffectType) {
      videoEffectType.addEventListener('change', () => {
        updateEffectTrackHighlight();
        updateTimelineHint();
        if (sourceMode === 'video' && document.querySelector('.video-inspector-tab[data-tab="adjust"]')?.classList.contains('is-active')) {
          setAdjustmentsContext(videoEffectType.value);
        }
      });
    }
    videoFileInput.addEventListener('change', () => {
      const [file] = videoFileInput.files || [];
      if (file) void loadVideoFile(file);
      videoFileInput.value = '';
    });
    btnVideoStart.addEventListener('click', () => seekVideo(videoTimeline.trimStart));
    btnVideoBack.addEventListener('click', () => jumpVideo(-5));
    btnVideoPlay.addEventListener('click', () => { void toggleVideoPlayback(); });
    btnVideoForward.addEventListener('click', () => jumpVideo(5));
    btnVideoEnd.addEventListener('click', () => seekVideo(videoTimeline.trimEnd));
    btnVideoMute.addEventListener('click', () => {
      videoEl.muted = !videoEl.muted;
      updateVideoMuteButton();
    });
    videoSeek.addEventListener('input', () => seekVideo(videoSeek.value));
    videoTrimStart.addEventListener('change', () => {
      pushTimelineHistory();
      applyVideoTrim();
    });
    videoTrimEnd.addEventListener('change', () => {
      pushTimelineHistory();
      applyVideoTrim();
    });
    btnSetTrimFromPlayhead.addEventListener('click', () => {
      videoTrimStart.value = String(videoEl.currentTime || 0);
      pushTimelineHistory();
      applyVideoTrim();
    });
    btnSetTrimEndFromPlayhead.addEventListener('click', () => {
      videoTrimEnd.value = String(videoEl.currentTime || 0);
      pushTimelineHistory();
      applyVideoTrim();
    });
    if (btnOpenEffectAdjust) {
      btnOpenEffectAdjust.addEventListener('click', () => {
        const item = videoTimeline.items.find((candidate) => candidate.id === selectedVideoEffectId);
        if (item) openAdjustmentsForContext(item.type);
      });
    }
    if (videoEffectStart) {
      videoEffectStart.addEventListener('change', () => commitSelectedEffectTiming({ pushHistory: true }));
    }
    if (videoEffectEnd) {
      videoEffectEnd.addEventListener('change', () => commitSelectedEffectTiming({ pushHistory: true }));
    }
    btnDeleteVideoEffect.addEventListener('click', deleteSelectedVideoEffect);
    btnExportVideo.addEventListener('click', () => { void startVideoExport(); });
    if (btnHeaderExportVideo) btnHeaderExportVideo.addEventListener('click', () => { void startVideoExport(); });
    btnCancelVideoExport.addEventListener('click', () => { void cancelVideoExport(); });
    btnCloseVideoExportModal.addEventListener('click', closeVideoExportModal);
    if (btnToolSelect) btnToolSelect.addEventListener('click', () => setEditorTool('select'));
    if (btnToolTrim) btnToolTrim.addEventListener('click', () => setEditorTool('trim'));
    if (btnTimelineZoomIn) btnTimelineZoomIn.addEventListener('click', () => {
      timelineZoom = clamp(timelineZoom + 0.5, 1, 8);
      applyTimelineZoom();
    });
    if (btnTimelineZoomOut) btnTimelineZoomOut.addEventListener('click', () => {
      timelineZoom = clamp(timelineZoom - 0.5, 1, 8);
      applyTimelineZoom();
    });
    if (timelineZoomInput) timelineZoomInput.addEventListener('input', () => {
      timelineZoom = clamp(Number(timelineZoomInput.value) || 1, 1, 8);
      applyTimelineZoom();
    });
    if (timelineViewport) {
      timelineViewport.addEventListener('wheel', (event) => {
        if (!event.ctrlKey || sourceMode !== 'video') return;
        event.preventDefault();
        timelineZoom = clamp(timelineZoom + (event.deltaY < 0 ? 0.25 : -0.25), 1, 8);
        applyTimelineZoom();
      }, { passive: false });
    }
    if (btnEditorUndo) btnEditorUndo.addEventListener('click', undoTimelineEdit);
    if (btnEditorRedo) btnEditorRedo.addEventListener('click', redoTimelineEdit);
    inspectorTabs.forEach((tab) => {
      tab.addEventListener('click', () => setInspectorTab(tab.dataset.tab));
    });
    adjustContextNav?.querySelectorAll('.adjust-context-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        openAdjustmentsForContext(tab.dataset.adjustContext);
      });
    });
    videoTimelineEl?.querySelectorAll('.timeline-track-label[data-adjust-context]').forEach((label) => {
      label.addEventListener('click', () => {
        const context = label.dataset.adjustContext;
        const options = {};
        if (label.dataset.syncTool === 'trim') {
          options.syncTool = true;
          options.tool = 'trim';
        } else if (label.dataset.syncTool === 'effect') {
          options.syncTool = true;
          options.tool = 'effect';
          options.syncEffectType = true;
          if (label.dataset.effectType) options.effectType = label.dataset.effectType;
        }
        openAdjustmentsForContext(context, options);
      });
    });
    document.addEventListener('keydown', handleVideoEditorKeydown);
    window.addEventListener('resize', () => {
      if (sourceMode === 'video') applyTimelineZoom();
    });
    if (timelinePlayheadHandle) timelinePlayheadHandle.addEventListener('pointerdown', beginPlayheadDrag);
    if (timelineTrackArea) timelineTrackArea.addEventListener('pointerdown', beginTimelineSelection);
    timelineTrimStartHandle.addEventListener('pointerdown', (event) => beginTrimDrag(event, 'start'));
    timelineTrimEndHandle.addEventListener('pointerdown', (event) => beginTrimDrag(event, 'end'));
    videoEl.addEventListener('play', updateVideoTransport);
    videoEl.addEventListener('pause', updateVideoTransport);
    videoEl.addEventListener('seeked', () => {
      updateVideoTransport();
      void syncVideoTimelineEffects();
      if (!animFrameId && isRunning) scheduleRenderLoop();
    });
    btnToggleCamera.addEventListener('click', () => toggleCamera(false));
    cameraSelect.addEventListener('change', onCameraChange);
    chkMirror.addEventListener('change', onTransformChange);
    chkFlipV.addEventListener('change', onTransformChange);
    rotationSelect.addEventListener('change', onTransformChange);

    chkBlobTracking.addEventListener('change', () => { void toggleEffect('blob'); });
    chkFaceDetection.addEventListener('change', () => { void toggleEffect('face'); });
    chkBlinkDetection.addEventListener('change', () => { void toggleEffect('blink'); });

    btnColorPick.addEventListener('click', enableColorPick);
    if (btnToggleAdvancedOptions) btnToggleAdvancedOptions.addEventListener('click', toggleAdvancedOptions);
    canvas.addEventListener('click', onCanvasClick);

    if (btnTakePhoto) btnTakePhoto.addEventListener('click', requestPhotoCapture);
    if (btnRecord) btnRecord.addEventListener('click', toggleRecording);
    if (btnDownloadCapture) btnDownloadCapture.addEventListener('click', downloadPendingCapture);
    if (btnDiscardCapture) btnDiscardCapture.addEventListener('click', () => closeCapturePreview(true));
    if (btnCloseCapturePreview) btnCloseCapturePreview.addEventListener('click', () => closeCapturePreview(true));
    if (btnMobileEffectsDock) {
      btnMobileEffectsDock.addEventListener('click', () => {
        setMobileFxPanelVisible(!isMobileFxPanelVisible());
      });
    }
    if (btnMobileFxClose) {
      btnMobileFxClose.addEventListener('click', () => setMobileFxPanelVisible(false));
    }
    if (mobileFxBackdrop) {
      mobileFxBackdrop.addEventListener('click', () => setMobileFxPanelVisible(false));
    }
    if (btnMobileTakePhoto) {
      btnMobileTakePhoto.addEventListener('click', () => {
        setMobileFxPanelVisible(false);
        requestPhotoCapture();
      });
    }
    if (btnMobileRecord) {
      btnMobileRecord.addEventListener('click', () => {
        setMobileFxPanelVisible(false);
        toggleRecording();
      });
    }
    if (btnMobileBlobToggle) {
      btnMobileBlobToggle.addEventListener('click', () => {
        chkBlobTracking.checked = !chkBlobTracking.checked;
        void toggleEffect('blob');
      });
    }
    if (btnMobileFaceToggle) {
      btnMobileFaceToggle.addEventListener('click', () => {
        chkFaceDetection.checked = !chkFaceDetection.checked;
        void toggleEffect('face');
      });
    }
    if (btnMobileBlinkToggle) {
      btnMobileBlinkToggle.addEventListener('click', () => {
        chkBlinkDetection.checked = !chkBlinkDetection.checked;
        void toggleEffect('blink');
      });
    }
    if (btnMobileColorPick) {
      btnMobileColorPick.addEventListener('click', () => {
        enableColorPick();
        setMobileFxPanelVisible(false);
      });
    }
    if (inpMobileBlobColor) {
      inpMobileBlobColor.addEventListener('input', (e) => {
        quickDetectorSettings.blobBoxColor = e.target.value;
        if (blobTrackingEffect) blobTrackingEffect.boxColor = e.target.value;
        updateQuickDetectorControlsUI();
        scheduleSaveQuickDetectorSettings();
        scheduleSaveActiveEffectSettings();
      });
    }
    if (inpMobileFaceColor) {
      inpMobileFaceColor.addEventListener('input', (e) => {
        quickDetectorSettings.faceBoxColor = e.target.value;
        if (faceDetectionEffect) faceDetectionEffect.boxColor = e.target.value;
        updateQuickDetectorControlsUI();
        scheduleSaveQuickDetectorSettings();
        scheduleSaveActiveEffectSettings();
      });
    }
    bindFaceVisualToggle(chkMobileFaceShowBox, chkMobileFaceShowBlur, 'box');
    bindFaceVisualToggle(chkMobileFaceShowBlur, chkMobileFaceShowBox, 'blur');
    if (inpMobileFaceLabel) {
      inpMobileFaceLabel.addEventListener('input', (e) => {
        const value = String(e.target.value || '').slice(0, 28);
        quickDetectorSettings.faceLabelText = value || 'CARA';
        if (faceDetectionEffect) faceDetectionEffect.labelText = value;
        updateQuickDetectorControlsUI();
        scheduleSaveQuickDetectorSettings();
        scheduleSaveActiveEffectSettings();
      });
      inpMobileFaceLabel.addEventListener('blur', (e) => {
        const normalized = normalizeFaceLabel(e.target.value);
        quickDetectorSettings.faceLabelText = normalized;
        e.target.value = normalized;
        if (faceDetectionEffect) faceDetectionEffect.labelText = normalized;
        saveQuickDetectorSettings();
        saveActiveEffectSettings();
      });
    }
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
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', () => {
      syncMobileViewportState();
      requestPreviewRefresh(true);
    });

    window.addEventListener('beforeunload', () => {
      cancelPhotoCountdown(false);
      stopRecording(false);
      clearPendingCapture(true);
      if (isRunning) cameraManager.stop();
      if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    });
  }

  function onVisibilityChange() {
    isPageVisible = document.visibilityState !== 'hidden';
    if (isVideoExporting) return;
    if (!isRunning) return;

    if (!isPageVisible) {
      cancelRenderLoop();
      return;
    }

    if (!animFrameId) {
      frameCount = 0;
      lastFpsTime = performance.now();
      scheduleRenderLoop();
    }
  }

  // ─── Camera ───
  function setCameraPlaceholderMessage(message) {
    if (!placeholder) return;
    const msg = placeholder.querySelector('div');
    if (msg) msg.textContent = message;
  }

  function getCameraStartErrorMessage(error, wasAutoStart = false) {
    const errorName = error && error.name ? error.name : '';
    if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
      return 'Permiso de cámara bloqueado. Habilitá el permiso del navegador y tocá Encender Cámara.';
    }
    if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      return 'No se encontró una cámara disponible. Conectá una cámara y tocá Encender Cámara.';
    }
    if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
      return 'Otra app parece estar usando la cámara. Cerrala y tocá Encender Cámara.';
    }
    if (errorName === 'OverconstrainedError' || errorName === 'ConstraintNotSatisfiedError') {
      return 'La cámara no soporta la configuración solicitada. Probá otra cámara o reintentá.';
    }
    return wasAutoStart
      ? 'La cámara no se inició automáticamente. Tocá Encender Cámara para reintentar.'
      : 'No se pudo activar la cámara. Revisá permisos y reintentá.';
  }

  async function toggleCamera(forceStart = false) {
    if (sourceMode !== 'camera') return;
    if (isRunning && !forceStart) {
      if (isRecording) stopRecording(true);
      cancelPhotoCountdown(false);

      cameraManager.stop();
      isRunning = false;
      cancelRenderLoop();
      btnToggleCamera.innerHTML = '<i class="fa-solid fa-play"></i> Encender Cámara';
      btnToggleCamera.classList.remove('active');
      placeholder.classList.remove('hidden');
      resolutionInfo.textContent = '—';
      fpsInfo.textContent = '—';
      updateCaptureButtons();
      return;
    }

    if (!isRunning) {
      const requestedDeviceId = cameraSelect.value || preferredDeviceId || null;
      setCameraPlaceholderMessage('Solicitando permiso de cámara...');
      const ok = await cameraManager.start(videoEl, requestedDeviceId);
      if (ok) {
        isRunning = true;
        placeholder.classList.add('hidden');
        btnToggleCamera.innerHTML = '<i class="fa-solid fa-stop"></i> Apagar Cámara';
        btnToggleCamera.classList.add('active');

        videoEl.addEventListener('loadedmetadata', () => {
          const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
          syncPreviewCanvasMetrics(sourceWidth, sourceHeight, true);
        }, { once: true });

        frameCount = 0;
        lastFpsTime = performance.now();
        if (isPageVisible) {
          scheduleRenderLoop();
        } else {
          animFrameId = null;
        }

        const cfg = loadConfig();
        const settings = cameraManager.getStreamSettings();
        preferredDeviceId = settings.deviceId || requestedDeviceId || preferredDeviceId;
        cfg.deviceId = preferredDeviceId || '';
        saveConfig(cfg);
        if (cameraSelect && preferredDeviceId) cameraSelect.value = preferredDeviceId;
        void refreshCameraDevices(preferredDeviceId);
      } else {
        const message = getCameraStartErrorMessage(cameraManager.lastError, forceStart);
        placeholder.classList.remove('hidden');
        setCameraPlaceholderMessage(message);
        showStatus(captureStatus, message, 'warning');
      }
      updateCaptureButtons();
    }
  }

  async function onCameraChange() {
    preferredDeviceId = cameraSelect.value || null;
    const cfg = loadConfig();
    cfg.deviceId = preferredDeviceId || '';
    saveConfig(cfg);
    if (!isRunning) return;

    cameraSelect.disabled = true;
    try {
      await cameraManager.switchCamera(cameraSelect.value);
      const settings = cameraManager.getStreamSettings();
      preferredDeviceId = settings.deviceId || preferredDeviceId;
      void refreshCameraDevices(preferredDeviceId);
    } catch (err) {
      console.error('Error switching camera:', err);
      showStatus(captureStatus, 'No se pudo cambiar de cámara', 'error');
      setTimeout(() => hideStatus(captureStatus), 2200);
    } finally {
      cameraSelect.disabled = false;
    }
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
  function syncBlinkLandmarkSource() {
    if (!blinkDetectionEffect || typeof blinkDetectionEffect.setLandmarkSource !== 'function') return;
    blinkDetectionEffect.setLandmarkSource(faceDetectionEffect || null);
  }

  async function toggleEffect(type) {
    if (type === 'blob') {
      if (chkBlobTracking.checked) {
        if (!blobTrackingEffect) {
          blobTrackingEffect = new BlobTracking();
          const savedBlobConfig = getSavedEffectConfig('blob');
          if (savedBlobConfig) blobTrackingEffect.setConfig(savedBlobConfig);
          blobTrackingEffect.boxColor = quickDetectorSettings.blobBoxColor;
          effectManager.addEffect(blobTrackingEffect);
        }
        if (blinkDetectionEffect) {
          blinkDetectionEffect.setBlinkCallback((eye) => blobTrackingEffect.triggerConnection(eye));
        }
        if (colorPickSection) colorPickSection.classList.remove('hidden');
      } else {
        if (blobTrackingEffect) effectManager.removeEffect(blobTrackingEffect);
        blobTrackingEffect = null;
        if (colorPickSection) colorPickSection.classList.add('hidden');
      }
      syncQuickDetectorSettingsFromEffects();
      saveActiveEffectSettings();
      renderEffectConfig();
      updateEffectsInfo();
      return;
    }

    if (type === 'face') {
      const requestId = ++faceLoadRequestId;
      if (chkFaceDetection.checked) {
        showStatus(captureStatus, 'Cargando detector de caras...', 'info');
        chkFaceDetection.disabled = true;
        try {
          await ensureFaceMeshLoaded();
        } catch (err) {
          console.error('No se pudo cargar MediaPipe Face Mesh:', err);
          showStatus(captureStatus, 'No se pudo cargar el detector de caras', 'error');
          chkFaceDetection.checked = false;
        } finally {
          chkFaceDetection.disabled = false;
        }

        if (requestId !== faceLoadRequestId || !chkFaceDetection.checked) return;
        if (typeof FaceMesh === 'undefined') return;

        if (!faceDetectionEffect) {
          faceDetectionEffect = new FaceDetection();
          const savedFaceConfig = getSavedEffectConfig('face');
          if (savedFaceConfig) faceDetectionEffect.setConfig(savedFaceConfig);
          applyQuickDetectorSettingsToEffects();
          effectManager.addEffect(faceDetectionEffect);
        } else {
          applyQuickDetectorSettingsToEffects();
        }
        syncBlinkLandmarkSource();
        if (!isRecording) {
          setTimeout(() => hideStatus(captureStatus), 1200);
        }
      } else {
        if (faceDetectionEffect) effectManager.removeEffect(faceDetectionEffect);
        faceDetectionEffect = null;
        syncBlinkLandmarkSource();
      }
    } else if (type === 'blink') {
      const requestId = ++blinkLoadRequestId;
      if (chkBlinkDetection.checked) {
        showStatus(captureStatus, 'Cargando detector de pestañeos...', 'info');
        chkBlinkDetection.disabled = true;
        try {
          await ensureFaceMeshLoaded();
        } catch (err) {
          console.error('No se pudo cargar MediaPipe Face Mesh:', err);
          showStatus(captureStatus, 'No se pudo cargar el detector de pestañeos', 'error');
          chkBlinkDetection.checked = false;
        } finally {
          chkBlinkDetection.disabled = false;
        }

        if (requestId !== blinkLoadRequestId || !chkBlinkDetection.checked) return;
        if (typeof FaceMesh === 'undefined') return;

        if (!blinkDetectionEffect) {
          blinkDetectionEffect = new BlinkDetection({ landmarkSource: faceDetectionEffect || null });
          const savedBlinkConfig = getSavedEffectConfig('blink');
          if (savedBlinkConfig) blinkDetectionEffect.setConfig(savedBlinkConfig);
          effectManager.addEffect(blinkDetectionEffect);
        }
        syncBlinkLandmarkSource();
        if (blobTrackingEffect) {
          blinkDetectionEffect.setBlinkCallback((eye) => blobTrackingEffect.triggerConnection(eye));
        }
        if (!isRecording) {
          setTimeout(() => hideStatus(captureStatus), 1200);
        }
      } else {
        if (blinkDetectionEffect) effectManager.removeEffect(blinkDetectionEffect);
        blinkDetectionEffect = null;
      }
    }

    syncQuickDetectorSettingsFromEffects();
    saveActiveEffectSettings();
    renderEffectConfig();
    updateEffectsInfo();
  }

  function updateEffectsInfo() {
    const names = [];
    if (blobTrackingEffect) names.push('Color');
    if (faceDetectionEffect) {
      if (faceDetectionEffect.showBox && faceDetectionEffect.showBlur) names.push('Caras mixtas');
      else if (faceDetectionEffect.showBlur) names.push('Caras blur/pixeladas');
      else names.push('Caras');
    }
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

  function normalizeRotationDegrees(deg) {
    const normalized = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
    if (normalized === 360) return 0;
    return normalized;
  }

  function getMobileAutoRotationDegrees(sourceWidth, sourceHeight) {
    const shouldAutoRotate = isMobileViewport() && sourceWidth > sourceHeight;
    return shouldAutoRotate ? 90 : 0;
  }

  function getEffectiveRotationDegrees(sourceWidth, sourceHeight) {
    if (sourceMode === 'camera' && isMobileViewport()) {
      return normalizeRotationDegrees(getMobileAutoRotationDegrees(sourceWidth, sourceHeight));
    }
    return normalizeRotationDegrees(rotation);
  }

  function getEffectiveFrameDimensions(sourceWidth, sourceHeight) {
    const effectiveRotation = getEffectiveRotationDegrees(sourceWidth, sourceHeight);
    const rotated = effectiveRotation === 90 || effectiveRotation === 270;
    return {
      width: rotated ? sourceHeight : sourceWidth,
      height: rotated ? sourceWidth : sourceHeight,
      effectiveRotation,
    };
  }

  function getPreviewFrameDimensions(sourceWidth, sourceHeight) {
    const { width: effectiveWidth, height: effectiveHeight } = getEffectiveFrameDimensions(sourceWidth, sourceHeight);
    const previewPreset = getCurrentPreviewQualityPreset();
    const sourcePixels = Math.max(1, effectiveWidth * effectiveHeight);
    const pixelScale = sourcePixels > previewPreset.maxPixels
      ? Math.sqrt(previewPreset.maxPixels / sourcePixels)
      : 1;
    const baseScale = Math.min(1, pixelScale, previewPreset.maxScale);

    const aspect = Math.max(0.0001, effectiveWidth / effectiveHeight);
    let width = Math.max(1, Math.round(effectiveWidth * baseScale));
    let height = Math.max(1, Math.round(effectiveHeight * baseScale));

    if (width < PREVIEW_MIN_WIDTH) {
      width = PREVIEW_MIN_WIDTH;
      height = Math.max(1, Math.round(width / aspect));
    }
    if (height < PREVIEW_MIN_HEIGHT) {
      height = PREVIEW_MIN_HEIGHT;
      width = Math.max(1, Math.round(height * aspect));
    }

    return { width, height, scale: width / Math.max(1, effectiveWidth) };
  }

  function buildResolutionLabel(sourceWidth, sourceHeight, previewWidth, previewHeight) {
    const previewLabel = getCurrentPreviewQualityPreset().label;
    if (sourceWidth === previewWidth && sourceHeight === previewHeight) {
      return `${sourceWidth}×${sourceHeight} · Preview ${previewLabel}`;
    }
    return `${sourceWidth}×${sourceHeight} · Preview ${previewLabel} ${previewWidth}×${previewHeight}`;
  }

  function getDesiredPreviewCanvasMetrics(sourceWidth, sourceHeight) {
    if (isMobileViewport()) {
      const wrapperWidth = Math.round((previewWrapper && previewWrapper.clientWidth) || window.innerWidth || sourceWidth);
      const wrapperHeight = Math.round((previewWrapper && previewWrapper.clientHeight) || window.innerHeight || sourceHeight);
      return {
        width: Math.max(PREVIEW_MIN_WIDTH, wrapperWidth),
        height: Math.max(PREVIEW_MIN_HEIGHT, wrapperHeight),
        scale: wrapperWidth / Math.max(1, sourceWidth),
      };
    }
    return getPreviewFrameDimensions(sourceWidth, sourceHeight);
  }

  function syncPreviewCanvasMetrics(sourceWidth, sourceHeight, forceLabel = false) {
    const { width, height, scale } = getDesiredPreviewCanvasMetrics(sourceWidth, sourceHeight);
    const resized = canvas.width !== width || canvas.height !== height;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
    }
    if (forceLabel || resized || previewScale !== scale) {
      resolutionInfo.textContent = buildResolutionLabel(sourceWidth, sourceHeight, width, height);
    }
    previewScale = scale;
    return { width, height, scale };
  }

  function requestPreviewRefresh(forceLabel = false) {
    if (!isRunning || videoEl.readyState < 2) return;
    const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
    syncPreviewCanvasMetrics(sourceWidth, sourceHeight, forceLabel);
  }

  function scheduleRenderLoop() {
    if (isVideoExporting) return;
    animFrameId = typeof videoEl.requestVideoFrameCallback === 'function'
      ? videoEl.requestVideoFrameCallback(renderLoop)
      : requestAnimationFrame(renderLoop);
  }

  function cancelRenderLoop() {
    if (animFrameId == null) return;
    if (typeof videoEl.cancelVideoFrameCallback === 'function') {
      videoEl.cancelVideoFrameCallback(animFrameId);
    } else {
      cancelAnimationFrame(animFrameId);
    }
    animFrameId = null;
  }

  function renderLoop() {
    if (!isRunning || isVideoExporting) {
      animFrameId = null;
      return;
    }
    if (!isPageVisible) {
      animFrameId = null;
      return;
    }

    try {
      if (videoEl.readyState >= 2) {
        if (sourceMode === 'video') {
          void syncVideoTimelineEffects();
          if (videoEl.currentTime >= videoTimeline.trimEnd) {
            videoEl.pause();
            videoEl.currentTime = videoTimeline.trimEnd;
          }
        }
        const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
        syncPreviewCanvasMetrics(sourceWidth, sourceHeight, frameCount % 30 === 0);

        try {
          if (isRecording) {
            renderSourceFrameBuffer(true);
            blitProcessedFrameToPreview();
          } else {
            renderProcessedFrame(canvas, ctx, 'preview');
          }
        } catch (renderErr) {
          console.error('Render frame fallback error:', renderErr);
          drawBaseFrame(ctx, canvas, 'preview');
        }

        // FPS
        frameCount++;
        const now = performance.now();
        if (now - lastFpsTime >= 1000) {
          fpsInfo.textContent = `${frameCount} FPS`;
          frameCount = 0;
          lastFpsTime = now;
        }
        updateVideoTransport();
      }
    } catch (err) {
      console.error('Render loop error:', err);
    }

    scheduleRenderLoop();
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

  function ensurePostFxBuffer(mode, w, h, scale) {
    let fxCanvas;
    let fxCtx;

    if (mode === 'recording') {
      fxCanvas = recordingFxCanvas;
      fxCtx = recordingFxCtx;
    } else if (mode === 'capture') {
      fxCanvas = captureFxCanvas;
      fxCtx = captureFxCtx;
    } else {
      fxCanvas = postFxCanvas;
      fxCtx = postFxCtx;
    }

    if (!fxCanvas) {
      fxCanvas = document.createElement('canvas');
      fxCtx = fxCanvas.getContext('2d', { willReadFrequently: true });

      if (mode === 'recording') {
        recordingFxCanvas = fxCanvas;
        recordingFxCtx = fxCtx;
      } else if (mode === 'capture') {
        captureFxCanvas = fxCanvas;
        captureFxCtx = fxCtx;
      } else {
        postFxCanvas = fxCanvas;
        postFxCtx = fxCtx;
      }
    }

    const pw = Math.max(320, Math.round(w * scale));
    const ph = Math.max(180, Math.round(h * scale));

    if (fxCanvas.width !== pw || fxCanvas.height !== ph) {
      fxCanvas.width = pw;
      fxCanvas.height = ph;
    }
    return { pw, ph, fxCanvas, fxCtx };
  }

  function drawBaseFrame(targetCtx, targetCanvas, mode = 'preview') {
    const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
    const effectiveRotation = getEffectiveRotationDegrees(sourceWidth, sourceHeight);
    const rotated = effectiveRotation === 90 || effectiveRotation === 270;
    const orientedWidth = rotated ? sourceHeight : sourceWidth;
    const orientedHeight = rotated ? sourceWidth : sourceHeight;
    const scaleX = targetCanvas.width / Math.max(1, orientedWidth);
    const scaleY = targetCanvas.height / Math.max(1, orientedHeight);
    const useCover = mode === 'preview' && isMobileViewport();
    const frameScale = useCover ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    const drawWidth = Math.max(1, Math.round(sourceWidth * frameScale));
    const drawHeight = Math.max(1, Math.round(sourceHeight * frameScale));

    targetCtx.save();
    targetCtx.filter = buildCanvasFilter();
    targetCtx.translate(targetCanvas.width / 2, targetCanvas.height / 2);
    if (effectiveRotation !== 0) {
      targetCtx.rotate((effectiveRotation * Math.PI) / 180);
    }
    let sx = 1;
    let sy = 1;
    if (getEffectiveFlipH()) sx = -1;
    if (flipV) sy = -1;
    if (sx !== 1 || sy !== 1) {
      targetCtx.scale(sx, sy);
    }
    targetCtx.drawImage(
      videoEl,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight
    );
    targetCtx.restore();
    return effectiveRotation;
  }

  function applyAdvancedPixelAdjustments(targetCanvas = canvas, targetCtx = ctx, mode = 'preview') {
    const w = targetCanvas.width;
    const h = targetCanvas.height;
    if (w === 0 || h === 0) return;

    let postFxScale = imageSettings.sharpness > 0 ? 0.78 : 0.86;
    if (w * h > 1920 * 1080) postFxScale *= 0.92;
    postFxScale = clamp(postFxScale, 0.72, 0.90);

    const { pw, ph, fxCanvas, fxCtx } = ensurePostFxBuffer(mode, w, h, postFxScale);
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
    const frameRotation = drawBaseFrame(targetCtx, targetCanvas, mode);
    if (needsAdvancedPixelAdjustments()) {
      applyAdvancedPixelAdjustments(targetCanvas, targetCtx, mode);
    }

    if (faceDetectionEffect) {
      faceDetectionEffect.flipH = getEffectiveFlipH();
      faceDetectionEffect.flipV = flipV;
      faceDetectionEffect.rotationDeg = frameRotation;
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
      const sampleX = clamp(x - 2, 0, Math.max(0, canvas.width - 5));
      const sampleY = clamp(y - 2, 0, Math.max(0, canvas.height - 5));
      const sampleWidth = Math.min(5, canvas.width);
      const sampleHeight = Math.min(5, canvas.height);
      const pixels = ctx.getImageData(sampleX, sampleY, sampleWidth, sampleHeight).data;
      const color = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 4) {
        color[0] += pixels[i];
        color[1] += pixels[i + 1];
        color[2] += pixels[i + 2];
      }
      const pixelCount = pixels.length / 4;
      blobTrackingEffect.setColorFromPixel(...color.map(value => Math.round(value / pixelCount)));
      colorPickMode = false;
      canvas.classList.remove('color-pick-mode');
      showStatus(colorPickStatus, 'Color seleccionado. Ya podés mover el objeto.', 'success');
      saveActiveEffectSettings();
      renderEffectConfig();
      setTimeout(() => hideStatus(colorPickStatus), 2500);
    }
  }

  // ─── Effect Config UI ───
  function renderEffectConfig() {
    if (effectConfigBlob) {
      effectConfigBlob.innerHTML = '';
      if (blobTrackingEffect) effectConfigBlob.appendChild(buildBlobConfig());
    }
    if (effectConfigFace) {
      effectConfigFace.innerHTML = '';
      if (faceDetectionEffect) effectConfigFace.appendChild(buildFaceConfig());
    }
    if (effectConfigBlink) {
      effectConfigBlink.innerHTML = '';
      if (blinkDetectionEffect) effectConfigBlink.appendChild(buildBlinkConfig());
    }
  }

  // --- Blob Tracking Config ---
  function buildBlobConfig() {
    const bt = blobTrackingEffect;
    const boxColor = normalizeHexColor(bt.boxColor, DEFAULT_QUICK_DETECTOR_SETTINGS.blobBoxColor);
    bt.boxColor = boxColor;
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
        <div class="config-block-title">Respuesta</div>
        <div class="help-text">Bajá la resolución de análisis si notás retraso. Subirla da más precisión, pero consume más CPU.</div>
        ${slider('sldBlobProcessScale', 'valBlobProcessScale', 'Resolución de análisis (%)', Math.round((bt.processScale || 0.45) * 100), 25, 100)}
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
          scheduleSaveActiveEffectSettings();
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
      bindSlider(el, 'sldBlobProcessScale', 'valBlobProcessScale', v => {
        bt.processScale = clamp(v / 100, 0.25, 1);
      });
      bindSlider(el, 'sldThickness', 'valThickness', v => bt.boxThickness = v);

      const inpColor = el.querySelector('#inpBoxColor');
      const swatch = el.querySelector('#boxColorSwatch');
      inpColor.addEventListener('input', e => {
        bt.boxColor = e.target.value;
        quickDetectorSettings.blobBoxColor = e.target.value;
        swatch.style.background = e.target.value;
        updateQuickDetectorControlsUI();
        scheduleSaveQuickDetectorSettings();
        scheduleSaveActiveEffectSettings();
      });

      el.querySelector('#chkShowCoords').addEventListener('change', e => {
        bt.showCoordinates = e.target.checked;
        scheduleSaveActiveEffectSettings();
      });
      el.querySelector('#chkShowCentroid').addEventListener('change', e => {
        bt.showCentroid = e.target.checked;
        scheduleSaveActiveEffectSettings();
      });
    });

    return el;
  }

  // --- Face Detection Config ---
  function buildFaceConfig() {
    const fd = faceDetectionEffect;
    const showBoxVisuals = fd.showBox !== false;
    const showPixelVisuals = !!fd.showBlur;
    const faceBoxColor = normalizeHexColor(fd.boxColor, DEFAULT_QUICK_DETECTOR_SETTINGS.faceBoxColor);
    fd.boxColor = faceBoxColor;
    const el = createSection('Detector de caras', `
      <div class="config-block">
        <div class="config-block-title">Configuración</div>
        <div class="help-text">Activá recuadro, blur/pixelado o ambos a la vez sobre cada cara detectada.</div>
        ${slider('sldMaxFaces', 'valMaxFaces', 'Máximo de caras a detectar', fd.maxFaces, 1, 5)}
        <div class="face-visual-toggles">
          <label class="checkbox-group"><input type="checkbox" id="chkAdvFaceShowBox" ${showBoxVisuals ? 'checked' : ''}><span>Recuadro</span></label>
          <label class="checkbox-group"><input type="checkbox" id="chkAdvFaceShowBlur" ${showPixelVisuals ? 'checked' : ''}><span>Blur / pixelado</span></label>
        </div>
        <div id="facePixelControls" class="${showPixelVisuals ? '' : 'hidden'}">
          ${slider('sldFacePixelation', 'valFacePixelation', 'Tamaño del pixelado', fd.pixelationCellSize, 4, 32)}
          ${slider('sldFacePadding', 'valFacePadding', 'Margen extra de censura (%)', fd.censorPaddingPercent, 0, 40)}
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
          ${slider('sldFaceThickness', 'valFaceThickness', 'Grosor del recuadro', fd.boxThickness, 1, 8)}
        </div>
        <label class="checkbox-group"><input type="checkbox" id="chkShowLandmarks" ${fd.showLandmarks ? 'checked' : ''}><span>Mostrar puntos faciales</span></label>
      </div>
      <div class="config-block">
        <div class="config-block-title">Respuesta</div>
        <div class="help-text">Menos suavizado y menos retención responden más rápido. Si vibra demasiado, subilos un poco.</div>
        ${slider('sldFaceInterval', 'valFaceInterval', 'Intervalo de análisis (ms)', fd.processIntervalMs, 16, 80)}
        ${slider('sldFaceSmoothing', 'valFaceSmoothing', 'Suavizado del recuadro (%)', Math.round((fd.boxSmoothing || 0) * 100), 0, 95)}
        ${slider('sldFaceHold', 'valFaceHold', 'Retención al perder cara (ms)', fd.detectionHoldMs, 80, 300, 10)}
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
        quickDetectorSettings.faceShowBox = showBox;
        quickDetectorSettings.faceShowBlur = showBlur;
        syncFaceModeUI();
        updateQuickDetectorControlsUI();
        updateEffectsInfo();
        scheduleSaveQuickDetectorSettings();
        scheduleSaveActiveEffectSettings();
      };

      if (chkAdvFaceShowBox) chkAdvFaceShowBox.addEventListener('change', () => onAdvFaceVisualChange('box'));
      if (chkAdvFaceShowBlur) chkAdvFaceShowBlur.addEventListener('change', () => onAdvFaceVisualChange('blur'));

      bindSlider(el, 'sldMaxFaces', 'valMaxFaces', v => {
        fd.maxFaces = v;
        if (fd.faceMesh) fd.faceMesh.setOptions({ maxNumFaces: v });
      });
      bindSlider(el, 'sldFacePixelation', 'valFacePixelation', v => {
        fd.pixelationCellSize = v;
        quickDetectorSettings.facePixelationCellSize = v;
        scheduleSaveQuickDetectorSettings();
      });
      bindSlider(el, 'sldFacePadding', 'valFacePadding', v => {
        fd.censorPaddingPercent = v;
        quickDetectorSettings.faceCensorPaddingPercent = v;
        scheduleSaveQuickDetectorSettings();
      });
      bindSlider(el, 'sldFaceThickness', 'valFaceThickness', v => fd.boxThickness = v);
      bindSlider(el, 'sldFaceInterval', 'valFaceInterval', v => {
        fd.processIntervalMs = clamp(Math.round(v), 16, 80);
      });
      bindSlider(el, 'sldFaceSmoothing', 'valFaceSmoothing', v => {
        fd.boxSmoothing = clamp(v / 100, 0, 0.95);
      });
      bindSlider(el, 'sldFaceHold', 'valFaceHold', v => {
        fd.detectionHoldMs = clamp(Math.round(v), 80, 300);
      });

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
          scheduleSaveQuickDetectorSettings();
          scheduleSaveActiveEffectSettings();
        });
        inpLabel.addEventListener('blur', e => {
          const normalized = normalizeFaceLabel(e.target.value);
          fd.labelText = normalized;
          quickDetectorSettings.faceLabelText = normalized;
          e.target.value = fd.labelText;
          updateQuickDetectorControlsUI();
          saveQuickDetectorSettings();
          saveActiveEffectSettings();
        });
      }

      const inpColor = el.querySelector('#inpFaceColor');
      const swatch = el.querySelector('#faceColorSwatch');
      if (inpColor && swatch) {
        inpColor.addEventListener('input', e => {
          fd.boxColor = e.target.value;
          quickDetectorSettings.faceBoxColor = e.target.value;
          swatch.style.background = e.target.value;
          updateQuickDetectorControlsUI();
          scheduleSaveQuickDetectorSettings();
          scheduleSaveActiveEffectSettings();
        });
      }

      el.querySelector('#chkShowLandmarks').addEventListener('change', e => {
        fd.showLandmarks = e.target.checked;
        scheduleSaveActiveEffectSettings();
      });
      syncFaceModeUI();
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
        ${slider('sldBlinkInterval', 'valBlinkInterval', 'Intervalo de análisis (ms)', bd.processIntervalMs, 16, 80)}
        ${slider('sldBlinkClosedFrames', 'valBlinkClosedFrames', 'Frames cerrados mínimos', bd.minClosedFrames, 1, 4)}
        ${slider('sldBlinkSmoothing', 'valBlinkSmoothing', 'Suavizado del párpado (%)', Math.round((bd._earSmoothing || 0) * 100), 0, 90)}
      </div>
    `);

    requestAnimationFrame(() => {
      const sld = el.querySelector('#sldEar');
      const val = el.querySelector('#valEar');
      sld.addEventListener('input', e => {
        bd.eyeArThreshold = parseFloat(e.target.value);
        val.textContent = bd.eyeArThreshold.toFixed(2);
        scheduleSaveActiveEffectSettings();
      });
      bindSlider(el, 'sldBlinkInterval', 'valBlinkInterval', v => {
        bd.processIntervalMs = clamp(Math.round(v), 16, 80);
      });
      bindSlider(el, 'sldBlinkClosedFrames', 'valBlinkClosedFrames', v => {
        bd.minClosedFrames = clamp(Math.round(v), 1, 4);
      });
      bindSlider(el, 'sldBlinkSmoothing', 'valBlinkSmoothing', v => {
        bd._earSmoothing = clamp(v / 100, 0, 0.9);
      });
    });

    return el;
  }

  // ─── UI Helpers ───
  function createSection(title, html) {
    const div = document.createElement('div');
    div.className = 'panel-section fade-in';
    div.innerHTML = `<div class="section-title accent">${escapeHtml(title)}</div><div class="effect-config">${html}</div>`;
    return div;
  }

  function slider(id, valId, label, value, min, max, step = 1) {
    const safeValue = toFiniteNumber(value, min);
    const safeMin = toFiniteNumber(min, 0);
    const safeMax = toFiniteNumber(max, safeMin);
    const safeStep = toFiniteNumber(step, 1);
    const displayVal = Number.isInteger(safeValue) ? safeValue : safeValue.toFixed(2);
    return `
      <div class="slider-group">
        <div class="slider-label">
          <span>${escapeHtml(label)}</span>
          <span class="value" id="${escapeHtml(valId)}">${escapeHtml(displayVal)}</span>
        </div>
        <input type="range" id="${escapeHtml(id)}" min="${safeMin}" max="${safeMax}" step="${safeStep}" value="${safeValue}">
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
      scheduleSaveActiveEffectSettings();
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
      if (config.face.showBox != null) quickDetectorSettings.faceShowBox = !!config.face.showBox;
      if (config.face.showBlur != null) quickDetectorSettings.faceShowBlur = !!config.face.showBlur;
      if (config.face.visualMode != null) {
        const legacy = faceFlagsFromVisualMode(config.face.visualMode);
        if (config.face.showBox == null) quickDetectorSettings.faceShowBox = legacy.showBox;
        if (config.face.showBlur == null) quickDetectorSettings.faceShowBlur = legacy.showBlur;
      }
      if (config.face.pixelationCellSize != null) {
        quickDetectorSettings.facePixelationCellSize = clamp(parseInt(config.face.pixelationCellSize, 10) || quickDetectorSettings.facePixelationCellSize, 4, 48);
      }
      if (config.face.censorPaddingPercent != null) {
        quickDetectorSettings.faceCensorPaddingPercent = clamp(parseInt(config.face.censorPaddingPercent, 10) || quickDetectorSettings.faceCensorPaddingPercent, 0, 48);
      }
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
      return;
    }
    if (e.key === 'Escape' && isMobileFxPanelVisible()) {
      setMobileFxPanelVisible(false);
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
      } = await buildPhotoBlobFromCanvas(
        pendingCapture.baseCanvas,
        enabled,
        strength
      );
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

  function updateCaptureCountdownUI() {
    if (!captureCountdown) return;
    captureCountdown.classList.toggle('hidden', !isPhotoCountdownActive);
    captureCountdown.classList.toggle('is-final', isPhotoCountdownActive && photoCountdownRemaining <= 1);
    if (captureCountdownValue) {
      captureCountdownValue.textContent = String(Math.max(1, photoCountdownRemaining));
    }
  }

  function cancelPhotoCountdown(showMessage = true) {
    if (photoCountdownTimer) {
      clearInterval(photoCountdownTimer);
      photoCountdownTimer = null;
    }
    const wasActive = isPhotoCountdownActive;
    isPhotoCountdownActive = false;
    photoCountdownRemaining = 0;
    updateCaptureCountdownUI();
    updateCaptureButtons();

    if (showMessage && wasActive) {
      showStatus(captureStatus, 'Temporizador cancelado', 'warning');
      setTimeout(() => hideStatus(captureStatus), 1400);
    }
  }

  function validatePhotoCaptureReady() {
    if (!isRunning) {
      showStatus(captureStatus, 'Primero encendé la cámara', 'warning');
      return false;
    }
    if (isCapturePreviewOpen()) {
      showStatus(captureStatus, 'Primero cerrá la vista previa actual', 'info');
      return false;
    }
    const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
    if (videoEl.readyState < 2 || sourceWidth <= 1 || sourceHeight <= 1) {
      showStatus(captureStatus, 'Esperá un momento y volvé a sacar la foto', 'info');
      return false;
    }
    return true;
  }

  function startPhotoCountdown(seconds) {
    cancelPhotoCountdown(false);
    isPhotoCountdownActive = true;
    photoCountdownRemaining = seconds;
    updateCaptureCountdownUI();
    updateCaptureButtons();
    showStatus(captureStatus, `Foto en ${seconds} segundos`, 'info');

    photoCountdownTimer = setInterval(() => {
      photoCountdownRemaining -= 1;
      if (photoCountdownRemaining <= 0) {
        clearInterval(photoCountdownTimer);
        photoCountdownTimer = null;
        isPhotoCountdownActive = false;
        updateCaptureCountdownUI();
        updateCaptureButtons();
        void takePhoto();
        return;
      }
      updateCaptureCountdownUI();
      showStatus(captureStatus, `Foto en ${photoCountdownRemaining} segundos`, 'info');
    }, 1000);
  }

  function requestPhotoCapture() {
    if (isPhotoCountdownActive) {
      cancelPhotoCountdown(true);
      return;
    }

    const timerSeconds = normalizeCaptureTimerSeconds(imageSettings.captureTimerSeconds);
    if (timerSeconds > 0) {
      if (!validatePhotoCaptureReady()) return;
      startPhotoCountdown(timerSeconds);
      return;
    }

    void takePhoto();
  }

  function updateCaptureButtons() {
    const previewOpen = isCapturePreviewOpen();
    const lockCaptureSettings = isRecording || previewOpen || isPhotoCountdownActive;
    const lockDetectorControls = previewOpen;

    if (btnTakePhoto) {
      btnTakePhoto.disabled = (!isRunning || isRecording || previewOpen) && !isPhotoCountdownActive;
      btnTakePhoto.innerHTML = isPhotoCountdownActive
        ? '<i class="fa-solid fa-xmark"></i> Cancelar timer'
        : '<i class="fa-solid fa-camera"></i> Sacar foto';
    }
    if (btnRecord) btnRecord.disabled = (!isRunning && !isRecording) || previewOpen || isPhotoCountdownActive;
    if (videoFormatSelect) videoFormatSelect.disabled = lockCaptureSettings;
    if (sldJpegQuality) sldJpegQuality.disabled = lockCaptureSettings;
    if (captureTimerSelect) captureTimerSelect.disabled = lockCaptureSettings;
    if (chkQualityEnhancer) chkQualityEnhancer.disabled = lockCaptureSettings;
    if (sldQualityEnhancerStrength) {
      sldQualityEnhancerStrength.disabled = lockCaptureSettings || !imageSettings.qualityEnhancer;
    }

    if (btnRecord) {
      if (isRecording) {
        btnRecord.classList.add('recording');
        btnRecord.innerHTML = '<i class="fa-solid fa-stop"></i> Detener';
      } else {
        btnRecord.classList.remove('recording');
        btnRecord.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Grabar';
      }
    }

    if (btnMobileTakePhoto) {
      btnMobileTakePhoto.disabled = (!isRunning || isRecording || previewOpen) && !isPhotoCountdownActive;
      btnMobileTakePhoto.classList.toggle('is-countdown', isPhotoCountdownActive);
      btnMobileTakePhoto.innerHTML = isPhotoCountdownActive
        ? '<i class="fa-solid fa-xmark"></i>'
        : '<i class="fa-solid fa-camera"></i>';
    }
    if (selMobileCaptureTimer) selMobileCaptureTimer.disabled = lockCaptureSettings;
    if (btnMobileEffectsDock) {
      btnMobileEffectsDock.disabled = previewOpen;
    }
    if (btnMobileRecord) {
      btnMobileRecord.disabled = (!isRunning && !isRecording) || previewOpen || isPhotoCountdownActive;
      btnMobileRecord.classList.toggle('is-recording', isRecording);
      btnMobileRecord.innerHTML = isRecording
        ? '<i class="fa-solid fa-stop"></i>'
        : '<i class="fa-solid fa-circle-dot"></i>';
    }
    if (btnMobileBlobToggle) btnMobileBlobToggle.disabled = lockDetectorControls;
    if (btnMobileFaceToggle) btnMobileFaceToggle.disabled = lockDetectorControls;
    if (btnMobileBlinkToggle) btnMobileBlinkToggle.disabled = lockDetectorControls;
    if (btnMobileColorPick) btnMobileColorPick.disabled = !chkBlobTracking.checked || !isRunning || lockDetectorControls;
    if (inpMobileBlobColor) inpMobileBlobColor.disabled = !chkBlobTracking.checked || lockDetectorControls;
    if (inpMobileFaceColor) inpMobileFaceColor.disabled = !chkFaceDetection.checked || lockDetectorControls;
    if (inpMobileFaceLabel) inpMobileFaceLabel.disabled = !chkFaceDetection.checked || lockDetectorControls;

    if (previewOpen) {
      setMobileFxPanelVisible(false);
    }
  }

  function canvasToBlobAsync(sourceCanvas, mimeType, quality) {
    return new Promise((resolve) => {
      sourceCanvas.toBlob((blob) => resolve(blob), mimeType, quality);
    });
  }

  function ensureRecordingCanvas() {
    if (!recordingCanvas) {
      recordingCanvas = document.createElement('canvas');
      recordingCtx = recordingCanvas.getContext('2d', { willReadFrequently: false });
    }

    const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
    const { width: recordingWidth, height: recordingHeight } = getEffectiveFrameDimensions(sourceWidth, sourceHeight);
    if (recordingCanvas.width !== recordingWidth || recordingCanvas.height !== recordingHeight) {
      recordingCanvas.width = recordingWidth;
      recordingCanvas.height = recordingHeight;
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
    const sourceFps = Number(cameraManager.getStreamSettings().frameRate);
    return clamp(Math.round(sourceFps || DEFAULT_CAMERA_FPS), 1, 120);
  }

  function normalizeVideoFps(value) {
    const fps = Number(value);
    if (!Number.isFinite(fps) || fps <= 0) return null;
    return clamp(Math.round(fps * 1000) / 1000, 1, 240);
  }

  function snapVideoSourceFps(value) {
    const fps = normalizeVideoFps(value);
    if (!fps) return null;
    let best = fps;
    let bestDiff = Infinity;
    for (const candidate of COMMON_VIDEO_FPS) {
      const diff = Math.abs(fps - candidate);
      if (diff < bestDiff && diff <= 0.08) {
        bestDiff = diff;
        best = candidate;
      }
    }
    return best;
  }

  function formatVideoFps(value) {
    const fps = normalizeVideoFps(value);
    if (!fps) return '—';
    return Number.isInteger(fps) ? String(fps) : fps.toFixed(3).replace(/\.?0+$/, '');
  }

  function formatVideoBitrate(value) {
    return `${(Math.max(0, Number(value) || 0) / 1_000_000).toFixed(1)} Mbps`;
  }

  function getVideoExportFps() {
    return normalizeVideoFps(videoSourceFps) || DEFAULT_CAMERA_FPS;
  }

  function readFpsFromCaptureStream(video) {
    if (typeof video.captureStream !== 'function') return null;
    const stream = video.captureStream();
    const track = stream.getVideoTracks()[0];
    const settingsFps = Number(track?.getSettings?.().frameRate);
    stream.getTracks().forEach((t) => t.stop());
    return snapVideoSourceFps(settingsFps);
  }

  function probeVideoFrameRate(video, calculateFrameRate) {
    if (typeof video.requestVideoFrameCallback !== 'function') return Promise.resolve(null);
    const savedTime = video.currentTime;
    const wasPaused = video.paused;
    let frameCount = 0;
    let callbackId = null;
    const mediaTimes = [];

    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => finish(calculateFrameRate(mediaTimes)), 3500);
      const finish = (fps) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (callbackId != null && typeof video.cancelVideoFrameCallback === 'function') {
          video.cancelVideoFrameCallback(callbackId);
        }
        video.pause();
        video.currentTime = savedTime;
        if (!wasPaused) void video.play().catch(() => {});
        resolve(snapVideoSourceFps(fps));
      };

      const onFrame = (_now, metadata) => {
        frameCount += 1;
        if (metadata && Number.isFinite(metadata.mediaTime)) {
          const previousTime = mediaTimes.at(-1);
          if (previousTime == null || metadata.mediaTime - previousTime > 0.0005) {
            mediaTimes.push(metadata.mediaTime);
          }
        }
        if (mediaTimes.length >= 25) {
          finish(calculateFrameRate(mediaTimes));
          return;
        }
        if (frameCount >= 120) {
          finish(calculateFrameRate(mediaTimes));
          return;
        }
        callbackId = video.requestVideoFrameCallback(onFrame);
      };

      void video.play().catch(() => finish(null));
      callbackId = video.requestVideoFrameCallback(onFrame);
    });
  }

  async function detectVideoSourceFps(video, calculateFrameRate) {
    const probed = await probeVideoFrameRate(video, calculateFrameRate);
    if (probed) return probed;

    const fromStream = readFpsFromCaptureStream(video);
    if (fromStream) return fromStream;

    const quality = video.getVideoPlaybackQuality?.();
    if (quality && video.currentTime > 0.2) {
      const measured = quality.totalVideoFrames / video.currentTime;
      const normalized = snapVideoSourceFps(measured);
      if (normalized) return normalized;
    }

    return DEFAULT_CAMERA_FPS;
  }

  function getRecommendedVideoBitrate(width, height, fps) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const safeFps = clamp(normalizeVideoFps(fps) || DEFAULT_CAMERA_FPS, 1, 240);
    const bitsPerPixelFrame = imageSettings.qualityEnhancer ? 0.22 : 0.18;
    const estimate = Math.round(safeWidth * safeHeight * safeFps * bitsPerPixelFrame);
    return Math.max(videoSourceAverageBitrate, clamp(estimate, 8000000, 80000000));
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

  function renderSourceFrameBuffer(applyQualityEnhancer = false) {
    if (videoEl.readyState < 2) return;

    ensureRecordingCanvas();
    if (!recordingCanvas || !recordingCtx) return;

    renderProcessedFrame(recordingCanvas, recordingCtx, 'recording');

    if (applyQualityEnhancer && imageSettings.qualityEnhancer) {
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

  function blitProcessedFrameToPreview() {
    if (!recordingCanvas || recordingCanvas.width === 0 || canvas.width === 0) return;
    ctx.drawImage(recordingCanvas, 0, 0, canvas.width, canvas.height);
  }

  function copyFrameToRecordingCanvas() {
    renderSourceFrameBuffer(true);
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
      };
    }

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = baseCanvas.width;
    exportCanvas.height = baseCanvas.height;
    const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: true });
    drawEnhancedFrameToContext(
      exportCtx,
      baseCanvas,
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
    };
  }

  async function buildPhotoCaptureSnapshot(enhancerEnabled, enhancerStrength) {
    const { sourceWidth, sourceHeight } = getSourceFrameDimensions();
    if (sourceWidth <= 1 || sourceHeight <= 1) {
      throw new Error('source_frame_unavailable');
    }

    const { width: captureWidth, height: captureHeight } = getEffectiveFrameDimensions(sourceWidth, sourceHeight);
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = captureWidth;
    baseCanvas.height = captureHeight;
    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
    renderProcessedFrame(baseCanvas, baseCtx, 'capture');

    const {
      blob,
      width,
      height,
    } = await buildPhotoBlobFromCanvas(baseCanvas, enhancerEnabled, enhancerStrength);
    return {
      blob,
      width,
      height,
      baseCanvas,
    };
  }

  async function takePhoto() {
    if (!validatePhotoCaptureReady()) return;

    try {
      const initialEnhancerEnabled = !!imageSettings.qualityEnhancer;
      const initialEnhancerStrength = imageSettings.qualityEnhancerStrength;
      const {
        blob, width, height, baseCanvas,
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
    if (isPhotoCountdownActive) {
      showStatus(captureStatus, 'Cancelá el temporizador antes de grabar', 'info');
      return;
    }
    if (!isRunning) {
      showStatus(captureStatus, 'Primero encendé la cámara', 'warning');
      return;
    }
    if (isCapturePreviewOpen()) {
      showStatus(captureStatus, 'Primero cierra la vista previa actual', 'info');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      showStatus(captureStatus, 'Tu navegador no soporta grabación', 'error');
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
        showStatus(captureStatus, 'Esperá un momento y reintentá la grabación', 'info');
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
      showStatus(captureStatus, 'No se pudo iniciar la grabación', 'error');
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
    setTimeout(() => URL.revokeObjectURL(url), 60000);
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
