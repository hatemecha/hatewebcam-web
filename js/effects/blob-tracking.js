/**
 * BlobTracking — Canvas-based HSV color detection
 * Optimized for lower CPU usage and more stable detections.
 */
class BlobTracking {
    constructor() {
        // HSV ranges
        this.hsvMin = [0, 50, 50];
        this.hsvMax = [180, 255, 255];

        // Area filters
        this.minArea = 100;
        this.maxArea = 100000;
        this.maxObjects = 10;

        // Morphology
        this.erodeIterations = 0;
        this.dilateIterations = 0;

        // Visualization
        this.boxColor = '#00ffff';
        this.boxThickness = 2;
        this.showCoordinates = true;
        this.showCentroid = false;

        // Detection mode
        this.detectionMode = 'manual'; // 'manual', 'lights', 'shadows'

        // Connection state (from blink detection)
        this.leftActive = false;
        this.rightActive = false;
        this.connectionColor = '#00ff00';
        this.connectionThickness = 1;

        // Centroids for connections
        this.centroids = [];

        // Tolerance for color picking
        this._tolerance = 30;

        // Process on a downscaled copy for better performance
        this.processScale = 0.55;

        // Internal processing buffers
        this._tempCanvas = document.createElement('canvas');
        this._tempCtx = this._tempCanvas.getContext('2d', { willReadFrequently: true });
        this._workW = 0;
        this._workH = 0;
        this._mask = null;
        this._visited = null;
        this._queue = null;
    }

    getName() {
        return 'Detector de Objetos';
    }

    triggerConnection(eye) {
        if (eye === 'left') {
            this.leftActive = true;
            this.rightActive = false;
        } else if (eye === 'right') {
            this.leftActive = false;
            this.rightActive = true;
        } else if (eye === 'both') {
            this.leftActive = true;
            this.rightActive = true;
        } else {
            this.leftActive = false;
            this.rightActive = false;
        }
    }

    /**
     * Convert RGB to HSV (H: 0-180, S: 0-255, V: 0-255) to match OpenCV convention
     */
    rgbToHsv(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;

        let h = 0;
        let s = 0;
        const v = max;

        if (d !== 0) {
            s = d / max;
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 30;
            if (h < 0) h += 180;
        }

        return [Math.round(h), Math.round(s * 255), Math.round(v * 255)];
    }

    _ensureBuffers(w, h) {
        const size = w * h;
        if (!this._mask || this._mask.length !== size) {
            this._mask = new Uint8Array(size);
            this._visited = new Uint8Array(size);
            this._queue = new Int32Array(size);
        }

        if (this._workW !== w || this._workH !== h) {
            this._workW = w;
            this._workH = h;
            this._tempCanvas.width = w;
            this._tempCanvas.height = h;
        }
    }

    _isHueInRange(hue) {
        const minH = this.hsvMin[0];
        const maxH = this.hsvMax[0];
        if (minH <= maxH) {
            return hue >= minH && hue <= maxH;
        }
        // Wrapped range around 0/180 (e.g. red tones)
        return hue >= minH || hue <= maxH;
    }

    /**
     * Process frame — detect blobs and draw overlays
     */
    processFrame(ctx, canvas) {
        const w = canvas.width;
        const h = canvas.height;
        if (w === 0 || h === 0) return;

        const scale = Math.max(0.2, Math.min(1, this.processScale || 1));
        const sw = Math.max(48, Math.round(w * scale));
        const sh = Math.max(48, Math.round(h * scale));

        this._ensureBuffers(sw, sh);

        // Downscaled frame read to reduce per-pixel workload
        this._tempCtx.drawImage(canvas, 0, 0, sw, sh);
        const imageData = this._tempCtx.getImageData(0, 0, sw, sh);
        const data = imageData.data;
        const mask = this._mask;

        const hMin = this.hsvMin[0];
        const hMax = this.hsvMax[0];
        const sMin = this.hsvMin[1];
        const sMax = this.hsvMax[1];
        const vMin = this.hsvMin[2];
        const vMax = this.hsvMax[2];

        for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;

            const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
            const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
            const d = max - min;

            let hue = 0;
            let sat = 0;
            const val = Math.round(max * 255);

            if (d !== 0) {
                sat = Math.round((d / max) * 255);
                if (max === r) hue = ((g - b) / d) % 6;
                else if (max === g) hue = (b - r) / d + 2;
                else hue = (r - g) / d + 4;
                hue = Math.round(hue * 30);
                if (hue < 0) hue += 180;
            }

            let match = false;
            if (this.detectionMode === 'lights') {
                match = val >= 200 && sat <= 50;
            } else if (this.detectionMode === 'shadows') {
                match = val <= 60;
            } else {
                const hueOk = hMin <= hMax ? (hue >= hMin && hue <= hMax) : (hue >= hMin || hue <= hMax);
                match = hueOk && sat >= sMin && sat <= sMax && val >= vMin && val <= vMax;
            }

            mask[p] = match ? 255 : 0;
        }

        let processedMask = mask;
        if (this.erodeIterations > 0) {
            for (let i = 0; i < this.erodeIterations; i++) {
                processedMask = this._erode(processedMask, sw, sh);
            }
        }
        if (this.dilateIterations > 0) {
            for (let i = 0; i < this.dilateIterations; i++) {
                processedMask = this._dilate(processedMask, sw, sh);
            }
        }

        const blobs = this._findBlobs(processedMask, sw, sh);

        const areaScale = scale * scale;
        const minAreaScaled = this.minArea * areaScale;
        const maxAreaScaled = this.maxArea * areaScale;

        const filtered = blobs
            .filter((bObj) => bObj.area >= minAreaScaled && bObj.area <= maxAreaScaled)
            .sort((a, bObj) => bObj.area - a.area)
            .slice(0, this.maxObjects);

        this.centroids = [];

        const scaleX = w / sw;
        const scaleY = h / sh;

        ctx.strokeStyle = this.boxColor;
        ctx.lineWidth = this.boxThickness;

        for (const blob of filtered) {
            const x = Math.max(0, Math.round(blob.x * scaleX));
            const y = Math.max(0, Math.round(blob.y * scaleY));
            const bw = Math.max(1, Math.round(blob.width * scaleX));
            const bh = Math.max(1, Math.round(blob.height * scaleY));
            const cx = Math.max(0, Math.min(w - 1, Math.round(blob.cx * scaleX)));
            const cy = Math.max(0, Math.min(h - 1, Math.round(blob.cy * scaleY)));

            ctx.strokeRect(x, y, bw, bh);

            this.centroids.push({ x: cx, y: cy });

            if (this.showCoordinates) {
                const text = `X:${cx} Y:${cy}`;
                ctx.font = '11px "Courier New", monospace';
                const tm = ctx.measureText(text);
                const th = 14;
                const labelY = Math.max(0, y - th - 2);
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(x, labelY, tm.width + 6, th + 2);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(text, x + 3, labelY + th - 2);
            }

            if (this.showCentroid) {
                ctx.beginPath();
                ctx.arc(cx, cy, 4, 0, Math.PI * 2);
                ctx.fillStyle = this.boxColor;
                ctx.fill();
            }
        }

        const numCentroids = this.centroids.length;
        if ((this.leftActive || this.rightActive) && numCentroids > 1) {
            const pairs = [];
            for (let i = 0; i < numCentroids; i++) {
                for (let j = i + 1; j < numCentroids; j++) {
                    pairs.push([this.centroids[i], this.centroids[j]]);
                }
            }

            const mid = Math.floor(pairs.length / 2);
            let pairsToDraw = [];

            if (this.leftActive && this.rightActive) {
                pairsToDraw = pairs;
            } else if (this.leftActive) {
                pairsToDraw = mid > 0 ? pairs.slice(0, mid) : pairs;
            } else if (this.rightActive) {
                pairsToDraw = mid > 0 ? pairs.slice(mid) : pairs;
            }

            ctx.strokeStyle = this.connectionColor;
            ctx.lineWidth = this.connectionThickness;

            for (const [p1, p2] of pairsToDraw) {
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
    }

    /**
     * Simple 3x3 erode (shrink white regions)
     */
    _erode(mask, w, h) {
        const out = new Uint8Array(w * h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                let allWhite = true;
                for (let dy = -1; dy <= 1 && allWhite; dy++) {
                    const row = (y + dy) * w;
                    for (let dx = -1; dx <= 1 && allWhite; dx++) {
                        if (mask[row + (x + dx)] === 0) allWhite = false;
                    }
                }
                out[y * w + x] = allWhite ? 255 : 0;
            }
        }
        return out;
    }

    /**
     * Simple 3x3 dilate (grow white regions)
     */
    _dilate(mask, w, h) {
        const out = new Uint8Array(w * h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                let anyWhite = false;
                for (let dy = -1; dy <= 1 && !anyWhite; dy++) {
                    const row = (y + dy) * w;
                    for (let dx = -1; dx <= 1 && !anyWhite; dx++) {
                        if (mask[row + (x + dx)] === 255) anyWhite = true;
                    }
                }
                out[y * w + x] = anyWhite ? 255 : 0;
            }
        }
        return out;
    }

    /**
     * Connected-component labeling using BFS flood fill.
     * Returns array of blob objects: { x, y, width, height, area, cx, cy }
     */
    _findBlobs(mask, w, h) {
        const visited = this._visited;
        visited.fill(0);

        const queue = this._queue;
        const blobs = [];

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                if (mask[idx] !== 255 || visited[idx] === 1) continue;

                let qHead = 0;
                let qTail = 0;
                queue[qTail++] = idx;
                visited[idx] = 1;

                let minX = x;
                let maxX = x;
                let minY = y;
                let maxY = y;
                let sumX = 0;
                let sumY = 0;
                let area = 0;

                while (qHead < qTail) {
                    const cur = queue[qHead++];
                    const cx = cur % w;
                    const cy = Math.floor(cur / w);

                    area++;
                    sumX += cx;
                    sumY += cy;

                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;

                    const up = cy > 0 ? cur - w : -1;
                    const down = cy < h - 1 ? cur + w : -1;
                    const left = cx > 0 ? cur - 1 : -1;
                    const right = cx < w - 1 ? cur + 1 : -1;

                    if (up >= 0 && mask[up] === 255 && visited[up] === 0) {
                        visited[up] = 1;
                        queue[qTail++] = up;
                    }
                    if (down >= 0 && mask[down] === 255 && visited[down] === 0) {
                        visited[down] = 1;
                        queue[qTail++] = down;
                    }
                    if (left >= 0 && mask[left] === 255 && visited[left] === 0) {
                        visited[left] = 1;
                        queue[qTail++] = left;
                    }
                    if (right >= 0 && mask[right] === 255 && visited[right] === 0) {
                        visited[right] = 1;
                        queue[qTail++] = right;
                    }
                }

                if (area >= 10) {
                    blobs.push({
                        x: minX,
                        y: minY,
                        width: maxX - minX + 1,
                        height: maxY - minY + 1,
                        area,
                        cx: Math.round(sumX / area),
                        cy: Math.round(sumY / area),
                    });
                }
            }
        }

        return blobs;
    }

    /**
     * Set color from a picked pixel (RGB)
     */
    setColorFromPixel(r, g, b) {
        const [h, s, v] = this.rgbToHsv(r, g, b);
        const tol = this._tolerance;

        let hMin = h - tol;
        let hMax = h + tol;
        if (hMin < 0) hMin += 180;
        if (hMax > 180) hMax -= 180;

        this.hsvMin = [Math.round(hMin), Math.max(0, s - tol * 2), Math.max(0, v - tol * 2)];
        this.hsvMax = [Math.round(hMax), Math.min(255, s + tol * 2), Math.min(255, v + tol * 2)];
        this.detectionMode = 'manual';
    }

    getConfig() {
        return {
            hsvMin: this.hsvMin,
            hsvMax: this.hsvMax,
            minArea: this.minArea,
            maxArea: this.maxArea,
            maxObjects: this.maxObjects,
            erodeIterations: this.erodeIterations,
            dilateIterations: this.dilateIterations,
            boxColor: this.boxColor,
            boxThickness: this.boxThickness,
            showCoordinates: this.showCoordinates,
            showCentroid: this.showCentroid,
            tolerance: this._tolerance,
            detectionMode: this.detectionMode,
            processScale: this.processScale,
        };
    }

    setConfig(config) {
        if (config.hsvMin) this.hsvMin = config.hsvMin;
        if (config.hsvMax) this.hsvMax = config.hsvMax;
        if (config.minArea != null) this.minArea = config.minArea;
        if (config.maxArea != null) this.maxArea = config.maxArea;
        if (config.maxObjects != null) this.maxObjects = config.maxObjects;
        if (config.erodeIterations != null) this.erodeIterations = config.erodeIterations;
        if (config.dilateIterations != null) this.dilateIterations = config.dilateIterations;
        if (config.boxColor) this.boxColor = config.boxColor;
        if (config.boxThickness != null) this.boxThickness = config.boxThickness;
        if (config.showCoordinates != null) this.showCoordinates = config.showCoordinates;
        if (config.showCentroid != null) this.showCentroid = config.showCentroid;
        if (config.tolerance != null) this._tolerance = config.tolerance;
        if (config.detectionMode) this.detectionMode = config.detectionMode;
        if (config.processScale != null) this.processScale = config.processScale;
    }

    reset() {
        this.leftActive = false;
        this.rightActive = false;
        this.centroids = [];
    }
}
