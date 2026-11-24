import {
  analyzeAudioTempo,
  type TempoAnalysis,
  type TempoBeat,
} from '../audio-tempo-analyzer.ts';
import type { EditAssistView } from '../../src/lib/editor/edit-assist-panel.ts';
import type { MessageKey } from '../../src/lib/i18n/catalog.ts';
export type { TempoAnalysis, TempoBeat } from '../audio-tempo-analyzer.ts';

const DEFAULT_STEP = 4;

export interface EditAssistMarker {
  time: number;
  kind: 'beat' | 'bar';
  source: 'edit-assist';
  strength: number;
  label: 'Compás' | 'Beat';
}

export interface EditAssistTimeline {
  trimStart: number;
  trimEnd: number;
  addMarkers?(markers: EditAssistMarker[]): void;
  clearMarkersBySource?(source: string): void;
  getMarkersBySource?(source: string): { time: number }[];
}

export interface EditAssistOptions {
  getSourceFile?: () => File | null;
  getTimeline?: () => EditAssistTimeline | null;
  isExporting?: () => boolean;
  updatePanel?: (view: EditAssistView, actions: EditAssistController) => void;
  pushHistory?: () => void;
  renderTimeline?: () => void;
  updateTimelineHint?: () => void;
}

export type TempoAnalyzer = (file: File) => Promise<TempoAnalysis>;

export interface EditAssistMetadata {
  bpm?: number;
  detectedBpm?: number;
  confidence?: number;
  offset?: number;
  markerStep?: number;
  generatedAt?: number;
}

export class EditAssistController {
  options: EditAssistOptions;
  analyzer: TempoAnalyzer;
  result: TempoAnalysis | null = null;
  isAnalyzing = false;
  private analysisId = 0;
  private status: EditAssistView['status'] = null;
  manualBpm = 0;
  offsetMs = 0;
  markerStep = DEFAULT_STEP;
  generatedAt = 0;

  constructor(
    options: EditAssistOptions,
    analyzer: TempoAnalyzer = analyzeAudioTempo,
  ) {
    this.options = options;
    this.analyzer = analyzer;
  }

  reset(): void {
    this.analysisId += 1;
    this.status = null;
    this.result = null;
    this.isAnalyzing = false;
    this.manualBpm = 0;
    this.offsetMs = 0;
    this.markerStep = DEFAULT_STEP;
    this.generatedAt = 0;
    this.updateUI();
  }

  get sourceFile(): File | null {
    return this.options.getSourceFile?.() ?? null;
  }

  get timeline(): EditAssistTimeline | null {
    return this.options.getTimeline?.() ?? null;
  }

  get isExporting(): boolean {
    return !!this.options.isExporting?.();
  }

  get effectiveBpm(): number {
    return this.manualBpm || this.result?.bpm || 0;
  }

  updateUI(): void {
    const loaded = this.sourceFile !== null;
    const available = loaded && !this.isAnalyzing && !this.isExporting;
    const hasBeats = Boolean(this.result?.beats.length && this.effectiveBpm);
    const markerCount =
      this.timeline?.getMarkersBySource?.('edit-assist').length ?? 0;
    this.options.updatePanel?.(
      {
        loaded,
        analyzing: this.isAnalyzing,
        canAnalyze: available,
        canAdjust: available && this.result !== null,
        canGenerate: available && hasBeats,
        canClear: available && markerCount > 0,
        detectedBpm: this.result?.bpm ?? 0,
        bpm: this.effectiveBpm,
        offsetMs: this.offsetMs,
        markerStep: this.markerStep,
        confidence: this.result?.confidence ?? 0,
        hasResult: this.result !== null,
        status: this.status,
      },
      this,
    );
  }

  setBpm(value: number): number {
    this.manualBpm = this.normalizeBpm(value);
    this.updateUI();
    return this.effectiveBpm;
  }

  setOffset(value: number): number {
    this.offsetMs = this.normalizeOffset(value);
    this.updateUI();
    return this.offsetMs;
  }

  setMarkerStep(value: number): void {
    this.markerStep = this.normalizeStep(value);
    this.updateUI();
  }

  async analyze(): Promise<void> {
    const file = this.sourceFile;
    if (!file || this.isAnalyzing || this.isExporting) return;
    const analysisId = ++this.analysisId;
    this.isAnalyzing = true;
    this.updateUI();
    try {
      const result = await this.analyzer(file);
      if (analysisId !== this.analysisId) return;
      this.result = result;
      this.manualBpm = this.normalizeBpm(result.bpm);
      this.offsetMs = 0;
      this.generatedAt = 0;
      this.status = result.bpm
        ? { message: 'Audio analizado.', type: 'success' }
        : { message: 'No encontré pulsos claros.', type: 'warning' };
    } catch (error) {
      if (analysisId !== this.analysisId) return;
      this.result = null;
      this.manualBpm = 0;
      this.offsetMs = 0;
      this.status = { message: this.formatError(error), type: 'error' };
    } finally {
      if (analysisId === this.analysisId) {
        this.isAnalyzing = false;
        this.updateUI();
      }
    }
  }

  scaleBpm(factor: number): void {
    const bpm = this.normalizeBpm(this.effectiveBpm * factor);
    if (!bpm) return;
    this.manualBpm = bpm;
    this.updateUI();
  }

  shiftOffset(deltaMs: number): void {
    this.offsetMs = this.normalizeOffset(this.offsetMs + deltaMs);
    this.updateUI();
  }

  buildBeatGrid(): TempoBeat[] {
    const timeline = this.timeline;
    const bpm = this.effectiveBpm;
    const firstBeat = this.result?.beats?.[0]?.time;
    if (!timeline || !bpm || !Number.isFinite(firstBeat)) return [];
    const period = 60 / bpm;
    let time = (firstBeat ?? 0) + this.offsetMs / 1000;
    while (time - period >= timeline.trimStart) time -= period;
    const beats: TempoBeat[] = [];
    for (; time <= timeline.trimEnd + 0.001; time += period) {
      if (time >= timeline.trimStart - 0.001) {
        beats.push({
          time: Math.round(time * 1000) / 1000,
          strength: 0.5,
        });
      }
    }
    return beats;
  }

  applyMarkers(step: number = this.markerStep): void {
    const timeline = this.timeline;
    if (!this.result?.beats?.length || !timeline?.addMarkers) return;
    this.markerStep = this.normalizeStep(step);
    const kind: 'beat' | 'bar' = this.markerStep >= 4 ? 'bar' : 'beat';
    const markers: EditAssistMarker[] = this.buildBeatGrid()
      .filter((_, index) => index % this.markerStep === 0)
      .map((beat) => ({
        time: beat.time,
        kind,
        source: 'edit-assist',
        strength: beat.strength,
        label: kind === 'bar' ? 'Compás' : 'Beat',
      }));
    if (!markers.length) return;
    this.options.pushHistory?.();
    timeline.clearMarkersBySource?.('edit-assist');
    timeline.addMarkers(markers);
    this.generatedAt = Date.now();
    this.options.renderTimeline?.();
    this.options.updateTimelineHint?.();
    this.status = {
      message: ' marcadores Edit Assist creados.',
      type: 'success',
      count: markers.length,
    };
    this.updateUI();
  }

  clearMarkers(): void {
    const timeline = this.timeline;
    if (
      !timeline?.clearMarkersBySource ||
      !timeline.getMarkersBySource?.('edit-assist').length
    )
      return;
    this.options.pushHistory?.();
    timeline.clearMarkersBySource('edit-assist');
    this.options.renderTimeline?.();
    this.options.updateTimelineHint?.();
    this.status = {
      message: 'Marcadores Edit Assist eliminados.',
      type: 'success',
    };
    this.updateUI();
  }

  toJSON(): {
    bpm: number;
    detectedBpm: number;
    confidence: number;
    offset: number;
    markerStep: number;
    generatedAt: number;
  } | null {
    if (!this.result) return null;
    return {
      bpm: this.effectiveBpm,
      detectedBpm: this.result.bpm || 0,
      confidence: this.result.confidence || 0,
      offset: this.offsetMs / 1000,
      markerStep: this.markerStep,
      generatedAt: this.generatedAt || Date.now(),
    };
  }

  loadMetadata(metadata: EditAssistMetadata | null): void {
    this.reset();
    if (!metadata) return;
    this.result = {
      bpm: Number(metadata.detectedBpm || metadata.bpm) || 0,
      confidence: Number(metadata.confidence) || 0,
      beats: [{ time: 0, strength: 0.5 }],
    };
    this.manualBpm = this.normalizeBpm(metadata.bpm);
    this.offsetMs = this.normalizeOffset(Number(metadata.offset || 0) * 1000);
    this.markerStep = this.normalizeStep(metadata.markerStep);
    this.generatedAt = Number(metadata.generatedAt) || 0;
    this.updateUI();
  }

  normalizeBpm(value: unknown): number {
    const bpm = Number(value);
    if (!Number.isFinite(bpm) || bpm <= 0) return 0;
    return Math.round(Math.min(320, Math.max(20, bpm)) * 10) / 10;
  }

  normalizeOffset(value: unknown): number {
    const offset = Number(value);
    if (!Number.isFinite(offset)) return 0;
    return Math.round(Math.min(5000, Math.max(-5000, offset)));
  }

  normalizeStep(value: unknown): number {
    const step = Number(value);
    return [1, 2, 4, 8].includes(step) ? step : DEFAULT_STEP;
  }

  private formatError(err: unknown): MessageKey {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message)
        : '';
    if (message === 'audio_context_unavailable')
      return 'Este navegador no permite analizar audio.';
    if (message === 'audio_track_missing')
      return 'Este video no tiene una pista de audio detectable.';
    if (message === 'audio_track_undecodable')
      return 'El navegador no puede decodificar la pista de audio de este video.';
    if (message === 'audio_decode_failed')
      return 'No pude leer el audio de este video.';
    return 'No se pudo analizar el audio.';
  }
}
