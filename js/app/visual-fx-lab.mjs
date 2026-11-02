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

const BUFFER_SLOTS = [
  ['source', 'SOURCE'],
  ['mask', 'MASK'],
  ['motion', 'MOTION'],
  ['field', 'FIELD'],
  ['history', 'HISTORY'],
  ['output', 'OUTPUT'],
];

// Dev-only buffer inspector. Opt-in: ?fxlab=1 or localStorage hatewebcam-fxlab=1.
/** @param {import('./controller.mjs').AppController} proto */
export function applyVisualFxLabMixin(proto) {
  proto.ensureVisualFxLab = function () {
    if (!isFxLabEnabled() || this._visualFxLabReady) return;
    this._visualFxLabReady = true;
    this.visualFxLabMode = 'overlay';

    const panel = document.createElement('div');
    panel.id = 'visualFxLabPanel';
    panel.className = 'visual-fx-lab';
    panel.innerHTML = `
      <div class="visual-fx-lab-title">FX Lab</div>
      <pre id="visualFxLabOutput"></pre>
      <div class="visual-fx-lab-buffers hidden" id="visualFxLabBuffers">
        ${BUFFER_SLOTS.map(
          ([key, label]) =>
            `<div class="visual-fx-lab-slot"><span>${label}</span><canvas data-buffer-slot="${key}"></canvas></div>`,
        ).join('')}
      </div>
      <div class="visual-fx-lab-actions">
        <button type="button" class="btn btn-compact is-active" data-fxlab-mode="overlay">Mask+Pose</button>
        <button type="button" class="btn btn-compact" data-fxlab-mode="buffers">Buffers</button>
        <button type="button" class="btn btn-compact" data-fxlab-mode="stats">Stats</button>
        <button type="button" class="btn btn-compact" id="btnFxLabCapture">Capture</button>
      </div>
    `;
    this.previewWrapper?.appendChild(panel);
    this.visualFxLabOutput = panel.querySelector('#visualFxLabOutput');
    this.visualFxLabBuffers = panel.querySelector('#visualFxLabBuffers');
    this.visualFxLabOverlay = document.createElement('canvas');
    this.visualFxLabOverlay.className = 'visual-fx-lab-overlay hidden';
    this.previewWrapper?.appendChild(this.visualFxLabOverlay);

    panel.querySelectorAll('[data-fxlab-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        this.visualFxLabMode = button.dataset.fxlabMode;
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

  proto.updateVisualFxLabBuffers = function (effect) {
    if (!this.visualFxLabBuffers) return;
    // GPU readback is comparatively slow - only pay for it while this
    // specific dev panel is open, and no more than a few times a second.
    const now = performance.now();
    if ((this._fxLabBufferTs || 0) + 200 > now) return;
    this._fxLabBufferTs = now;
    const buffers = effect?.renderer?.getDebugBuffers?.() || {};
    const mask = effect?.analyzer?.lastMask;
    if (mask?.data?.length && !buffers.mask) {
      const canvas = document.createElement('canvas');
      canvas.width = mask.width;
      canvas.height = mask.height;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(mask.width, mask.height);
      for (let i = 0; i < mask.data.length; i++) {
        const v = mask.data[i];
        imageData.data[i * 4] = v;
        imageData.data[i * 4 + 1] = v;
        imageData.data[i * 4 + 2] = v;
        imageData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      buffers.mask = canvas;
    }
    for (const [key] of BUFFER_SLOTS) {
      const target = this.visualFxLabBuffers.querySelector(
        `[data-buffer-slot="${key}"]`,
      );
      const source = buffers[key];
      if (!target || !source) continue;
      target.width = source.width;
      target.height = source.height;
      target.getContext('2d').drawImage(source, 0, 0);
    }
  };

  proto.updateVisualFxLab = function () {
    if (!this._visualFxLabReady) return;
    const effect = this.visualFxEffect;
    const frame = effect?.analyzer?.lastFrame;
    const mask = effect?.analyzer?.lastMask;
    const regions = frame?.regions || {};
    const strongest = getStrongestMotionRegion(regions);
    const seg = effect?.analyzer?.segmentationSource || 'none';
    const simplified = effect?.analyzer?.useSimplifiedMode
      ? 'FALLBACK'
      : 'AVAILABLE';

    this.visualFxLabBuffers?.classList.toggle(
      'hidden',
      this.visualFxLabMode !== 'buffers',
    );
    if (this.visualFxLabMode === 'buffers')
      this.updateVisualFxLabBuffers(effect);

    if (
      this.visualFxLabMode === 'overlay' &&
      this.canvas &&
      this.previewWrapper
    ) {
      this.visualFxLabOverlay.classList.remove('hidden');
      const rect = this.canvas.getBoundingClientRect();
      const wrapperRect = this.previewWrapper.getBoundingClientRect();
      this.visualFxLabOverlay.width = this.canvas.width;
      this.visualFxLabOverlay.height = this.canvas.height;
      this.visualFxLabOverlay.style.width = `${rect.width}px`;
      this.visualFxLabOverlay.style.height = `${rect.height}px`;
      this.visualFxLabOverlay.style.left = `${rect.left - wrapperRect.left}px`;
      this.visualFxLabOverlay.style.top = `${rect.top - wrapperRect.top}px`;

      const octx = this.visualFxLabOverlay.getContext('2d');
      octx.clearRect(
        0,
        0,
        this.visualFxLabOverlay.width,
        this.visualFxLabOverlay.height,
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
    } else if (this.visualFxLabOverlay) {
      this.visualFxLabOverlay.classList.add('hidden');
    }

    if (!this.visualFxLabOutput) return;
    const lines = [
      `system: ${effect?.config?.system || '-'}`,
      `variation: ${((effect?.config?.seed || 0) % 999) + 1}`,
      `segmentation: ${seg} (${simplified})`,
      `motion: ${(frame?.motionEnergy || 0).toFixed(3)}`,
      `strongest: ${strongest?.name || '-'} (${(strongest?.speed || 0).toFixed(3)})`,
      `mask cov: ${mask ? (mask.getMaskCoverage?.() || 0).toFixed(3) : '-'}`,
      `status: ${effect?.analyzer?.status || '-'}`,
      `renderer: ${effect?.renderer?.failed ? 'CPU fallback' : 'GPU'}`,
      `preview fps: ${effect?.previewFps ?? '-'}`,
    ];
    this.visualFxLabOutput.textContent = lines.join('\n');
  };
}
