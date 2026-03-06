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
        this.visualMode = 'pixelate';
        this.pixelationCellSize = 14;
        this.censorPaddingPercent = 18;

        // Transform awareness — set by app.js
        this.flipH = false;
        this.flipV = false;
        this.rotationDeg = 0;

        // Latest results
        this._faces = [];
        this._pixelCanvas = document.createElement('canvas');
        this._pixelCtx = this._pixelCanvas.getContext('2d', { willReadFrequently: true });

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

    _normalizeVisualMode(value) {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'box' || normalized === 'hybrid' || normalized === 'pixelate') {
            return normalized;
        }
        return 'pixelate';
    }

    _isBoxVisualMode() {
        return this.visualMode === 'box' || this.visualMode === 'hybrid';
    }

    _isPixelVisualMode() {
        return this.visualMode === 'pixelate' || this.visualMode === 'hybrid';
    }

    _getFaceRect(face, canvasWidth, canvasHeight, paddingPercent = this.censorPaddingPercent) {
        const p1 = this._mapPoint(face.minX, face.minY);
        const p2 = this._mapPoint(face.maxX, face.maxY);
        const x1 = p1.x * canvasWidth;
        const y1 = p1.y * canvasHeight;
        const x2 = p2.x * canvasWidth;
        const y2 = p2.y * canvasHeight;

        const fx = Math.max(0, Math.min(x1, x2));
        const fy = Math.max(0, Math.min(y1, y2));
        const fw = Math.abs(x2 - x1);
        const fh = Math.abs(y2 - y1);
        if (fw < 2 || fh < 2) return null;

        const padRatio = Math.max(0, paddingPercent) / 100;
        const padX = Math.round(fw * padRatio);
        const padY = Math.round(fh * padRatio * 1.12);
        const px = Math.max(0, fx - padX);
        const py = Math.max(0, fy - padY);
        const pw = Math.min(canvasWidth - px, fw + padX * 2);
        const ph = Math.min(canvasHeight - py, fh + padY * 2);

        if (pw < 2 || ph < 2) return null;
        return { x: px, y: py, width: pw, height: ph };
    }

    _pixelateRegion(ctx, canvas, rect) {
        if (!this._pixelCtx || !rect) return;

        const { x, y, width, height } = rect;
        const cellSize = Math.max(4, Math.round(this.pixelationCellSize || 14));
        const sampleWidth = Math.max(1, Math.round(width / cellSize));
        const sampleHeight = Math.max(1, Math.round(height / cellSize));

        if (this._pixelCanvas.width !== sampleWidth || this._pixelCanvas.height !== sampleHeight) {
            this._pixelCanvas.width = sampleWidth;
            this._pixelCanvas.height = sampleHeight;
        } else {
            this._pixelCtx.clearRect(0, 0, sampleWidth, sampleHeight);
        }

        this._pixelCtx.imageSmoothingEnabled = true;
        this._pixelCtx.drawImage(canvas, x, y, width, height, 0, 0, sampleWidth, sampleHeight);

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._pixelCanvas, 0, 0, sampleWidth, sampleHeight, x, y, width, height);
        ctx.restore();
    }

    _drawFaceBox(ctx, rect) {
        const { x, y, width, height } = rect;

        ctx.strokeStyle = this.boxColor;
        ctx.lineWidth = this.boxThickness;
        ctx.strokeRect(x, y, width, height);

        const label = this._normalizeLabel(this.labelText);
        ctx.font = '11px "Courier New", monospace';
        const tm = ctx.measureText(label);
        ctx.fillStyle = this.boxColor;
        const labelY = Math.max(0, y - 16);
        ctx.fillRect(x, labelY, tm.width + 8, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, x + 4, labelY + 12);
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
        const rectPadding = this._isPixelVisualMode() ? this.censorPaddingPercent : 8;

        for (const face of this._faces) {
            const rect = this._getFaceRect(face, w, h, rectPadding);
            if (!rect) continue;

            if (this._isPixelVisualMode()) {
                this._pixelateRegion(ctx, canvas, rect);
            }

            if (this._isBoxVisualMode()) {
                this._drawFaceBox(ctx, rect);
            }

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
            visualMode: this.visualMode,
            pixelationCellSize: this.pixelationCellSize,
            censorPaddingPercent: this.censorPaddingPercent,
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
        if (config.visualMode != null) this.visualMode = this._normalizeVisualMode(config.visualMode);
        if (config.pixelationCellSize != null) {
            this.pixelationCellSize = Math.max(4, Math.min(48, Math.round(config.pixelationCellSize)));
        }
        if (config.censorPaddingPercent != null) {
            this.censorPaddingPercent = Math.max(0, Math.min(48, Math.round(config.censorPaddingPercent)));
        }
    }

    _normalizeLabel(value) {
        const label = String(value || '').trim();
        if (!label) return 'CARA';
        return label.slice(0, 28);
    }

    reset() { this._faces = []; }
}
