/**
 * CameraManager - WebRTC camera capture
 */
class CameraManager {
  constructor() {
    this.stream = null;
    this.videoElement = null;
    this.devices = [];
    this.currentDeviceId = null;
    this.running = false;
    this.lastError = null;
  }

  /**
   * Enumerate available video input devices.
   */
  async enumerateDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      this.lastError = new Error('MediaDevices API no disponible en este navegador.');
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
  async start(videoElement, deviceId = null, opts = {}) {
    this.videoElement = videoElement;

    if (!navigator.mediaDevices?.getUserMedia) {
      this.lastError = new Error('getUserMedia no esta disponible en este navegador.');
      return false;
    }

    const constraints = this._buildVideoConstraints(deviceId, opts);

    try {
      if (this.stream) {
        this.stop();
      }

      await this._startWithConstraints(constraints, deviceId);
      this.lastError = null;
      return true;
    } catch (e) {
      // Fallback: if selected device fails, retry with default camera.
      if (deviceId) {
        try {
          if (this.stream) this.stop();
          await this._startWithConstraints(this._buildVideoConstraints(null, opts), null);
          this.lastError = null;
          return true;
        } catch (fallbackError) {
          if (!this._isExpectedCameraAccessError(fallbackError)) {
            console.warn('Error starting camera (fallback failed):', fallbackError);
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

  _isExpectedCameraAccessError(error) {
    const name = error && error.name ? error.name : '';
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

  _buildVideoConstraints(deviceId = null, opts = {}) {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const deviceMemory = typeof navigator !== 'undefined' && typeof navigator.deviceMemory === 'number'
      ? navigator.deviceMemory
      : 0;
    const hardwareConcurrency = typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 0;
    const lowPower = isMobile
      || (deviceMemory > 0 && deviceMemory <= 4)
      || (hardwareConcurrency > 0 && hardwareConcurrency <= 4);
    const targetFps = 30;

    const defaultWidth = lowPower ? 960 : 1280;
    const defaultHeight = lowPower ? 540 : 720;
    const defaultFps = targetFps;
    const maxWidth = lowPower ? 1280 : 1920;
    const maxHeight = lowPower ? 720 : 1080;

    const width = opts.width || defaultWidth;
    const height = opts.height || defaultHeight;
    const fps = opts.fps || defaultFps;

    const constraints = {
      video: {
        width: { ideal: width, max: maxWidth },
        height: { ideal: height, max: maxHeight },
        frameRate: { ideal: fps, max: targetFps }
      },
      audio: false
    };

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    } else if (isMobile) {
      constraints.video.facingMode = { ideal: 'user' };
    }

    return constraints;
  }

  async _startWithConstraints(constraints, deviceId = null) {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.stream = stream;
    this.videoElement.srcObject = stream;

    try {
      await this.videoElement.play();

      const [track] = stream.getVideoTracks();
      const settings = track ? track.getSettings() : {};
      this.currentDeviceId = deviceId || settings.deviceId || null;
      this.running = true;
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      if (this.stream === stream) this.stream = null;
      if (this.videoElement?.srcObject === stream) this.videoElement.srcObject = null;
      this.currentDeviceId = null;
      this.running = false;
      throw error;
    }
  }

  /**
   * Stop camera stream
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.running = false;
    this.currentDeviceId = null;
  }

  /**
   * Switch to a different camera
   */
  async switchCamera(deviceId) {
    if (this.running && this.videoElement) {
      return this.start(this.videoElement, deviceId);
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
