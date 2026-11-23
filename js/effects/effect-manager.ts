import type { RenderProfile } from '../app/render-engine.ts';

export interface FrameEffect {
  getName?(): string;
  processFrame(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    profile: RenderProfile | null,
  ): void;
}

export class EffectManager {
  readonly effects: FrameEffect[] = [];

  addEffect(effect: FrameEffect) {
    if (!this.effects.includes(effect)) {
      this.effects.push(effect);
    }
  }

  removeEffect(effect: FrameEffect) {
    const idx = this.effects.indexOf(effect);
    if (idx !== -1) {
      this.effects.splice(idx, 1);
    }
  }

  processFrame(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    renderProfile: RenderProfile | null = null,
  ) {
    for (const effect of this.effects) {
      try {
        effect.processFrame(ctx, canvas, video, renderProfile);
      } catch (err) {
        console.error(
          `Error en efecto ${effect.getName ? effect.getName() : 'desconocido'}:`,
          err,
        );
      }
    }
  }
}
