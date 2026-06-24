import { analyzeAudioTempo } from '../audio-tempo-analyzer.mjs';

const DEFAULT_STEP = 4;

export class EditAssistController {
  constructor(options, analyzer = analyzeAudioTempo) {
    this.options = options;
    this.analyzer = analyzer;
    this.result = null;
    this.isAnalyzing = false;
    this.isBound = false;
    this.manualBpm = 0;
    this.offsetMs = 0;
    this.markerStep = DEFAULT_STEP;
    this.generatedAt = 0;
  }

  bind() {
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
      this.manualBpm = this.normalizeBpm(el.bpmInput.value);
      this.syncControls();
      this.updateUI();
    });
    el.offsetInput?.addEventListener('change', () => {
      this.offsetMs = this.normalizeOffset(el.offsetInput.value);
      this.syncControls();
      this.updateUI();
    });
    el.densitySelect?.addEventListener('change', () => {
      this.markerStep = this.normalizeStep(el.densitySelect.value);
      this.syncControls();
      this.updateUI();
    });
    this.updateUI();
  }

  reset() {
    this.result = null;
    this.isAnalyzing = false;
    this.manualBpm = 0;
    this.offsetMs = 0;
    this.markerStep = DEFAULT_STEP;
    this.generatedAt = 0;
    this.updateUI();
  }

  getElements() {
    return this.options.getElements?.() || {};
  }

  get sourceFile() {
    return this.options.getSourceFile?.() || null;
  }

  get timeline() {
    return this.options.getTimeline?.() || null;
  }

  get isExporting() {
    return !!this.options.isExporting?.();
  }

  get effectiveBpm() {
    return this.manualBpm || this.result?.bpm || 0;
  }

  updateUI() {
    const el = this.getElements();
    const loaded = !!this.sourceFile;
    const hasBeats = !!this.result?.beats?.length && !!this.effectiveBpm;
    if (el.analyzeButton) {
      el.analyzeButton.disabled =
        !loaded || this.isAnalyzing || this.isExporting;
      el.analyzeButton.innerHTML = this.isAnalyzing
        ? '<i class="fa-solid fa-spinner fa-spin"></i> Analizando...'
        : '<i class="fa-solid fa-wave-square"></i> Analizar audio';
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
        this.timeline?.getMarkersBySource?.('edit-assist').length || 0;
      el.clearButton.disabled =
        !loaded || !count || this.isAnalyzing || this.isExporting;
    }
    this.syncControls();
    if (!el.result) return;
    if (!loaded) {
      el.result.textContent = 'Importá un video para analizar su audio.';
    } else if (this.isAnalyzing) {
      el.result.textContent = 'Analizando pulsos aproximados...';
    } else if (this.result?.bpm) {
      el.result.textContent = `Tempo estimado: ${this.result.bpm} BPM · usado ${this.effectiveBpm} BPM · offset ${this.offsetMs} ms · confianza ${this.formatConfidence(this.result.confidence)}`;
    } else if (this.result) {
      el.result.textContent = 'No encontré pulsos claros en el audio.';
    } else {
      el.result.textContent =
        'Detecta pulsos aproximados para sincronizar efectos.';
    }
  }

  syncControls() {
    const el = this.getElements();
    if (el.bpmInput) el.bpmInput.value = this.effectiveBpm || '';
    if (el.offsetInput) el.offsetInput.value = String(this.offsetMs);
    if (el.densitySelect) el.densitySelect.value = String(this.markerStep);
  }

  async analyze() {
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

  scaleBpm(factor) {
    const bpm = this.normalizeBpm(this.effectiveBpm * factor);
    if (!bpm) return;
    this.manualBpm = bpm;
    this.updateUI();
  }

  shiftOffset(deltaMs) {
    this.offsetMs = this.normalizeOffset(this.offsetMs + deltaMs);
    this.updateUI();
  }

  buildBeatGrid() {
    const timeline = this.timeline;
    const bpm = this.effectiveBpm;
    const firstBeat = this.result?.beats?.[0]?.time;
    if (!timeline || !bpm || !Number.isFinite(firstBeat)) return [];
    const period = 60 / bpm;
    let time = firstBeat + this.offsetMs / 1000;
    while (time - period >= timeline.trimStart) time -= period;
    const beats = [];
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

  applyMarkers(step = this.markerStep) {
    const timeline = this.timeline;
    if (!this.result?.beats?.length || !timeline?.addMarkers) return;
    this.markerStep = this.normalizeStep(step);
    const kind = this.markerStep >= 4 ? 'bar' : 'beat';
    const markers = this.buildBeatGrid()
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
    timeline.clearMarkersBySource('edit-assist');
    timeline.addMarkers(markers);
    this.generatedAt = Date.now();
    this.options.renderTimeline?.();
    this.options.updateTimelineHint?.();
    this.updateUI();
    this.show(`${markers.length} marcadores Edit Assist creados.`, 'success');
  }

  clearMarkers() {
    const timeline = this.timeline;
    if (
      !timeline?.clearMarkersBySource ||
      !timeline.getMarkersBySource('edit-assist').length
    )
      return;
    this.options.pushHistory?.();
    timeline.clearMarkersBySource('edit-assist');
    this.options.renderTimeline?.();
    this.options.updateTimelineHint?.();
    this.updateUI();
    this.show('Marcadores Edit Assist eliminados.', 'success');
  }

  toJSON() {
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

  loadMetadata(metadata) {
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

  show(message, type) {
    const el = this.getElements();
    if (el.status) this.options.showStatus?.(el.status, message, type);
  }

  normalizeBpm(value) {
    const bpm = Number(value);
    if (!Number.isFinite(bpm) || bpm <= 0) return 0;
    return Math.round(Math.min(320, Math.max(20, bpm)) * 10) / 10;
  }

  normalizeOffset(value) {
    const offset = Number(value);
    if (!Number.isFinite(offset)) return 0;
    return Math.round(Math.min(5000, Math.max(-5000, offset)));
  }

  normalizeStep(value) {
    const step = Number(value);
    return [1, 2, 4, 8].includes(step) ? step : DEFAULT_STEP;
  }

  formatConfidence(value) {
    if (value >= 0.7) return 'alta';
    if (value >= 0.4) return 'media';
    return 'baja';
  }

  formatError(err) {
    if (err?.message === 'audio_context_unavailable')
      return 'Este navegador no permite analizar audio.';
    if (err?.message === 'audio_track_missing')
      return 'Este video no tiene una pista de audio detectable.';
    if (err?.message === 'audio_track_undecodable')
      return 'El navegador no puede decodificar la pista de audio de este video.';
    if (err?.message === 'audio_decode_failed')
      return 'No pude leer el audio de este video.';
    return 'No se pudo analizar el audio.';
  }
}
