import { POSE_CONNECTIONS } from '../../subject/subject-motion.mjs';
import {
  mapNormToSubjectSpace,
  withSubjectVideoTransform,
} from '../../subject/subject-frame-map.mjs';

const JOINT_LABELS = Object.freeze({
  0: 'HEAD',
  11: 'SHOULDER_L',
  12: 'SHOULDER_R',
  15: 'WRIST_L',
  16: 'WRIST_R',
  23: 'HIP_L',
  24: 'HIP_R',
  27: 'ANKLE_L',
  28: 'ANKLE_R',
});

const PRIORITY_JOINTS = [15, 16, 0, 27, 28, 11, 12];

function pickSmartLabels(frame, config, maxLabels = 6) {
  const landmarks = frame.landmarks || [];
  const velocities = frame.jointVelocities || [];
  const candidates = PRIORITY_JOINTS.map((index) => {
    const point = landmarks[index];
    if (!point || (point.visibility ?? 1) < 0.35) return null;
    const vel = velocities[index] || { x: 0, y: 0 };
    const speed = Math.hypot(vel.x, vel.y);
    return {
      index,
      label: JOINT_LABELS[index] || `J${index}`,
      point,
      speed,
      score:
        speed * 2 +
        (config.showVelocity ? 0.15 : 0) +
        (index === 15 || index === 16 ? 0.2 : 0),
    };
  }).filter(Boolean);

  candidates.sort((a, b) => b.score - a.score);
  const densityCap = Math.max(2, Math.round(maxLabels * (config.density ?? 0.55)));
  return candidates.slice(0, densityCap);
}

function layoutLabels(labels, mappedPoints) {
  const placed = [];
  return labels.map((entry, i) => {
    const mapped = mappedPoints[i];
    const candidates = [
      { x: mapped.x + 8, y: mapped.y - 6 },
      { x: mapped.x + 8, y: mapped.y + 10 },
      { x: mapped.x - 48, y: mapped.y - 4 },
      { x: mapped.x + 8, y: mapped.y - 18 },
    ];
    for (const pos of candidates) {
      const box = { x: pos.x, y: pos.y - 10, w: 72, h: 34 };
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
    placed.push({ x: mapped.x + 8, y: mapped.y - 6, w: 72, h: 34 });
    return { x: mapped.x + 8, y: mapped.y - 6 };
  });
}

export function renderBodyMap(ctx, canvas, frame, config, intensity = 1, drawMetrics = null) {
  if (!frame?.landmarks?.length || !config || !drawMetrics) return;
  const color = config.color || '#f0f0ec';
  const alpha = Math.min(1, intensity * (config.connectionOpacity ?? 0.45));
  const lineWidth = Math.max(0.5, config.lineThickness ?? 1);
  const landmarks = frame.landmarks;

  withSubjectVideoTransform(ctx, drawMetrics, (tctx) => {
    tctx.save();
    tctx.lineCap = 'round';
    tctx.lineJoin = 'round';

    if (config.showCenter && frame.center) {
      const center = mapNormToSubjectSpace(
        frame.center.x,
        frame.center.y,
        drawMetrics,
      );
      tctx.strokeStyle = `rgba(240,240,236,${alpha * 0.55})`;
      tctx.lineWidth = 1;
      tctx.beginPath();
      tctx.moveTo(center.x - 6, center.y);
      tctx.lineTo(center.x + 6, center.y);
      tctx.moveTo(center.x, center.y - 6);
      tctx.lineTo(center.x, center.y + 6);
      tctx.stroke();
    }

    if (config.showSkeleton) {
      tctx.globalAlpha = alpha;
      tctx.strokeStyle = color;
      tctx.lineWidth = lineWidth;
      POSE_CONNECTIONS.forEach(([a, b]) => {
        const pA = landmarks[a];
        const pB = landmarks[b];
        if (!pA || !pB) return;
        if ((pA.visibility ?? 1) < 0.35 || (pB.visibility ?? 1) < 0.35) return;
        const start = mapNormToSubjectSpace(pA.x, pA.y, drawMetrics);
        const end = mapNormToSubjectSpace(pB.x, pB.y, drawMetrics);
        tctx.beginPath();
        tctx.moveTo(start.x, start.y);
        tctx.lineTo(end.x, end.y);
        tctx.stroke();
      });
    }

    if (config.showJoints) {
      tctx.fillStyle = color;
      tctx.globalAlpha = alpha * 0.9;
      PRIORITY_JOINTS.forEach((index) => {
        const point = landmarks[index];
        if (!point || (point.visibility ?? 1) < 0.35) return;
        const mapped = mapNormToSubjectSpace(point.x, point.y, drawMetrics);
        tctx.beginPath();
        tctx.arc(mapped.x, mapped.y, 2.2, 0, Math.PI * 2);
        tctx.fill();
      });
    }

    if (config.showLabels) {
      const labels = pickSmartLabels(frame, config);
      const mappedPoints = labels.map((entry) =>
        mapNormToSubjectSpace(entry.point.x, entry.point.y, drawMetrics),
      );
      const positions = layoutLabels(labels, mappedPoints);
      tctx.font = `${config.labelSize || 9}px "Cascadia Mono", monospace`;
      tctx.fillStyle = `rgba(240,240,236,${alpha * 0.85})`;
      labels.forEach((entry, index) => {
        const pos = positions[index];
        tctx.fillText(entry.label, pos.x, pos.y);
      });
    }

    tctx.restore();
  });
}
