/** Local body motion regions derived from pose landmarks. */

const REGION_DEFS = Object.freeze({
  head: { joints: [0, 1, 2, 3, 4], radius: 0.08 },
  torso: { joints: [11, 12, 23, 24], radius: 0.14 },
  leftHand: { joints: [15, 17, 19, 21], radius: 0.07 },
  rightHand: { joints: [16, 18, 20, 22], radius: 0.07 },
  leftFoot: { joints: [27, 29, 31], radius: 0.06 },
  rightFoot: { joints: [28, 30, 32], radius: 0.06 },
  leftArm: { joints: [11, 13, 15], radius: 0.09 },
  rightArm: { joints: [12, 14, 16], radius: 0.09 },
  leftLeg: { joints: [23, 25, 27], radius: 0.08 },
  rightLeg: { joints: [24, 26, 28], radius: 0.08 },
});

function avgPoint(points) {
  if (!points.length) return { x: 0.5, y: 0.5 };
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function clampRange(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function buildLocalMotionRegions(frame) {
  if (!frame?.landmarks?.length) return {};
  const regions = {};
  const velocities = frame.jointVelocities || [];

  Object.entries(REGION_DEFS).forEach(([name, def]) => {
    const points = def.joints
      .map((index) => frame.landmarks[index])
      .filter((point) => point && (point.visibility ?? 1) > 0.3);
    if (!points.length) return;

    const position = avgPoint(points);
    let vx = 0;
    let vy = 0;
    let count = 0;
    def.joints.forEach((index) => {
      const vel = velocities[index];
      if (!vel) return;
      vx += vel.x;
      vy += vel.y;
      count++;
    });
    if (count > 0) {
      vx /= count;
      vy /= count;
    }
    const speed = Math.hypot(vx, vy);
    regions[name] = {
      name,
      position,
      velocity: { x: vx, y: vy },
      speed: clampRange(speed * 8, 0, 1),
      direction: speed > 0.0001 ? Math.atan2(vy, vx) : 0,
      influenceRadius: def.radius,
      confidence: clampRange(points.length / def.joints.length, 0, 1),
    };
  });

  return regions;
}

export function getStrongestMotionRegion(regions = {}) {
  let best = null;
  Object.values(regions).forEach((region) => {
    if (!best || region.speed > best.speed) best = region;
  });
  return best;
}

export function getJointMotion(regions, name) {
  return regions?.[name] || null;
}

export function getMotionAt(regions, nx, ny) {
  let best = { speed: 0, direction: 0, region: null };
  Object.values(regions || {}).forEach((region) => {
    const dx = nx - region.position.x;
    const dy = ny - region.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist > region.influenceRadius) return;
    const falloff = 1 - dist / region.influenceRadius;
    const influence = region.speed * falloff;
    if (influence > best.speed) {
      best = {
        speed: influence,
        direction: region.direction,
        region: region.name,
        velocity: region.velocity,
      };
    }
  });
  return best;
}

export function sampleInfluence(regions, nx, ny) {
  const motion = getMotionAt(regions, nx, ny);
  return motion.speed;
}

export { REGION_DEFS };
