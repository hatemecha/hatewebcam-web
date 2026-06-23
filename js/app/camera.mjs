/** @param {import('./controller.mjs').AppController} proto */
export function applyCameraMixin(proto) {
  proto.setCameraPlaceholderMessage = function (message) {
    if (this.placeholderCameraMessage) {
      this.placeholderCameraMessage.textContent = message;
      return;
    }
    if (!this.placeholder) return;
    const msg = this.placeholder.querySelector(
      '#previewPlaceholderCameraMessage, .preview-placeholder-camera div',
    );
    if (msg) msg.textContent = message;
  };

  proto.setVideoPlaceholderLoadingMessage = function (message) {
    if (this.placeholderLoadingMessage) {
      this.placeholderLoadingMessage.textContent = message;
    }
  };

  proto.updatePreviewPlaceholder = function () {
    if (!this.placeholder) return;
    const inVideoMode = this.sourceMode === 'video';
    const hasVideo = !!this.videoSourceFile;
    const isLoading = !!this.videoPlaceholderLoading;
    const showPlaceholder = inVideoMode ? !hasVideo : !this.isRunning;

    this.placeholder.classList.toggle('hidden', !showPlaceholder);
    this.placeholder.classList.toggle(
      'is-solid',
      inVideoMode && showPlaceholder,
    );
    this.previewWrapper?.classList.toggle(
      'is-empty',
      inVideoMode && showPlaceholder,
    );

    if (this.placeholderCamera) {
      this.placeholderCamera.classList.toggle('hidden', inVideoMode);
    }
    if (this.placeholderVideo) {
      this.placeholderVideo.classList.toggle(
        'hidden',
        !inVideoMode || hasVideo || isLoading,
      );
    }
    if (this.placeholderLoading) {
      this.placeholderLoading.classList.toggle(
        'hidden',
        !inVideoMode || hasVideo || !isLoading,
      );
    }

    if (inVideoMode && showPlaceholder) {
      this.clearPreviewCanvas?.();
    }
  };

  proto.showVideoPlaceholderLoading = function (
    message = 'Leyendo metadata del video...',
  ) {
    this.videoPlaceholderLoading = true;
    this.setVideoPlaceholderLoadingMessage(message);
    this.updatePreviewPlaceholder();
  };

  proto.hideVideoPlaceholderLoading = function () {
    this.videoPlaceholderLoading = false;
    this.updatePreviewPlaceholder();
  };

  proto.getCameraStartErrorMessage = function (error, wasAutoStart = false) {
    const errorName = error && error.name ? error.name : '';
    if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
      return 'Permiso de cámara bloqueado. Habilitá el permiso del navegador y tocá Encender Cámara.';
    }
    if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      return 'No se encontró una cámara disponible. Conectá una cámara y tocá Encender Cámara.';
    }
    if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
      return 'Otra app parece estar usando la cámara. Cerrala y tocá Encender Cámara.';
    }
    if (
      errorName === 'OverconstrainedError' ||
      errorName === 'ConstraintNotSatisfiedError'
    ) {
      return 'La cámara no soporta la configuración solicitada. Probá otra cámara o reintentá.';
    }
    return wasAutoStart
      ? 'La cámara no se inició automáticamente. Tocá Encender Cámara para reintentar.'
      : 'No se pudo activar la cámara. Revisá permisos y reintentá.';
  };

  proto.toggleCamera = async function (forceStart = false) {
    if (this.sourceMode !== 'camera') return;
    if (this.isRunning && !forceStart) {
      if (this.isRecording) this.stopRecording(true);
      this.cancelPhotoCountdown(false);

      this.cameraManager.stop();
      this.isRunning = false;
      this.cancelRenderLoop();
      this.btnToggleCamera.innerHTML =
        '<i class="fa-solid fa-play"></i> Encender Cámara';
      this.btnToggleCamera.classList.remove('active');
      this.updatePreviewPlaceholder();
      this.resolutionInfo.textContent = '—';
      this.fpsInfo.textContent = '—';
      this.updateCaptureButtons();
      return;
    }

    if (!this.isRunning) {
      const requestedDeviceId =
        this.cameraSelect.value || this.preferredDeviceId || null;
      this.setCameraPlaceholderMessage('Solicitando permiso de cámara...');
      const ok = await this.cameraManager.start(
        this.videoEl,
        requestedDeviceId,
      );
      if (ok) {
        this.isRunning = true;
        this.updatePreviewPlaceholder();
        this.btnToggleCamera.innerHTML =
          '<i class="fa-solid fa-stop"></i> Apagar Cámara';
        this.btnToggleCamera.classList.add('active');

        this.videoEl.addEventListener(
          'loadedmetadata',
          () => {
            const { sourceWidth, sourceHeight } =
              this.getSourceFrameDimensions();
            this.syncPreviewCanvasMetrics(sourceWidth, sourceHeight, true);
          },
          { once: true },
        );

        this.frameCount = 0;
        this.lastFpsTime = performance.now();
        if (this.isPageVisible) {
          this.scheduleRenderLoop();
        } else {
          this.animFrameId = null;
        }

        const cfg = this.loadConfig();
        const settings = this.cameraManager.getStreamSettings();
        this.preferredDeviceId =
          settings.deviceId || requestedDeviceId || this.preferredDeviceId;
        cfg.deviceId = this.preferredDeviceId || '';
        this.saveConfig(cfg);
        if (this.cameraSelect && this.preferredDeviceId)
          this.cameraSelect.value = this.preferredDeviceId;
        void this.refreshCameraDevices(this.preferredDeviceId);
      } else {
        const message = this.getCameraStartErrorMessage(
          this.cameraManager.lastError,
          forceStart,
        );
        this.setCameraPlaceholderMessage(message);
        this.updatePreviewPlaceholder();
        this.showStatus(this.captureStatus, message, 'warning');
      }
      this.updateCaptureButtons();
    }
  };

  proto.onCameraChange = async function () {
    this.preferredDeviceId = this.cameraSelect.value || null;
    const cfg = this.loadConfig();
    cfg.deviceId = this.preferredDeviceId || '';
    this.saveConfig(cfg);
    if (!this.isRunning) return;

    this.cameraSelect.disabled = true;
    try {
      await this.cameraManager.switchCamera(this.cameraSelect.value);
      const settings = this.cameraManager.getStreamSettings();
      this.preferredDeviceId = settings.deviceId || this.preferredDeviceId;
      void this.refreshCameraDevices(this.preferredDeviceId);
    } catch (err) {
      console.error('Error switching camera:', err);
      this.showStatus(
        this.captureStatus,
        'No se pudo cambiar de cámara',
        'error',
      );
      setTimeout(() => this.hideStatus(this.captureStatus), 2200);
    } finally {
      this.cameraSelect.disabled = false;
    }
  };

  proto.onTransformChange = function () {
    this.flipH = this.chkMirror.checked;
    this.flipV = this.chkFlipV.checked;
    this.rotation = parseInt(this.rotationSelect.value, 10);
    const cfg = this.loadConfig();
    cfg.flipH = this.flipH;
    cfg.flipV = this.flipV;
    cfg.rotation = this.rotation;
    this.saveConfig(cfg);
  };
}
