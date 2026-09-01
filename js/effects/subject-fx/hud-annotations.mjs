import { seededInt, seededRange } from '../../subject/subject-prng.mjs';
import { mapNormToCanvas } from '../../subject/subject-frame-map.mjs';

const HUD_LABELS = Object.freeze([
  'PULSE',
  'SKIN',
  'TEMPERATURE',
  'BONE',
  'DEPTH',
  'SIGNAL',
  'MASS',
  'FLOW',
  'VECTOR',
  'TORQUE',
]);

const ANCHOR_LANDMARKS = Object.freeze([
  { index: 0, priority: 0.9 },
  { index: 11, priority: 0.7 },
  { index: 12, priority: 0.7 },
  { index: 15, priority: 0.85 },
  { index: 16, priority: 0.85 },
  { index: 23, priority: 0.65 },
  { index: 24, priority: 0.65 },
  { index: 27, priority: 0.75 },
  { index: 28, priority: 0.75 },
]);

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

/** Quantized media-time bucket for numeric drift. */
export function hudTimeBucket(mediaTimeMs, holdMs = 380, speed = 1) {
  const hold = Math.max(60, holdMs);
  const rate = Math.max(0.1, speed);
  return Math.floor((Math.max(0, mediaTimeMs) * rate) / hold);
}

/** Stable numeric readout that drifts with media time but not every frame. */
export function hudNumericValue(seed, clipId, landmarkIndex, timeBucket) {
  const base = seededRange(seed, 12, 98, clipId, 'hud-base', landmarkIndex);
  const drift = seededRange(
    seed,
    -6,
    6,
    clipId,
    'hud-drift',
    landmarkIndex,
    timeBucket,
  );
  return Math.round(Math.min(99, Math.max(0, base + drift)));
}

function pickLabel(seed, clipId, landmarkIndex) {
  const labelIndex = seededInt(
    seed,
    0,
    HUD_LABELS.length - 1,
    clipId,
    'hud-label',
    landmarkIndex,
  );
  return HUD_LABELS[labelIndex];
}

function pickSide(seed, clipId, landmarkIndex) {
  return seededRange(seed, 0, 1, clipId, 'hud-side', landmarkIndex) < 0.5
    ? 'left'
    : 'right';
}

function layoutLabelPosition(
  anchor,
  side,
  slot,
  canvasWidth,
  canvasHeight,
  placed,
) {
  const margin = 18;
  const labelW = 88;
  const labelH = 28;
  const slotCount = 7;
  const slotY =
    margin +
    (slot / Math.max(1, slotCount - 1)) * (canvasHeight - margin * 2 - labelH);
  const baseX =
    side === 'left'
      ? margin
      : Math.max(margin, canvasWidth - margin - labelW);
  const candidates = [
    { x: baseX, y: slotY },
    { x: baseX, y: slotY + 14 },
    { x: baseX, y: slotY - 12 },
    { x: baseX + (side === 'left' ? 12 : -12), y: slotY + 6 },
  ];
  for (const pos of candidates) {
    const box = { x: pos.x, y: pos.y - 12, w: labelW, h: labelH };
    const collision = placed.some(
      (other) =>
        box.x < other.x + other.w &&
        box.x + box.w > other.x &&
        box.y < other.y + other.h &&
        box.y + box.h > other.y,
    );
    if (!collision) {
      placed.push(box);
      return pos;
    }
  }
  placed.push({ x: baseX, y: slotY - 12, w: labelW, h: labelH });
  return { x: baseX, y: slotY };
}

/**
 * Build stable HUD annotation layout (pure, testable).
 * @returns {Array<{landmarkIndex:number,label:string,value:number,anchor:{x:number,y:number},labelPos:{x:number,y:number},side:string}>}
 */
export function buildHudAnnotations(
  frame,
  config,
  seed,
  clipId,
  mediaTimeMs,
  drawMetrics,
) {
  if (!frame?.landmarks?.length || !drawMetrics) return [];

  const density = clamp01(config.density ?? 0.5);
  const maxCount = Math.max(2, Math.min(9, Math.round(4 + density * 3)));
  const timeBucket = hudTimeBucket(
    mediaTimeMs,
    config.hold ?? 380,
    config.speed ?? 1,
  );

  const landmarks = frame.landmarks;
  const candidates = ANCHOR_LANDMARKS.map(({ index, priority }) => {
    const point = landmarks[index];
    if (!point || (point.visibility ?? 1) < 0.35) return null;
    const anchor = mapNormToCanvas(point.x, point.y, drawMetrics);
    return {
      landmarkIndex: index,
      priority:
        priority +
        seededRange(seed, 0, 0.2, clipId, 'hud-priority', index),
      anchor,
      label: pickLabel(seed, clipId, index),
      side: pickSide(seed, clipId, index),
      slot: seededInt(seed, 0, 6, clipId, 'hud-slot', index),
      value: hudNumericValue(seed, clipId, index, timeBucket),
    };
  }).filter(Boolean);

  candidates.sort((a, b) => b.priority - a.priority);
  const selected = candidates.slice(0, maxCount);
  const placed = [];

  return selected.map((entry) => {
    const labelPos = layoutLabelPosition(
      entry.anchor,
      entry.side,
      entry.slot,
      drawMetrics.canvasWidth,
      drawMetrics.canvasHeight,
      placed,
    );
    return { ...entry, labelPos };
  });
}

export function renderHudAnnotations(
  ctx,
  canvas,
  frame,
  config,
  intensity = 1,
  seed = 0,
  clipId = '',
  drawMetrics = null,
  mediaTimeMs = 0,
) {
  if (!config?.enabled || !frame || !drawMetrics) return;

  const alpha = clamp01(intensity) * clamp01(config.opacity ?? 0.82);
  if (alpha <= 0.01) return;

  const annotations = buildHudAnnotations(
    frame,
    config,
    seed,
    clipId,
    mediaTimeMs,
    drawMetrics,
  );
  if (!annotations.length) return;

  const lineWidth = Math.max(0.35, config.lineWidth ?? 0.6);
  const fontSize = Math.max(7, Math.round(config.fontSize ?? 9));
  const color = config.color || '#e8e8e4';

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.font = `${fontSize}px "Cascadia Mono", monospace`;
  ctx.fillStyle = `rgba(232,232,228,${alpha * 0.9})`;
  ctx.strokeStyle = `rgba(232,232,228,${alpha * 0.55})`;
  ctx.lineWidth = lineWidth;

  for (const entry of annotations) {
    const { anchor, labelPos, label, value } = entry;
    const lineEnd = {
      x: labelPos.x + (entry.side === 'left' ? 72 : 8),
      y: labelPos.y - 4,
    };

    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    const midX = anchor.x + (lineEnd.x - anchor.x) * 0.42;
    const midY = anchor.y + (lineEnd.y - anchor.y) * 0.18;
    ctx.lineTo(midX, midY);
    ctx.lineTo(lineEnd.x, lineEnd.y);
    ctx.stroke();

    const text = `${label} ${String(value).padStart(2, '0')}`;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillText(text, labelPos.x, labelPos.y);

    ctx.fillStyle = `rgba(232,232,228,${alpha * 0.35})`;
    ctx.fillRect(anchor.x - 1.5, anchor.y - 1.5, 3, 3);
  }

  ctx.restore();
}
