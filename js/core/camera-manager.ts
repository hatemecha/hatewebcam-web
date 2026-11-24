export interface CameraStartOptions {
  width?: number;
  height?: number;
  fps?: number;
  onPermissionGranted?: () => void;
}

export class CameraManager {
  stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  devices: MediaDeviceInfo[] = [];
  currentDeviceId: string | null = null;
  private running = false;
  lastError: unknown = null;
  private request = 0;

  /**
   * Enumerate available video input devices.
   */
  async enumerateDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      this.lastError = new Error(
        'MediaDevices API no disponible en este navegador.',
      );
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter((d) => d.kind === 'videoinput');
      this.lastError = null;
      return this.devices;
    } catch (e) {
      console.warn('Error enumerating devices:', e);
      this.lastError = e;
      return [];
    }
  }

  /**
   * Start camera stream
   */
  async start(
    videoElement: HTMLVideoElement,
    deviceId: string | null = null,
    opts: CameraStartOptions = {},
  ) {
    this.stop();
    this.videoElement = videoElement;
    const request = this.request;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.lastError = new Error(
        'getUserMedia no esta disponible en este navegador.',
      );
      return false;
    }

    const constraints = this._buildVideoConstraints(deviceId, opts);

    try {
      return await this.startWithConstraints(
        videoElement,
        constraints,
        deviceId,
        opts,
        request,
      );
    } catch (e) {
      if (request !== this.request) return false;
      // Fallback: if selected device fails, retry with default camera.
      if (deviceId) {
        try {
          return await this.startWithConstraints(
            videoElement,
            this._buildVideoConstraints(null, opts),
            null,
            opts,
            request,
          );
        } catch (fallbackError) {
          if (request !== this.request) return false;
          if (!this._isExpectedCameraAccessError(fallbackError)) {
            console.warn(
              'Error starting camera (fallback failed):',
              fallbackError,
            );
          }
          this.lastError = fallbackError;
          return false;
        }
      }
      if (!this._isExpectedCameraAccessError(e)) {
        console.warn('Error starting camera:', e);
      }
      this.lastError = e;
      return false;
    }
  }

  private _isExpectedCameraAccessError(error: unknown) {
    const name = (error as { name?: string } | null)?.name || '';
    return [
      'NotAllowedError',
      'SecurityError',
      'NotFoundError',
      'DevicesNotFoundError',
      'NotReadableError',
      'TrackStartError',
      'OverconstrainedError',
      'ConstraintNotSatisfiedError',
    ].includes(name);
  }

  _buildVideoConstraints(
    deviceId: string | null = null,
    opts: CameraStartOptions = {},
  ) {
    const ua =
      typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const memory =
      typeof navigator !== 'undefined' && 'deviceMemory' in navigator
        ? navigator.deviceMemory
        : undefined;
    const deviceMemory = typeof memory === 'number' ? memory : 0;
    const hardwareConcurrency =
      typeof navigator !== 'undefined' &&
      typeof navigator.hardwareConcurrency === 'number'
        ? navigator.hardwareConcurrency
        : 0;
    const lowPower =
      isMobile ||
      (deviceMemory > 0 && deviceMemory <= 4) ||
      (hardwareConcurrency > 0 && hardwareConcurrency <= 4);
    const preferredFps = 30;

    const defaultWidth = lowPower ? 960 : 1280;
    const defaultHeight = lowPower ? 540 : 720;
    const defaultFps = preferredFps;
    const maxWidth = lowPower ? 1280 : 1920;
    const maxHeight = lowPower ? 720 : 1080;

    const width = opts.width || defaultWidth;
    const height = opts.height || defaultHeight;
    const fps = opts.fps || defaultFps;

    const video: MediaTrackConstraints = {
      width: { ideal: width, max: maxWidth },
      height: { ideal: height, max: maxHeight },
      frameRate: { ideal: fps },
    };

    if (deviceId) {
      video.deviceId = { exact: deviceId };
    } else if (isMobile) {
      video.facingMode = { ideal: 'user' };
    }

    return { video, audio: false };
  }

  private async startWithConstraints(
    videoElement: HTMLVideoElement,
    constraints: MediaStreamConstraints,
    deviceId: string | null,
    opts: CameraStartOptions,
    request: number,
  ): Promise<boolean> {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (request !== this.request) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    this.stream = stream;

    try {
      opts.onPermissionGranted?.();
      if (request !== this.request) return false;
      videoElement.srcObject = stream;
      await videoElement.play();
      if (request !== this.request) return false;

      const [track] = stream.getVideoTracks();
      const settings = track ? track.getSettings() : {};
      this.currentDeviceId = deviceId || settings.deviceId || null;
      this.running = true;
      this.lastError = null;
      return true;
    } catch (error) {
      if (request === this.request) this.releaseStream();
      throw error;
    }
  }

  /**
   * Stop camera stream
   */
  stop() {
    this.request += 1;
    this.releaseStream();
  }

  private releaseStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.videoElement && this.videoElement.srcObject === this.stream)
      this.videoElement.srcObject = null;
    this.stream = null;
    this.running = false;
    this.currentDeviceId = null;
  }

  /**
   * Switch to a different camera
   */
  async switchCamera(deviceId: string | null, opts: CameraStartOptions = {}) {
    if (this.running && this.videoElement) {
      return this.start(this.videoElement, deviceId, opts);
    }
    return false;
  }

  isRunning() {
    return this.running;
  }

  getStreamSettings() {
    const track = this.stream ? this.stream.getVideoTracks()[0] : null;
    return track ? track.getSettings() : {};
  }
}
