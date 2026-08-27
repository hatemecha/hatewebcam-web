import {
  SUBJECT_PRESET_IDS,
  SUBJECT_PRESET_LABELS,
  SUBJECT_PRESET_HINTS,
  SUBJECT_BASIC_CONTROLS,
} from '../effects/subject-fx/subject-presets.mjs';
import { SUBJECT_ANALYSIS_STATUS } from '../subject/subject-analyzer.mjs';

const REACTIVITY_SEGMENTS = Object.freeze([
  { id: 'fixed', label: 'Fijo' },
  { id: 'motion', label: 'Motion' },
  { id: 'beat', label: 'Beat' },
  { id: 'motion-beat', label: 'Both' },
]);

function seedToVariation(seed = 0) {
  return (Math.abs(Math.round(seed)) % 999) + 1;
}

function getSubjectStatusMeta(analyzer, bypass) {
  if (bypass) {
    return { tone: 'muted', label: 'Bypass activo', detail: '', showRetry: false };
  }
  const status = analyzer?.status || 'idle';
  switch (status) {
    case SUBJECT_ANALYSIS_STATUS.preparing:
      return { tone: 'pending', label: 'Preparando sujeto…', detail: '', showRetry: false };
    case SUBJECT_ANALYSIS_STATUS.analyzing:
      return { tone: 'pending', label: 'Analizando sujeto…', detail: '', showRetry: false };
    case SUBJECT_ANALYSIS_STATUS.detected:
      return {
        tone: 'ready',
        label: 'Sujeto detectado',
        detail: analyzer?.segmentationSource || '',
        showRetry: false,
      };
    case SUBJECT_ANALYSIS_STATUS.ready:
      return { tone: 'ready', label: 'Sujeto listo', detail: '', showRetry: false };
    case SUBJECT_ANALYSIS_STATUS.simplified:
      return {
        tone: 'warning',
        label: 'Modo simplificado',
        detail: 'Segmentación limitada',
        showRetry: false,
      };
    case SUBJECT_ANALYSIS_STATUS.lost:
      return { tone: 'warning', label: 'Sin sujeto en frame', detail: '', showRetry: true };
    case SUBJECT_ANALYSIS_STATUS.error:
      return {
        tone: 'error',
        label: analyzer?.statusMessage || 'No se pudo detectar el sujeto',
        detail: '',
        showRetry: true,
      };
    default:
      return { tone: 'muted', label: 'Esperando análisis', detail: '', showRetry: false };
  }
}

/** @param {import('./controller.mjs').AppController} proto */
export function applySubjectFxUIMixin(proto) {
  proto.getSubjectVariationNumber = function (seed = 0) {
    return seedToVariation(seed);
  };

  proto.isPlayheadInsideSelectedSubjectClip = function (item) {
    if (!item || item.type !== 'subject') return false;
    const t = this.videoEl?.currentTime || 0;
    return t >= item.startTime && t < item.endTime;
  };

  proto.renderSubjectFxInspector = function () {
    if (!this.subjectFxInspectorHost) return;
    const item = this.getSelectedVideoEffectItem?.();
    const show = item?.type === 'subject';
    this.subjectFxInspectorHost.classList.toggle('hidden', !show);
    if (!show) return;

    const config = item.config || this.snapshotSubjectFxConfig();
    const preset = config.preset || 'anatomy';
    const basicControls = SUBJECT_BASIC_CONTROLS[preset] || SUBJECT_BASIC_CONTROLS.anatomy;
    const status = getSubjectStatusMeta(this.subjectFxEffect?.analyzer, this.subjectFxBypass);
    const outsideClip = !this.isPlayheadInsideSelectedSubjectClip(item);
    const variation = seedToVariation(config.seed);
    const hint = SUBJECT_PRESET_HINTS[preset] || '';
    const fxActive = !this.subjectFxBypass;

    const presetButtons = SUBJECT_PRESET_IDS.map((presetId) => {
      const spanClass =
        presetId === 'dissolve' ? ' subject-preset-span-2' : '';
      return `
      <button type="button"
        class="subject-preset-btn${config.preset === presetId ? ' is-active' : ''}${spanClass}"
        data-subject-preset="${presetId}"
        aria-pressed="${config.preset === presetId}">
        ${SUBJECT_PRESET_LABELS[presetId]}
      </button>`;
    }).join('');

    const reactivitySegments = REACTIVITY_SEGMENTS.map(
      (segment) => `
      <button type="button"
        class="subject-segment${config.reactivity === segment.id ? ' is-active' : ''}"
        data-subject-reactivity="${segment.id}"
        aria-pressed="${config.reactivity === segment.id}">
        ${segment.label}
      </button>`,
    ).join('');

    const controlBlock = (key, label, idPrefix, val, min, max) => {
      if (!basicControls.includes(key)) return '';
      return this.slider(
        `sld${idPrefix}`,
        `val${idPrefix}`,
        label,
        Math.round(val * (key === 'scale' ? 100 : 100)),
        min,
        max,
      );
    };

    this.subjectFxInspectorHost.innerHTML = `
      <div class="subject-inspector">
        <header class="subject-inspector-head">
          <div class="subject-inspector-title">Subject FX</div>
          <div class="subject-status-row">
            <div class="subject-status-pill subject-status-pill--${status.tone}" role="status">
              <span class="subject-status-dot" aria-hidden="true"></span>
              <span class="subject-status-text">${status.label}</span>
            </div>
            ${status.showRetry ? `
            <button type="button" class="btn btn-compact subject-retry-btn" id="btnSubjectRetry">Reintentar</button>` : ''}
          </div>
        </header>

        ${outsideClip ? `
        <div class="subject-playhead-note">
          <span>Playhead fuera del clip.</span>
          <button type="button" class="btn btn-compact" id="btnSubjectGoToClip">Ir al clip</button>
        </div>` : ''}

        <div class="subject-preset-grid" role="list">${presetButtons}</div>
        <p class="subject-preset-hint">${hint}</p>

        <div class="subject-controls">
          ${controlBlock('amount', 'Intensidad', 'SubjectAmount', config.amount, 0, 100)}
          ${controlBlock('density', 'Densidad', 'SubjectDensity', config.density, 0, 100)}
          ${controlBlock('persistence', 'Persistencia', 'SubjectPersistence', config.persistence, 0, 100)}
          ${controlBlock('scale', 'Escala', 'SubjectScale', config.scale, 25, 200)}

          <div class="subject-field subject-field--compact">
            <div class="subject-field-label">Reactividad</div>
            <div class="subject-segmented" role="group" aria-label="Reactividad">${reactivitySegments}</div>
          </div>

          <div class="subject-field subject-field--compact subject-variation-field">
            <div class="subject-field-label">Variación</div>
            <div class="subject-variation-controls">
              <button type="button" class="btn icon-btn subject-var-btn" id="btnSubjectVarPrev" aria-label="Variación anterior">‹</button>
              <span class="subject-variation-value" id="subjectVariationLabel">${variation}</span>
              <button type="button" class="btn icon-btn subject-var-btn" id="btnSubjectVarNext" aria-label="Variación siguiente">›</button>
              <button type="button" class="btn btn-compact" id="btnSubjectRandomize">Random</button>
            </div>
          </div>
        </div>

        <footer class="subject-footer-row">
          <label class="subject-power-toggle">
            <input type="checkbox" id="chkSubjectBypass" ${fxActive ? 'checked' : ''} />
            <span>FX activo</span>
          </label>
          <button type="button" class="subject-advanced-toggle" id="btnSubjectAdvanced" aria-expanded="false">
            Advanced ▸
          </button>
        </footer>

        <div id="subjectAdvancedPanel" class="subject-advanced-panel hidden">
          ${this.slider('sldSubjectMotionInfluence', 'valSubjectMotionInfluence', 'Influencia movimiento', Math.round(config.motionInfluence * 100), 0, 100)}
          ${this.slider('sldSubjectBeatInfluence', 'valSubjectBeatInfluence', 'Influencia beat', Math.round(config.beatInfluence * 100), 0, 100)}
          <button type="button" class="btn btn-compact" id="btnSubjectPreAnalyze">Preanalizar clip</button>
          <p class="subject-advanced-note">Preanaliza el tramo del clip para playback más estable. Opcional.</p>
        </div>
      </div>
    `;

    this.btnSubjectBypass = this.subjectFxInspectorHost.querySelector('#chkSubjectBypass');
    this.updateSubjectFxBypassUI?.();

    this.subjectFxInspectorHost
      .querySelectorAll('[data-subject-preset]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          this.applySubjectPresetToSelection(button.dataset.subjectPreset);
        });
      });

    const bindSlider = (inputId, valueId, key, scale = 0.01) => {
      const input = this.subjectFxInspectorHost.querySelector(`#${inputId}`);
      const value = this.subjectFxInspectorHost.querySelector(`#${valueId}`);
      if (!input) return;
      input.addEventListener('input', () => {
        if (value) value.textContent = input.value;
        this.commitSubjectFxConfig({ [key]: Number(input.value) * scale });
      });
    };

    bindSlider('sldSubjectAmount', 'valSubjectAmount', 'amount');
    bindSlider('sldSubjectDensity', 'valSubjectDensity', 'density');
    bindSlider('sldSubjectPersistence', 'valSubjectPersistence', 'persistence');
    bindSlider('sldSubjectScale', 'valSubjectScale', 'scale', 0.01);
    bindSlider('sldSubjectMotionInfluence', 'valSubjectMotionInfluence', 'motionInfluence');
    bindSlider('sldSubjectBeatInfluence', 'valSubjectBeatInfluence', 'beatInfluence');

    this.subjectFxInspectorHost
      .querySelectorAll('[data-subject-reactivity]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          this.commitSubjectFxConfig({ reactivity: button.dataset.subjectReactivity });
          this.renderSubjectFxInspector();
        });
      });

    this.subjectFxInspectorHost
      .querySelector('#btnSubjectRandomize')
      ?.addEventListener('click', () => this.randomizeSubjectSeed());
    this.subjectFxInspectorHost
      .querySelector('#btnSubjectVarPrev')
      ?.addEventListener('click', () => this.stepSubjectVariation(-1));
    this.subjectFxInspectorHost
      .querySelector('#btnSubjectVarNext')
      ?.addEventListener('click', () => this.stepSubjectVariation(1));
    this.subjectFxInspectorHost
      .querySelector('#chkSubjectBypass')
      ?.addEventListener('change', (event) => {
        const shouldBypass = !event.target.checked;
        if (shouldBypass !== !!this.subjectFxBypass) this.toggleSubjectFxBypass();
      });
    this.subjectFxInspectorHost
      .querySelector('#btnSubjectGoToClip')
      ?.addEventListener('click', () => {
        void this.seekVideo(Math.min(item.endTime - 0.05, item.startTime + 0.05));
      });
    this.subjectFxInspectorHost
      .querySelector('#btnSubjectRetry')
      ?.addEventListener('click', () => {
        this.subjectFxEffect?.analyzer?.reset({ hard: true });
        void this.syncVideoTimelineSubject(true);
        this.renderSubjectFxInspector();
      });
    this.subjectFxInspectorHost
      .querySelector('#btnSubjectPreAnalyze')
      ?.addEventListener('click', () => void this.startSubjectPreAnalysis());
    this.subjectFxInspectorHost
      .querySelector('#btnSubjectAdvanced')
      ?.addEventListener('click', (event) => {
        const panel = this.subjectFxInspectorHost.querySelector('#subjectAdvancedPanel');
        const open = panel?.classList.toggle('hidden') === false;
        event.currentTarget.textContent = open ? 'Advanced ▾' : 'Advanced ▸';
        event.currentTarget.setAttribute('aria-expanded', String(open));
      });
  };

  proto.updateSubjectFxBypassUI = function () {
    const bypass = !!this.subjectFxBypass;
    if (this.btnSubjectBypass) {
      this.btnSubjectBypass.checked = !bypass;
    }
    const pill = this.subjectFxInspectorHost?.querySelector('.subject-status-pill');
    if (pill && bypass) {
      pill.className = 'subject-status-pill subject-status-pill--muted';
      const text = pill.querySelector('.subject-status-text');
      if (text) text.textContent = 'Bypass activo';
    }
  };
}
