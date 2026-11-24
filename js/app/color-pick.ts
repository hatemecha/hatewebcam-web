import type { WebcamPreferences } from './webcam-preferences.ts';
import type { BlobTracking } from '../effects/blob-tracking.ts';
import {
  setColorPickFeedback,
  type ColorPickTarget,
} from '../../src/lib/webcam/color-pick-feedback.ts';

interface ColorPickHost {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  detectors: { blob: Pick<BlobTracking, 'setColorFromPixel'> | null };
  preferences: Pick<
    WebcamPreferences,
    | 'saveActiveEffectSettings'
    | 'scheduleSyncSelectedClipConfig'
    | 'publishWebcamPanel'
  >;
}

export class ColorPicker {
  private target: ColorPickTarget | null = null;
  private resetFeedback: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: ColorPickHost) {}

  start(target: ColorPickTarget = 'quick'): void {
    this.cancel();
    if (!this.host.detectors.blob) {
      setColorPickFeedback(target, {
        message: 'Primero activá "Detectar objetos por color"',
        type: 'warning',
      });
      return;
    }
    this.target = target;
    this.host.canvas.classList.add('color-pick-mode');
    setColorPickFeedback(target, {
      message: 'Hacé click en el video para elegir un color',
      type: 'info',
    });
  }

  cancel(): void {
    if (this.resetFeedback !== null) clearTimeout(this.resetFeedback);
    this.resetFeedback = null;
    setColorPickFeedback('quick', null);
    setColorPickFeedback('advanced', null);
    this.target = null;
    this.host.canvas.classList.remove('color-pick-mode');
  }

  sample(event: MouseEvent): void {
    const { canvas, ctx, detectors } = this.host;
    const blob = detectors.blob;
    const target = this.target;
    if (!target || !blob) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.round(
      (event.clientX - rect.left) * (canvas.width / rect.width),
    );
    const y = Math.round(
      (event.clientY - rect.top) * (canvas.height / rect.height),
    );
    if (!(x >= 0 && x < canvas.width && y >= 0 && y < canvas.height)) return;

    const sampleX = Math.max(0, Math.min(x - 2, canvas.width - 5));
    const sampleY = Math.max(0, Math.min(y - 2, canvas.height - 5));
    const pixels = ctx.getImageData(
      sampleX,
      sampleY,
      Math.min(5, canvas.width),
      Math.min(5, canvas.height),
    ).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      red += pixels[index];
      green += pixels[index + 1];
      blue += pixels[index + 2];
    }
    const pixelCount = pixels.length / 4;
    blob.setColorFromPixel(
      Math.round(red / pixelCount),
      Math.round(green / pixelCount),
      Math.round(blue / pixelCount),
    );
    this.cancel();
    this.host.preferences.saveActiveEffectSettings();
    this.host.preferences.scheduleSyncSelectedClipConfig();
    this.host.preferences.publishWebcamPanel();
    setColorPickFeedback(target, {
      message: 'Color seleccionado. Ya podés mover el objeto.',
      type: 'success',
    });
    this.resetFeedback = setTimeout(() => {
      this.resetFeedback = null;
      setColorPickFeedback(target, null);
    }, 2500);
  }
}
