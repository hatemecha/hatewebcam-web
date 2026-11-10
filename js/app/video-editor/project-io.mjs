import { VideoTimeline } from '../../editor/video-timeline.ts';

/** @param {import('../controller.mjs').AppController} proto */
export function applyVideoEditorProjectMixin(proto) {
  proto.buildEditorProjectData = function () {
    if (!this.videoSourceFile) return null;
    const timeline = this.videoTimeline.toJSON();
    return {
      version: 2,
      source: {
        name: this.videoSourceFile.name,
        size: this.videoSourceFile.size,
        duration: this.videoTimeline.duration,
        width: this.videoEl.videoWidth || 0,
        height: this.videoEl.videoHeight || 0,
        fps: this.videoSourceFps || 30,
      },
      trim: {
        start: this.videoTimeline.trimStart,
        end: this.videoTimeline.trimEnd,
      },
      timeline: {
        items: timeline.items,
        markers: timeline.markers,
      },
      settings: {
        editorExport: {
          editorExportPreset: this.imageSettings.editorExportPreset,
          editorExportFormat: this.imageSettings.editorExportFormat,
          editorExportMode: this.imageSettings.editorExportMode,
          editorCopyAudio: this.imageSettings.editorCopyAudio,
          experimentalExportFeatures:
            this.imageSettings.experimentalExportFeatures,
          effectsExportChroma: this.imageSettings.effectsExportChroma,
          qualityEnhancer: this.imageSettings.qualityEnhancer,
          qualityEnhancerStrength: this.imageSettings.qualityEnhancerStrength,
        },
        preview: {
          previewQuality: this.imageSettings.previewQuality,
          performanceMode: this.imageSettings.performanceMode,
        },
      },
      editAssist: this.editAssist?.toJSON?.() || null,
    };
  };

  proto.saveEditorProject = function () {
    const project = this.buildEditorProjectData();
    if (!project) {
      this.showStatus(
        this.videoEditorStatus,
        'Importá un video antes de guardar el proyecto.',
        'warning',
      );
      return;
    }
    const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], {
      type: 'application/json',
    });
    const basename =
      this.videoSourceFile.name.replace(/\.[^.]+$/, '') || 'hatewebcam';
    this.downloadBlob(blob, `${basename}.hatewebcam.json`);
    this.showStatus(this.videoEditorStatus, 'Proyecto guardado.', 'success');
  };

  proto.loadEditorProjectFile = async function (file) {
    try {
      const project = this.normalizeEditorProject(
        JSON.parse(await file.text()),
      );
      if (
        this.videoSourceFile &&
        this.editorProjectMatchesSource(project, this.videoSourceFile)
      ) {
        this.applyEditorProject(project);
        this.pendingEditorProject = null;
        this.showStatus(this.videoEditorStatus, 'Proyecto cargado.', 'success');
        return;
      }
      this.pendingEditorProject = project;
      this.showStatus(
        this.videoEditorStatus,
        'Proyecto cargado. Reimportá el video original para restaurarlo.',
        'warning',
      );
    } catch (err) {
      this.showStatus(
        this.videoEditorStatus,
        err?.message === 'invalid_project'
          ? 'El archivo de proyecto no es válido.'
          : 'No se pudo cargar el proyecto.',
        'error',
      );
    }
  };

  proto.normalizeEditorProject = function (project) {
    if (!project || !project.source || !project.timeline) {
      throw new Error('invalid_project');
    }
    if (project.version === 1) {
      return this.normalizeEditorProjectV2?.({
        ...project,
        version: 1,
      });
    }
    if (project.version !== 2) throw new Error('invalid_project');
    return this.normalizeEditorProjectV2?.(project) || project;
  };

  proto.editorProjectMatchesSource = function (project, file) {
    const source = project?.source || {};
    if (source.name && file?.name && source.name !== file.name) return false;
    if (source.size && file?.size && source.size !== file.size) return false;
    const projectDuration = Number(source.duration);
    if (
      Number.isFinite(projectDuration) &&
      this.videoEl?.duration &&
      Math.abs(projectDuration - this.videoEl.duration) > 0.5
    ) {
      return false;
    }
    return true;
  };

  proto.applyEditorProject = function (project) {
    const duration = Number(project.source?.duration || this.videoEl?.duration);
    this.videoTimeline = VideoTimeline.fromJSON(
      {
        ...project.timeline,
        trim: project.trim,
      },
      Number.isFinite(duration) ? duration : 0,
    );
    const editorExport = project.settings?.editorExport || {};
    Object.assign(this.imageSettings, {
      ...editorExport,
      ...(project.settings?.preview || {}),
    });
    this.selectedVideoEffectId = '';
    this.selectedVideoEffectIds = new Set();
    this.timelineClipboard = null;
    this.editAssist?.loadMetadata?.(project.editAssist);
    this.editorHistory?.clear();
    this.updateEditorHistoryButtons();
    if (this.videoTrimStart)
      this.videoTrimStart.value = this.videoTimeline.trimStart;
    if (this.videoTrimEnd) this.videoTrimEnd.value = this.videoTimeline.trimEnd;
    this.updateImageControlsUI();
    this.updateTimelineClipboardStatus();
    this.renderVideoTimeline();
    this.updateVideoEditorUI();
    if (this.videoSourceFile) void this.syncVideoTimelineEffects(true);
  };
}
