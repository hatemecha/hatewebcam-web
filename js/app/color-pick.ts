import type { WebcamPreferences } from './webcam-preferences.ts';
import type { BlobTracking } from '../effects/blob-tracking.ts';
import { hideStatus, showStatus } from './feedback.ts';

interface ColorPickHost {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  detectors: { blob: Pick<BlobTracking, 'setColorFromPixel'> | null };
  colorPickStatus: HTMLElement | null;
  sourceMode: 'camera' | 'video';
  preferences: Pick<WebcamPreferences, 'saveActiveEffectSettings'>;
  renderEffectConfig(): void;
}

export class ColorPicker {
  private active = false;

  constructor(private readonly host: ColorPickHost) {}

  start(status = this.host.colorPickStatus): void {
    if (!this.host.detectors.blob) {
      showStatus(
        status,
        'Primero activá "Detectar objetos por color"',
        'warning',
      );
      return;
    }
    this.active = true;
    this.host.canvas.classList.add('color-pick-mode');
    showStatus(status, 'Hacé click en el video para elegir un color', 'info');
  }

  cancel(): void {
    this.active = false;
    this.host.canvas.classList.remove('color-pick-mode');
  }

  sample(event: MouseEvent): void {
    const { canvas, ctx, detectors } = this.host;
    const blob = detectors.blob;
    if (!this.active || !blob) return;

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
    this.host.renderEffectConfig();

    const status =
      this.host.sourceMode === 'video'
        ? document.querySelector<HTMLElement>('#cfgTargetColorStatus')
        : this.host.colorPickStatus;
    showStatus(
      status,
      'Color seleccionado. Ya podés mover el objeto.',
      'success',
    );
    setTimeout(() => hideStatus(status), 2500);
  }
}
