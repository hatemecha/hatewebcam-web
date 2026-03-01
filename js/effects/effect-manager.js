/**
 * EffectManager — Manages active effects pipeline
 */
class EffectManager {
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

    clearEffects() {
        this.effects = [];
    }

    /**
     * Process frame through all active effects in order
     * @param {CanvasRenderingContext2D} ctx
     * @param {HTMLCanvasElement} canvas
     * @param {HTMLVideoElement} video - for effects that need raw video
     */
    processFrame(ctx, canvas, video) {
        for (const effect of this.effects) {
            try {
                effect.processFrame(ctx, canvas, video);
            } catch (err) {
                console.error(`Error en efecto ${effect.getName ? effect.getName() : 'desconocido'}:`, err);
            }
        }
    }

    getActiveEffects() {
        return [...this.effects];
    }

    resetAll() {
        for (const effect of this.effects) {
            if (effect.reset) effect.reset();
        }
    }
}
