import { isVisualFxClipType } from '../../editor/timeline-clip-types.ts';
import {
  VideoTimeline,
  type TimelineItem,
  type TimelineMarker,
  type TimelineSourceData,
} from '../../editor/video-timeline.ts';
import {
  migrateProjectToV2,
  normalizeVisualConfig,
} from '../../visual-fx/config.ts';
import type { MessageKey } from '../../../src/lib/i18n/catalog.ts';
import type { ImageSettings } from '../constants.ts';
import type { EditAssistMetadata } from '../edit-assist-controller.ts';
import { downloadBlob, type StatusType } from '../feedback.ts';
import type { VideoEditorSession } from './session.ts';

type ExportSettings = Pick<
  ImageSettings,
  | 'editorExportPreset'
  | 'editorExportFormat'
  | 'editorExportMode'
  | 'editorCopyAudio'
  | 'experimentalExportFeatures'
  | 'effectsExportChroma'
  | 'qualityEnhancer'
  | 'qualityEnhancerStrength'
>;

type PreviewSettings = Pick<
  ImageSettings,
  'previewQuality' | 'performanceMode'
>;

interface ProjectSource {
  name?: string;
  size?: number;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
}

interface EditorProject {
  version: 2;
  source: ProjectSource;
  trim?: { start?: unknown; end?: unknown };
  timeline: Pick<TimelineSourceData, 'items' | 'markers'>;
  settings: {
    editorExport: Partial<ExportSettings>;
    preview: Partial<PreviewSettings>;
  };
  editAssist: EditAssistMetadata | null;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function member<T extends string>(value: unknown, values: readonly T[]) {
  return values.find((candidate) => candidate === value);
}

function parseItems(value: unknown): Array<Partial<TimelineItem>> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('invalid_project');
  return value.map((entry: unknown) => {
    const item = record(entry);
    const type = string(item?.type);
    if (!item || !type) throw new Error('invalid_project');
    return {
      id: string(item.id),
      type,
      startTime: number(item.startTime),
      endTime: number(item.endTime),
      config: isVisualFxClipType(type)
        ? { ...normalizeVisualConfig(item.config) }
        : (record(item.config) ?? {}),
    };
  });
}

function parseMarkers(value: unknown): Array<Partial<TimelineMarker>> {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('invalid_project');
  return value.map((entry: unknown) => {
    const marker = record(entry);
    if (!marker) throw new Error('invalid_project');
    return {
      id: string(marker.id),
      time: number(marker.time),
      kind: string(marker.kind),
      source: string(marker.source),
      strength: number(marker.strength),
      label: string(marker.label),
    };
  });
}

export function normalizeEditorProject(input: unknown): EditorProject {
  const data = record(input);
  const source = record(data?.source);
  const timeline = record(data?.timeline);
  if (!data || !source || !timeline) throw new Error('invalid_project');

  const migrated = migrateProjectToV2({ version: data.version, timeline });
  const settings = record(data.settings);
  const exportSettings = record(settings?.editorExport);
  const preview = record(settings?.preview);
  const trim = record(data.trim);
  const editAssist = record(data.editAssist);
  return {
    version: migrated.version,
    source: {
      name: string(source.name),
      size: number(source.size),
      duration: number(source.duration),
      width: number(source.width),
      height: number(source.height),
      fps: number(source.fps),
    },
    timeline: {
      items: parseItems(migrated.timeline.items),
      markers: parseMarkers(migrated.timeline.markers),
    },
    trim: trim && { start: trim.start, end: trim.end },
    settings: {
      editorExport: {
        editorExportPreset: member(exportSettings?.editorExportPreset, [
          'fast',
          'balanced',
          'high',
          'chroma',
          'experimental-mp4',
        ]),
        editorExportFormat: member(exportSettings?.editorExportFormat, [
          'auto',
          'webm',
          'mp4',
        ]),
        editorExportMode: member(exportSettings?.editorExportMode, [
          'full',
          'effects-chroma',
        ]),
        editorCopyAudio: boolean(exportSettings?.editorCopyAudio),
        experimentalExportFeatures: boolean(
          exportSettings?.experimentalExportFeatures,
        ),
        effectsExportChroma: member(exportSettings?.effectsExportChroma, [
          'green',
          'blue',
        ]),
        qualityEnhancer: boolean(exportSettings?.qualityEnhancer),
        qualityEnhancerStrength: number(
          exportSettings?.qualityEnhancerStrength,
        ),
      },
      preview: {
        previewQuality: member(preview?.previewQuality, [
          'draft',
          'balanced',
          'high',
          'full',
        ]),
        performanceMode: member(preview?.performanceMode, [
          'auto',
          'performance',
          'normal',
          'quality',
        ]),
      },
    },
    editAssist: editAssist
      ? {
          bpm: number(editAssist.bpm),
          detectedBpm: number(editAssist.detectedBpm),
          confidence: number(editAssist.confidence),
          offset: number(editAssist.offset),
          markerStep: number(editAssist.markerStep),
          generatedAt: number(editAssist.generatedAt),
        }
      : null,
  };
}

export interface ProjectOptions {
  video: HTMLVideoElement;
  getSourceFps: () => number;
  getImageSettings: () => ImageSettings;
  showStatus: (message: MessageKey, type: StatusType) => void;
  onRestore: () => void;
}

export class EditorProjects {
  private pending: EditorProject | null = null;
  private loadRequest = 0;

  constructor(
    private readonly session: Pick<
      VideoEditorSession,
      'source' | 'timeline' | 'history' | 'editAssist'
    >,
    private readonly options: ProjectOptions,
  ) {}

  build(): EditorProject | null {
    const file = this.session.source.file;
    if (!file) return null;
    const { videoWidth: width, videoHeight: height } = this.options.video;
    const { trim, items, markers } = this.session.timeline.toJSON();
    const {
      editorExportPreset,
      editorExportFormat,
      editorExportMode,
      editorCopyAudio,
      experimentalExportFeatures,
      effectsExportChroma,
      qualityEnhancer,
      qualityEnhancerStrength,
      previewQuality,
      performanceMode,
    } = this.options.getImageSettings();
    return {
      version: 2,
      source: {
        name: file.name,
        size: file.size,
        duration: this.session.timeline.duration,
        width,
        height,
        fps: this.options.getSourceFps() || 30,
      },
      trim,
      timeline: { items, markers },
      settings: {
        editorExport: {
          editorExportPreset,
          editorExportFormat,
          editorExportMode,
          editorCopyAudio,
          experimentalExportFeatures,
          effectsExportChroma,
          qualityEnhancer,
          qualityEnhancerStrength,
        },
        preview: { previewQuality, performanceMode },
      },
      editAssist: this.session.editAssist.toJSON(),
    };
  }

  save(): void {
    const project = this.build();
    if (!project) {
      this.options.showStatus(
        'Importá un video antes de guardar el proyecto.',
        'warning',
      );
      return;
    }
    const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], {
      type: 'application/json',
    });
    const basename =
      project.source.name?.replace(/\.[^.]+$/, '') || 'hatewebcam';
    downloadBlob(blob, `${basename}.hatewebcam.json`);
    this.options.showStatus('Proyecto guardado.', 'success');
  }

  async load(file: File): Promise<void> {
    const request = ++this.loadRequest;
    try {
      const raw = await file.text();
      if (request !== this.loadRequest) return;
      const project = normalizeEditorProject(JSON.parse(raw));
      const source = this.session.source.file;
      if (source && this.matches(project, source)) {
        this.restore(project);
        this.pending = null;
        this.options.showStatus('Proyecto cargado.', 'success');
      } else {
        this.pending = project;
        this.options.showStatus(
          'Proyecto cargado. Reimportá el video original para restaurarlo.',
          'warning',
        );
      }
    } catch (error) {
      if (request !== this.loadRequest) return;
      this.options.showStatus(
        error instanceof Error && error.message === 'invalid_project'
          ? 'El archivo de proyecto no es válido.'
          : 'No se pudo cargar el proyecto.',
        'error',
      );
    }
  }

  restorePending(file: File): 'none' | 'restored' | 'mismatch' {
    if (!this.pending) return 'none';
    if (!this.matches(this.pending, file)) return 'mismatch';
    this.restore(this.pending);
    this.pending = null;
    return 'restored';
  }

  private matches(project: EditorProject, file: File): boolean {
    const { name, size, duration } = project.source;
    if (name && file.name && name !== file.name) return false;
    if (size && file.size && size !== file.size) return false;
    const actual = this.options.video.duration;
    return (
      duration === undefined || !actual || Math.abs(duration - actual) <= 0.5
    );
  }

  private restore(project: EditorProject): void {
    const duration = project.source.duration || this.options.video.duration;
    this.session.timeline = VideoTimeline.fromJSON(
      { ...project.timeline, trim: project.trim },
      Number.isFinite(duration) ? duration : 0,
    );
    const settings = {
      ...project.settings.editorExport,
      ...project.settings.preview,
    };
    Object.assign(
      this.options.getImageSettings(),
      Object.fromEntries(
        Object.entries(settings).filter(([, value]) => value !== undefined),
      ),
    );
    this.session.editAssist.loadMetadata(project.editAssist);
    this.session.history.clear();
    this.options.onRestore();
  }
}
