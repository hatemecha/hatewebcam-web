/**
 * BlinkDetection — MediaPipe Face Mesh blink detection
 * Port of the Python BlinkDetection effect
 */
class BlinkDetection {
    constructor() {
        // MediaPipe Face Mesh
        this.faceMesh = null;
        this.ready = false;
        this.initPromise = null;

        // EAR landmark indices (same as Python version)
        this.LEFT_EYE_EAR = [33, 133, 159, 145];
        this.RIGHT_EYE_EAR = [362, 263, 386, 374];

        // State
        this.eyeArThreshold = 0.22;
        this.leftBlinkDetected = false;
        this.rightBlinkDetected = false;
        this.showDebug = true;
        this.feedbackColor = '#00ff00';
        this.processIntervalMs = 60;
        this.minClosedFrames = 2;
        this._earSmoothing = 0.7;

        // Callback
        this.blinkCallback = null;

        // Latest landmarks for overlay drawing
        this._latestLandmarks = null;
        this._faceMeshProcessing = false;
        this._lastProcessTs = 0;
        this._leftEarSmooth = 1;
        this._rightEarSmooth = 1;
        this._leftClosedFrames = 0;
        this._rightClosedFrames = 0;

        // Initialize MediaPipe
        this._initMediaPipe();
    }

    getName() {
        return 'Detección de Pestañeos';
    }

    _initMediaPipe() {
        try {
            if (typeof FaceMesh === 'undefined') {
                console.warn('MediaPipe FaceMesh not loaded. Blink detection disabled.');
                return;
            }

            this.faceMesh = new FaceMesh({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
                }
            });

            this.faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            this.faceMesh.onResults((results) => {
                this._onFaceMeshResults(results);
            });

            // Send a dummy frame to initialize
            this.initPromise = this.faceMesh.initialize().then(() => {
                this.ready = true;
                console.log('MediaPipe FaceMesh initialized');
            }).catch(e => {
                console.error('FaceMesh init error:', e);
            });
        } catch (e) {
            console.error('Cannot initialize FaceMesh:', e);
        }
    }

    _onFaceMeshResults(results) {
        this._faceMeshProcessing = false;

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];
            this._latestLandmarks = landmarks;

            // Calculate EAR
            const leftEar = this._calculateEar(this.LEFT_EYE_EAR, landmarks);
            const rightEar = this._calculateEar(this.RIGHT_EYE_EAR, landmarks);

            // Smooth EAR and require consecutive frames to reduce false positives.
            const keep = this._earSmoothing;
            const take = 1 - keep;
            this._leftEarSmooth = this._leftEarSmooth * keep + leftEar * take;
            this._rightEarSmooth = this._rightEarSmooth * keep + rightEar * take;

            this._leftClosedFrames = this._leftEarSmooth < this.eyeArThreshold ? this._leftClosedFrames + 1 : 0;
            this._rightClosedFrames = this._rightEarSmooth < this.eyeArThreshold ? this._rightClosedFrames + 1 : 0;

            this.leftBlinkDetected = this._leftClosedFrames >= this.minClosedFrames;
            this.rightBlinkDetected = this._rightClosedFrames >= this.minClosedFrames;

            // Fire callback
            if (this.blinkCallback) {
                if (this.leftBlinkDetected && this.rightBlinkDetected) {
                    this.blinkCallback('both');
                } else if (this.leftBlinkDetected) {
                    this.blinkCallback('left');
                } else if (this.rightBlinkDetected) {
                    this.blinkCallback('right');
                } else {
                    this.blinkCallback('none');
                }
            }
        } else {
            this._latestLandmarks = null;
            this.leftBlinkDetected = false;
            this.rightBlinkDetected = false;
            this._leftClosedFrames = 0;
            this._rightClosedFrames = 0;
            if (this.blinkCallback) this.blinkCallback('none');
        }
    }

    _calculateEar(eyeIndices, landmarks) {
        const points = eyeIndices.map(i => landmarks[i]);
        if (points.length < 4) return 1.0;

        // Vertical distance
        const A = Math.sqrt(
            Math.pow(points[2].x - points[3].x, 2) +
            Math.pow(points[2].y - points[3].y, 2)
        );
        // Horizontal distance
        const B = Math.sqrt(
            Math.pow(points[0].x - points[1].x, 2) +
            Math.pow(points[0].y - points[1].y, 2)
        );

        if (B === 0) return 0;
        return A / B;
    }

    /**
     * Process frame — sends to MediaPipe for async processing  
     * Drawing is done from cached results
     */
    processFrame(ctx, canvas, video) {
        // Send frame to MediaPipe (throttled)
        if (this.ready && !this._faceMeshProcessing && video && video.readyState >= 2) {
            const now = performance.now();
            if (now - this._lastProcessTs < this.processIntervalMs) return;
            this._lastProcessTs = now;
            this._faceMeshProcessing = true;
            this.faceMesh.send({ image: video }).catch(() => {
                this._faceMeshProcessing = false;
            });
        }
    }

    setBlinkCallback(callback) {
        this.blinkCallback = callback;
    }

    setFeedbackColor(hexColor) {
        this.feedbackColor = hexColor;
    }

    getConfig() {
        return {
            eyeArThreshold: this.eyeArThreshold,
            showDebug: this.showDebug,
            processIntervalMs: this.processIntervalMs,
            minClosedFrames: this.minClosedFrames,
        };
    }

    setConfig(config) {
        if (config.eyeArThreshold != null) this.eyeArThreshold = config.eyeArThreshold;
        if (config.showDebug != null) this.showDebug = config.showDebug;
        if (config.processIntervalMs != null) this.processIntervalMs = config.processIntervalMs;
        if (config.minClosedFrames != null) this.minClosedFrames = config.minClosedFrames;
    }

    reset() {
        this.leftBlinkDetected = false;
        this.rightBlinkDetected = false;
        this._latestLandmarks = null;
        this._leftClosedFrames = 0;
        this._rightClosedFrames = 0;
        this._leftEarSmooth = 1;
        this._rightEarSmooth = 1;
    }
}
