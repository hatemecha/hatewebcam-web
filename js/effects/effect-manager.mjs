/**
 * EffectManager — Manages active effects pipeline
 */
export class EffectManager {
  constructor() {
    this.effects = [];
  }

  addEffect(effect) {
    if (!this.effects.includes(effect)) {
      this.effects.push(effect);
    }
  }

  removeEffect(effect) {
    const idx = this.effects.indexOf(effect);
    if (idx !== -1) {
      this.effects.splice(idx, 1);
    }
  }

  /**
   * Process frame through all active effects in order
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLVideoElement} video - for effects that need raw video
   */
  processFrame(ctx, canvas, video, renderProfile = null) {
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
