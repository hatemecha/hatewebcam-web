import { analyzeAudioTempo } from '../audio-tempo-analyzer.mjs';

export class EditAssistController {
  constructor(app, analyzer = analyzeAudioTempo) {
    this.app = app;
    this.analyzer = analyzer;
    this.result = null;
    this.isAnalyzing = false;
    this.isBound = false;
  }

  bind() {
    if (this.isBound) return;
    this.isBound = true;
    this.app.btnEditAssistAnalyze?.addEventListener('click', () => { void this.analyze(); });
    this.app.btnEditAssistBeat?.addEventListener('click', () => this.applyMarkers(1));
    this.app.btnEditAssistEvery2?.addEventListener('click', () => this.applyMarkers(2));
    this.app.btnEditAssistEvery4?.addEventListener('click', () => this.applyMarkers(4));
    this.app.btnEditAssistClear?.addEventListener('click', () => this.clearMarkers());
    this.updateUI();
  }

  reset() {
    this.result = null;
    this.isAnalyzing = false;
    this.updateUI();
  }

  updateUI() {
    const loaded = !!this.app.videoSourceFile;
    const hasBeats = !!this.result?.beats?.length;
    if (this.app.btnEditAssistAnalyze) {
      this.app.btnEditAssistAnalyze.disabled = !loaded || this.isAnalyzing || this.app.isVideoExporting;
      this.app.btnEditAssistAnalyze.innerHTML = this.isAnalyzing
        ? '<i class="fa-solid fa-spinner fa-spin"></i> Analizando...'
        : '<i class="fa-solid fa-wave-square"></i> Analizar audio';
    }
    [this.app.btnEditAssistBeat, this.app.btnEditAssistEvery2, this.app.btnEditAssistEvery4].forEach((button) => {
      if (button) button.disabled = !loaded || !hasBeats || this.isAnalyzing || this.app.isVideoExporting;
    });
    if (this.app.btnEditAssistClear) {
      const count = this.app.videoTimeline?.getMarkersBySource?.('edit-assist').length || 0;
      this.app.btnEditAssistClear.disabled = !loaded || !count || this.isAnalyzing || this.app.isVideoExporting;
    }
    if (!this.app.editAssistResult) return;
    if (!loaded) {
      this.app.editAssistResult.textContent = 'Importá un video para analizar su audio.';
    } else if (this.isAnalyzing) {
      this.app.editAssistResult.textContent = 'Analizando pulsos aproximados...';
    } else if (this.result?.bpm) {
      this.app.editAssistResult.textContent = `Tempo estimado: ${this.result.bpm} BPM · confianza ${this.formatConfidence(this.result.confidence)} · ${this.result.beats.length} marcadores posibles`;
    } else if (this.result) {
      this.app.editAssistResult.textContent = 'No encontré pulsos claros en el audio.';
    } else {
      this.app.editAssistResult.textContent = 'Detecta pulsos aproximados para sincronizar efectos.';
    }
  }

  async analyze() {
    if (!this.app.videoSourceFile || this.isAnalyzing) return;
    this.isAnalyzing = true;
    this.updateUI();
    try {
      this.result = await this.analyzer(this.app.videoSourceFile);
      this.show(this.result.bpm ? 'Audio analizado.' : 'No encontré pulsos claros.', this.result.bpm ? 'success' : 'warning');
    } catch (err) {
      this.result = null;
      this.show(this.formatError(err), 'error');
    } finally {
      this.isAnalyzing = false;
      this.updateUI();
    }
  }

  applyMarkers(step) {
    if (!this.result?.beats?.length || !this.app.videoTimeline?.addMarkers) return;
    const timeline = this.app.videoTimeline;
    const kind = step >= 4 ? 'bar' : 'beat';
    const markers = this.result.beats
      .filter((beat, index) => index % step === 0 && beat.time >= timeline.trimStart && beat.time <= timeline.trimEnd)
      .map((beat) => ({
        time: beat.time,
        kind,
        source: 'edit-assist',
        strength: beat.strength,
        label: kind === 'bar' ? 'Compás' : 'Beat',
      }));
    if (!markers.length) return;
    this.app.pushTimelineHistory?.();
    timeline.clearMarkersBySource('edit-assist');
    timeline.addMarkers(markers);
    this.app.renderVideoTimeline?.();
    this.app.updateTimelineHint?.();
    this.updateUI();
    this.show(`${markers.length} marcadores Edit Assist creados.`, 'success');
  }

  clearMarkers() {
    const timeline = this.app.videoTimeline;
    if (!timeline?.clearMarkersBySource || !timeline.getMarkersBySource('edit-assist').length) return;
    this.app.pushTimelineHistory?.();
    timeline.clearMarkersBySource('edit-assist');
    this.app.renderVideoTimeline?.();
    this.app.updateTimelineHint?.();
    this.updateUI();
    this.show('Marcadores Edit Assist eliminados.', 'success');
  }

  show(message, type) {
    if (this.app.editAssistStatus) this.app.showStatus(this.app.editAssistStatus, message, type);
  }

  formatConfidence(value) {
    if (value >= 0.7) return 'alta';
    if (value >= 0.4) return 'media';
    return 'baja';
  }

  formatError(err) {
    if (err?.message === 'audio_context_unavailable') return 'Este navegador no permite analizar audio.';
    if (err?.message === 'audio_track_missing') return 'Este video no tiene una pista de audio detectable.';
    if (err?.message === 'audio_track_undecodable') return 'El navegador no puede decodificar la pista de audio de este video.';
    if (err?.message === 'audio_decode_failed') return 'No pude leer el audio de este video.';
    return 'No se pudo analizar el audio.';
  }
}
