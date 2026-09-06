function erode(mask, out, w, h) {
  out.fill(0);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let allWhite = true;
      for (let dy = -1; dy <= 1 && allWhite; dy++) {
        const row = (y + dy) * w;
        for (let dx = -1; dx <= 1 && allWhite; dx++) {
          if (mask[row + x + dx] === 0) allWhite = false;
        }
      }
      out[y * w + x] = allWhite ? 255 : 0;
    }
  }
}

function dilate(mask, out, w, h) {
  out.fill(0);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let anyWhite = false;
      for (let dy = -1; dy <= 1 && !anyWhite; dy++) {
        const row = (y + dy) * w;
        for (let dx = -1; dx <= 1 && !anyWhite; dx++) {
          if (mask[row + x + dx] === 255) anyWhite = true;
        }
      }
      out[y * w + x] = anyWhite ? 255 : 0;
    }
  }
}

// Scratch buffers are sized once per (width, height) pair and reused across
// messages - this worker receives a new frame roughly every 16-33ms, and
// re-allocating four full-frame typed arrays every single time was pure GC
// pressure for no behavioral benefit (the buffers are fully overwritten by
// `.fill(0)` / the flood fill below before being read).
let cachedW = 0;
let cachedH = 0;
let mask = null;
let morphA = null;
let morphB = null;
let visited = null;
let queue = null;

function ensureBuffers(w, h) {
  if (cachedW === w && cachedH === h && mask) return;
  cachedW = w;
  cachedH = h;
  const size = w * h;
  mask = new Uint8Array(size);
  morphA = new Uint8Array(size);
  morphB = new Uint8Array(size);
  visited = new Uint8Array(size);
  queue = new Int32Array(size);
}

function findBlobs(mask, w, h) {
  visited.fill(0);
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

self.onmessage = (event) => {
  const {
    seq,
    width,
    height,
    buffer,
    hsvMin,
    hsvMax,
    detectionMode,
    erodeIterations,
    dilateIterations,
    minAreaScaled,
    maxAreaScaled,
    maxObjects,
  } = event.data;
  const data = new Uint8ClampedArray(buffer);
  ensureBuffers(width, height);
  const hMin = hsvMin[0];
  const hMax = hsvMax[0];
  const sMin = hsvMin[1];
  const sMax = hsvMax[1];
  const vMin = hsvMin[2];
  const vMax = hsvMax[2];

  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
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

    let match;
    if (detectionMode === 'lights') {
      match = val >= 200 && sat <= 50;
    } else if (detectionMode === 'shadows') {
      match = val <= 60;
    } else {
      const hueOk =
        hMin <= hMax ? hue >= hMin && hue <= hMax : hue >= hMin || hue <= hMax;
      match = hueOk && sat >= sMin && sat <= sMax && val >= vMin && val <= vMax;
    }
    mask[p] = match ? 255 : 0;
  }

  let processedMask = mask;
  let outputMask = morphA;
  for (let i = 0; i < erodeIterations; i++) {
    erode(processedMask, outputMask, width, height);
    processedMask = outputMask;
    outputMask = outputMask === morphA ? morphB : morphA;
  }
  for (let i = 0; i < dilateIterations; i++) {
    dilate(processedMask, outputMask, width, height);
    processedMask = outputMask;
    outputMask = outputMask === morphA ? morphB : morphA;
  }

  const blobs = findBlobs(processedMask, width, height)
    .filter((blob) => blob.area >= minAreaScaled && blob.area <= maxAreaScaled)
    .sort((a, b) => b.area - a.area)
    .slice(0, maxObjects);

  self.postMessage({ seq, blobs });
};
