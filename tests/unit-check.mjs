import assert from 'node:assert/strict';
import {
  getProcessingFrameDimensions,
  getPreviewFrameDimensions,
} from '../js/preview-metrics.mjs';
import {
  calculateExportBitrate,
  calculateFrameDurationUs,
  calculateExportFrameCount,
  calculateFrameRateFromMediaTimes,
  calculateFrameTimestampUs,
  calculateSourceAverageBitrate,
  canCopyAudioCodecToFormat,
  chooseEditorExportFormat,
  diagnoseVideoExportSupport,
  formatExportDebugInfo,
  formatObservedExportProgress,
  getWebmMuxerCodec,
  normalizeFrameRate,
  buildEditorExportPreflight,
  snapFrameRate,
  shouldAppendFinalFrame,
} from '../js/video-export.mjs';
import { CameraManager } from '../js/core/camera-manager.mjs';
import { VideoTimeline } from '../js/editor/video-timeline.mjs';
import { EditorHistory } from '../js/editor/editor-history.mjs';
import { BlobTracking } from '../js/effects/blob-tracking.mjs';
import { BlinkDetection } from '../js/effects/blink-detection.mjs';
import { FaceDetection } from '../js/effects/face-detection.mjs';
import { RENDER_PROFILES } from '../js/app/render-engine.mjs';
import { calculateTimelineTickInterval } from '../js/app/timeline-view.mjs';
import {
  DEFAULT_IMAGE_SETTINGS,
  PERFORMANCE_MODE_PRESETS,
  normalizePerformanceMode,
} from '../js/app/constants.mjs';
import { EditAssistController } from '../js/app/edit-assist-controller.mjs';
import { applyEffectsMixin } from '../js/app/effects.mjs';
import { applyCameraMixin } from '../js/app/camera.mjs';
import { applyRenderLoopMixin } from '../js/app/render.mjs';
import { applyLocalvideoeditorMixin } from '../js/app/video-editor.mjs';
import {
  estimateTempoFromSamples,
  extractMediaAudioSamples,
} from '../js/audio-tempo-analyzer.mjs';

function mockGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  };
}

async function checkCameraStreamCleanup() {
  let trackStopped = false;
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          trackStopped = true;
        },
      },
    ],
    getVideoTracks: () => [],
  };
  const navigator = {
    mediaDevices: {
      getUserMedia: async () => stream,
    },
  };
  const restoreNavigator = mockGlobal('navigator', navigator);
  try {
    const camera = new CameraManager();
    const video = {
      srcObject: null,
      play: async () => {
        const error = new Error('play_failed');
        error.name = 'NotAllowedError';
        throw error;
      },
    };

    const started = await camera.start(video);
    assert.equal(started, false);
    assert.equal(
      trackStopped,
      true,
      'failed playback must stop the acquired track',
    );
    assert.equal(camera.stream, null);
    assert.equal(video.srcObject, null);
    assert.equal(camera.isRunning(), false);
  } finally {
    restoreNavigator();
  }
}

function checkCameraPreservesSupportedFps() {
  const restoreNavigator = mockGlobal('navigator', {
    userAgent: '',
    mediaDevices: {},
  });
  let preferred;
  let requested;
  try {
    const camera = new CameraManager();
    preferred = camera._buildVideoConstraints();
    requested = camera._buildVideoConstraints(null, { fps: 30 });
  } finally {
    restoreNavigator();
  }

  assert.equal(
    preferred.video.frameRate.ideal,
    30,
    'camera should default to 30 FPS',
  );
  assert.equal(
    'max' in preferred.video.frameRate,
    false,
    'camera FPS must not be capped',
  );
  assert.equal(
    requested.video.frameRate.ideal,
    30,
    'an explicit camera FPS should be preserved',
  );
}

function checkReusableMorphologyBuffers() {
  let now = 0;
  let analysisCount = 0;
  const fakeContext = {
    drawImage() {},
    getImageData: (x, y, width, height) => {
      analysisCount++;
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
  };
  const document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => fakeContext,
    }),
  };
  const restoreDocument = mockGlobal('document', document);
  const restorePerformance = mockGlobal('performance', { now: () => now });
  const effect = new BlobTracking();
  effect._ensureBuffers(3, 3);

  const firstBuffer = effect._morphBufferA;
  const centroids = effect.centroids;
  const input = new Uint8Array(9).fill(255);
  effect._erode(input, firstBuffer, 3, 3);
  assert.deepEqual(Array.from(firstBuffer), [0, 0, 0, 0, 255, 0, 0, 0, 0]);

  effect._ensureBuffers(3, 3);
  assert.equal(
    effect._morphBufferA,
    firstBuffer,
    'same dimensions must reuse buffers',
  );
  effect.reset();
  assert.equal(
    effect.centroids,
    centroids,
    'reset must reuse the centroids array',
  );

  effect.setColorFromPixel(255, 0, 0);
  assert.equal(effect.targetColor, '#ff0000');
  assert.deepEqual(
    Array.from(effect.hsvMin),
    [150, 195, 195],
    'red selection must wrap the hue range',
  );
  assert.deepEqual(Array.from(effect.hsvMax), [30, 255, 255]);
  assert.equal(effect.setColorFromHex('#00c853'), true);
  assert.equal(effect.targetColor, '#00c853');
  assert.equal(effect.setColorFromHex('invalid'), false);

  const blob = { x: 0, y: 0, width: 20, height: 20, area: 400, cx: 10, cy: 10 };
  effect._stabilizeBlobs([blob], 0);
  const smoothed = effect._stabilizeBlobs([{ ...blob, x: 10, cx: 20 }], 30);
  assert.equal(
    smoothed[0].x,
    6.5,
    'box movement must stay responsive without jittering',
  );
  assert.equal(
    effect._stabilizeBlobs([], 100).length,
    1,
    'short detection gaps must not flicker',
  );
  assert.equal(
    effect._stabilizeBlobs([], 220).length,
    0,
    'stale detections must disappear',
  );
  effect.setConfig({ labelSize: 99 });
  assert.equal(
    effect.getConfig().labelSize,
    32,
    'blob label size must clamp high values',
  );
  effect.setConfig({ labelSize: 2 });
  assert.equal(
    effect.getConfig().labelSize,
    8,
    'blob label size must clamp low values',
  );

  effect.processFrame(fakeContext, { width: 100, height: 100 });
  now = 20;
  effect.processFrame(fakeContext, { width: 100, height: 100 });
  assert.equal(
    analysisCount,
    1,
    'blob analysis must be reused between video frames',
  );
  now = 50;
  effect.processFrame(fakeContext, { width: 100, height: 100 });
  assert.equal(
    analysisCount,
    2,
    'blob analysis must resume at its configured interval',
  );

  now = 100;
  effect.processFrame(fakeContext, { width: 640, height: 360 });
  const workSize = [effect._workW, effect._workH];
  now = 150;
  effect.processFrame(fakeContext, { width: 1600, height: 900 });
  assert.deepEqual(
    [effect._workW, effect._workH],
    workSize,
    'preview quality must not change detector resolution',
  );
  const previewAnalysisCount = analysisCount;
  now = 151;
  effect.processFrame(
    fakeContext,
    { width: 1600, height: 900 },
    null,
    RENDER_PROFILES.preview,
  );
  assert.equal(
    analysisCount,
    previewAnalysisCount,
    'preview profile must keep detector throttling',
  );
  effect.processFrame(
    fakeContext,
    { width: 1600, height: 900 },
    null,
    RENDER_PROFILES.export,
  );
  assert.equal(
    analysisCount,
    previewAnalysisCount + 1,
    'export profile must force per-frame analysis',
  );
  restorePerformance();
  restoreDocument();
}

function checkBlinkDetectionUsesRefinedEyeLandmarks() {
  let options;
  class FaceMesh {
    setOptions(value) {
      options = value;
    }
    onResults() {}
    initialize() {
      return Promise.resolve();
    }
  }
  const restoreFaceMesh = mockGlobal('FaceMesh', FaceMesh);
  const effect = new BlinkDetection();
  restoreFaceMesh();
  assert.equal(
    options.refineLandmarks,
    true,
    'blink detection needs refined eye landmarks',
  );
  assert.equal(
    effect.minClosedFrames,
    1,
    'blink response should not wait for extra frames',
  );
  assert.equal(
    effect._earSmoothing,
    0.35,
    'eye smoothing must prioritize low latency',
  );
}

async function checkBlinkCallbackClearsWhenBlobDisabled() {
  const app = {
    chkBlobTracking: { checked: false },
    blobTrackingEffect: {},
    blinkDetectionEffect: {
      callback: () => {},
      setBlinkCallback(callback) {
        this.callback = callback;
      },
    },
    effectManager: {
      removeEffect(effect) {
        assert.equal(effect, app.blobTrackingEffect);
      },
    },
    effectsInfo: { textContent: '' },
    colorPickSection: { classList: { add() {}, remove() {} } },
    syncQuickDetectorSettingsFromEffects() {},
    saveActiveEffectSettings() {},
    renderEffectConfig() {},
    updateEffectsInfo() {},
  };
  applyEffectsMixin(app);
  await app.toggleEffect('blob');
  assert.equal(app.blobTrackingEffect, null);
  assert.equal(
    app.blinkDetectionEffect.callback,
    null,
    'blink must stop calling color tracking when color detector is disabled',
  );
}

function checkFaceDetectionUsesRefinedEyeLandmarks() {
  let options;
  class FaceMesh {
    setOptions(value) {
      options = value;
    }
    onResults() {}
    initialize() {
      return Promise.resolve();
    }
  }
  const restoreDocument = mockGlobal('document', {
    createElement: () => ({ getContext: () => ({}) }),
  });
  const restoreFaceMesh = mockGlobal('FaceMesh', FaceMesh);
  const effect = new FaceDetection();
  restoreFaceMesh();
  restoreDocument();
  assert.equal(
    options.refineLandmarks,
    true,
    'shared face landmarks must preserve blink accuracy',
  );
  assert.equal(
    effect.processIntervalMs,
    30,
    'face analysis must refresh near video frame rate',
  );
  assert.equal(
    effect.boxSmoothing,
    0.5,
    'face boxes must respond without excessive lag',
  );
  assert.equal(
    effect.detectionHoldMs,
    120,
    'short gaps may be held without leaving stale boxes',
  );
  assert.equal(effect.showBox, true, 'face boxes must be enabled by default');
  assert.equal(effect.showBlur, false, 'face blur must be opt-in');
  effect.setConfig({ labelSize: 99 });
  assert.equal(
    effect.getConfig().labelSize,
    32,
    'face label size must clamp high values',
  );
  effect.setConfig({ labelSize: 2 });
  assert.equal(
    effect.getConfig().labelSize,
    8,
    'face label size must clamp low values',
  );
  effect.setConfig({ visualMode: 'hybrid' });
  assert.equal(effect.showBox, true, 'hybrid mode must keep box enabled');
  assert.equal(effect.showBlur, true, 'hybrid mode must keep blur enabled');
  assert.equal(
    effect.getConfig().visualMode,
    'hybrid',
    'legacy visualMode must stay compatible',
  );
  effect.setConfig({ showBox: false, showBlur: true });
  assert.equal(
    effect.getConfig().visualMode,
    'pixelate',
    'blur-only mode must map to pixelate',
  );
}

function checkVideoTimelineIntervals() {
  const timeline = new VideoTimeline(20);
  timeline.setTrim(2, 18);
  const look = timeline.add('look', 2, 8, { contrast: 120 });
  const face = timeline.add('face', 6, 10, { visualMode: 'pixelate' });

  assert.deepEqual(
    Array.from(timeline.activeAt(2), (item) => item.type),
    ['look'],
  );
  assert.deepEqual(
    Array.from(timeline.activeAt(6), (item) => item.type),
    ['look', 'face'],
  );
  assert.deepEqual(
    Array.from(timeline.activeAt(8), (item) => item.type),
    ['face'],
    'end boundaries must be exclusive',
  );
  assert.throws(() => timeline.add('look', 7, 9), /superponer/);
  timeline.add('look', 8, 9, { contrast: 90 });
  assert.throws(() => timeline.add('blink', 0, 3), /dentro del recorte/);
  assert.throws(() => timeline.setTrim(4, 16), /fuera del nuevo recorte/);

  timeline.upsert({ ...look, startTime: 3, endTime: 6 });
  timeline.remove(face.id);
  assert.equal(timeline.activeAt(6).length, 0);

  const [left, right] = timeline.split(look.id, 4);
  assert.equal(left.startTime, 3);
  assert.equal(left.endTime, 4);
  assert.equal(right.startTime, 4);
  assert.equal(right.endTime, 6);
  assert.equal(right.config.contrast, 120);
  assert.throws(() => timeline.split(right.id, 4.01), /dentro del clip/);

  const added = timeline.toggleMarker(5.123, 0.08);
  assert.equal(added.action, 'added');
  assert.equal(timeline.markers[0].time, 5.123);
  assert.equal(timeline.markers[0].kind, 'manual');
  assert.equal(timeline.markers[0].source, 'user');
  assert.ok(
    timeline.getSnapPoints().includes(5.123),
    'markers must be timeline snap points',
  );
  timeline.addMarkers([
    {
      time: 6,
      kind: 'beat',
      source: 'edit-assist',
      strength: 0.8,
      label: 'Beat',
    },
    {
      time: 8,
      kind: 'bar',
      source: 'edit-assist',
      strength: 0.9,
      label: 'Compás',
    },
  ]);
  assert.equal(timeline.getMarkersBySource('edit-assist').length, 2);
  const duplicate = timeline.addMarker({
    time: 6.005,
    kind: 'beat',
    source: 'edit-assist',
    strength: 0.3,
  });
  assert.equal(
    timeline.getMarkersBySource('edit-assist').length,
    2,
    'near duplicate edit-assist markers must be ignored',
  );
  assert.equal(duplicate.time, 6);
  const manualSameTime = timeline.addMarker({
    time: 6.005,
    kind: 'manual',
    source: 'user',
  });
  assert.equal(
    manualSameTime.source,
    'user',
    'manual markers are distinct from edit-assist markers',
  );
  assert.equal(timeline.markers.length, 4);
  assert.ok(
    timeline.getSnapPoints().includes(8),
    'edit-assist markers must be timeline snap points',
  );
  timeline.clearMarkersBySource('edit-assist');
  assert.equal(timeline.getMarkersBySource('edit-assist').length, 0);
  assert.equal(
    timeline.getMarkersBySource('user').length,
    2,
    'clearing edit-assist markers must keep user markers',
  );
  const removed = timeline.toggleMarker(5.16, 0.08);
  assert.equal(removed.action, 'removed');
  assert.equal(timeline.markers.length, 1);
}

function checkAudioTempoAnalyzer() {
  const sampleRate = 44100;
  const clickTrack = (bpm, duration = 8) => {
    const samples = new Float32Array(sampleRate * duration);
    const period = 60 / bpm;
    for (let beat = 0; beat < duration / period; beat++) {
      const start = Math.round(beat * period * sampleRate);
      for (
        let index = 0;
        index < 900 && start + index < samples.length;
        index++
      ) {
        samples[start + index] = Math.max(
          samples[start + index] || 0,
          1 - index / 900,
        );
      }
    }
    return samples;
  };

  const samples = clickTrack(120);
  const result = estimateTempoFromSamples(samples, sampleRate);
  assert.ok(
    Math.abs(result.bpm - 120) <= 2,
    `120 BPM pulses should be detected, got ${result.bpm}`,
  );
  assert.ok(
    result.confidence > 0.3,
    'clear pulses should produce usable confidence',
  );
  assert.ok(
    result.beats.length >= 14,
    'clear pulses should produce beat markers',
  );

  const slower = estimateTempoFromSamples(clickTrack(90), sampleRate);
  assert.ok(
    Math.abs(slower.bpm - 90) <= 2,
    `90 BPM pulses should be detected, got ${slower.bpm}`,
  );

  const normalized = estimateTempoFromSamples(clickTrack(45), sampleRate, {
    minBpm: 80,
    maxBpm: 180,
  });
  assert.ok(
    Math.abs(normalized.bpm - 90) <= 2,
    `45 BPM pulses should normalize into range, got ${normalized.bpm}`,
  );

  const silent = estimateTempoFromSamples(
    new Float32Array(sampleRate * 2),
    sampleRate,
  );
  assert.equal(silent.bpm, 0);
  assert.equal(silent.confidence, 0);
  assert.equal(silent.beats.length, 0);

  const empty = estimateTempoFromSamples(new Float32Array(), sampleRate);
  assert.equal(empty.bpm, 0);
  assert.equal(empty.confidence, 0);
  assert.equal(empty.beats.length, 0);
}

function checkEditAssistManualControls() {
  const timeline = new VideoTimeline(10);
  timeline.addMarker({ time: 3, source: 'user' });
  const controller = new EditAssistController({
    getSourceFile: () => ({}),
    getTimeline: () => timeline,
    isExporting: () => false,
    getElements: () => ({}),
    pushHistory() {},
    renderTimeline() {},
    updateTimelineHint() {},
  });
  controller.result = {
    bpm: 120,
    confidence: 0.8,
    beats: [{ time: 0.2, strength: 1 }],
  };
  controller.manualBpm = 120;

  controller.scaleBpm(0.5);
  assert.equal(controller.effectiveBpm, 60, 'half BPM control should apply');
  controller.scaleBpm(2);
  assert.equal(controller.effectiveBpm, 120, 'double BPM control should apply');
  controller.shiftOffset(10);
  controller.applyMarkers(8);

  const generated = timeline.getMarkersBySource('edit-assist');
  assert.equal(controller.markerStep, 8);
  assert.equal(generated[0].time, 0.21, 'offset should move generated grid');
  assert.equal(generated.length, 3, 'density 8 should keep every 8th beat');
  assert.equal(
    timeline.getMarkersBySource('user').length,
    1,
    'Edit Assist must not delete manual markers',
  );

  controller.clearMarkers();
  assert.equal(timeline.getMarkersBySource('edit-assist').length, 0);
  assert.equal(timeline.getMarkersBySource('user').length, 1);
}

async function checkMediaAudioExtraction() {
  const sampleRate = 44100;
  const frames = sampleRate;
  const channels = 2;
  const data = new Float32Array(frames * channels);
  for (let beat = 0; beat < 2; beat++) {
    const start = Math.round(beat * 0.5 * sampleRate);
    for (let index = 0; index < 900; index++) {
      const value = 1 - index / 900;
      data[(start + index) * channels] = value;
      data[(start + index) * channels + 1] = value;
    }
  }
  class FakeSample {
    constructor() {
      this.sampleRate = sampleRate;
      this.numberOfFrames = frames;
      this.numberOfChannels = channels;
      this.closed = false;
    }
    allocationSize() {
      return data.byteLength;
    }
    copyTo(destination) {
      destination.set(data);
    }
    close() {
      this.closed = true;
    }
  }
  class BlobSource {
    constructor(file) {
      this.file = file;
    }
  }
  class Input {
    constructor() {
      this.disposed = false;
    }
    async canRead() {
      return true;
    }
    async getPrimaryAudioTrack() {
      return {};
    }
    dispose() {
      this.disposed = true;
    }
  }
  class AudioSampleSink {
    async *samples() {
      yield new FakeSample();
    }
  }
  const extracted = await extractMediaAudioSamples(new Blob(['video']), {
    mediaModule: { Input, BlobSource, ALL_FORMATS: [], AudioSampleSink },
  });
  assert.equal(extracted.sampleRate, sampleRate);
  assert.equal(extracted.samples.length, frames);
  assert.ok(
    extracted.samples.some((value) => value > 0.9),
    'decoded media samples must be mixed to mono',
  );
}

function checkStableExportDefaults() {
  assert.equal(DEFAULT_IMAGE_SETTINGS.editorExportFormat, 'webm');
  assert.equal(DEFAULT_IMAGE_SETTINGS.editorCopyAudio, false);
  assert.equal(DEFAULT_IMAGE_SETTINGS.experimentalExportFeatures, false);
}

function checkEditorExportPresets() {
  const app = {
    imageSettings: { ...DEFAULT_IMAGE_SETTINGS },
    updateImageControlsUI() {},
    updateVideoEditorUI() {},
    saveImageSettings() {},
  };
  applyLocalvideoeditorMixin(app);
  app.updateImageControlsUI = () => {};
  app.updateVideoEditorUI = () => {};
  app.saveImageSettings = () => {};
  app.applyEditorExportPreset('experimental-mp4');
  assert.equal(app.imageSettings.editorExportPreset, 'experimental-mp4');
  assert.equal(app.imageSettings.experimentalExportFeatures, true);
  assert.equal(app.imageSettings.editorExportFormat, 'mp4');
  assert.equal(app.imageSettings.editorCopyAudio, true);

  app.applyEditorExportPreset('chroma');
  assert.equal(app.imageSettings.editorExportMode, 'effects-chroma');
  assert.equal(app.imageSettings.editorExportFormat, 'webm');
  assert.equal(app.imageSettings.editorCopyAudio, false);
}

function checkTimelineClipSnappingHelper() {
  const app = {
    videoTimeline: {
      trimStart: 0,
      trimEnd: 10,
      duration: 10,
      markers: [{ id: 'm1', time: 2.5 }],
      items: [{ id: 'a', type: 'blob', startTime: 1, endTime: 4 }],
      getSnapPoints() {
        return [this.trimStart, this.trimEnd, this.markers[0].time, 1, 4];
      },
    },
    videoEl: { currentTime: 6 },
    chkTimelineSnap: { checked: true },
    timelineZoom: 1,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  };
  applyLocalvideoeditorMixin(app);
  assert.deepEqual(
    app.resolveTimelineClipTimes({
      type: 'blob',
      startTime: 4.04,
      endTime: 7.04,
    }),
    { startTime: 4, endTime: 7 },
    'new clips must snap to the nearest same-track edge',
  );
  assert.deepEqual(
    app.resolveTimelineClipTimes({
      type: 'face',
      startTime: 5.9,
      endTime: 7.9,
    }),
    { startTime: 6, endTime: 8 },
    'new clips must snap to the playhead when it is closer',
  );
  assert.equal(
    app.snapTimelineTime(2.46),
    2.5,
    'timeline cursor must snap to markers',
  );
  assert.deepEqual(
    app.getTimelineRowStyle(2),
    { top: 'calc(2 * 20%)', height: '20%' },
    'timeline clips must fill the full effect row height',
  );
}

function checkTimelineMarkerIntervalsForInsertion() {
  const timeline = new VideoTimeline(10);
  timeline.addMarkers([
    { time: 1, kind: 'beat', source: 'edit-assist' },
    { time: 1.5, kind: 'beat', source: 'edit-assist' },
    { time: 2, kind: 'beat', source: 'edit-assist' },
  ]);
  const app = {
    videoTimeline: timeline,
    videoEl: { currentTime: 0 },
    chkTimelineSnap: { checked: true },
    timelineZoom: 1,
    DEFAULT_TIMELINE_EFFECT_DURATION: 3,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  };
  applyLocalvideoeditorMixin(app);
  assert.deepEqual(
    app.resolveTimelineInsertionTimes({
      type: 'blob',
      anchorTime: 1.2,
      duration: 3,
    }),
    { startTime: 1, endTime: 1.5 },
    'new clips dropped on tempo markers should fill the marker interval',
  );
}

function checkTimelineClipboardBasics() {
  const timeline = new VideoTimeline(10);
  const look = timeline.add('look', 1, 2, { contrast: 120 });
  const app = {
    videoTimeline: timeline,
    videoSourceFile: {},
    videoEl: { currentTime: 5 },
    selectedVideoEffectId: look.id,
    selectedVideoEffectIds: new Set([look.id]),
    timelineHistorySuspended: false,
    editorHistory: { push() {} },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    updateEditorHistoryButtons() {},
    renderVideoTimeline() {},
    updateVideoEffectInspector() {},
    syncVideoTimelineEffects() {},
    showStatus() {},
  };
  applyLocalvideoeditorMixin(app);
  app.copySelectedVideoEffects(false);
  app.pasteVideoEffects(false);
  assert.equal(timeline.items.length, 2, 'paste should add a copied clip');
  assert.equal(timeline.items[1].startTime, 5);
  assert.equal(timeline.items[1].endTime, 6);
  assert.deepEqual(timeline.items[1].config, { contrast: 120 });
}

function checkProjectJsonRoundTrip() {
  const timeline = new VideoTimeline(12);
  timeline.setTrim(1, 10);
  timeline.add('look', 2, 4, { contrast: 120 });
  timeline.addMarker({ time: 3, kind: 'bar', source: 'edit-assist' });
  const app = {
    videoSourceFile: { name: 'clip.mp4', size: 1234 },
    videoTimeline: timeline,
    videoEl: { videoWidth: 1920, videoHeight: 1080 },
    videoSourceFps: 29.97,
    imageSettings: { ...DEFAULT_IMAGE_SETTINGS, editorExportMode: 'webm' },
    editAssist: {
      toJSON: () => ({
        bpm: 128,
        confidence: 0.72,
        offset: 0.184,
        markerStep: 4,
        generatedAt: 1,
      }),
    },
  };
  applyLocalvideoeditorMixin(app);
  const project = JSON.parse(JSON.stringify(app.buildEditorProjectData()));
  assert.equal(project.version, 1);
  assert.equal(project.source.name, 'clip.mp4');
  assert.equal(project.trim.start, 1);
  assert.equal(project.timeline.items.length, 1);
  assert.equal(project.editAssist.bpm, 128);

  const restored = VideoTimeline.fromJSON(
    { ...project.timeline, trim: project.trim },
    project.source.duration,
  );
  assert.equal(restored.trimStart, 1);
  assert.equal(restored.trimEnd, 10);
  assert.equal(restored.items[0].config.contrast, 120);
  assert.equal(restored.markers[0].source, 'edit-assist');
  assert.throws(() =>
    VideoTimeline.fromJSON(
      { items: [{ type: 'look', startTime: 4, endTime: 2 }] },
      10,
    ),
  );
}

function checkBeatReactiveAutomation() {
  const timeline = new VideoTimeline(8);
  timeline.addMarkers([
    { time: 1, kind: 'beat', source: 'edit-assist' },
    { time: 2, kind: 'beat', source: 'edit-assist' },
  ]);
  const app = {
    videoTimeline: timeline,
    DEFAULT_IMAGE_SETTINGS,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  };
  applyLocalvideoeditorMixin(app);
  const clip = {
    startTime: 0,
    endTime: 4,
    config: { automation: 'beat-pulse' },
  };
  assert.equal(app.getTimelineAutomationIntensity(clip, 1), 1);
  assert.ok(app.getTimelineAutomationIntensity(clip, 1.22) < 0.001);
  assert.equal(
    app.getTimelineAutomationIntensity(
      { ...clip, config: { automation: 'alternate-beat' } },
      2.1,
    ),
    0,
  );
  assert.equal(
    app.getTimelineAutomationIntensity(
      { ...clip, config: { automation: 'fade-in' } },
      2,
    ),
    0.5,
  );
  assert.equal(
    app.applyLookAutomation(
      { ...DEFAULT_IMAGE_SETTINGS, contrast: 100 },
      { contrast: 180, automation: 'fade-in' },
      { startTime: 0, endTime: 4, config: { automation: 'fade-in' } },
      2,
    ).contrast,
    140,
  );
}

function checkSplitAllEffectsAtMarkers() {
  const timeline = new VideoTimeline(10);
  timeline.add('look', 0, 10, { contrast: 120 });
  timeline.add('face', 2, 8, { showBox: true });
  timeline.addMarker({ time: 3 });
  timeline.addMarker({ time: 6 });
  const app = {
    videoTimeline: timeline,
    videoSourceFile: {},
    isVideoExporting: false,
    selectedVideoEffectId: '',
    selectedVideoEffectIds: new Set(),
    timelineHistorySuspended: false,
    editorHistory: { push() {} },
    updateEditorHistoryButtons() {},
    renderVideoTimeline() {},
    updateVideoEffectInspector() {},
    updateAdjustmentsPanelState() {},
    updateEffectTrackHighlight() {},
    syncVideoTimelineEffects() {},
    showStatus() {},
    hideStatus() {},
  };
  applyLocalvideoeditorMixin(app);
  app.splitAllEffectsAtMarkers();
  assert.equal(timeline.items.length, 6);
  assert.deepEqual(
    Array.from(
      timeline.items,
      (item) => `${item.type}:${item.startTime}-${item.endTime}`,
    ),
    ['look:0-3', 'face:2-3', 'look:3-6', 'face:3-6', 'look:6-10', 'face:6-8'],
  );
}

async function checkSequentialExportAdvance() {
  let pauseCalls = 0;
  const app = {
    videoExportPlayback: { playbackRate: 4 },
    videoEl: {
      currentTime: 0,
      ended: false,
      playbackRate: 4,
      pause() {
        pauseCalls += 1;
      },
    },
    isVideoExporting: true,
    seekCalls: 0,
    playCalls: 0,
    waitCalls: 0,
  };
  applyLocalvideoeditorMixin(app);
  app.seekVideoForExport = async () => {
    app.seekCalls += 1;
  };
  app.waitForExportVideoFrame = async () => {
    app.waitCalls += 1;
  };
  app.playVideoUntilExportTime = async () => {
    app.playCalls += 1;
  };
  await app.advanceVideoForExport(0, 24, 0);
  await app.advanceVideoForExport(1 / 24, 24, 1);
  app.videoEl.currentTime = 1 / 24;
  await app.advanceVideoForExport(1 / 24, 24, 2);
  app.videoEl.currentTime = 0.2;
  await app.advanceVideoForExport(2 / 24, 24, 3);
  assert.equal(
    app.seekCalls,
    1,
    'only the first export frame should require an absolute seek',
  );
  assert.equal(app.playCalls, 1, 'later frames should advance sequentially');
  assert.equal(
    app.waitCalls,
    0,
    'sequential export should not wait for an extra frame after every step',
  );
  assert.equal(
    app.videoExportSkippedFrames,
    1,
    'overshot frames should be reused instead of forcing a late seek',
  );
  assert.equal(
    app.videoExportPlayback.playbackRate,
    1,
    'overshot export playback must fall back to realtime',
  );
  assert.equal(
    app.videoEl.playbackRate,
    1,
    'overshot export playback must update the video element rate',
  );
  assert.equal(
    pauseCalls,
    1,
    'overshot export playback must pause before reusing the current frame',
  );
}

async function checkExportPlaybackPausesAtTarget() {
  let pauseCalls = 0;
  const app = {
    isVideoExporting: true,
    videoExportPlayback: { playbackRate: 4 },
    videoEl: {
      currentTime: 1,
      ended: false,
      playbackRate: 1,
      pause() {
        pauseCalls += 1;
      },
      play: async () => {},
      addEventListener() {},
      removeEventListener() {},
    },
  };
  applyLocalvideoeditorMixin(app);
  await app.playVideoUntilExportTime(1, 0.01);
  assert.equal(
    pauseCalls,
    1,
    'export playback must pause as soon as the target frame is reached',
  );
}

async function checkExportSeekFallsBackWhenSeekedIsMissing() {
  let currentTime = 4;
  let waited = false;
  let fastSeekCalled = false;
  const app = {
    videoTimeline: { duration: 10 },
    videoEl: {
      readyState: 2,
      get currentTime() {
        return currentTime;
      },
      set currentTime(value) {
        currentTime = value;
      },
      fastSeek() {
        fastSeekCalled = true;
      },
      addEventListener() {},
      removeEventListener() {},
    },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  };
  applyLocalvideoeditorMixin(app);
  app.waitForExportVideoFrame = async () => {
    waited = true;
  };
  await app.seekVideoForExport(0);
  assert.equal(currentTime, 0);
  assert.equal(
    fastSeekCalled,
    false,
    'export seek must request exact timestamps instead of fastSeek keyframes',
  );
  assert.equal(
    waited,
    true,
    'export seek should continue if the media time lands but seeked is not emitted',
  );
}

async function checkExportPrepareRecoversDecodeFailure() {
  const app = {
    videoSourceFile: {},
    videoExportTotalFrames: 10,
    videoExportRecoveredSource: false,
    videoEl: {
      currentTime: 0,
      muted: false,
      playbackRate: 1,
      pause() {},
    },
    seekCalls: 0,
    recoveredAt: null,
    getVideoExportFps: () => 24,
    updateVideoExportProgress() {},
  };
  applyLocalvideoeditorMixin(app);
  app.seekVideoForExport = async () => {
    app.seekCalls += 1;
    if (app.seekCalls === 1) throw new Error('video_decode_failed');
  };
  app.recoverVideoSourceForExport = async (time) => {
    app.videoExportRecoveredSource = true;
    app.recoveredAt = time;
  };
  await app.prepareSequentialVideoExport(2);
  assert.equal(app.seekCalls, 2);
  assert.equal(app.recoveredAt, 2);
  assert.equal(app.videoEl.playbackRate, 4);
  assert.equal(app.videoEl.muted, true);
}

function checkVideoSeekAvoidsExactDuration() {
  let currentTime = 0;
  let scheduled = 0;
  const app = {
    videoSourceFile: {},
    isVideoExporting: false,
    videoTimeline: { trimStart: 0, trimEnd: 10, duration: 10 },
    videoEl: {
      duration: 10,
      get currentTime() {
        return currentTime;
      },
      set currentTime(value) {
        currentTime = value;
      },
    },
    animFrameId: null,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    updateVideoTransport() {},
    scheduleRenderLoop() {
      scheduled += 1;
    },
  };
  applyLocalvideoeditorMixin(app);
  app.seekVideo(10);
  assert.ok(
    currentTime < 10,
    'timeline-end seeks must avoid the exact media duration',
  );
  assert.ok(
    Math.abs(currentTime - 9.999) < 1e-9,
    'timeline-end seeks should land on the playable final timestamp',
  );
  assert.equal(scheduled, 1);
}

function checkPausedVideoPreviewUsesAnimationFrame() {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  let rafCalls = 0;
  let cancelled = 0;
  globalThis.requestAnimationFrame = () => {
    rafCalls += 1;
    return 41;
  };
  globalThis.cancelAnimationFrame = (id) => {
    cancelled = id;
  };
  try {
    const app = {
      canvas: { width: 1, height: 1 },
      ctx: {},
      frameCount: 0,
      isPageVisible: true,
      isRunning: true,
      isVideoExporting: false,
      lastFpsTime: performance.now(),
      sourceMode: 'video',
      videoTimeline: { trimEnd: 10, duration: 10 },
      videoEl: {
        currentTime: 0,
        paused: true,
        readyState: 2,
        requestVideoFrameCallback() {
          throw new Error('paused video should not wait for a video frame');
        },
        cancelVideoFrameCallback() {},
      },
      fpsInfo: { textContent: '' },
    };
    applyRenderLoopMixin(app);
    app.syncVideoTimelineLookNow = () => {};
    app.syncVideoTimelineDetectors = () => {};
    app.syncPreviewCanvasMetrics = () => {};
    app.renderProcessedFrame = () => {};
    app.updateVideoTransport = () => {};
    app.scheduleRenderLoop();
    assert.equal(app.animFrameType, 'animation');
    assert.equal(rafCalls, 1);
    app.cancelRenderLoop();
    assert.equal(cancelled, 41);
    rafCalls = 0;
    app.animFrameId = 43;
    app.animFrameType = 'animation';
    app.refreshPausedVideoPreview();
    assert.equal(
      cancelled,
      43,
      'paused preview refresh must cancel stale renders after seeked',
    );
    assert.equal(
      rafCalls,
      1,
      'paused preview refresh must schedule one fresh render after seeked',
    );
    let scheduled = 0;
    app.animFrameId = 42;
    app.animFrameType = 'animation';
    app.scheduleRenderLoop = () => {
      scheduled += 1;
    };
    app.videoEl.currentTime = 10;
    let pauseCalls = 0;
    app.videoEl.pause = () => {
      pauseCalls += 1;
    };
    app.renderLoop();
    assert.equal(app.animFrameId, null);
    assert.equal(
      scheduled,
      0,
      'paused video preview should render once, not spin forever',
    );
    assert.equal(
      app.videoEl.currentTime,
      10,
      'paused video preview at the end must not re-seek every render',
    );
    assert.equal(
      pauseCalls,
      0,
      'paused video preview at the end must not pause repeatedly',
    );
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
}

async function checkVideoPlaybackRestartsFromEnd() {
  let currentTime = 9.999;
  let cancelled = 0;
  let scheduled = 0;
  const app = {
    videoSourceFile: {},
    isVideoExporting: false,
    animFrameId: 77,
    videoTimeline: { trimStart: 0, trimEnd: 10, duration: 10 },
    videoEl: {
      paused: true,
      duration: 10,
      get currentTime() {
        return currentTime;
      },
      set currentTime(value) {
        currentTime = value;
      },
      play: async () => {},
    },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    cancelRenderLoop() {
      cancelled += 1;
      this.animFrameId = null;
    },
    scheduleRenderLoop() {
      scheduled += 1;
      this.animFrameId = 78;
    },
    updateVideoTransport() {},
    showStatus() {},
  };
  applyLocalvideoeditorMixin(app);
  await app.toggleVideoPlayback();
  assert.equal(
    cancelled,
    1,
    'playing from the end must cancel stale preview renders',
  );
  assert.equal(
    currentTime,
    0,
    'playing from the end must return to trim start',
  );
  assert.equal(
    scheduled,
    1,
    'playing from the end must schedule a fresh render',
  );
}

async function checkExportPlaybackRateRestores() {
  const app = {
    videoEl: {
      playbackRate: 1.25,
      muted: false,
      readyState: 2,
      currentTime: 0,
      duration: 10,
      pause() {},
      addEventListener() {},
      removeEventListener() {},
    },
    videoTimeline: { duration: 10 },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    videoExportSession: {
      stop() {},
      releaseWakeLock: async () => {},
    },
    videoExportProgress: { value: 0 },
    videoExportModal: { classList: { add() {} } },
    isRunning: false,
    videoSourceFile: null,
    updateVideoEditorUI() {},
    updateVideoTransport() {},
    deactivateModalFocusTrap() {},
    waitForExportVideoFrame: async () => {},
  };
  applyLocalvideoeditorMixin(app);
  app.updateVideoEditorUI = () => {};
  app.updateVideoTransport = () => {};
  await app.prepareSequentialVideoExport(0);
  assert.equal(
    app.videoEl.playbackRate,
    4,
    'sequential export should decode faster than realtime',
  );
  assert.equal(app.videoEl.muted, true);
  app.cleanupVideoExport(false);
  assert.equal(
    app.videoEl.playbackRate,
    1.25,
    'export cleanup must restore original playbackRate',
  );
  assert.equal(
    app.videoEl.muted,
    false,
    'export cleanup must restore muted state',
  );
}

async function checkExportTimelineDetectorToggleIsQuiet() {
  const calls = [];
  const effect = {};
  const app = {
    isVideoExporting: true,
    chkBlobTracking: { checked: true },
    chkFaceDetection: { checked: false },
    chkBlinkDetection: { checked: false },
    blobTrackingEffect: effect,
    blinkDetectionEffect: {
      setBlinkCallback: () => calls.push('blink-callback'),
    },
    effectManager: {
      removeEffect(removed) {
        assert.equal(removed, effect);
        calls.push('remove');
      },
    },
    colorPickSection: {
      classList: {
        add() {
          calls.push('color-ui');
        },
        remove() {},
      },
    },
    syncQuickDetectorSettingsFromEffects() {
      calls.push('sync-settings');
    },
    saveActiveEffectSettings() {
      calls.push('save-settings');
    },
    renderEffectConfig() {
      calls.push('render-config');
    },
    updateEffectsInfo() {
      calls.push('effects-info');
    },
  };
  applyEffectsMixin(app);
  applyLocalvideoeditorMixin(app);
  await app.setTimelineDetector('blob', null);
  assert.equal(app.chkBlobTracking.checked, false);
  assert.equal(app.blobTrackingEffect, null);
  assert.deepEqual(
    calls,
    ['remove', 'blink-callback', 'color-ui'],
    'export detector toggles must skip storage and heavy UI refresh',
  );
}

function checkEditorHistoryUndoRedo() {
  const history = new EditorHistory();
  const timeline = new VideoTimeline(12);
  timeline.setTrim(1, 11);
  timeline.add('look', 2, 5, { contrast: 110 });
  timeline.toggleMarker(6, 0.08);
  history.push(timeline);
  timeline.setTrim(2, 10);
  timeline.items[0].startTime = 3;
  timeline.markers[0].time = 7;
  assert.ok(history.undo(timeline));
  assert.equal(timeline.trimStart, 1);
  assert.equal(timeline.items[0].startTime, 2);
  assert.equal(timeline.markers[0].time, 6);
  assert.ok(history.redo(timeline));
  assert.equal(timeline.trimStart, 2);
  assert.equal(timeline.items[0].startTime, 3);
  assert.equal(timeline.markers[0].time, 7);
}

function checkPreviewProcessingResolutionContract() {
  const sourceWidth = 1920;
  const sourceHeight = 1080;
  const processing = getProcessingFrameDimensions(sourceWidth, sourceHeight);
  const draftPreview = getPreviewFrameDimensions(
    sourceWidth,
    sourceHeight,
    'draft',
  );
  const fullPreview = getPreviewFrameDimensions(
    sourceWidth,
    sourceHeight,
    'full',
  );

  assert.equal(
    processing.width,
    sourceWidth,
    'processing width must match source',
  );
  assert.equal(
    processing.height,
    sourceHeight,
    'processing height must match source',
  );
  assert.equal(
    fullPreview.width,
    sourceWidth,
    'full preview must match source',
  );
  assert.equal(
    fullPreview.height,
    sourceHeight,
    'full preview must match source',
  );
  assert.ok(
    draftPreview.width < processing.width,
    'draft preview must downscale display width',
  );
  assert.ok(
    draftPreview.height < processing.height,
    'draft preview must downscale display height',
  );
  assert.notDeepEqual(
    [draftPreview.width, draftPreview.height],
    [fullPreview.width, fullPreview.height],
    'preview quality must still change display resolution',
  );
}

function checkVideoExportTimingAndQuality() {
  for (const fps of [23.976, 24, 25, 29.97, 30, 59.94, 60]) {
    const duration = 10;
    const frameCount = calculateExportFrameCount(duration, fps);
    const encodedDuration =
      calculateFrameTimestampUs(frameCount, fps) / 1_000_000;
    assert.ok(
      Math.abs(encodedDuration - duration) <= 1 / fps,
      `${fps} FPS duration must stay within one frame`,
    );
    assert.equal(
      calculateFrameTimestampUs(1, fps),
      Math.round(1_000_000 / fps),
    );
    assert.ok(
      calculateFrameDurationUs(0, fps) > 0,
      `${fps} FPS frame duration must be positive`,
    );
  }

  assert.equal(calculateSourceAverageBitrate(10_000_000, 10), 8_000_000);
  assert.equal(calculateSourceAverageBitrate(0, 10), 0);
  assert.equal(calculateExportBitrate(12_000_000, 1920, 1080, 30), 12_000_000);
  assert.ok(calculateExportBitrate(1_000_000, 3840, 2160, 60) > 1_000_000);
  assert.equal(getWebmMuxerCodec('vp09.00.10.08'), 'V_VP9');
  assert.equal(getWebmMuxerCodec('vp8'), 'V_VP8');
  assert.equal(normalizeFrameRate('24'), 24);
  assert.equal(normalizeFrameRate(0), null);
  assert.equal(snapFrameRate(23.98), 23.976);
  assert.equal(snapFrameRate(24.04), 24);
  assert.equal(
    calculateFrameRateFromMediaTimes([0, 1 / 24, 2 / 24, 3 / 24]),
    24,
  );
  assert.equal(
    calculateFrameRateFromMediaTimes([0, 1 / 24, 2 / 24, 2 / 24, 3 / 24]),
    24,
  );
  assert.equal(calculateFrameRateFromMediaTimes([0]), null);
  assert.equal(
    shouldAppendFinalFrame(10, 30, 300),
    false,
    'exact frame-grid exports must not append a duplicate final frame',
  );
  assert.equal(
    shouldAppendFinalFrame(10.01, 30, 300),
    true,
    'non-grid durations may append a final duration marker',
  );
  const fast = buildEditorExportPreflight({
    preset: 'fast',
    width: 3840,
    height: 2160,
    sourceFps: 60,
    duration: 10,
  });
  assert.deepEqual([fast.width, fast.height, fast.fps], [1280, 720, 30]);
  assert.equal(fast.format, 'webm');
  assert.equal(fast.copyAudio, false);

  const high = buildEditorExportPreflight({
    preset: 'high',
    width: 3840,
    height: 2160,
    sourceFps: 120,
    duration: 10,
  });
  assert.deepEqual([high.width, high.height, high.fps], [3840, 2160, 60]);
  assert.equal(high.risk.level, 'high');

  const mp4 = buildEditorExportPreflight({
    preset: 'experimental-mp4',
    width: 2560,
    height: 1440,
    sourceFps: 60,
    duration: 10,
  });
  assert.deepEqual([mp4.width, mp4.height, mp4.fps], [1920, 1080, 30]);
  assert.equal(mp4.format, 'mp4');
  assert.equal(mp4.copyAudio, true);

  const blocked = buildEditorExportPreflight({
    preset: 'balanced',
    width: 1920,
    height: 1080,
    sourceFps: 30,
    duration: 1300,
  });
  assert.equal(blocked.blocked, true);
  assert.equal(
    formatExportDebugInfo({
      stage: 'encode',
      done: 3,
      total: 10,
      fps: 30,
      time: 0.1,
      width: 640,
      height: 360,
      queueSize: 2,
    }),
    'stage:encode · frame:3/10 · fps:30 · t:0.100s · 640x360 · queue:2',
  );
  assert.equal(
    formatExportDebugInfo({
      stage: 'seek-fallback',
      done: 579,
      total: 590,
      fps: 30,
      time: 19.3,
      width: 576,
      height: 576,
      note: 'frames_reutilizados:1',
    }),
    'stage:seek-fallback · frame:579/590 · fps:30 · t:19.300s · 576x576 · queue:0 · frames_reutilizados:1',
  );
}

function checkAutoPerformanceDowngrade() {
  const app = {
    imageSettings: { performanceMode: 'auto', previewQuality: 'balanced' },
    PERFORMANCE_MODE_PRESETS,
    normalizePerformanceMode,
    autoPerformanceDowngraded: false,
    lowFpsSampleCount: 0,
    blobTrackingEffect: { processScale: 0.45, processIntervalMs: 33 },
    faceDetectionEffect: { processIntervalMs: 30 },
    blinkDetectionEffect: { processIntervalMs: 30 },
    updateImageControlsUI() {},
    requestPreviewRefresh() {},
    renderEffectConfig() {},
    showStatus() {},
  };
  applyCameraMixin(app);
  app.handlePreviewFpsSample(23);
  app.handlePreviewFpsSample(23);
  assert.equal(app.autoPerformanceDowngraded, false);
  app.handlePreviewFpsSample(23);
  assert.equal(app.autoPerformanceDowngraded, true);
  assert.deepEqual(PERFORMANCE_MODE_PRESETS.performance.camera, {
    width: 960,
    height: 540,
    fps: 30,
  });
  assert.equal(app.imageSettings.previewQuality, 'draft');
  assert.equal(app.blobTrackingEffect.processScale, 0.35);
  assert.equal(app.blobTrackingEffect.processIntervalMs, 120);
  assert.equal(app.faceDetectionEffect.processIntervalMs, 120);
  assert.equal(app.blinkDetectionEffect.processIntervalMs, 120);
}

async function checkVideoExportDiagnostics() {
  const noWebCodecs = await diagnoseVideoExportSupport({
    VideoEncoderImpl: undefined,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(noWebCodecs.supported, false);
  assert.equal(noWebCodecs.reason, 'webcodecs_unavailable');

  const noVideoFrame = await diagnoseVideoExportSupport({
    VideoEncoderImpl: class VideoEncoder {},
    VideoFrameImpl: undefined,
  });
  assert.equal(noVideoFrame.supported, false);
  assert.equal(noVideoFrame.reason, 'videoframe_unavailable');

  class UnsupportedEncoder {
    static async isConfigSupported(config) {
      return { supported: false, config };
    }
  }
  const unsupported = await diagnoseVideoExportSupport({
    VideoEncoderImpl: UnsupportedEncoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.reason, 'webcodecs_codec_unsupported');

  class Vp8Encoder {
    static async isConfigSupported(config) {
      return { supported: config.codec === 'vp8', config };
    }
  }
  const supported = await diagnoseVideoExportSupport({
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 12_000_000,
    VideoEncoderImpl: Vp8Encoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(supported.supported, true);
  assert.equal(supported.codec, 'vp8');
  assert.equal(supported.muxerCodec, 'V_VP8');
  assert.equal(supported.format, 'webm');

  class AvcEncoder {
    static async isConfigSupported(config) {
      return { supported: config.codec.startsWith('avc1.'), config };
    }
  }
  const mp4 = await diagnoseVideoExportSupport({
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 12_000_000,
    requestedFormat: 'auto',
    audioCodec: 'aac',
    copyAudio: true,
    VideoEncoderImpl: AvcEncoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(mp4.supported, true);
  assert.equal(
    mp4.format,
    'mp4',
    'auto export may use MP4 when WebM is unavailable',
  );
  assert.equal(mp4.extension, 'mp4');
  assert.equal(mp4.mediaCodec, 'avc');
  assert.equal(mp4.audioCopySupported, true);

  class FastWebmAndMp4Encoder {
    static async isConfigSupported(config) {
      return {
        supported: config.codec === 'vp8' || config.codec.startsWith('avc1.'),
        config,
      };
    }
  }
  const autoFast = await diagnoseVideoExportSupport({
    requestedFormat: 'auto',
    VideoEncoderImpl: FastWebmAndMp4Encoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(
    autoFast.format,
    'webm',
    'auto export must prefer fast WebM when both containers are available',
  );

  const forcedMp4Unsupported = await diagnoseVideoExportSupport({
    requestedFormat: 'mp4',
    VideoEncoderImpl: Vp8Encoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(
    forcedMp4Unsupported.supported,
    false,
    'forced MP4 must not silently fall back',
  );

  const effectsOnly = await diagnoseVideoExportSupport({
    requestedFormat: 'mp4',
    mode: 'effects-chroma',
    VideoEncoderImpl: Vp8Encoder,
    VideoFrameImpl: class VideoFrame {},
  });
  assert.equal(effectsOnly.supported, true);
  assert.equal(
    effectsOnly.format,
    'webm',
    'effects-only chroma export must force WebM',
  );
  assert.equal(effectsOnly.audioReason, 'effects_export_has_no_audio');
}

function checkEditorExportFormatHelpers() {
  assert.equal(
    chooseEditorExportFormat({
      requestedFormat: 'auto',
      mp4Supported: true,
      webmSupported: true,
    }),
    'webm',
  );
  assert.equal(
    chooseEditorExportFormat({
      requestedFormat: 'auto',
      mp4Supported: false,
      webmSupported: true,
    }),
    'webm',
  );
  assert.equal(
    chooseEditorExportFormat({
      requestedFormat: 'mp4',
      mp4Supported: false,
      webmSupported: true,
    }),
    '',
  );
  assert.equal(
    chooseEditorExportFormat({
      requestedFormat: 'mp4',
      mode: 'effects-chroma',
      mp4Supported: true,
      webmSupported: true,
    }),
    'webm',
  );
  assert.equal(canCopyAudioCodecToFormat('aac', 'mp4'), true);
  assert.equal(canCopyAudioCodecToFormat('mp4a.40.2', 'mp4'), true);
  assert.equal(canCopyAudioCodecToFormat('opus', 'webm'), true);
  assert.equal(canCopyAudioCodecToFormat('aac', 'webm'), false);
  assert.equal(canCopyAudioCodecToFormat('opus', 'mp4'), false);
}

function checkPaletteDropUsesEffectTypeRow() {
  let addedType = '';
  const chip = {
    classList: { remove() {} },
    hasPointerCapture: () => false,
  };
  const app = {
    TIMELINE_EFFECT_META: {
      blob: { label: 'Color', trackLabel: 'COLOR', row: 2 },
      face: { label: 'Caras', trackLabel: 'CARAS', row: 3 },
    },
    paletteDragState: { type: 'blob', chip, moved: true },
    videoSourceFile: {},
    removeTimelineDragGhost() {},
    clearTimelineDropTargets() {},
    updateEffectTrackHighlight() {},
    showStatus() {},
    hideStatus() {},
  };
  applyLocalvideoeditorMixin(app);
  app.getTimelineRowFromClientY = () => 'face';
  app.getTimelineTime = () => 4;
  app.addTimelineEffectClip = (type, time) => {
    addedType = `${type}:${time}`;
  };
  app.removeTimelineDragGhost = () => {};
  app.finishPaletteDrag({ pointerId: 1, clientX: 100, clientY: 50 });
  assert.equal(
    addedType,
    'blob:4',
    'palette drops must use the dragged effect type, not the row under the pointer',
  );
}

async function checkEffectsOnlyExportSkipsBaseRender() {
  const app = {
    videoTimeline: { trimStart: 2 },
    imageSettings: {
      editorExportMode: 'effects-chroma',
      effectsExportChroma: 'green',
      qualityEnhancer: true,
    },
    videoExportTotalFrames: 1,
    recordingCanvas: { width: 100, height: 100 },
    recordingCtx: {},
    progressCalls: [],
    lookCalls: 0,
    baseRenderCalls: 0,
    effectsOnlyCalls: 0,
    updateVideoExportProgress(done, total, fps, meta) {
      this.progressCalls.push(meta.stage);
    },
    seekVideoForExport: async (time) => {
      assert.equal(
        time,
        2,
        'effects-only export should seek to trim start for frame zero',
      );
    },
    applyVideoTimelineLook() {
      this.lookCalls += 1;
    },
    syncVideoTimelineDetectorsAt: async () => {},
    ensureRecordingCanvas() {},
    renderSourceFrameBuffer() {
      this.baseRenderCalls += 1;
    },
    renderEffectsOnlyFrame(canvas, ctx, chromaColor) {
      assert.equal(chromaColor, '#00ff00');
      this.effectsOnlyCalls += 1;
    },
  };
  applyLocalvideoeditorMixin(app);
  app.seekVideoForExport = async (time) => {
    assert.equal(
      time,
      2,
      'effects-only export should seek to trim start for frame zero',
    );
  };
  await app.renderVideoExportFrame(0, 30, {
    mode: 'effects-chroma',
    chromaColor: '#00ff00',
  });
  assert.equal(
    app.lookCalls,
    0,
    'effects-only export must not render LOOK as a video base transform',
  );
  assert.equal(
    app.baseRenderCalls,
    0,
    'effects-only export must not call the full video-base renderer',
  );
  assert.equal(app.effectsOnlyCalls, 1);
}

async function checkExportFrameProgressThrottlesInnerStages() {
  const calls = [];
  const app = {
    videoTimeline: { trimStart: 0 },
    imageSettings: {
      editorExportMode: 'full',
      qualityEnhancer: false,
    },
    videoExportTotalFrames: 10,
    updateVideoExportProgress(done, total, fps, meta) {
      calls.push(meta);
    },
    applyVideoTimelineLook() {},
    syncVideoTimelineDetectorsAt: async () => {},
    renderSourceFrameBuffer() {},
  };
  applyLocalvideoeditorMixin(app);
  app.updateVideoExportProgress = (done, total, fps, meta) => {
    calls.push(meta);
  };
  app.advanceVideoForExport = async () => {};
  await app.renderVideoExportFrame(1, 30, { mode: 'full' });
  const byStage = Object.fromEntries(calls.map((meta) => [meta.stage, meta]));
  assert.equal(
    byStage.decode.force,
    true,
    'decode remains the single forced frame progress update',
  );
  assert.equal(
    byStage.look.force,
    undefined,
    'look progress must use throttled UI updates',
  );
  assert.equal(
    byStage.detectors.force,
    undefined,
    'detector progress must use throttled UI updates',
  );
  assert.equal(
    byStage.canvas.force,
    undefined,
    'canvas progress must use throttled UI updates',
  );
}

function checkObservedExportProgressAndTimelineTicks() {
  assert.equal(
    calculateTimelineTickInterval(60, 180),
    30,
    'narrow timelines need sparse labels',
  );
  assert.equal(
    calculateTimelineTickInterval(60, 720),
    10,
    'wide timelines can show denser labels',
  );

  const early = formatObservedExportProgress({
    done: 1,
    total: 100,
    startedAt: 0,
    now: 500,
    fps: 30,
  });
  assert.ok(
    !early.includes('restantes'),
    'early progress must not fake an ETA',
  );
  assert.ok(early.includes('midiendo velocidad real'));

  const observed = formatObservedExportProgress({
    done: 50,
    total: 100,
    startedAt: 0,
    now: 5000,
    fps: 30,
  });
  assert.ok(
    observed.includes('10 fps reales'),
    'progress must show observed export speed',
  );
  assert.ok(
    observed.includes('5s transcurridos'),
    'progress must show elapsed time instead of fake ETA',
  );
}

await checkCameraStreamCleanup();
checkCameraPreservesSupportedFps();
checkReusableMorphologyBuffers();
checkBlinkDetectionUsesRefinedEyeLandmarks();
await checkBlinkCallbackClearsWhenBlobDisabled();
checkFaceDetectionUsesRefinedEyeLandmarks();
checkVideoTimelineIntervals();
checkAudioTempoAnalyzer();
checkEditAssistManualControls();
await checkMediaAudioExtraction();
checkStableExportDefaults();
checkEditorExportPresets();
checkTimelineClipSnappingHelper();
checkTimelineMarkerIntervalsForInsertion();
checkTimelineClipboardBasics();
checkProjectJsonRoundTrip();
checkBeatReactiveAutomation();
checkSplitAllEffectsAtMarkers();
await checkSequentialExportAdvance();
await checkExportPlaybackPausesAtTarget();
await checkExportSeekFallsBackWhenSeekedIsMissing();
await checkExportPrepareRecoversDecodeFailure();
checkVideoSeekAvoidsExactDuration();
checkPausedVideoPreviewUsesAnimationFrame();
await checkVideoPlaybackRestartsFromEnd();
await checkExportPlaybackRateRestores();
await checkExportTimelineDetectorToggleIsQuiet();
checkEditorHistoryUndoRedo();
checkPreviewProcessingResolutionContract();
checkVideoExportTimingAndQuality();
checkAutoPerformanceDowngrade();
await checkVideoExportDiagnostics();
checkEditorExportFormatHelpers();
checkPaletteDropUsesEffectTypeRow();
await checkEffectsOnlyExportSkipsBaseRender();
await checkExportFrameProgressThrottlesInnerStages();
checkObservedExportProgressAndTimelineTicks();
console.log('Unit check passed.');
