/**
 * FaceDetection — MediaPipe Face Mesh-based face detection
 * Draws bounding boxes around detected faces, accounting for canvas transforms
 */
class FaceDetection {
    constructor() {
        this.faceMesh = null;
        this.ready = false;
        this._processing = false;
        this._lastProcessTs = 0;

        // Visualization
        this.boxColor = '#e53935';
        this.boxThickness = 2;
        this.labelText = 'CARA';
        this.showLandmarks = false;
        this.maxFaces = 2;
        this.processIntervalMs = 45;
        this.boxSmoothing = 0.65;

        // Transform awareness — set by app.js
        this.flipH = false;
        this.flipV = false;
        this.rotationDeg = 0;

        // Latest results
        this._faces = [];

        this._initMediaPipe();
    }

    getName() { return 'Detector de Caras'; }

    _initMediaPipe() {
        try {
            if (typeof FaceMesh === 'undefined') {
                console.warn('MediaPipe FaceMesh not loaded.');
                return;
            }

            this.faceMesh = new FaceMesh({
                locateFile: (file) =>
                    `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
            });

            this.faceMesh.setOptions({
                maxNumFaces: this.maxFaces,
                refineLandmarks: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5,
            });

            this.faceMesh.onResults((results) => this._onResults(results));

            this.faceMesh.initialize().then(() => {
                this.ready = true;
            }).catch((e) => console.error('FaceDetection init error:', e));
        } catch (e) {
            console.error('FaceDetection: cannot init', e);
        }
    }

    _onResults(results) {
        this._processing = false;
        const nextFaces = [];

        if (results.multiFaceLandmarks) {
            for (let index = 0; index < results.multiFaceLandmarks.length; index++) {
                const landmarks = results.multiFaceLandmarks[index];
                let minX = 1, maxX = 0, minY = 1, maxY = 0;
                for (const lm of landmarks) {
                    if (lm.x < minX) minX = lm.x;
                    if (lm.x > maxX) maxX = lm.x;
                    if (lm.y < minY) minY = lm.y;
                    if (lm.y > maxY) maxY = lm.y;
                }

                const prev = this._faces[index];
                if (prev) {
                    const keep = this.boxSmoothing;
                    const take = 1 - keep;
                    minX = prev.minX * keep + minX * take;
                    maxX = prev.maxX * keep + maxX * take;
                    minY = prev.minY * keep + minY * take;
                    maxY = prev.maxY * keep + maxY * take;
                }

                nextFaces.push({ minX, maxX, minY, maxY, landmarks });
            }
        }

        this._faces = nextFaces;
    }

    /**
     * Transform normalized coordinates accounting for flips + rotation.
     */
    _mapPoint(normX, normY) {
        let x = this.flipH ? (1 - normX) : normX;
        let y = this.flipV ? (1 - normY) : normY;
        const rot = ((this.rotationDeg % 360) + 360) % 360;

        if (rot === 90) {
            return { x: 1 - y, y: x };
        }
        if (rot === 180) {
            return { x: 1 - x, y: 1 - y };
        }
        if (rot === 270) {
            return { x: y, y: 1 - x };
        }
        return { x, y };
    }

    processFrame(ctx, canvas, video) {
        if (this.ready && !this._processing && video && video.readyState >= 2) {
            const now = performance.now();
            if (now - this._lastProcessTs >= this.processIntervalMs) {
                this._lastProcessTs = now;
                this._processing = true;
                this.faceMesh.send({ image: video }).catch(() => {
                    this._processing = false;
                });
            }
        }

        const w = canvas.width;
        const h = canvas.height;

        for (const face of this._faces) {
            // Transform bounding box corners
            const p1 = this._mapPoint(face.minX, face.minY);
            const p2 = this._mapPoint(face.maxX, face.maxY);
            const x1 = p1.x * w;
            const y1 = p1.y * h;
            const x2 = p2.x * w;
            const y2 = p2.y * h;

            // Ensure correct order after potential flip
            const fx = Math.max(0, Math.min(x1, x2));
            const fy = Math.max(0, Math.min(y1, y2));
            const fw = Math.abs(x2 - x1);
            const fh = Math.abs(y2 - y1);
            if (fw < 2 || fh < 2) continue;

            // Pad slightly
            const pad = Math.round(fw * 0.08);
            const px = Math.max(0, fx - pad);
            const py = Math.max(0, fy - pad);
            const pw = Math.min(w - px, fw + pad * 2);
            const ph = Math.min(h - py, fh + pad * 2);

            // Draw box
            ctx.strokeStyle = this.boxColor;
            ctx.lineWidth = this.boxThickness;
            ctx.strokeRect(px, py, pw, ph);

            // Label
            const label = this._normalizeLabel(this.labelText);
            ctx.font = '11px "Courier New", monospace';
            const tm = ctx.measureText(label);
            ctx.fillStyle = this.boxColor;
            const labelY = Math.max(0, py - 16);
            ctx.fillRect(px, labelY, tm.width + 8, 16);
            ctx.fillStyle = '#fff';
            ctx.fillText(label, px + 4, labelY + 12);

            // Optional landmarks
            if (this.showLandmarks && face.landmarks) {
                ctx.fillStyle = 'rgba(229,57,53,0.4)';
                for (const lm of face.landmarks) {
                    const p = this._mapPoint(lm.x, lm.y);
                    const lx = p.x * w;
                    const ly = p.y * h;
                    ctx.fillRect(Math.round(lx), Math.round(ly), 1, 1);
                }
            }
        }
    }

    getConfig() {
        return {
            boxColor: this.boxColor,
            boxThickness: this.boxThickness,
            labelText: this.labelText,
            showLandmarks: this.showLandmarks,
            maxFaces: this.maxFaces,
            processIntervalMs: this.processIntervalMs,
            boxSmoothing: this.boxSmoothing,
            rotationDeg: this.rotationDeg,
        };
    }

    setConfig(config) {
        if (config.boxColor) this.boxColor = config.boxColor;
        if (config.boxThickness != null) this.boxThickness = config.boxThickness;
        if (config.labelText != null) this.labelText = this._normalizeLabel(config.labelText);
        if (config.showLandmarks != null) this.showLandmarks = config.showLandmarks;
        if (config.maxFaces != null) {
            this.maxFaces = config.maxFaces;
            if (this.faceMesh) this.faceMesh.setOptions({ maxNumFaces: this.maxFaces });
        }
        if (config.processIntervalMs != null) this.processIntervalMs = config.processIntervalMs;
        if (config.boxSmoothing != null) this.boxSmoothing = config.boxSmoothing;
        if (config.rotationDeg != null) this.rotationDeg = config.rotationDeg;
    }

    _normalizeLabel(value) {
        const label = String(value || '').trim();
        if (!label) return 'CARA';
        return label.slice(0, 28);
    }

    reset() { this._faces = []; }
}
