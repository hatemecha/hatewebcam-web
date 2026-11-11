import {
  buildEditorExportPreflight,
  diagnoseVideoExportSupport,
  formatObservedExportProgress,
  getEditorChromaColor,
} from '../../video-export.mjs';
import { patchExportModalState } from '../../../src/lib/capture/session-state.ts';
import { updateShellState } from '../../../src/lib/shell/shell-bridge.mjs';
import { translateCurrent } from '../../../src/lib/i18n/translate.ts';
import { updateEditorUiState } from '../../../src/lib/editor/editor-state.ts';

const VIDEO_END_EPSILON = 0.001;
const VIDEO_EXPORT_PLAYBACK_RATE = 4;

/** @param {import('../controller.mjs').AppController} proto */
export function applyVideoEditorExportMixin(proto) {
  proto.buildVideoExportPreflight = function () {
    if (!this.videoSourceFile) return null;
    const { sourceWidth, sourceHeight } = this.getSourceFrameDimensions();
    const { width, height } = this.getEffectiveFrameDimensions(
      sourceWidth,
      sourceHeight,
    );
    return buildEditorExportPreflight({
      preset: this.imageSettings.editorExportPreset,
      width,
      height,
      sourceFps: this.videoSourceFps,
      duration: Math.max(
        0,
        (Number(this.videoTimeline?.trimEnd) || 0) -
          (Number(this.videoTimeline?.trimStart) || 0),
      ),
      sourceBitrate: this.videoSourceAverageBitrate,
      mode: this.imageSettings.editorExportMode,
      requestedFormat: this.imageSettings.editorExportFormat,
      copyAudio: this.imageSettings.editorCopyAudio,
      qualityEnhancer: this.imageSettings.qualityEnhancer,
    });
  };

  proto.getEffectiveVideoExportFps = function () {
    return this.buildVideoExportPreflight()?.fps || null;
  };

  proto.formatVideoExportPreflight = function (preflight) {
    if (!preflight)
      return translateCurrent(
        'Importá un video para habilitar la exportación.',
      );
    return `${translateCurrent('Preflight')}: ${preflight.width}×${preflight.height} · ${this.formatVideoFps(preflight.fps)} FPS · ${this.formatDurationDetailed(preflight.duration)} · ${preflight.totalFrames} ${translateCurrent('frames')} · ${this.formatVideoBitrate(preflight.bitrate)} · ${translateCurrent(`memoria ${preflight.risk.label}`)}`;
  };

  proto.updateVideoEditorUI = function () {
    const loaded = !!this.videoSourceFile;
    document.body.classList.toggle('video-has-source', loaded);
    if (!loaded && this.inspectorTabs) this.setInspectorTab('project');
    const canExport =
      loaded &&
      typeof VideoEncoder !== 'undefined' &&
      typeof VideoFrame !== 'undefined';
    updateEditorUiState({
      hasSource: loaded,
      exporting: !!this.isVideoExporting,
      canExport,
    });
    updateShellState({
      exportEnabled: canExport && !this.isVideoExporting,
    });
    if (this.btnChooseVideo) {
      const label = translateCurrent(
        loaded ? 'Cambiar video' : 'Importar video',
      );
      this.btnChooseVideo.innerHTML = `<i class="fa-solid fa-folder-open"></i> ${label}`;
      this.btnChooseVideo.setAttribute('aria-label', label);
    }
    if (this.videoProjectHelp) {
      this.videoProjectHelp.textContent = translateCurrent(
        loaded
          ? 'Reemplazá el video o exportá cuando termines.'
          : 'Importá un archivo local. MP4, WebM o MOV si el navegador lo soporta.',
      );
    }
    this.updateVideoEffectInspector();
    this.updateEditorExportControls();
    this.updateAdjustmentsPanelState();
    this.updateInspectorWorkflow();
    this.updateEditorHistoryButtons();
    this.editAssist?.updateUI();
    if (!loaded) {
      if (this.videoFileMeta)
        this.videoFileMeta.textContent = translateCurrent(
          'Ningún archivo cargado',
        );
      if (this.videoExportDetails)
        this.videoExportDetails.textContent = translateCurrent(
          'Importá un video para habilitar la exportación.',
        );
      if (this.videoExportDiagnostics)
        this.videoExportDiagnostics.textContent = '';
      if (this.sourceMode === 'video') {
        this.updatePreviewPlaceholder();
      }
      this.updateTimelineHint();
      return;
    }
    this.updatePreviewPlaceholder();
    this.updateVideoFileMeta?.();
    if (this.videoExportDetails) {
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
              this.imageSettings.editorExportFormat ||
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
      this.videoExportDetails.textContent = `${this.formatVideoExportPreflight(preflight)} · ${exportLabel}`;
    }
    void this.refreshVideoExportDiagnostics();
    this.updateTimelineHint();
  };

  proto.updateEditorExportControls = function () {
    const effectsOnly =
      this.imageSettings.editorExportMode === 'effects-chroma';
    const experimental = !!this.imageSettings.experimentalExportFeatures;
    if (!experimental) {
      this.imageSettings.editorExportFormat = 'webm';
      this.imageSettings.editorCopyAudio = false;
    }
    if (this.videoExportModeSelect)
      this.videoExportModeSelect.value = this.imageSettings.editorExportMode;
    if (this.editorExportPresetSelect) {
      this.editorExportPresetSelect.value =
        this.imageSettings.editorExportPreset || 'balanced';
      this.editorExportPresetSelect.disabled = this.isVideoExporting;
    }
    if (this.chkExperimentalExportFeatures) {
      this.chkExperimentalExportFeatures.checked = experimental;
      this.chkExperimentalExportFeatures.disabled = this.isVideoExporting;
    }
    if (this.editorExperimentalExportGroup) {
      this.editorExperimentalExportGroup.classList.toggle(
        'hidden',
        !experimental,
      );
    }
    if (this.editorStableExportDetails) {
      this.editorStableExportDetails.textContent = translateCurrent(
        effectsOnly
          ? 'Estable: WebM · solo efectos chroma'
          : 'Estable: WebM · sin audio',
      );
    }
    if (this.editorExportFormatSelect) {
      this.editorExportFormatSelect.value =
        this.imageSettings.editorExportFormat;
      this.editorExportFormatSelect.disabled =
        !experimental || effectsOnly || this.isVideoExporting;
    }
    if (this.chkEditorCopyAudio) {
      this.chkEditorCopyAudio.checked = !!this.imageSettings.editorCopyAudio;
      this.chkEditorCopyAudio.disabled =
        !experimental || effectsOnly || this.isVideoExporting;
    }
    if (this.effectsExportChromaGroup) {
      this.effectsExportChromaGroup.classList.toggle('hidden', !effectsOnly);
    }
    if (this.effectsExportChromaSelect) {
      this.effectsExportChromaSelect.value =
        this.imageSettings.effectsExportChroma;
      this.effectsExportChromaSelect.disabled =
        !effectsOnly || this.isVideoExporting;
    }
  };

  proto.applyEditorExportPreset = function (preset) {
    const value = [
      'fast',
      'balanced',
      'high',
      'chroma',
      'experimental-mp4',
    ].includes(preset)
      ? preset
      : 'balanced';
    const presets = {
      fast: {
        editorExportMode: 'full',
        experimentalExportFeatures: false,
        editorExportFormat: 'webm',
        editorCopyAudio: false,
        qualityEnhancer: false,
        qualityEnhancerStrength: 20,
      },
      balanced: {
        editorExportMode: 'full',
        experimentalExportFeatures: false,
        editorExportFormat: 'webm',
        editorCopyAudio: false,
        qualityEnhancer: false,
        qualityEnhancerStrength: 35,
      },
      high: {
        editorExportMode: 'full',
        experimentalExportFeatures: false,
        editorExportFormat: 'webm',
        editorCopyAudio: false,
        qualityEnhancer: true,
        qualityEnhancerStrength: 55,
      },
      chroma: {
        editorExportMode: 'effects-chroma',
        experimentalExportFeatures: false,
        editorExportFormat: 'webm',
        editorCopyAudio: false,
        effectsExportChroma: 'green',
        qualityEnhancer: false,
        qualityEnhancerStrength: 35,
      },
      'experimental-mp4': {
        editorExportMode: 'full',
        experimentalExportFeatures: true,
        editorExportFormat: 'mp4',
        editorCopyAudio: true,
        qualityEnhancer: false,
        qualityEnhancerStrength: 35,
      },
    };
    Object.assign(this.imageSettings, presets[value], {
      editorExportPreset: value,
    });
    this.updateImageControlsUI();
    this.updateVideoEditorUI();
    this.saveImageSettings();
  };

  proto.formatVideoExportDiagnosis = function (diagnosis, bitrate) {
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
    return `${translateCurrent('Diagnóstico')}: ${format} · ${diagnosis.codec} · ${this.formatVideoBitrate(bitrate)} · ${mode} · ${audio}`;
  };

  proto.refreshVideoExportDiagnostics = async function () {
    if (!this.videoExportDiagnostics || !this.videoSourceFile) return null;
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
    this.videoExportDiagnostics.textContent = `${this.formatVideoExportDiagnosis(
      diagnosis,
      preflight.bitrate,
    )} · ${translateCurrent(preflight.risk.recommendation)}`;
    return diagnosis;
  };

  proto.updateVideoTransport = function () {
    if (this.sourceMode !== 'video') return;
    const duration = this.videoTimeline.duration || 0;
    const currentTime = this.videoEl.currentTime || 0;
    this.videoSeek.value = String(currentTime);

    // Called every render tick during playback; the play/pause icon in
    // particular changes at most a few times per session, so an innerHTML
    // rewrite 30-60 times a second was pure waste.
    const timeLabel = `${this.formatDurationDetailed(currentTime)} / ${this.formatDurationDetailed(duration)}`;
    if (this._lastVideoTimeLabel !== timeLabel) {
      this._lastVideoTimeLabel = timeLabel;
      this.videoTimeLabel.textContent = timeLabel;
    }
    const paused = this.videoEl.paused;
    if (this._lastVideoPlayPaused !== paused) {
      this._lastVideoPlayPaused = paused;
      this.btnVideoPlay.innerHTML = paused
        ? '<i class="fa-solid fa-play"></i>'
        : '<i class="fa-solid fa-pause"></i>';
    }
    if (duration > 0) {
      const left = `${this.clamp((currentTime / duration) * 100, 0, 100)}%`;
      if (this._lastPlayheadLeft !== left) {
        this._lastPlayheadLeft = left;
        this.timelinePlayhead.style.left = left;
      }
    }
  };

  proto.getVideoPlayableEnd = function (end = this.videoTimeline?.trimEnd) {
    const duration =
      Number(this.videoTimeline?.duration || this.videoEl?.duration) || 0;
    const safeEnd = Number.isFinite(Number(end)) ? Number(end) : duration;
    return duration > 0 && safeEnd >= duration
      ? Math.max(0, duration - VIDEO_END_EPSILON)
      : Math.max(0, safeEnd);
  };

  proto.clampVideoSeekTime = function (time) {
    const start = Math.max(0, Number(this.videoTimeline?.trimStart) || 0);
    const end = this.getVideoPlayableEnd(this.videoTimeline?.trimEnd);
    return this.clamp(Number(time) || 0, start, Math.max(start, end));
  };

  proto.toggleVideoPlayback = async function () {
    if (!this.videoSourceFile || this.isVideoExporting) return;
    if (this.videoEl.paused) {
      const end = this.getVideoPlayableEnd(this.videoTimeline.trimEnd);
      if (
        this.videoEl.currentTime < this.videoTimeline.trimStart ||
        this.videoEl.currentTime >= end
      ) {
        this.cancelRenderLoop();
        this.videoEl.currentTime = this.videoTimeline.trimStart;
      }
      await this.videoEl
        .play()
        .catch(() =>
          this.showStatus(
            this.videoEditorStatus,
            'No se pudo reproducir el video.',
            'error',
          ),
        );
      if (!this.animFrameId) this.scheduleRenderLoop();
    } else {
      this.videoEl.pause();
    }
    this.updateVideoTransport();
  };

  proto.seekVideo = function (time) {
    if (!this.videoSourceFile || this.isVideoExporting) return;
    const previous = this.videoEl.currentTime || 0;
    const next = this.clampVideoSeekTime(time);
    if (this.visualFxEffect?.active && next !== previous) {
      this.visualFxEffect.onSeek?.();
    }
    this.videoEl.currentTime = next;
    this.updateVideoTransport();
    if (!this.animFrameId) this.scheduleRenderLoop();
  };

  proto.jumpVideo = function (seconds) {
    this.seekVideo((this.videoEl.currentTime || 0) + seconds);
  };

  proto.renderVideoExportFrame = async function (
    frameIndex,
    fps,
    exportMeta = {},
  ) {
    const start = this.videoTimeline.trimStart;
    const time = start + frameIndex / fps;
    const exportMode =
      exportMeta.mode || this.imageSettings.editorExportMode || 'full';
    this.updateVideoExportProgress(
      frameIndex,
      this.videoExportTotalFrames || 0,
      fps,
      { stage: frameIndex === 0 ? 'seek' : 'decode', time, force: true },
    );
    try {
      await this.advanceVideoForExport(time, fps, frameIndex);
    } catch (err) {
      if (this.videoExportPlayback && frameIndex > 0) {
        await this.reuseCurrentVideoExportFrame();
        this.updateVideoExportProgress(
          frameIndex,
          this.videoExportTotalFrames || 0,
          fps,
          {
            stage: 'frame-reuse',
            time,
            force: true,
            note: `frames_reutilizados:${this.videoExportSkippedFrames || 0}`,
          },
        );
      } else {
        this.updateVideoExportProgress(
          frameIndex,
          this.videoExportTotalFrames || 0,
          fps,
          {
            stage: 'seek-retry',
            time,
            force: true,
            note: err?.message || err?.name || 'seek_failed',
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
        this.videoExportTotalFrames || 0,
        fps,
        { stage: 'look', time },
      );
      this.applyVideoTimelineLook(time, { force: true });
    }
    this.updateVideoExportProgress(
      frameIndex,
      this.videoExportTotalFrames || 0,
      fps,
      { stage: 'detectors', time },
    );
    await this.syncVideoTimelineDetectorsAt(time, false);
    await this.syncVideoTimelineVisualFxAt?.(time, false);
    if (this.visualFxEffect?.active && !this.visualFxBypass) {
      await this.visualFxEffect.analyze(
        this.videoEl,
        time * 1000,
        this.renderEngine.getProfile('export'),
      );
    }
    this.updateVideoExportProgress(
      frameIndex,
      this.videoExportTotalFrames || 0,
      fps,
      { stage: 'canvas', time },
    );
    if (exportMode === 'effects-chroma') {
      this.ensureRecordingCanvas();
      this.renderEffectsOnlyFrame(
        this.recordingCanvas,
        this.recordingCtx,
        exportMeta.chromaColor ||
          getEditorChromaColor(this.imageSettings.effectsExportChroma),
        'export',
      );
    } else {
      this.renderSourceFrameBuffer(
        !!this.imageSettings.qualityEnhancer,
        'export',
      );
    }
    this.videoExportLastRenderedFrameIndex = frameIndex;
  };

  proto.updateVideoExportProgress = function (done, total, fps, meta = {}) {
    if (!this.videoExportSession || typeof this.clamp !== 'function') return;
    const now = performance.now();
    const force = !!meta.force || done >= total || meta.stage === 'error';
    if (
      !force &&
      this.videoExportLastUiUpdate &&
      now - this.videoExportLastUiUpdate < 250
    )
      return;
    this.videoExportLastUiUpdate = now;
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeDone = this.clamp(Number(done) || 0, 0, safeTotal);
    const progress = safeDone / safeTotal;
    this.exportProgressRatio = progress;
    const debug = this.formatExportDebugInfo
      ? this.formatExportDebugInfo({
          stage: meta.stage || 'encode',
          done: safeDone,
          total: safeTotal,
          fps,
          time:
            meta.time ??
            this.videoTimeline.trimStart +
              Math.max(0, safeDone - 1) / Math.max(1, Number(fps) || 1),
          width: this.recordingCanvas?.width || 0,
          height: this.recordingCanvas?.height || 0,
          queueSize: meta.queueSize || 0,
          note: meta.note || '',
        })
      : undefined;
    patchExportModalState({
      progress,
      summary: formatObservedExportProgress({
        done: safeDone,
        total: safeTotal,
        startedAt: this.videoExportSession.startedAt || now,
        now,
        fps,
        stage: meta.stage,
      }),
      ...(debug ? { debug } : {}),
    });
  };

  proto.runVideoExportViaWebCodecs = async function () {
    const { encodeCanvasSequence, formatExportDebugInfo } =
      await import('../../video-export.mjs');
    const preflight =
      this.videoExportPreflight || this.buildVideoExportPreflight();
    if (!preflight) throw new Error('video_export_preflight_missing');
    this.videoExportPreflight = preflight;
    const fps = preflight.fps;
    const start = this.videoTimeline.trimStart;
    const end = this.videoTimeline.trimEnd;
    const mode = preflight.mode;
    const totalFrames = preflight.totalFrames;
    this.ensureRecordingCanvas();
    this.formatExportDebugInfo = formatExportDebugInfo;
    this.videoExportTotalFrames = totalFrames;
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
      this.videoSourceFile.name.replace(/\.[^.]+$/, '') || 'hatewebcam-video';
    const suffix = mode === 'effects-chroma' ? 'efectos-chroma' : 'editado';
    this.videoExportFileName = `${baseName}-${suffix}.${diagnosis.extension || 'webm'}`;

    await this.prepareSequentialVideoExport(start);

    return encodeCanvasSequence({
      canvas: this.recordingCanvas,
      width: this.recordingCanvas.width,
      height: this.recordingCanvas.height,
      fps,
      totalFrames,
      duration: end - start,
      bitrate,
      requestedFormat: preflight.format,
      mode,
      chromaColor: this.imageSettings.effectsExportChroma,
      audioSourceFile: this.videoSourceFile,
      trimStart: start,
      trimEnd: end,
      copyAudio: !!preflight.copyAudio,
      diagnosis,
      renderFrame: (frameIndex, meta) =>
        this.renderVideoExportFrame(frameIndex, fps, meta),
      onProgress: (done, total, meta) =>
        this.updateVideoExportProgress(done, total, fps, meta),
      shouldCancel: () => !this.isVideoExporting,
    });
  };

  proto.finalizeVideoExportBlob = async function (blob) {
    if (
      blob?.exportInfo?.extension &&
      !this.videoExportFileName.endsWith(`.${blob.exportInfo.extension}`)
    ) {
      this.videoExportFileName = this.videoExportFileName.replace(
        /\.[^.]+$/,
        `.${blob.exportInfo.extension}`,
      );
    }
    this.downloadBlob(blob, this.videoExportFileName);
    this.showStatus(
      this.videoEditorStatus,
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
      summary: `${this.videoExportFileName} · ${this.formatBytes(blob.size)}${audioNote} · descarga iniciada`,
      showCancel: false,
      showClose: true,
    });
    this.cleanupVideoExport(true);
  };

  proto.startVideoExport = async function () {
    if (!this.videoSourceFile || this.isVideoExporting) return;
    if (typeof HTMLCanvasElement === 'undefined') {
      this.showStatus(
        this.videoEditorStatus,
        'Este navegador no puede exportar el video.',
        'error',
      );
      return;
    }

    if (
      typeof VideoEncoder === 'undefined' ||
      typeof VideoFrame === 'undefined'
    ) {
      this.showStatus(
        this.videoEditorStatus,
        'La exportación fiable requiere Chrome o Edge actualizado con WebCodecs.',
        'error',
      );
      return;
    }

    try {
      const preflight = this.buildVideoExportPreflight();
      if (!preflight) throw new Error('video_export_preflight_missing');
      this.videoExportPreflight = preflight;
      if (this.videoExportDetails) {
        this.videoExportDetails.textContent =
          this.formatVideoExportPreflight(preflight);
      }
      if (preflight.blocked) {
        if (this.videoExportDiagnostics) {
          this.videoExportDiagnostics.textContent =
            preflight.risk.recommendation;
        }
        this.showStatus(
          this.videoEditorStatus,
          'Exportación bloqueada por riesgo de memoria. Reducí duración o usá Rápido/Balanceado.',
          'error',
        );
        this.videoExportPreflight = null;
        return;
      }
      this.ensureRecordingCanvas();
      const diagnosis = await diagnoseVideoExportSupport({
        width: preflight.width,
        height: preflight.height,
        fps: preflight.fps,
        bitrate: preflight.bitrate,
        requestedFormat: preflight.format,
        mode: preflight.mode,
        copyAudio: preflight.copyAudio,
      });
      this.videoExportDiagnosis = diagnosis;
      if (this.videoExportDiagnostics) {
        this.videoExportDiagnostics.textContent = `${this.formatVideoExportDiagnosis(
          diagnosis,
          preflight.bitrate,
        )} · ${preflight.risk.recommendation}`;
      }
      if (!diagnosis.supported) {
        this.showStatus(
          this.videoEditorStatus,
          this.formatVideoExportDiagnosis(diagnosis, preflight.bitrate),
          'error',
        );
        this.videoExportPreflight = null;
        return;
      }
      this.flushPendingClipConfigSync();
      this.appliedTimelineItemIds = {
        look: '',
        blob: '',
        face: '',
        blink: '',
      };
      this.appliedVisualFxClipId = '';
      this.resetVisualFxTemporalState?.();
      this.videoExportRecoveredSource = false;
      this.videoExportSession.start(0);
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
      this.cancelRenderLoop();
      if ('wakeLock' in navigator) {
        this.videoExportWakeLock = await navigator.wakeLock
          .request('screen')
          .catch(() => null);
      }

      const blob = await this.runVideoExportViaWebCodecs();
      await this.finalizeVideoExportBlob(blob);
    } catch (err) {
      if (err?.message === 'export_cancelled') {
        this.cleanupVideoExport(true);
        return;
      }
      this.failVideoExport(err);
    }
  };

  proto.seekVideoForExport = function (time) {
    const target = this.clamp(
      time,
      0,
      this.getVideoPlayableEnd(this.videoTimeline.duration),
    );
    const tolerance = 0.02;
    if (Math.abs(this.videoEl.currentTime - target) <= tolerance)
      return this.waitForExportVideoFrame();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        clearInterval(poll);
        this.videoEl.removeEventListener('seeked', onSeeked);
        this.videoEl.removeEventListener('error', onError);
      };
      const isAtTarget = () =>
        Math.abs((this.videoEl.currentTime || 0) - target) <= tolerance &&
        this.videoEl.readyState >= 2;
      const fail = (err) => {
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
      this.videoEl.addEventListener('seeked', onSeeked, { once: true });
      this.videoEl.addEventListener('error', onError, { once: true });
      this.videoEl.currentTime = target;
    });
  };

  proto.canRecoverVideoExportSeek = function (err) {
    return (
      !this.videoExportRecoveredSource &&
      ['video_decode_failed', 'video_seek_timeout'].includes(err?.message)
    );
  };

  proto.recoverVideoSourceForExport = async function (time) {
    if (!this.videoSourceFile) throw new Error('video_decode_failed');
    this.videoExportRecoveredSource = true;
    this.updateVideoExportProgress(
      0,
      this.videoExportTotalFrames || 0,
      this.getVideoExportFps(),
      {
        stage: 'source-reload',
        time,
        force: true,
        note: 'recargando_video',
      },
    );

    const previousUrl = this.videoObjectUrl;
    const nextUrl = URL.createObjectURL(this.videoSourceFile);
    try {
      await new Promise((resolve, reject) => {
        let timeout = null;
        const cleanup = () => {
          clearTimeout(timeout);
          this.videoEl.removeEventListener('loadedmetadata', loaded);
          this.videoEl.removeEventListener('error', failed);
        };
        const loaded = () => {
          cleanup();
          resolve();
        };
        const failed = () => {
          cleanup();
          reject(new Error('video_decode_failed'));
        };
        timeout = setTimeout(() => {
          cleanup();
          reject(new Error('video_seek_timeout'));
        }, 5000);
        this.videoEl.addEventListener('loadedmetadata', loaded, {
          once: true,
        });
        this.videoEl.addEventListener('error', failed, { once: true });
        this.videoEl.pause();
        this.videoEl.srcObject = null;
        this.videoEl.src = nextUrl;
        this.videoEl.muted = true;
        this.videoEl.preload = 'auto';
        this.videoEl.load();
      });
      if (previousUrl && previousUrl !== nextUrl)
        URL.revokeObjectURL(previousUrl);
      this.videoObjectUrl = nextUrl;
    } catch (err) {
      URL.revokeObjectURL(nextUrl);
      if (previousUrl) {
        this.videoEl.src = previousUrl;
        this.videoEl.load();
      }
      throw err;
    }
  };

  proto.prepareSequentialVideoExport = async function (startTime) {
    this.videoExportPlayback = {
      originalPlaybackRate: this.videoEl.playbackRate || 1,
      originalMuted: this.videoEl.muted,
      playbackRate: VIDEO_EXPORT_PLAYBACK_RATE,
    };
    this.videoEl.muted = true;
    this.videoEl.playbackRate = this.videoExportPlayback.playbackRate;
    this.videoEl.pause();
    try {
      await this.seekVideoForExport(startTime);
    } catch (err) {
      if (!this.canRecoverVideoExportSeek(err)) throw err;
      await this.recoverVideoSourceForExport(startTime);
      await this.seekVideoForExport(startTime);
    }
  };

  proto.advanceVideoForExport = async function (
    targetTime,
    fps,
    frameIndex = 0,
  ) {
    if (!this.videoExportPlayback || frameIndex === 0)
      return this.seekVideoForExport(targetTime);
    const tolerance = Math.min(0.025, 0.45 / Math.max(1, Number(fps) || 1));
    const current = this.videoEl.currentTime || 0;
    if (Math.abs(current - targetTime) <= tolerance) return;
    if (current > targetTime + tolerance) {
      // Never touch the export playback rate here. playVideoUntilExportTime
      // reads it again for every frame, so lowering it once slowed the rest of
      // the export down to real time.
      this.videoEl.pause();
      return this.reuseCurrentVideoExportFrame();
    }
    return this.playVideoUntilExportTime(targetTime, tolerance);
  };

  proto.reuseCurrentVideoExportFrame = async function () {
    this.videoExportSkippedFrames = (this.videoExportSkippedFrames || 0) + 1;
  };

  proto.playVideoUntilExportTime = function (targetTime, tolerance) {
    if (typeof this.videoEl.play !== 'function')
      return this.reuseCurrentVideoExportFrame();
    this.videoEl.playbackRate = this.videoExportPlayback?.playbackRate || 1;
    return new Promise((resolve, reject) => {
      let frameCallbackId = null;
      const cleanup = () => {
        clearTimeout(timeout);
        this.videoEl.removeEventListener('error', onError);
        if (
          frameCallbackId != null &&
          typeof this.videoEl.cancelVideoFrameCallback === 'function'
        ) {
          this.videoEl.cancelVideoFrameCallback(frameCallbackId);
        }
      };
      const done = () => {
        this.videoEl.pause();
        cleanup();
        resolve();
      };
      const fail = (err) => {
        cleanup();
        reject(err);
      };
      const tick = () => {
        frameCallbackId = null;
        if (!this.isVideoExporting) {
          fail(new Error('export_cancelled'));
          return;
        }
        if (
          (this.videoEl.currentTime || 0) >= targetTime - tolerance ||
          this.videoEl.ended
        ) {
          done();
          return;
        }
        if (typeof this.videoEl.requestVideoFrameCallback === 'function') {
          frameCallbackId = this.videoEl.requestVideoFrameCallback(tick);
        } else {
          setTimeout(tick, 8);
        }
      };
      const onError = () => fail(new Error('video_decode_failed'));
      const secondsLeft = Math.max(
        0,
        targetTime - (this.videoEl.currentTime || 0),
      );
      const timeout = setTimeout(
        () => {
          cleanup();
          this.videoEl.pause();
          this.reuseCurrentVideoExportFrame().then(resolve, reject);
        },
        Math.max(700, secondsLeft * 1200 + 500),
      );
      this.videoEl.addEventListener('error', onError, { once: true });
      this.videoEl.play().then(tick, () => {
        cleanup();
        this.videoEl.pause();
        this.reuseCurrentVideoExportFrame().then(resolve, reject);
      });
    });
  };

  proto.waitForExportVideoFrame = function () {
    if (typeof this.videoEl.requestVideoFrameCallback !== 'function')
      return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(done, 120);
      this.videoEl.requestVideoFrameCallback(done);
    });
  };

  proto.cancelVideoExport = async function (showMessage = true) {
    if (!this.isVideoExporting) return;
    this.isVideoExporting = false;
    this.videoEl.pause();
    this.videoEl.playbackRate =
      this.videoExportPlayback?.originalPlaybackRate || 1;
    if (this.videoExportPlayback)
      this.videoEl.muted = this.videoExportPlayback.originalMuted;
    this.videoExportPlayback = null;
    if (showMessage)
      this.showStatus(
        this.videoEditorStatus,
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
  };

  proto.failVideoExport = function (err) {
    console.error('Video export failed:', err);
    const messages = {
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
      messages[err?.message] ||
      'La exportación falló. Revisá espacio libre y permisos.';
    this.showStatus(this.videoEditorStatus, message, 'error');
    void this.cancelVideoExport(false).then(() => {
      const detail = err?.message || err?.name || 'error_desconocido';
      const ratio = this.exportProgressRatio || 0;
      patchExportModalState({
        open: true,
        titleState: 'error',
        help: 'Revisá el detalle y volvé a intentarlo.',
        summary: `${message} · ${detail}`,
        showCancel: false,
        showClose: true,
        ...(this.formatExportDebugInfo
          ? {
              debug: this.formatExportDebugInfo({
                stage: 'error',
                done: Math.round(ratio * (this.videoExportTotalFrames || 0)),
                total: this.videoExportTotalFrames || 0,
                fps: this.getVideoExportFps(),
                width: this.recordingCanvas?.width || 0,
                height: this.recordingCanvas?.height || 0,
              }),
            }
          : {}),
      });
    });
  };

  proto.cleanupVideoExport = function (keepModal = false) {
    this.videoExportSession.stop();
    this.videoExportFileName = '';
    this.videoExportDiagnosis = null;
    this.videoExportPreflight = null;
    this.videoExportRecoveredSource = false;
    if (this.videoExportPlayback) {
      this.videoEl.pause();
      this.videoEl.playbackRate =
        this.videoExportPlayback.originalPlaybackRate || 1;
      this.videoEl.muted = this.videoExportPlayback.originalMuted;
      this.videoExportPlayback = null;
    }
    if (!keepModal) {
      this.videoExportTotalFrames = 0;
      this.videoExportLastRenderedFrameIndex = -1;
      this.videoExportSeekFallback = false;
      this.videoExportSkippedFrames = 0;
      this.exportProgressRatio = 0;
      patchExportModalState({ open: false, progress: 0, titleState: 'idle' });
      this.deactivateModalFocusTrap(this.videoExportModal);
    }
    void this.videoExportSession.releaseWakeLock();
    this.updateVideoEditorUI();
    this.updateVideoTransport();
    if (this.isRunning && this.videoSourceFile && !this.animFrameId)
      this.scheduleRenderLoop();
  };

  proto.closeVideoExportModal = function () {
    if (this.isVideoExporting) return;
    this.exportProgressRatio = 0;
    patchExportModalState({ open: false, progress: 0 });
    this.deactivateModalFocusTrap(this.videoExportModal);
  };
}
