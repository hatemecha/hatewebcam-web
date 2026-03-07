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
        this.boxSmoothing = 0.82;
        this.visualMode = 'box';
        this.pixelationCellSize = 14;
        this.censorPaddingPercent = 18;
        this.detectionHoldMs = 220;
        this.matchDistanceMultiplier = 1.9;
        this.sameFaceOverlapRatio = 0.62;
        this.sameFaceCenterRatio = 0.38;

        // Transform awareness — set by app.js
        this.flipH = false;
        this.flipV = false;
        this.rotationDeg = 0;

        // Latest results
        this._faces = [];
        this._nextFaceId = 1;
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
        const now = performance.now();
        const previousFaces = this._faces.slice();
        const reusedFaceIds = new Set();
        const nextFaces = [];

        if (results.multiFaceLandmarks) {
            for (const landmarks of results.multiFaceLandmarks) {
                const detectedFace = this._measureFace(landmarks);
                const prevFace = this._findMatchingFace(detectedFace, previousFaces, reusedFaceIds);
                if (prevFace) reusedFaceIds.add(prevFace.id);
                nextFaces.push(this._stabilizeFace(detectedFace, prevFace, now));
            }
        }

        for (const prevFace of previousFaces) {
            if (reusedFaceIds.has(prevFace.id)) continue;
            if (now - (prevFace.lastSeenTs || 0) > this.detectionHoldMs) continue;
            nextFaces.push({
                ...prevFace,
                lastSeenTs: prevFace.lastSeenTs || now,
                missedFrames: (prevFace.missedFrames || 0) + 1,
            });
        }

        const dedupedFaces = this._dedupeFaces(nextFaces);

        dedupedFaces.sort((a, b) => {
            const aMissed = a.missedFrames || 0;
            const bMissed = b.missedFrames || 0;
            if (aMissed !== bMissed) return aMissed - bMissed;
            return (a.centerX || 0) - (b.centerX || 0);
        });

        this._faces = dedupedFaces.slice(0, this.maxFaces);
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
        return 'box';
    }

    _isBoxVisualMode() {
        return this.visualMode === 'box' || this.visualMode === 'hybrid';
    }

    _isPixelVisualMode() {
        return this.visualMode === 'pixelate' || this.visualMode === 'hybrid';
    }

    _measureFace(landmarks) {
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        for (const lm of landmarks) {
            if (lm.x < minX) minX = lm.x;
            if (lm.x > maxX) maxX = lm.x;
            if (lm.y < minY) minY = lm.y;
            if (lm.y > maxY) maxY = lm.y;
        }

        const width = Math.max(0.0001, maxX - minX);
        const height = Math.max(0.0001, maxY - minY);
        return {
            minX,
            maxX,
            minY,
            maxY,
            width,
            height,
            centerX: minX + width / 2,
            centerY: minY + height / 2,
            landmarks,
        };
    }

    _findMatchingFace(face, previousFaces, reusedFaceIds) {
        let bestFace = null;
        let bestDistance = Infinity;

        for (const prevFace of previousFaces) {
            if (!prevFace || reusedFaceIds.has(prevFace.id)) continue;

            const dx = (face.centerX || 0) - (prevFace.centerX || 0);
            const dy = (face.centerY || 0) - (prevFace.centerY || 0);
            const distance = Math.hypot(dx, dy);
            const faceSize = Math.max(face.width || 0, face.height || 0, prevFace.width || 0, prevFace.height || 0);
            const maxDistance = Math.max(0.06, faceSize * this.matchDistanceMultiplier);
            if (distance > maxDistance || distance >= bestDistance) continue;

            bestDistance = distance;
            bestFace = prevFace;
        }

        return bestFace;
    }

    _stabilizeFace(face, prevFace, now) {
        let stabilized = { ...face };

        if (prevFace) {
            const keep = this.boxSmoothing;
            const take = 1 - keep;
            stabilized = {
                ...face,
                minX: prevFace.minX * keep + face.minX * take,
                maxX: prevFace.maxX * keep + face.maxX * take,
                minY: prevFace.minY * keep + face.minY * take,
                maxY: prevFace.maxY * keep + face.maxY * take,
            };
            stabilized.width = Math.max(0.0001, stabilized.maxX - stabilized.minX);
            stabilized.height = Math.max(0.0001, stabilized.maxY - stabilized.minY);
            stabilized.centerX = stabilized.minX + stabilized.width / 2;
            stabilized.centerY = stabilized.minY + stabilized.height / 2;
        }

        stabilized.id = prevFace ? prevFace.id : this._nextFaceId++;
        stabilized.lastSeenTs = now;
        stabilized.missedFrames = 0;
        return stabilized;
    }

    _getFaceArea(face) {
        return Math.max(0, face.width || 0) * Math.max(0, face.height || 0);
    }

    _getFaceIntersection(faceA, faceB) {
        const minX = Math.max(faceA.minX || 0, faceB.minX || 0);
        const minY = Math.max(faceA.minY || 0, faceB.minY || 0);
        const maxX = Math.min(faceA.maxX || 0, faceB.maxX || 0);
        const maxY = Math.min(faceA.maxY || 0, faceB.maxY || 0);
        const width = Math.max(0, maxX - minX);
        const height = Math.max(0, maxY - minY);
        return width * height;
    }

    _isSameFaceCandidate(faceA, faceB) {
        const areaA = this._getFaceArea(faceA);
        const areaB = this._getFaceArea(faceB);
        if (areaA <= 0 || areaB <= 0) return false;

        const intersection = this._getFaceIntersection(faceA, faceB);
        if (intersection <= 0) return false;

        const smallerArea = Math.max(0.0001, Math.min(areaA, areaB));
        const overlapRatio = intersection / smallerArea;

        const dx = (faceA.centerX || 0) - (faceB.centerX || 0);
        const dy = (faceA.centerY || 0) - (faceB.centerY || 0);
        const centerDistance = Math.hypot(dx, dy);
        const maxSize = Math.max(faceA.width || 0, faceA.height || 0, faceB.width || 0, faceB.height || 0, 0.0001);
        const normalizedCenterDistance = centerDistance / maxSize;

        return overlapRatio >= this.sameFaceOverlapRatio
            && normalizedCenterDistance <= this.sameFaceCenterRatio;
    }

    _pickPreferredFace(faceA, faceB) {
        const missedA = faceA.missedFrames || 0;
        const missedB = faceB.missedFrames || 0;
        if (missedA !== missedB) return missedA < missedB ? faceA : faceB;

        const seenA = faceA.lastSeenTs || 0;
        const seenB = faceB.lastSeenTs || 0;
        if (seenA !== seenB) return seenA > seenB ? faceA : faceB;

        const areaA = this._getFaceArea(faceA);
        const areaB = this._getFaceArea(faceB);
        if (areaA !== areaB) return areaA >= areaB ? faceA : faceB;

        return (faceA.id || 0) <= (faceB.id || 0) ? faceA : faceB;
    }

    _dedupeFaces(faces) {
        if (!Array.isArray(faces) || faces.length <= 1) return Array.isArray(faces) ? faces.slice() : [];

        const orderedFaces = faces.slice().sort((a, b) => {
            const preferred = this._pickPreferredFace(a, b);
            return preferred === a ? -1 : 1;
        });
        const uniqueFaces = [];

        for (const face of orderedFaces) {
            const duplicateIndex = uniqueFaces.findIndex((candidate) => this._isSameFaceCandidate(face, candidate));
            if (duplicateIndex === -1) {
                uniqueFaces.push(face);
                continue;
            }

            uniqueFaces[duplicateIndex] = this._pickPreferredFace(uniqueFaces[duplicateIndex], face);
        }

        return uniqueFaces;
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
            detectionHoldMs: this.detectionHoldMs,
            sameFaceOverlapRatio: this.sameFaceOverlapRatio,
            sameFaceCenterRatio: this.sameFaceCenterRatio,
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
        if (config.detectionHoldMs != null) {
            this.detectionHoldMs = Math.max(80, Math.min(600, Math.round(config.detectionHoldMs)));
        }
        if (config.sameFaceOverlapRatio != null) {
            this.sameFaceOverlapRatio = Math.max(0.2, Math.min(0.95, Number(config.sameFaceOverlapRatio)));
        }
        if (config.sameFaceCenterRatio != null) {
            this.sameFaceCenterRatio = Math.max(0.08, Math.min(0.9, Number(config.sameFaceCenterRatio)));
        }
    }

    _normalizeLabel(value) {
        const label = String(value || '').trim();
        if (!label) return 'CARA';
        return label.slice(0, 28);
    }

    reset() { this._faces = []; }
}
