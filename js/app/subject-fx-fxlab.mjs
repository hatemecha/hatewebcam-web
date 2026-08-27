import { getStrongestMotionRegion } from '../subject/subject-local-motion.mjs';
import {
  mapNormToCanvas,
  mapNormToSubjectSpace,
  withSubjectVideoTransform,
} from '../subject/subject-frame-map.mjs';

function isFxLabEnabled() {
  try {
    if (localStorage.getItem('hatewebcam-fxlab') === '1') return true;
  } catch {
    /* ignore */
  }
  return new URLSearchParams(window.location.search).get('fxlab') === '1';
}

/** @param {import('./controller.mjs').AppController} proto */
export function applySubjectFxLabMixin(proto) {
  proto.ensureSubjectFxLab = function () {
    if (!isFxLabEnabled() || this._subjectFxLabReady) return;
    this._subjectFxLabReady = true;
    this.subjectFxLabMode = 'overlay';

    const panel = document.createElement('div');
    panel.id = 'subjectFxLabPanel';
    panel.className = 'subject-fx-lab';
    panel.innerHTML = `
      <div class="subject-fx-lab-title">FX Lab</div>
      <pre id="subjectFxLabOutput"></pre>
      <div class="subject-fx-lab-actions">
        <button type="button" class="btn btn-compact" data-fxlab-mode="overlay">Mask+Pose</button>
        <button type="button" class="btn btn-compact" data-fxlab-mode="stats">Stats</button>
        <button type="button" class="btn btn-compact" id="btnFxLabCapture">Capture</button>
      </div>
    `;
    this.previewWrapper?.appendChild(panel);
    this.subjectFxLabOutput = panel.querySelector('#subjectFxLabOutput');
    this.subjectFxLabOverlay = document.createElement('canvas');
    this.subjectFxLabOverlay.className = 'subject-fx-lab-overlay hidden';
    this.previewWrapper?.appendChild(this.subjectFxLabOverlay);

    panel.querySelectorAll('[data-fxlab-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        this.subjectFxLabMode = button.dataset.fxlabMode;
        panel.querySelectorAll('[data-fxlab-mode]').forEach((el) => {
          el.classList.toggle('is-active', el === button);
        });
      });
    });
    panel.querySelector('#btnFxLabCapture')?.addEventListener('click', () => {
      if (!this.canvas) return;
      const link = document.createElement('a');
      link.download = `fxlab-${Date.now()}.png`;
      link.href = this.canvas.toDataURL('image/png');
      link.click();
    });
  };

  proto.updateSubjectFxLab = function () {
    if (!this._subjectFxLabReady) return;
    const effect = this.subjectFxEffect;
    const frame = effect?.analyzer?.lastFrame;
    const mask = effect?.analyzer?.lastMask;
    const regions = frame?.regions || {};
    const strongest = getStrongestMotionRegion(regions);
    const seg = effect?.analyzer?.segmentationSource || 'none';
    const simplified = effect?.analyzer?.useSimplifiedMode
      ? 'FALLBACK'
      : 'AVAILABLE';

    if (
      this.subjectFxLabMode === 'overlay' &&
      this.canvas &&
      this.previewWrapper
    ) {
      this.subjectFxLabOverlay.classList.remove('hidden');
      const rect = this.canvas.getBoundingClientRect();
      const wrapperRect = this.previewWrapper.getBoundingClientRect();
      this.subjectFxLabOverlay.width = this.canvas.width;
      this.subjectFxLabOverlay.height = this.canvas.height;
      this.subjectFxLabOverlay.style.width = `${rect.width}px`;
      this.subjectFxLabOverlay.style.height = `${rect.height}px`;
      this.subjectFxLabOverlay.style.left = `${rect.left - wrapperRect.left}px`;
      this.subjectFxLabOverlay.style.top = `${rect.top - wrapperRect.top}px`;

      const octx = this.subjectFxLabOverlay.getContext('2d');
      octx.clearRect(
        0,
        0,
        this.subjectFxLabOverlay.width,
        this.subjectFxLabOverlay.height,
      );
      const drawMetrics = this.getVideoDrawMetrics?.(this.canvas, 'preview');
      if (frame && drawMetrics) {
        if (mask?.data?.length) {
          octx.save();
          octx.fillStyle = 'rgba(120, 220, 160, 0.35)';
          const step = 2;
          for (let y = 0; y < mask.height; y += step) {
            for (let x = 0; x < mask.width; x += step) {
              if (mask.data[y * mask.width + x] < 128) continue;
              const p = mapNormToCanvas(
                x / mask.width,
                y / mask.height,
                drawMetrics,
              );
              octx.fillRect(p.x, p.y, step + 1, step + 1);
            }
          }
          octx.restore();
        }
        withSubjectVideoTransform(octx, drawMetrics, (tctx) => {
          tctx.strokeStyle = 'rgba(240,240,236,0.85)';
          tctx.fillStyle = 'rgba(168,59,56,0.9)';
          frame.landmarks?.forEach((point, index) => {
            if ((point.visibility ?? 1) < 0.35) return;
            const p = mapNormToSubjectSpace(point.x, point.y, drawMetrics);
            tctx.beginPath();
            tctx.arc(p.x, p.y, index % 5 === 0 ? 3 : 2, 0, Math.PI * 2);
            tctx.fill();
          });
        });
      }
    } else if (this.subjectFxLabOverlay) {
      this.subjectFxLabOverlay.classList.add('hidden');
    }

    if (!this.subjectFxLabOutput) return;
    const lines = [
      `preset: ${effect?.config?.preset || '-'}`,
      `variation: ${((effect?.config?.seed || 0) % 999) + 1}`,
      `segmentation: ${seg} (${simplified})`,
      `motion: ${(frame?.motionEnergy || 0).toFixed(3)}`,
      `strongest: ${strongest?.name || '-'} (${(strongest?.speed || 0).toFixed(3)})`,
      `mask cov: ${mask ? (mask.getMaskCoverage?.() || 0).toFixed(3) : '-'}`,
      `status: ${effect?.analyzer?.status || '-'}`,
      `preview fps: ${effect?.previewFps ?? '-'}`,
    ];
    this.subjectFxLabOutput.textContent = lines.join('\n');
  };
}
