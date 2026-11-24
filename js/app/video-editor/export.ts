import {
  buildEditorExportPreflight,
  diagnoseVideoExportSupport,
  encodeCanvasSequence,
  formatExportDebugInfo,
  formatObservedExportProgress,
  getEditorChromaColor,
  type VideoExportDiagnosis,
} from '../../video-export.ts';
import { getVideoPlayableEnd } from './playable-end.ts';
import {
  formatBytes,
  formatDurationDetailed,
  formatVideoBitrate,
  formatVideoFps,
  normalizeVideoFps,
} from '../media-format.ts';
import { DEFAULT_CAMERA_FPS, type ImageSettings } from '../constants.ts';
import { clamp } from '../webcam-settings.ts';
import { downloadBlob, showStatus } from '../feedback.ts';
import type { PreviewRenderer } from '../preview-renderer.ts';
import type { RenderEngine } from '../render-engine.ts';
import type { WebcamCamera } from '../webcam-camera.ts';
import type { WebcamCapture } from '../webcam-capture.ts';
import type { WebcamPreferences } from '../webcam-preferences.ts';
import type { VideoEditorSession } from './session.ts';
import { patchExportModalState } from '../../../src/lib/capture/session-state.ts';
import { updateShellState } from '../../../src/lib/shell/shell-bridge.ts';
import { translateCurrent } from '../../../src/lib/i18n/translate.ts';
import {
  updateEditorUiState,
  type SourceMode,
} from '../../../src/lib/editor/editor-state.ts';

const VIDEO_EXPORT_PLAYBACK_RATE = 4;

type VideoExportPreflight = ReturnType<typeof buildEditorExportPreflight>;
type CanvasSequence = Parameters<typeof encodeCanvasSequence>[0];
type RenderMeta = Partial<Parameters<CanvasSequence['renderFrame']>[1]>;
type ExportBlob = Awaited<ReturnType<typeof encodeCanvasSequence>>;
interface ProgressMeta {
  stage?: string;
  time?: number;
  force?: boolean;
  note?: string;
  queueSize?: number;
}

export interface ExportHost {
  videoEl: HTMLVideoElement;
  videoEditorStatus: HTMLElement | null;
  sourceMode: SourceMode;
  isRunning: boolean;
  imageSettings: ImageSettings;
  capture: Pick<
    WebcamCapture,
    'ensureRecordingCanvas' | 'renderSourceFrameBuffer'
  >;
  renderer: Pick<
    PreviewRenderer,
    | 'getSourceFrameDimensions'
    | 'getEffectiveFrameDimensions'
    | 'renderEffectsOnlyFrame'
    | 'cancelRenderLoop'
    | 'scheduleRenderLoop'
    | 'hasPendingFrame'
  >;
  renderEngine: Pick<
    RenderEngine,
    'getProfile' | 'recordingCanvas' | 'recordingCtx'
  >;
  preferences: Pick<WebcamPreferences, 'flushPendingClipConfigSync'>;
  camera: Pick<WebcamCamera, 'updatePreviewPlaceholder'>;
}

export class VideoExporter {
  private videoExportDiagnosis: VideoExportDiagnosis | null = null;
  private videoExportRecoveredSource = false;
  private videoExportPlayback: {
    originalPlaybackRate: number;
    originalMuted: boolean;
    playbackRate: number;
  } | null = null;
  private exportProgressRatio = 0;
  private exportDiagnosticsRequest = 0;
  private run: AbortController | null = null;

  constructor(
    private readonly editor: VideoEditorSession,
    private readonly host: ExportHost,
  ) {}

  dispose(): void {
    this.exportDiagnosticsRequest += 1;
    this.run?.abort(new Error('export_cancelled'));
    this.editor.exportSession.reset();
    void this.editor.exportSession.releaseWakeLock();
    this.restorePlayback();
  }

  buildVideoExportPreflight() {
    if (!this.editor.source?.file) return null;
    const { sourceWidth, sourceHeight } =
      this.host.renderer.getSourceFrameDimensions();
    const { width, height } = this.host.renderer.getEffectiveFrameDimensions(
      sourceWidth,
      sourceHeight,
    );
    return buildEditorExportPreflight({
      preset: this.host.imageSettings.editorExportPreset,
      width,
      height,
      sourceFps: this.editor.source.fps,
      duration: Math.max(
        0,
        (Number(this.editor.timeline?.trimEnd) || 0) -
          (Number(this.editor.timeline?.trimStart) || 0),
      ),
      sourceBitrate: this.editor.source.averageBitrate,
      mode: this.host.imageSettings.editorExportMode,
      requestedFormat: this.host.imageSettings.editorExportFormat,
      copyAudio: this.host.imageSettings.editorCopyAudio,
      qualityEnhancer: this.host.imageSettings.qualityEnhancer,
    });
  }

  getEffectiveVideoExportFps() {
    return this.buildVideoExportPreflight()?.fps || null;
  }

  getVideoExportFps() {
    return (
      this.editor.exportSession.preflight?.fps ||
      this.getEffectiveVideoExportFps() ||
      normalizeVideoFps(this.editor.source.fps) ||
      DEFAULT_CAMERA_FPS
    );
  }

  formatVideoExportPreflight(preflight: VideoExportPreflight | null) {
    if (!preflight)
      return translateCurrent(
        'Importá un video para habilitar la exportación.',
      );
    return `${translateCurrent('Preflight')}: ${preflight.width}×${preflight.height} · ${formatVideoFps(preflight.fps)} FPS · ${formatDurationDetailed(preflight.duration)} · ${preflight.totalFrames} ${translateCurrent('frames')} · ${formatVideoBitrate(preflight.bitrate)} · ${translateCurrent(`memoria ${preflight.risk.label}`)}`;
  }

  updateVideoEditorUI() {
    const loaded = !!this.editor.source?.file;
    document.body.classList.toggle('video-has-source', loaded);
    if (!loaded) this.editor.workspace.setInspectorTab('project');
    const canExport =
      loaded &&
      typeof VideoEncoder !== 'undefined' &&
      typeof VideoFrame !== 'undefined';
    updateEditorUiState({
      hasSource: loaded,
      exporting: !!this.editor.exportSession?.active,
      canExport,
    });
    updateShellState({
      exportEnabled: canExport && !this.editor.exportSession?.active,
    });
    this.editor.workspace.updateVideoEffectInspector();
    this.editor.workspace.updateAdjustmentsPanelState();
    this.editor.workspace.updateEditorHistoryButtons();
    this.editor.editAssist?.updateUI();
    if (!loaded) {
      ++this.exportDiagnosticsRequest;
      updateEditorUiState({ exportDetails: '', exportDiagnostics: '' });
      if (this.host.sourceMode === 'video') {
        this.host.camera.updatePreviewPlaceholder();
      }
      this.editor.workspace.updateTimelineHint();
      return;
    }
    this.host.camera.updatePreviewPlaceholder();
    {
      const preflight = this.buildVideoExportPreflight();
      const modeLabel = translateCurrent(
        preflight?.mode === 'effects-chroma'
          ? 'solo efectos chroma'
          : 'video + efectos',
      );
      const formatLabel =
        preflight?.mode === 'effects-chroma'
          ? 'WebM'
          : (
              preflight?.format ||
              this.host.imageSettings.editorExportFormat ||
              'auto'
            ).toUpperCase();
      const audioLabel = translateCurrent(
        preflight?.mode === 'effects-chroma'
          ? 'sin audio'
          : preflight?.copyAudio
            ? 'audio si compatible'
            : 'sin audio',
      );
      const exportLabel = canExport
        ? `${formatLabel} · ${modeLabel} · ${audioLabel}`
        : translateCurrent('WebCodecs no disponible');
      updateEditorUiState({
        exportDetails: `${this.formatVideoExportPreflight(preflight)} · ${exportLabel}`,
      });
    }
    void this.refreshVideoExportDiagnostics();
    this.editor.workspace.updateTimelineHint();
  }

  formatVideoExportDiagnosis(diagnosis: VideoExportDiagnosis, bitrate: number) {
    if (!diagnosis.webCodecs)
      return translateCurrent(
        'Diagnóstico: WebCodecs no disponible. Usá Chrome o Edge actualizado.',
      );
    if (!diagnosis.videoFrame)
      return translateCurrent(
        'Diagnóstico: VideoFrame no disponible. Usá Chrome o Edge actualizado.',
      );
    const requested =
      diagnosis.requestedFormat === 'auto'
        ? 'Auto'
        : String(diagnosis.requestedFormat || '').toUpperCase();
    if (!diagnosis.supported)
      return `${translateCurrent('Diagnóstico')}: ${requested} ${translateCurrent('no soportado')} (${diagnosis.reason ? translateCurrent(diagnosis.reason) : translateCurrent('sin codec')}).`;
    const format = String(diagnosis.format || 'webm').toUpperCase();
    const mode = translateCurrent(
      diagnosis.mode === 'effects-chroma'
        ? 'solo efectos chroma'
        : 'video + efectos',
    );
    const audio =
      diagnosis.mode === 'effects-chroma'
        ? translateCurrent('sin audio')
        : diagnosis.audioCopySupported
          ? `${translateCurrent('audio copiado')} (${diagnosis.audioCodec})`
          : diagnosis.audioCopyRequested &&
              diagnosis.audioReason === 'audio_codec_unknown'
            ? translateCurrent('audio se intentará si es compatible')
            : `${translateCurrent('sin audio')}${diagnosis.audioReason ? ` (${diagnosis.audioReason})` : ''}`;
    return `${translateCurrent('Diagnóstico')}: ${format} · ${diagnosis.codec} · ${formatVideoBitrate(bitrate)} · ${mode} · ${audio}`;
  }

  async refreshVideoExportDiagnostics() {
    const request = ++this.exportDiagnosticsRequest;
    if (!this.editor.source?.file) return null;
    const preflight = this.buildVideoExportPreflight();
    if (!preflight) return null;
    const diagnosis = await diagnoseVideoExportSupport({
      width: preflight.width,
      height: preflight.height,
      fps: preflight.fps,
      bitrate: preflight.bitrate,
      requestedFormat: preflight.format,
      mode: preflight.mode,
      copyAudio: preflight.copyAudio,
    });
    if (request !== this.exportDiagnosticsRequest) return null;
    updateEditorUiState({
      exportDiagnostics: `${this.formatVideoExportDiagnosis(diagnosis, preflight.bitrate)} · ${translateCurrent(preflight.risk.recommendation)}`,
    });
    return diagnosis;
  }

  async renderVideoExportFrame(
    frameIndex: number,
    fps: number,
    exportMeta: RenderMeta = {},
  ) {
    const start = this.editor.timeline.trimStart;
    const time = start + frameIndex / fps;
    const exportMode =
      exportMeta.mode || this.host.imageSettings.editorExportMode || 'full';
    this.updateVideoExportProgress(
      frameIndex,
      this.editor.exportSession.totalFrames || 0,
      fps,
      { stage: frameIndex === 0 ? 'seek' : 'decode', time, force: true },
    );
    try {
      await this.advanceVideoForExport(time, fps, frameIndex);
    } catch (err) {
      this.run?.signal.throwIfAborted();
      if (this.videoExportPlayback && frameIndex > 0) {
        await this.reuseCurrentVideoExportFrame();
        this.updateVideoExportProgress(
          frameIndex,
          this.editor.exportSession.totalFrames || 0,
          fps,
          {
            stage: 'frame-reuse',
            time,
            force: true,
            note: `frames_reutilizados:${this.editor.exportSession.skippedFrames || 0}`,
          },
        );
      } else {
        this.updateVideoExportProgress(
          frameIndex,
          this.editor.exportSession.totalFrames || 0,
          fps,
          {
            stage: 'seek-retry',
            time,
            force: true,
            note:
              (err instanceof Error && (err.message || err.name)) ||
              'seek_failed',
          },
        );
        if (this.canRecoverVideoExportSeek(err)) {
          await this.recoverVideoSourceForExport(time);
        }
        await this.seekVideoForExport(time);
      }
    }
    if (exportMode === 'full') {
      this.updateVideoExportProgress(
        frameIndex,
        this.editor.exportSession.totalFrames || 0,
        fps,
        { stage: 'look', time },
      );
      this.editor.timelineEffects.applyLook(time, { force: true });
    }
    this.updateVideoExportProgress(
      frameIndex,
      this.editor.exportSession.totalFrames || 0,
      fps,
      { stage: 'detectors', time },
    );
    await this.editor.timelineEffects.syncDetectorsAt(time, false);
    this.run?.signal.throwIfAborted();
    await this.editor.visualFx?.syncAt(time);
    const visualFx = this.editor.visualFx?.activeEffect;
    if (visualFx) {
      await visualFx.analyze(
        this.host.videoEl,
        time * 1000,
        this.host.renderEngine.getProfile('export'),
      );
    }
    this.run?.signal.throwIfAborted();
    this.updateVideoExportProgress(
      frameIndex,
      this.editor.exportSession.totalFrames || 0,
      fps,
      { stage: 'canvas', time },
    );
    if (exportMode === 'effects-chroma') {
      this.host.capture.ensureRecordingCanvas();
      const { recordingCanvas, recordingCtx } = this.host.renderEngine;
      if (!recordingCanvas || !recordingCtx)
        throw new Error('video_export_canvas_unavailable');
      this.host.renderer.renderEffectsOnlyFrame(
        recordingCanvas,
        recordingCtx,
        exportMeta.chromaColor ||
          getEditorChromaColor(this.host.imageSettings.effectsExportChroma),
        'export',
      );
    } else {
      this.host.capture.renderSourceFrameBuffer(
        !!this.host.imageSettings.qualityEnhancer,
        'export',
      );
    }
    this.editor.exportSession.lastRenderedFrameIndex = frameIndex;
  }

  updateVideoExportProgress(
    done: number,
    total: number,
    fps: number,
    meta: ProgressMeta = {},
  ) {
    const now = performance.now();
    const force = !!meta.force || done >= total || meta.stage === 'error';
    if (
      !force &&
      this.editor.exportSession.lastUiUpdate &&
      now - this.editor.exportSession.lastUiUpdate < 250
    )
      return;
    this.editor.exportSession.lastUiUpdate = now;
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeDone = clamp(Number(done) || 0, 0, safeTotal);
    const progress = safeDone / safeTotal;
    this.exportProgressRatio = progress;
    const debug = formatExportDebugInfo({
      stage: meta.stage || 'encode',
      done: safeDone,
      total: safeTotal,
      fps,
      time:
        meta.time ??
        this.editor.timeline.trimStart +
          Math.max(0, safeDone - 1) / Math.max(1, Number(fps) || 1),
      width: this.host.renderEngine.recordingCanvas?.width || 0,
      height: this.host.renderEngine.recordingCanvas?.height || 0,
      queueSize: meta.queueSize || 0,
      note: meta.note || '',
    });
    patchExportModalState({
      progress,
      summary: formatObservedExportProgress({
        done: safeDone,
        total: safeTotal,
        startedAt: this.editor.exportSession.startedAt || now,
        now,
        fps,
      }),
      debug,
    });
  }

  async runVideoExportViaWebCodecs() {
    const preflight =
      this.editor.exportSession.preflight || this.buildVideoExportPreflight();
    if (!preflight) throw new Error('video_export_preflight_missing');
    this.editor.exportSession.preflight = preflight;
    const fps = preflight.fps;
    const start = this.editor.timeline.trimStart;
    const end = this.editor.timeline.trimEnd;
    const mode = preflight.mode;
    const totalFrames = preflight.totalFrames;
    this.host.capture.ensureRecordingCanvas();
    this.editor.exportSession.totalFrames = totalFrames;
    const bitrate = preflight.bitrate;
    const diagnosis =
      this.videoExportDiagnosis ||
      (await diagnoseVideoExportSupport({
        width: preflight.width,
        height: preflight.height,
        fps,
        bitrate,
        requestedFormat: preflight.format,
        mode,
        copyAudio: preflight.copyAudio,
      }));

    const baseName =
      this.editor.source.file?.name.replace(/\.[^.]+$/, '') ||
      'hatewebcam-video';
    const suffix = mode === 'effects-chroma' ? 'efectos-chroma' : 'editado';
    this.editor.exportSession.fileName = `${baseName}-${suffix}.${diagnosis.extension || 'webm'}`;

    await this.prepareSequentialVideoExport(start);

    const canvas = this.host.renderEngine.recordingCanvas;
    if (!canvas) throw new Error('video_export_canvas_unavailable');
    return encodeCanvasSequence({
      canvas,
      width: canvas.width,
      height: canvas.height,
      fps,
      totalFrames,
      duration: end - start,
      bitrate,
      requestedFormat: preflight.format,
      mode,
      chromaColor: this.host.imageSettings.effectsExportChroma,
      audioSourceFile: this.editor.source?.file,
      trimStart: start,
      trimEnd: end,
      copyAudio: !!preflight.copyAudio,
      diagnosis,
      renderFrame: (frameIndex, meta) =>
        this.renderVideoExportFrame(frameIndex, fps, meta),
      onProgress: (done, total, meta) =>
        this.updateVideoExportProgress(done, total, fps, meta),
      shouldCancel: () => !this.editor.exportSession?.active,
    });
  }

  finalizeVideoExportBlob(blob: ExportBlob) {
    if (
      blob?.exportInfo?.extension &&
      !this.editor.exportSession.fileName.endsWith(
        `.${blob.exportInfo.extension}`,
      )
    ) {
      this.editor.exportSession.fileName =
        this.editor.exportSession.fileName.replace(
          /\.[^.]+$/,
          `.${blob.exportInfo.extension}`,
        );
    }
    downloadBlob(blob, this.editor.exportSession.fileName);
    showStatus(
      this.host.videoEditorStatus,
      'Exportación terminada y guardada.',
      'success',
    );
    this.exportProgressRatio = 1;
    const audioNote = blob?.exportInfo?.audioCopied
      ? ` · audio ${blob.exportInfo.audioCodec}`
      : blob?.exportInfo?.audioReason && blob.exportInfo.mode === 'full'
        ? ` · ${blob.exportInfo.audioReason}`
        : '';
    patchExportModalState({
      open: true,
      titleState: 'success',
      progress: 1,
      help: 'El archivo se descargó a tu equipo.',
      summary: `${this.editor.exportSession.fileName} · ${formatBytes(blob.size)}${audioNote} · descarga iniciada`,
      showCancel: false,
      showClose: true,
    });
    this.cleanupVideoExport(true);
  }

  async startVideoExport() {
    const source = this.editor.source.signal;
    if (!source || this.editor.source.loading || this.run) return;
    if (typeof HTMLCanvasElement === 'undefined') {
      showStatus(
        this.host.videoEditorStatus,
        'Este navegador no puede exportar el video.',
        'error',
      );
      return;
    }

    if (
      typeof VideoEncoder === 'undefined' ||
      typeof VideoFrame === 'undefined'
    ) {
      showStatus(
        this.host.videoEditorStatus,
        'La exportación fiable requiere Chrome o Edge actualizado con WebCodecs.',
        'error',
      );
      return;
    }

    const run = new AbortController();
    this.run = run;
    const { signal } = run;
    const onSourceRelease = () => run.abort(new Error('export_cancelled'));
    source.addEventListener('abort', onSourceRelease, { once: true });
    try {
      const preflight = this.buildVideoExportPreflight();
      if (!preflight) throw new Error('video_export_preflight_missing');
      this.editor.exportSession.preflight = preflight;
      updateEditorUiState({
        exportDetails: this.formatVideoExportPreflight(preflight),
      });
      if (preflight.blocked) {
        updateEditorUiState({
          exportDiagnostics: translateCurrent(preflight.risk.recommendation),
        });
        showStatus(
          this.host.videoEditorStatus,
          'Exportación bloqueada por riesgo de memoria. Reducí duración o usá Rápido/Balanceado.',
          'error',
        );
        this.editor.exportSession.preflight = null;
        return;
      }
      this.host.capture.ensureRecordingCanvas();
      const diagnosis = await diagnoseVideoExportSupport({
        width: preflight.width,
        height: preflight.height,
        fps: preflight.fps,
        bitrate: preflight.bitrate,
        requestedFormat: preflight.format,
        mode: preflight.mode,
        copyAudio: preflight.copyAudio,
      });
      signal.throwIfAborted();
      this.videoExportDiagnosis = diagnosis;
      updateEditorUiState({
        exportDiagnostics: `${this.formatVideoExportDiagnosis(diagnosis, preflight.bitrate)} · ${translateCurrent(preflight.risk.recommendation)}`,
      });
      if (!diagnosis.supported) {
        showStatus(
          this.host.videoEditorStatus,
          this.formatVideoExportDiagnosis(diagnosis, preflight.bitrate),
          'error',
        );
        this.editor.exportSession.preflight = null;
        return;
      }
      this.host.preferences.flushPendingClipConfigSync();
      this.editor.timelineEffects.resetApplied();
      this.editor.visualFx?.reset();
      this.videoExportRecoveredSource = false;
      this.editor.exportSession.start(0);
      this.exportProgressRatio = 0;
      patchExportModalState({
        open: true,
        titleState: 'running',
        progress: 0,
        summary: 'Preparando exportación…',
        debug: 'stage:preparando · frame:0/?',
        help: 'No cierres esta pestaña mientras se procesa el archivo.',
        showCancel: true,
        showClose: false,
      });
      this.updateVideoEditorUI();
      this.host.renderer.cancelRenderLoop();
      if ('wakeLock' in navigator) {
        const lock = await navigator.wakeLock
          .request('screen')
          .catch(() => null);
        if (signal.aborted) await lock?.release().catch(() => {});
        else this.editor.exportSession.wakeLock = lock;
      }

      signal.throwIfAborted();
      const blob = await this.runVideoExportViaWebCodecs();
      signal.throwIfAborted();
      this.finalizeVideoExportBlob(blob);
    } catch (err) {
      if (!signal.aborted) this.failVideoExport(err);
    } finally {
      source.removeEventListener('abort', onSourceRelease);
      this.run = null;
      if (!this.editor.exportSession.active)
        this.editor.exportSession.preflight = null;
    }
  }

  seekVideoForExport(time: number): Promise<void> {
    const signal = this.run?.signal;
    signal?.throwIfAborted();
    const target = clamp(
      time,
      0,
      getVideoPlayableEnd(
        this.editor.timeline.duration || this.host.videoEl.duration || 0,
      ),
    );
    const tolerance = 0.02;
    if (Math.abs(this.host.videoEl.currentTime - target) <= tolerance)
      return this.waitForExportVideoFrame();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        clearInterval(poll);
        this.host.videoEl.removeEventListener('seeked', onSeeked);
        this.host.videoEl.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(signal?.reason);
      };
      const isAtTarget = () =>
        Math.abs((this.host.videoEl.currentTime || 0) - target) <= tolerance &&
        this.host.videoEl.readyState >= 2;
      const fail = (err: Error) => {
        if (isAtTarget()) {
          onSeeked();
          return;
        }
        cleanup();
        reject(err);
      };
      const onSeeked = () => {
        cleanup();
        this.waitForExportVideoFrame().then(resolve, reject);
      };
      const onError = () => fail(new Error('video_decode_failed'));
      const poll = setInterval(() => {
        if (isAtTarget()) onSeeked();
      }, 120);
      const timeout = setTimeout(
        () => fail(new Error('video_seek_timeout')),
        5000,
      );
      this.host.videoEl.addEventListener('seeked', onSeeked, { once: true });
      this.host.videoEl.addEventListener('error', onError, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
      this.host.videoEl.currentTime = target;
    });
  }

  canRecoverVideoExportSeek(err: unknown) {
    return (
      !this.videoExportRecoveredSource &&
      ['video_decode_failed', 'video_seek_timeout'].includes(
        err instanceof Error ? err.message : '',
      )
    );
  }

  async recoverVideoSourceForExport(time: number) {
    if (!this.editor.source?.file) throw new Error('video_decode_failed');
    this.videoExportRecoveredSource = true;
    this.updateVideoExportProgress(
      0,
      this.editor.exportSession.totalFrames || 0,
      this.getVideoExportFps(),
      {
        stage: 'source-reload',
        time,
        force: true,
        note: 'recargando_video',
      },
    );

    await this.editor.source.reload(5000, this.run?.signal);
  }

  async prepareSequentialVideoExport(startTime: number) {
    this.videoExportPlayback = {
      originalPlaybackRate: this.host.videoEl.playbackRate || 1,
      originalMuted: this.host.videoEl.muted,
      playbackRate: VIDEO_EXPORT_PLAYBACK_RATE,
    };
    this.host.videoEl.muted = true;
    this.host.videoEl.playbackRate = this.videoExportPlayback.playbackRate;
    this.host.videoEl.pause();
    try {
      await this.seekVideoForExport(startTime);
    } catch (err) {
      if (!this.canRecoverVideoExportSeek(err)) throw err;
      await this.recoverVideoSourceForExport(startTime);
      await this.seekVideoForExport(startTime);
    }
  }

  async advanceVideoForExport(targetTime: number, fps: number, frameIndex = 0) {
    if (!this.videoExportPlayback || frameIndex === 0)
      return this.seekVideoForExport(targetTime);
    const tolerance = Math.min(0.025, 0.45 / Math.max(1, Number(fps) || 1));
    const current = this.host.videoEl.currentTime || 0;
    if (Math.abs(current - targetTime) <= tolerance) return;
    if (current > targetTime + tolerance) {
      // Never touch the export playback rate here. playVideoUntilExportTime
      // reads it again for every frame, so lowering it once slowed the rest of
      // the export down to real time.
      this.host.videoEl.pause();
      return this.reuseCurrentVideoExportFrame();
    }
    return this.playVideoUntilExportTime(targetTime, tolerance);
  }

  async reuseCurrentVideoExportFrame() {
    this.editor.exportSession.skippedFrames =
      (this.editor.exportSession.skippedFrames || 0) + 1;
  }

  playVideoUntilExportTime(
    targetTime: number,
    tolerance: number,
  ): Promise<void> {
    const signal = this.run?.signal;
    signal?.throwIfAborted();
    if (typeof this.host.videoEl.play !== 'function')
      return this.reuseCurrentVideoExportFrame();
    this.host.videoEl.playbackRate =
      this.videoExportPlayback?.playbackRate || 1;
    return new Promise((resolve, reject) => {
      let frameCallbackId: number | null = null;
      let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
      let settled = false;
      const cleanup = () => {
        settled = true;
        clearTimeout(timeout);
        if (fallbackTimer !== null) clearTimeout(fallbackTimer);
        this.host.videoEl.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
        if (
          frameCallbackId != null &&
          typeof this.host.videoEl.cancelVideoFrameCallback === 'function'
        ) {
          this.host.videoEl.cancelVideoFrameCallback(frameCallbackId);
        }
      };
      const done = () => {
        this.host.videoEl.pause();
        cleanup();
        resolve();
      };
      const fail = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onAbort = () =>
        fail(signal?.reason ?? new Error('export_cancelled'));
      const tick = () => {
        if (settled) return;
        frameCallbackId = null;
        if (!this.editor.exportSession?.active) {
          fail(new Error('export_cancelled'));
          return;
        }
        if (
          (this.host.videoEl.currentTime || 0) >= targetTime - tolerance ||
          this.host.videoEl.ended
        ) {
          done();
          return;
        }
        if (typeof this.host.videoEl.requestVideoFrameCallback === 'function') {
          frameCallbackId = this.host.videoEl.requestVideoFrameCallback(tick);
        } else {
          fallbackTimer = setTimeout(tick, 8);
        }
      };
      const onError = () => fail(new Error('video_decode_failed'));
      const secondsLeft = Math.max(
        0,
        targetTime - (this.host.videoEl.currentTime || 0),
      );
      const timeout = setTimeout(
        () => {
          cleanup();
          this.host.videoEl.pause();
          this.reuseCurrentVideoExportFrame().then(resolve, reject);
        },
        Math.max(700, secondsLeft * 1200 + 500),
      );
      this.host.videoEl.addEventListener('error', onError, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
      this.host.videoEl.play().then(tick, () => {
        if (settled) return;
        cleanup();
        this.host.videoEl.pause();
        this.reuseCurrentVideoExportFrame().then(resolve, reject);
      });
    });
  }

  waitForExportVideoFrame(): Promise<void> {
    const signal = this.run?.signal;
    signal?.throwIfAborted();
    if (typeof this.host.videoEl.requestVideoFrameCallback !== 'function')
      return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        this.host.videoEl.cancelVideoFrameCallback?.(id);
      };
      const done = () => {
        cleanup();
        resolve();
      };
      const onAbort = () => {
        cleanup();
        reject(signal?.reason);
      };
      const timeout = setTimeout(done, 120);
      const id = this.host.videoEl.requestVideoFrameCallback(done);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  cancelVideoExport(showMessage = true): void {
    this.run?.abort(new Error('export_cancelled'));
    if (!this.editor.exportSession?.active) return;
    this.editor.exportSession.stop();
    if (showMessage)
      showStatus(
        this.host.videoEditorStatus,
        'Exportación cancelada.',
        'warning',
      );
    patchExportModalState({
      open: true,
      titleState: 'muted',
      help: 'Podés cerrar esta ventana.',
      summary: 'No se descargó ningún archivo.',
      showCancel: false,
      showClose: true,
    });
    this.cleanupVideoExport(true);
  }

  failVideoExport(err: unknown) {
    console.error('Video export failed:', err);
    const messages: Record<string, string> = {
      webcodecs_codec_unsupported:
        'No hay un codec compatible para el formato elegido.',
      webcodecs_unavailable:
        'WebCodecs no está disponible. Usá Chrome o Edge actualizado.',
      videoframe_unavailable:
        'VideoFrame no está disponible. Usá Chrome o Edge actualizado.',
      video_export_preflight_missing:
        'No se pudo calcular la exportación antes de iniciar.',
      video_seek_timeout: 'No se pudo leer un frame del video a tiempo.',
      video_playback_timeout:
        'No se pudo avanzar el video a tiempo durante la exportación.',
      video_decode_failed: 'El navegador no pudo decodificar el video.',
    };
    const message =
      messages[err instanceof Error ? err.message : ''] ||
      'La exportación falló. Revisá espacio libre y permisos.';
    showStatus(this.host.videoEditorStatus, message, 'error');
    this.cancelVideoExport(false);
    {
      const detail =
        (err instanceof Error && (err.message || err.name)) ||
        'error_desconocido';
      const ratio = this.exportProgressRatio || 0;
      patchExportModalState({
        open: true,
        titleState: 'error',
        help: 'Revisá el detalle y volvé a intentarlo.',
        summary: `${message} · ${detail}`,
        showCancel: false,
        showClose: true,
        debug: formatExportDebugInfo({
          stage: 'error',
          done: Math.round(ratio * this.editor.exportSession.totalFrames),
          total: this.editor.exportSession.totalFrames,
          fps: this.getVideoExportFps(),
          width: this.host.renderEngine.recordingCanvas?.width || 0,
          height: this.host.renderEngine.recordingCanvas?.height || 0,
        }),
      });
    }
  }

  private restorePlayback(): void {
    const playback = this.videoExportPlayback;
    if (!playback) return;
    this.host.videoEl.pause();
    this.host.videoEl.playbackRate = playback.originalPlaybackRate;
    this.host.videoEl.muted = playback.originalMuted;
    this.videoExportPlayback = null;
  }

  cleanupVideoExport(keepModal = false) {
    this.editor.exportSession.stop();
    this.editor.exportSession.fileName = '';
    this.videoExportDiagnosis = null;
    this.editor.exportSession.preflight = null;
    this.videoExportRecoveredSource = false;
    this.restorePlayback();
    if (!keepModal) {
      this.editor.exportSession.totalFrames = 0;
      this.editor.exportSession.lastRenderedFrameIndex = -1;
      this.editor.exportSession.seekFallback = false;
      this.editor.exportSession.skippedFrames = 0;
      this.exportProgressRatio = 0;
      patchExportModalState({ open: false, progress: 0, titleState: 'idle' });
    }
    void this.editor.exportSession.releaseWakeLock();
    this.updateVideoEditorUI();
    this.editor.transport?.update();
    if (
      this.host.isRunning &&
      this.editor.source?.file &&
      !this.host.renderer.hasPendingFrame
    )
      this.host.renderer.scheduleRenderLoop();
  }

  closeVideoExportModal() {
    if (this.editor.exportSession?.active) return;
    this.exportProgressRatio = 0;
    patchExportModalState({ open: false, progress: 0 });
  }
}
