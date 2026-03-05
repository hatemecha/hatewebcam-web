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
      console.error('Error enumerating devices:', e);
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
          console.error('Error starting camera (fallback failed):', fallbackError);
          this.lastError = fallbackError;
          return false;
        }
      }
      console.error('Error starting camera:', e);
      this.lastError = e;
      return false;
    }
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

    const defaultWidth = lowPower ? 960 : 1280;
    const defaultHeight = lowPower ? 540 : 720;
    const defaultFps = lowPower ? 24 : 30;
    const maxWidth = lowPower ? 1280 : 1920;
    const maxHeight = lowPower ? 720 : 1080;

    const width = opts.width || defaultWidth;
    const height = opts.height || defaultHeight;
    const fps = opts.fps || defaultFps;

    const constraints = {
      video: {
        width: { ideal: width, max: maxWidth },
        height: { ideal: height, max: maxHeight },
        frameRate: { ideal: fps, max: lowPower ? 24 : 30 }
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
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.videoElement.srcObject = this.stream;
    await this.videoElement.play();

    const [track] = this.stream.getVideoTracks();
    const settings = track ? track.getSettings() : {};
    this.currentDeviceId = deviceId || settings.deviceId || null;
    this.running = true;
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
  }

  /**
   * Switch to a different camera
   */
  async switchCamera(deviceId) {
    if (this.running && this.videoElement) {
      await this.start(this.videoElement, deviceId);
    }
  }

  isRunning() {
    return this.running;
  }

  getVideoWidth() {
    return this.videoElement ? this.videoElement.videoWidth : 0;
  }

  getVideoHeight() {
    return this.videoElement ? this.videoElement.videoHeight : 0;
  }

  getStreamSettings() {
    const track = this.stream ? this.stream.getVideoTracks()[0] : null;
    return track ? track.getSettings() : {};
  }
}
