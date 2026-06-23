/** @param {import('./controller.mjs').AppController} proto */
export function applyColorPickMixin(proto) {
  proto.enableColorPick = function () {
    if (!this.blobTrackingEffect) {
      this.showStatus(
        this.colorPickStatus,
        'Primero activá "Detectar objetos por color"',
        'warning',
      );
      return;
    }
    this.colorPickMode = true;
    this.canvas.classList.add('color-pick-mode');
    this.showStatus(
      this.colorPickStatus,
      'Hacé click en el video para elegir un color',
      'info',
    );
  };

  proto.onCanvasClick = function (e) {
    if (!this.colorPickMode || !this.blobTrackingEffect) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = Math.round(
      (e.clientX - rect.left) * (this.canvas.width / rect.width),
    );
    const y = Math.round(
      (e.clientY - rect.top) * (this.canvas.height / rect.height),
    );

    if (x >= 0 && x < this.canvas.width && y >= 0 && y < this.canvas.height) {
      const sampleX = this.clamp(x - 2, 0, Math.max(0, this.canvas.width - 5));
      const sampleY = this.clamp(y - 2, 0, Math.max(0, this.canvas.height - 5));
      const sampleWidth = Math.min(5, this.canvas.width);
      const sampleHeight = Math.min(5, this.canvas.height);
      const pixels = this.ctx.getImageData(
        sampleX,
        sampleY,
        sampleWidth,
        sampleHeight,
      ).data;
      const color = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 4) {
        color[0] += pixels[i];
        color[1] += pixels[i + 1];
        color[2] += pixels[i + 2];
      }
      const pixelCount = pixels.length / 4;
      this.blobTrackingEffect.setColorFromPixel(
        ...color.map((value) => Math.round(value / pixelCount)),
      );
      this.colorPickMode = false;
      this.canvas.classList.remove('color-pick-mode');
      this.showStatus(
        this.colorPickStatus,
        'Color seleccionado. Ya podés mover el objeto.',
        'success',
      );
      this.saveActiveEffectSettings();
      this.renderEffectConfig();
      setTimeout(() => this.hideStatus(this.colorPickStatus), 2500);
    }
  };
}
