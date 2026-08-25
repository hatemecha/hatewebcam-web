/** @param {import('./controller.mjs').AppController} proto */
export function applyCameraMixin(proto) {
  proto.getCameraStatePresentation = function (state, error = null) {
    const states = {
      off: {
        title: 'Cámara apagada',
        message: 'Encendé la cámara para ver la imagen.',
        action: 'Encender cámara',
        icon: 'fa-video-slash',
      },
      requesting: {
        title: 'Permiso de cámara',
        message: 'Aceptá el permiso del sitio para continuar.',
        icon: 'fa-shield-halved',
      },
      starting: {
        title: 'Iniciando cámara',
        message: 'Estamos preparando la imagen.',
        icon: 'fa-spinner fa-spin',
      },
      running: {
        title: 'Cámara funcionando',
        message: 'La cámara está lista.',
        icon: 'fa-video',
      },
      denied: {
        title: 'Permiso de cámara denegado',
        message: 'Habilitá la cámara para este sitio y volvé a intentarlo.',
        hint: 'Revisá el ícono de permisos junto a la dirección del sitio.',
        action: 'Reintentar',
        icon: 'fa-shield-halved',
      },
      missing: {
        title: 'No se encontró una cámara',
        message: 'Conectá una cámara o revisá que esté habilitada.',
        action: 'Reintentar',
        icon: 'fa-video-slash',
      },
      busy: {
        title: 'La cámara está ocupada',
        message: 'Cerrá la aplicación que la está usando y reintentá.',
        action: 'Reintentar',
        icon: 'fa-triangle-exclamation',
      },
      unsupported: {
        title: 'Configuración no soportada',
        message: 'Probá otra cámara o el modo Balanceado.',
        action: 'Reintentar',
        icon: 'fa-triangle-exclamation',
      },
      unknown: {
        title: 'No se pudo iniciar la cámara',
        message: 'Revisá los permisos y volvé a intentarlo.',
        action: 'Reintentar',
        icon: 'fa-circle-exclamation',
      },
    };
    return { ...(states[state] || states.unknown), state, error };
  };

  proto.classifyCameraError = function (error) {
    const name = error?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
      return 'missing';
    if (name === 'NotReadableError' || name === 'TrackStartError')
      return 'busy';
    if (
      name === 'OverconstrainedError' ||
      name === 'ConstraintNotSatisfiedError' ||
      !navigator.mediaDevices?.getUserMedia
    )
      return 'unsupported';
    return 'unknown';
  };

  proto.setCameraState = function (
    state,
    error = null,
    { focus = false } = {},
  ) {
    const view = this.getCameraStatePresentation(state, error);
    const stateKey = `${state}:${error?.name || ''}`;
    const changed = this.cameraUiStateKey !== stateKey;
    this.cameraUiStateKey = stateKey;
    this.cameraUiState = state;
    if (this.cameraStateTitle) this.cameraStateTitle.textContent = view.title;
    this.setCameraPlaceholderMessage(view.message);
    if (this.cameraStateHint) {
      this.cameraStateHint.textContent = view.hint || '';
      this.cameraStateHint.classList.toggle('hidden', !view.hint);
    }
    if (this.cameraStateIcon) {
      this.cameraStateIcon.className = `fa-solid ${view.icon} fa-2x`;
    }
    if (this.btnCameraStateAction) {
      this.btnCameraStateAction.classList.toggle('hidden', !view.action);
      const label = this.btnCameraStateAction.querySelector('span');
      if (label) label.textContent = view.action || '';
      if (focus && changed && view.action) this.btnCameraStateAction.focus();
    }
    if (
      this.sourceMode !== 'video' &&
      state !== 'running' &&
      state !== 'starting' &&
      this.captureStatus
    ) {
      this.hideStatus(this.captureStatus);
    }
  };

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
    const view = this.getCameraStatePresentation(
      this.classifyCameraError(error),
      error,
    );
    return wasAutoStart && view.state === 'unknown'
      ? 'La cámara no se inició automáticamente. Volvé a intentarlo.'
      : `${view.title}. ${view.message}`;
  };

  proto.getEffectivePerformanceMode = function () {
    const mode = this.normalizePerformanceMode(
      this.imageSettings.performanceMode,
    );
    if (mode === 'auto')
      return this.autoPerformanceDowngraded ? 'performance' : 'normal';
    return mode;
  };

  proto.getPerformanceModePreset = function (mode) {
    const effective = mode || this.getEffectivePerformanceMode?.() || 'normal';
    return (
      this.PERFORMANCE_MODE_PRESETS[effective] ||
      this.PERFORMANCE_MODE_PRESETS.normal
    );
  };

  proto.getCameraStartOptions = function () {
    return { ...this.getPerformanceModePreset().camera };
  };

  proto.applyDetectorPerformanceProfile = function (profile) {
    if (this.blobTrackingEffect) {
      this.blobTrackingEffect.processScale = profile.blobProcessScale;
      this.blobTrackingEffect.processIntervalMs = profile.detectorIntervalMs;
    }
    if (this.faceDetectionEffect) {
      this.faceDetectionEffect.processIntervalMs = profile.detectorIntervalMs;
    }
    if (this.blinkDetectionEffect) {
      this.blinkDetectionEffect.processIntervalMs = profile.detectorIntervalMs;
    }
    this.renderEffectConfig?.();
  };

  proto.applyPerformanceProfileSettings = function (
    profile,
    { save = true } = {},
  ) {
    this.imageSettings.previewQuality = profile.previewQuality;
    this.applyDetectorPerformanceProfile(profile);
    this.updateImageControlsUI();
    this.requestPreviewRefresh(true);
    if (save) this.saveImageSettings();
  };

  proto.applyPerformanceMode = async function (
    mode,
    { restartCamera = false, notify = false, save = true } = {},
  ) {
    const normalized = this.normalizePerformanceMode(mode);
    const changed = this.imageSettings.performanceMode !== normalized;
    this.imageSettings.performanceMode = normalized;
    this.autoPerformanceDowngraded = false;
    this.lowFpsSampleCount = 0;
    this.applyPerformanceProfileSettings(this.getPerformanceModePreset(), {
      save,
    });
    if (notify) {
      this.showStatus(
        this.captureStatus,
        `Modo ${this.PERFORMANCE_MODE_PRESETS[normalized].label} aplicado.`,
        'info',
      );
      setTimeout(() => this.hideStatus(this.captureStatus), 1600);
    }
    if (
      restartCamera &&
      changed &&
      this.isRunning &&
      this.sourceMode === 'camera'
    ) {
      this.cameraManager.stop();
      this.isRunning = false;
      this.cancelRenderLoop();
      await this.toggleCamera(true);
    }
  };

  proto.handlePreviewFpsSample = function (fps) {
    if (
      this.imageSettings.performanceMode !== 'auto' ||
      this.autoPerformanceDowngraded
    ) {
      return;
    }
    if (fps < 24) this.lowFpsSampleCount += 1;
    else this.lowFpsSampleCount = 0;
    if (this.lowFpsSampleCount < 3) return;
    this.autoPerformanceDowngraded = true;
    this.applyPerformanceProfileSettings(
      this.PERFORMANCE_MODE_PRESETS.performance,
      { save: false },
    );
    this.showStatus(
      this.captureStatus,
      'FPS bajo detectado. Se bajó la preview y el tracking.',
      'warning',
    );
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
        '<i class="fa-solid fa-play"></i> Encender cámara';
      this.btnToggleCamera.classList.remove('active');
      this.setCameraState('off');
      this.updatePreviewPlaceholder();
      this.resolutionInfo.textContent = '-';
      this.fpsInfo.textContent = '-';
      this.updateCaptureButtons();
      return;
    }

    if (!this.isRunning) {
      const requestedDeviceId =
        this.cameraSelect.value || this.preferredDeviceId || null;
      this.setCameraState('requesting');
      const ok = await this.cameraManager.start(
        this.videoEl,
        requestedDeviceId,
        {
          ...this.getCameraStartOptions(),
          onPermissionGranted: () => this.setCameraState('starting'),
        },
      );
      if (ok) {
        this.isRunning = true;
        this.setCameraState('running');
        this.updatePreviewPlaceholder();
        this.btnToggleCamera.innerHTML =
          '<span class="camera-live-label"><span class="camera-live-dot" aria-hidden="true"></span>Cámara activa</span><span class="camera-off-action">Apagar</span>';
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
        const errorState = this.classifyCameraError(
          this.cameraManager.lastError,
        );
        this.setCameraState(errorState, this.cameraManager.lastError, {
          focus: true,
        });
        const message = this.getCameraStartErrorMessage(
          this.cameraManager.lastError,
          forceStart,
        );
        this.setCameraPlaceholderMessage(message);
        this.updatePreviewPlaceholder();
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
      this.setCameraState('starting');
      const ok = await this.cameraManager.switchCamera(
        this.cameraSelect.value,
        {
          ...this.getCameraStartOptions(),
          onPermissionGranted: () => this.setCameraState('starting'),
        },
      );
      if (!ok)
        throw this.cameraManager.lastError || new Error('camera_switch_failed');
      this.setCameraState('running');
      const settings = this.cameraManager.getStreamSettings();
      this.preferredDeviceId = settings.deviceId || this.preferredDeviceId;
      void this.refreshCameraDevices(this.preferredDeviceId);
    } catch (err) {
      console.error('Error switching camera:', err);
      this.setCameraState(this.classifyCameraError(err), err, { focus: true });
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
    this.syncMirrorControls?.();
  };
}
