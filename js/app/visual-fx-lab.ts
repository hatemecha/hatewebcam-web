import { getPreviewMetrics } from '../../src/lib/preview/metrics-state.ts';
import type { PreviewRenderer } from './preview-renderer.ts';
import type { VisualFxSession } from './video-editor/visual-fx-session.ts';
import { getStrongestMotionRegion } from '../subject/subject-local-motion.ts';
import {
  mapNormToCanvas,
  mapNormToSubjectSpace,
  withSubjectVideoTransform,
} from '../subject/subject-frame-map.ts';

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
] as const;

// Dev-only buffer inspector. Opt-in: ?fxlab=1 or localStorage hatewebcam-fxlab=1.
export class VisualFxLab {
  private panel: HTMLDivElement | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private output: HTMLElement | null = null;
  private buffers: HTMLElement | null = null;
  private mode: 'overlay' | 'buffers' | 'stats' = 'overlay';
  private bufferReadTime = 0;
  private mountEvents: AbortController | null = null;

  constructor(
    private readonly effects: VisualFxSession,
    private readonly renderer: PreviewRenderer,
    private readonly canvas: HTMLCanvasElement,
    private readonly previewWrapper: HTMLElement | null,
  ) {}

  mount(): void {
    if (!this.previewWrapper || this.panel || !isFxLabEnabled()) return;
    this.mountEvents = new AbortController();
    const { signal } = this.mountEvents;
    const panel = document.createElement('div');
    this.panel = panel;
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
    this.output = panel.querySelector('#visualFxLabOutput');
    this.buffers = panel.querySelector('#visualFxLabBuffers');
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'visual-fx-lab-overlay hidden';
    this.previewWrapper?.appendChild(this.overlay);

    panel
      .querySelectorAll<HTMLButtonElement>('[data-fxlab-mode]')
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            const mode = button.dataset.fxlabMode;
            if (mode !== 'overlay' && mode !== 'buffers' && mode !== 'stats')
              return;
            this.mode = mode;
            panel
              .querySelectorAll<HTMLButtonElement>('[data-fxlab-mode]')
              .forEach((el) => {
                el.classList.toggle('is-active', el === button);
              });
          },
          { signal },
        );
      });
    panel.querySelector('#btnFxLabCapture')?.addEventListener(
      'click',
      () => {
        if (!this.canvas) return;
        const link = document.createElement('a');
        link.download = `fxlab-${Date.now()}.png`;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
      },
      { signal },
    );
  }

  private updateBuffers(effect: VisualFxSession['effect']) {
    if (!this.buffers) return;
    // GPU readback is comparatively slow - only pay for it while this
    // specific dev panel is open, and no more than a few times a second.
    const now = performance.now();
    if ((this.bufferReadTime || 0) + 200 > now) return;
    this.bufferReadTime = now;
    const buffers: Partial<
      Record<(typeof BUFFER_SLOTS)[number][0], HTMLCanvasElement | null>
    > = effect?.renderer?.getDebugBuffers?.() || {};
    const mask = effect?.analyzer?.lastMask;
    if (mask?.data?.length && !buffers.mask) {
      const canvas = document.createElement('canvas');
      canvas.width = mask.width;
      canvas.height = mask.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
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
      const target = this.buffers.querySelector<HTMLCanvasElement>(
        `[data-buffer-slot="${key}"]`,
      );
      const source = buffers[key];
      if (!target || !source) continue;
      target.width = source.width;
      target.height = source.height;
      target.getContext('2d')?.drawImage(source, 0, 0);
    }
  }

  update(): void {
    if (!this.panel || !this.overlay) return;
    const effect = this.effects.effect;
    const frame = effect?.analyzer?.lastFrame;
    const mask = effect?.analyzer?.lastMask;
    const regions = frame?.regions || {};
    const strongest = getStrongestMotionRegion(regions);
    const seg = frame?.segmentationSource || 'none';
    const simplified = frame?.simplified ? 'FALLBACK' : 'AVAILABLE';

    this.buffers?.classList.toggle('hidden', this.mode !== 'buffers');
    if (this.mode === 'buffers') this.updateBuffers(effect);

    if (this.mode === 'overlay' && this.canvas && this.previewWrapper) {
      this.overlay.classList.remove('hidden');
      const rect = this.canvas.getBoundingClientRect();
      const wrapperRect = this.previewWrapper.getBoundingClientRect();
      this.overlay.width = this.canvas.width;
      this.overlay.height = this.canvas.height;
      this.overlay.style.width = `${rect.width}px`;
      this.overlay.style.height = `${rect.height}px`;
      this.overlay.style.left = `${rect.left - wrapperRect.left}px`;
      this.overlay.style.top = `${rect.top - wrapperRect.top}px`;

      const octx = this.overlay.getContext('2d');
      if (!octx) return;
      octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
      const drawMetrics = this.renderer?.getVideoDrawMetrics(
        this.canvas,
        'preview',
      );
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
    } else if (this.overlay) {
      this.overlay.classList.add('hidden');
    }

    if (!this.output) return;
    const config = effect?.getConfig();
    const lines = [
      `system: ${config?.system || '-'}`,
      `variation: ${((config?.seed || 0) % 999) + 1}`,
      `segmentation: ${seg} (${simplified})`,
      `motion: ${(frame?.motionEnergy || 0).toFixed(3)}`,
      `strongest: ${strongest?.name || '-'} (${(strongest?.speed || 0).toFixed(3)})`,
      `mask cov: ${mask ? (mask.getMaskCoverage?.() || 0).toFixed(3) : '-'}`,
      `status: ${effect?.analyzer?.status || '-'}`,
      `renderer: ${effect?.renderer?.failed ? 'CPU fallback' : 'GPU'}`,
      `preview fps: ${getPreviewMetrics().fps}`,
    ];
    this.output.textContent = lines.join('\n');
  }
  dispose(): void {
    this.mountEvents?.abort();
    this.mountEvents = null;
    this.panel?.remove();
    this.overlay?.remove();
    this.panel = null;
    this.overlay = null;
    this.output = null;
    this.buffers = null;
  }
}
