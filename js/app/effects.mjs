/** @param {import('./controller.mjs').AppController} proto */
export function applyEffectsMixin(proto) {
  proto.syncBlinkLandmarkSource = function () {
    if (
      !this.blinkDetectionEffect ||
      typeof this.blinkDetectionEffect.setLandmarkSource !== 'function'
    )
      return;
    this.blinkDetectionEffect.setLandmarkSource(
      this.faceDetectionEffect || null,
    );
  };

  proto.toggleEffect = async function (type) {
    const quiet = !!this.suppressEffectSideEffects;
    if (type === 'blob') {
      if (this.chkBlobTracking.checked) {
        if (!this.blobTrackingEffect) {
          this.blobTrackingEffect = new BlobTracking();
          const savedBlobConfig = this.getSavedEffectConfig('blob');
          if (savedBlobConfig)
            this.blobTrackingEffect.setConfig(savedBlobConfig);
          this.blobTrackingEffect.boxColor =
            this.quickDetectorSettings.blobBoxColor;
          this.effectManager.addEffect(this.blobTrackingEffect);
        }
        if (this.blinkDetectionEffect) {
          this.blinkDetectionEffect.setBlinkCallback((eye) =>
            this.blobTrackingEffect?.triggerConnection(eye),
          );
        }
        if (this.colorPickSection)
          this.colorPickSection.classList.remove('hidden');
      } else {
        if (this.blobTrackingEffect)
          this.effectManager.removeEffect(this.blobTrackingEffect);
        this.blobTrackingEffect = null;
        if (this.blinkDetectionEffect)
          this.blinkDetectionEffect.setBlinkCallback(null);
        if (this.colorPickSection)
          this.colorPickSection.classList.add('hidden');
      }
      if (!quiet) {
        this.syncQuickDetectorSettingsFromEffects();
        this.saveActiveEffectSettings();
        this.renderEffectConfig();
        this.updateEffectsInfo();
      }
      return;
    }

    if (type === 'face') {
      const requestId = ++this.faceLoadRequestId;
      if (this.chkFaceDetection.checked) {
        if (!quiet)
          this.showStatus(
            this.captureStatus,
            'Cargando detector de caras...',
            'info',
          );
        this.chkFaceDetection.disabled = true;
        try {
          await this.ensureFaceMeshLoaded();
        } catch (err) {
          console.error('No se pudo cargar MediaPipe Face Mesh:', err);
          if (!quiet)
            this.showStatus(
              this.captureStatus,
              'No se pudo cargar el detector de caras',
              'error',
            );
          this.chkFaceDetection.checked = false;
        } finally {
          this.chkFaceDetection.disabled = false;
        }

        if (
          requestId !== this.faceLoadRequestId ||
          !this.chkFaceDetection.checked
        )
          return;
        if (typeof FaceMesh === 'undefined') return;

        if (!this.faceDetectionEffect) {
          this.faceDetectionEffect = new FaceDetection();
          const savedFaceConfig = this.getSavedEffectConfig('face');
          if (savedFaceConfig)
            this.faceDetectionEffect.setConfig(savedFaceConfig);
          this.applyQuickDetectorSettingsToEffects();
          this.effectManager.addEffect(this.faceDetectionEffect);
        } else {
          this.applyQuickDetectorSettingsToEffects();
        }
        this.syncBlinkLandmarkSource();
        if (!quiet && !this.isRecording) {
          setTimeout(() => this.hideStatus(this.captureStatus), 1200);
        }
      } else {
        if (this.faceDetectionEffect)
          this.effectManager.removeEffect(this.faceDetectionEffect);
        this.faceDetectionEffect = null;
        this.syncBlinkLandmarkSource();
      }
    } else if (type === 'blink') {
      const requestId = ++this.blinkLoadRequestId;
      if (this.chkBlinkDetection.checked) {
        if (!quiet)
          this.showStatus(
            this.captureStatus,
            'Cargando detector de pestañeos...',
            'info',
          );
        this.chkBlinkDetection.disabled = true;
        try {
          await this.ensureFaceMeshLoaded();
        } catch (err) {
          console.error('No se pudo cargar MediaPipe Face Mesh:', err);
          if (!quiet)
            this.showStatus(
              this.captureStatus,
              'No se pudo cargar el detector de pestañeos',
              'error',
            );
          this.chkBlinkDetection.checked = false;
        } finally {
          this.chkBlinkDetection.disabled = false;
        }

        if (
          requestId !== this.blinkLoadRequestId ||
          !this.chkBlinkDetection.checked
        )
          return;
        if (typeof FaceMesh === 'undefined') return;

        if (!this.blinkDetectionEffect) {
          this.blinkDetectionEffect = new BlinkDetection({
            landmarkSource: this.faceDetectionEffect || null,
          });
          const savedBlinkConfig = this.getSavedEffectConfig('blink');
          if (savedBlinkConfig)
            this.blinkDetectionEffect.setConfig(savedBlinkConfig);
          this.effectManager.addEffect(this.blinkDetectionEffect);
        }
        this.syncBlinkLandmarkSource();
        if (this.blobTrackingEffect) {
          this.blinkDetectionEffect.setBlinkCallback((eye) =>
            this.blobTrackingEffect?.triggerConnection(eye),
          );
        } else {
          this.blinkDetectionEffect.setBlinkCallback(null);
        }
        if (!quiet && !this.isRecording) {
          setTimeout(() => this.hideStatus(this.captureStatus), 1200);
        }
      } else {
        if (this.blinkDetectionEffect)
          this.effectManager.removeEffect(this.blinkDetectionEffect);
        this.blinkDetectionEffect = null;
      }
    }

    if (!quiet) {
      this.syncQuickDetectorSettingsFromEffects();
      this.saveActiveEffectSettings();
      this.renderEffectConfig();
      this.updateEffectsInfo();
    }
  };

  proto.updateEffectsInfo = function () {
    const names = [];
    if (this.blobTrackingEffect) names.push('Color');
    if (this.faceDetectionEffect) {
      if (this.faceDetectionEffect.showBox && this.faceDetectionEffect.showBlur)
        names.push('Caras mixtas');
      else if (this.faceDetectionEffect.showBlur)
        names.push('Caras blur/pixeladas');
      else names.push('Caras');
    }
    if (this.blinkDetectionEffect) names.push('Pestañeos');
    this.effectsInfo.textContent =
      names.length > 0 ? names.join(' · ') : 'Sin detectores';
  };
}
