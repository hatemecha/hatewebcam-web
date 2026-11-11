import { analyzeAudioTempo } from '../audio-tempo-analyzer.mjs';
import { translateCurrent } from '../../src/lib/i18n/translate.ts';

const DEFAULT_STEP = 4;

export interface TempoBeat {
  time: number;
  strength: number;
}

export interface TempoAnalysis {
  bpm: number;
  confidence: number;
  beats: TempoBeat[];
}

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

export interface EditAssistElements {
  analyzeButton?: HTMLButtonElement | null;
  beatButton?: HTMLButtonElement | null;
  every2Button?: HTMLButtonElement | null;
  every4Button?: HTMLButtonElement | null;
  every8Button?: HTMLButtonElement | null;
  halfButton?: HTMLButtonElement | null;
  doubleButton?: HTMLButtonElement | null;
  offsetDownButton?: HTMLButtonElement | null;
  offsetUpButton?: HTMLButtonElement | null;
  regenerateButton?: HTMLButtonElement | null;
  clearButton?: HTMLButtonElement | null;
  bpmInput?: HTMLInputElement | null;
  offsetInput?: HTMLInputElement | null;
  densitySelect?: HTMLSelectElement | null;
  result?: HTMLElement | null;
  status?: HTMLElement | null;
}

export interface EditAssistOptions {
  getSourceFile?: () => File | null;
  getTimeline?: () => EditAssistTimeline | null;
  isExporting?: () => boolean;
  getElements?: () => EditAssistElements;
  pushHistory?: () => void;
  renderTimeline?: () => void;
  showStatus?: (element: HTMLElement, message: string, type: string) => void;
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
  isBound = false;
  manualBpm = 0;
  offsetMs = 0;
  markerStep = DEFAULT_STEP;
  generatedAt = 0;

  constructor(
    options: EditAssistOptions,
    analyzer: TempoAnalyzer = analyzeAudioTempo as TempoAnalyzer,
  ) {
    this.options = options;
    this.analyzer = analyzer;
  }

  bind(): void {
    if (this.isBound) return;
    this.isBound = true;
    const el = this.getElements();
    el.analyzeButton?.addEventListener('click', () => {
      void this.analyze();
    });
    el.beatButton?.addEventListener('click', () => this.applyMarkers(1));
    el.every2Button?.addEventListener('click', () => this.applyMarkers(2));
    el.every4Button?.addEventListener('click', () => this.applyMarkers(4));
    el.every8Button?.addEventListener('click', () => this.applyMarkers(8));
    el.halfButton?.addEventListener('click', () => this.scaleBpm(0.5));
    el.doubleButton?.addEventListener('click', () => this.scaleBpm(2));
    el.offsetDownButton?.addEventListener('click', () => this.shiftOffset(-10));
    el.offsetUpButton?.addEventListener('click', () => this.shiftOffset(10));
    el.regenerateButton?.addEventListener('click', () =>
      this.applyMarkers(this.markerStep),
    );
    el.bpmInput?.addEventListener('change', () => {
      this.manualBpm = this.normalizeBpm(el.bpmInput?.value);
      this.syncControls();
      this.updateUI();
    });
    el.offsetInput?.addEventListener('change', () => {
      this.offsetMs = this.normalizeOffset(el.offsetInput?.value);
      this.syncControls();
      this.updateUI();
    });
    el.densitySelect?.addEventListener('change', () => {
      this.markerStep = this.normalizeStep(el.densitySelect?.value);
      this.syncControls();
      this.updateUI();
    });
    this.updateUI();
  }

  reset(): void {
    this.result = null;
    this.isAnalyzing = false;
    this.manualBpm = 0;
    this.offsetMs = 0;
    this.markerStep = DEFAULT_STEP;
    this.generatedAt = 0;
    this.updateUI();
  }

  getElements(): EditAssistElements {
    return this.options.getElements?.() ?? {};
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
    const el = this.getElements();
    const loaded = !!this.sourceFile;
    const hasBeats = !!this.result?.beats?.length && !!this.effectiveBpm;
    if (el.analyzeButton) {
      el.analyzeButton.disabled =
        !loaded || this.isAnalyzing || this.isExporting;
      el.analyzeButton.innerHTML = this.isAnalyzing
        ? `<i class="fa-solid fa-spinner fa-spin"></i> ${translateCurrent('Analizando...')}`
        : `<i class="fa-solid fa-wave-square"></i> ${translateCurrent('Analizar audio')}`;
    }
    [
      el.beatButton,
      el.every2Button,
      el.every4Button,
      el.every8Button,
      el.halfButton,
      el.doubleButton,
      el.offsetDownButton,
      el.offsetUpButton,
      el.regenerateButton,
    ].forEach((button) => {
      if (button)
        button.disabled =
          !loaded || !hasBeats || this.isAnalyzing || this.isExporting;
    });
    [el.bpmInput, el.offsetInput, el.densitySelect].forEach((input) => {
      if (input)
        input.disabled =
          !loaded || !this.result || this.isAnalyzing || this.isExporting;
    });
    if (el.clearButton) {
      const count =
        this.timeline?.getMarkersBySource?.('edit-assist').length ?? 0;
      el.clearButton.disabled =
        !loaded || !count || this.isAnalyzing || this.isExporting;
    }
    this.syncControls();
    if (!el.result) return;
    if (!loaded) {
      el.result.textContent = translateCurrent(
        'Importá un video para analizar su audio.',
      );
    } else if (this.isAnalyzing) {
      el.result.textContent = translateCurrent(
        'Analizando pulsos aproximados...',
      );
    } else if (this.result?.bpm) {
      el.result.textContent = `${translateCurrent('Tempo estimado:')} ${this.result.bpm} BPM ${translateCurrent(' · usado ')}${this.effectiveBpm} BPM · offset ${this.offsetMs} ms ${translateCurrent(' · confianza ')}${translateCurrent(this.formatConfidence(this.result.confidence))}`;
    } else if (this.result) {
      el.result.textContent = translateCurrent(
        'No encontré pulsos claros en el audio.',
      );
    } else {
      // The help text above already explains what the analysis does; repeating
      // it here filled the status line with the same sentence twice.
      el.result.textContent = translateCurrent('Sin analizar');
    }
  }

  syncControls(): void {
    const el = this.getElements();
    if (el.bpmInput) el.bpmInput.value = String(this.effectiveBpm || '');
    if (el.offsetInput) el.offsetInput.value = String(this.offsetMs);
    if (el.densitySelect) el.densitySelect.value = String(this.markerStep);
    (
      [
        [el.beatButton, 1],
        [el.every2Button, 2],
        [el.every4Button, 4],
        [el.every8Button, 8],
      ] as const
    ).forEach(([button, step]) => {
      button?.classList.toggle('is-active', step === this.markerStep);
    });
  }

  async analyze(): Promise<void> {
    if (!this.sourceFile || this.isAnalyzing) return;
    this.isAnalyzing = true;
    this.updateUI();
    try {
      this.result = await this.analyzer(this.sourceFile);
      this.manualBpm = this.normalizeBpm(this.result.bpm);
      this.offsetMs = 0;
      this.generatedAt = 0;
      this.show(
        this.result.bpm ? 'Audio analizado.' : 'No encontré pulsos claros.',
        this.result.bpm ? 'success' : 'warning',
      );
    } catch (err) {
      this.result = null;
      this.manualBpm = 0;
      this.offsetMs = 0;
      this.show(this.formatError(err), 'error');
    } finally {
      this.isAnalyzing = false;
      this.updateUI();
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
    this.updateUI();
    this.show(`${markers.length} marcadores Edit Assist creados.`, 'success');
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
    this.updateUI();
    this.show('Marcadores Edit Assist eliminados.', 'success');
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

  show(message: string, type: string): void {
    const el = this.getElements();
    if (el.status) this.options.showStatus?.(el.status, message, type);
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

  formatConfidence(value: number): string {
    if (value >= 0.7) return 'alta';
    if (value >= 0.4) return 'media';
    return 'baja';
  }

  formatError(err: unknown): string {
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
