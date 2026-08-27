import { seededInt, seededRange } from '../../subject/subject-prng.mjs';
import {
  getMotionAt,
  getStrongestMotionRegion,
} from '../../subject/subject-local-motion.mjs';
import { pickRandomMaskPoint } from '../../subject/subject-mask.mjs';
import { mapNormToCanvas } from '../../subject/subject-frame-map.mjs';

const SIZE_TIERS = Object.freeze({
  micro: [6, 14],
  small: [12, 28],
  medium: [22, 44],
});

const JOINT_SPAWN = Object.freeze({
  leftHand: [15, 17, 19],
  rightHand: [16, 18, 20],
  leftFoot: [27, 29],
  rightFoot: [28, 30],
  head: [0, 1, 2],
  leftArm: [11, 13, 15],
  rightArm: [12, 14, 16],
});

/** Simulation is authored against a 30fps media clock. */
const MEDIA_FRAME_MS = 1000 / 30;

function seededRandom(seed, ...parts) {
  return seededRange(seed, 0, 1, ...parts);
}

function pickSize(seed, clipId, serial, scale = 1) {
  const roll = seededRandom(seed, clipId, serial, 'tier');
  const tier = roll < 0.55 ? 'micro' : roll < 0.88 ? 'small' : 'medium';
  const [min, max] = SIZE_TIERS[tier];
  return seededRange(seed, min, max, clipId, serial, 'size') * scale;
}

export class FragmentEngine {
  constructor() {
    this.fragments = [];
    this.lastSeed = 0;
    this.lastClipId = '';
    this.spawnCooldown = 0;
    this.spawnSerial = 0;
    this.lastMediaMs = null;
    this.simAccumulatorMs = 0;
  }

  reset(options = {}) {
    this.fragments = [];
    this.spawnCooldown = 0;
    this.lastMediaMs = null;
    this.simAccumulatorMs = 0;
    if (options.hard) {
      this.lastSeed = 0;
      this.lastClipId = '';
      this.spawnSerial = 0;
    }
  }

  update({
    frame,
    config,
    intensity,
    seed,
    clipId,
    drawMetrics,
    sourceCanvas,
    beatStrength = 0,
    scale = 1,
    persistence = 0.5,
    mediaTimeMs = null,
  }) {
    if (!config?.enabled || !frame || !sourceCanvas || !drawMetrics) return;

    if (clipId !== this.lastClipId || seed !== this.lastSeed) {
      this.fragments = [];
      this.spawnCooldown = 0;
      this.simAccumulatorMs = 0;
      this.lastMediaMs = null;
      this.lastClipId = clipId;
      this.lastSeed = seed;
    }

    const mediaMs =
      mediaTimeMs != null && Number.isFinite(mediaTimeMs)
        ? mediaTimeMs
        : (frame.timestamp ?? 0);

    if (this.lastMediaMs != null && mediaMs + 40 < this.lastMediaMs) {
      this.fragments = [];
      this.spawnCooldown = 0;
      this.simAccumulatorMs = 0;
    }

    if (this.lastMediaMs == null) {
      this.lastMediaMs = mediaMs;
      return;
    }
    const deltaMs = Math.max(0, mediaMs - this.lastMediaMs);
    this.lastMediaMs = mediaMs;
    if (deltaMs === 0) return;
    this.simAccumulatorMs += deltaMs;

    const maxCount = Math.max(3, Math.round(config.density * intensity * 22));
    const regions = frame.regions || {};
    const strongest = getStrongestMotionRegion(regions);
    const spawnRate =
      0.35 + intensity * config.density * 0.8 + beatStrength * 0.35;

    while (this.simAccumulatorMs >= MEDIA_FRAME_MS - 0.001) {
      this.simAccumulatorMs -= MEDIA_FRAME_MS;
      this.#stepFrame({
        frame,
        config,
        intensity,
        seed,
        clipId,
        drawMetrics,
        scale,
        beatStrength,
        strongest,
        persistence,
        maxCount,
        regions,
        spawnRate,
      });
    }
  }

  #stepFrame({
    frame,
    config,
    seed,
    clipId,
    drawMetrics,
    scale,
    beatStrength,
    strongest,
    persistence,
    maxCount,
    regions,
    spawnRate,
  }) {
    this.spawnCooldown -= spawnRate;

    while (this.spawnCooldown <= 0 && this.fragments.length < maxCount) {
      this.spawnCooldown += 1;
      this.spawnSerial += 1;
      const fragment = this.#spawnFragment({
        frame,
        config,
        seed,
        clipId,
        drawMetrics,
        scale,
        beatStrength,
        strongest,
        persistence,
        serial: this.spawnSerial,
      });
      if (fragment) this.fragments.push(fragment);
      else break;
    }

    this.fragments = this.fragments
      .map((fragment) => {
        const local = getMotionAt(regions, fragment.anchorX, fragment.anchorY);
        const motionPush = {
          x:
            (local.velocity?.x || 0) *
              drawMetrics.drawWidth *
              config.motionInfluence *
              0.35 +
            fragment.vx * 0.08,
          y:
            (local.velocity?.y || 0) *
              drawMetrics.drawHeight *
              config.motionInfluence *
              0.35 +
            fragment.vy * 0.08,
        };
        const lifeDecay = 0.985 - (1 - persistence) * 0.015;
        return {
          ...fragment,
          x: fragment.x + motionPush.x,
          y: fragment.y + motionPush.y,
          vx: fragment.vx * (0.88 + persistence * 0.08),
          vy: fragment.vy * (0.88 + persistence * 0.08),
          life: fragment.life * lifeDecay,
          age: fragment.age + 1,
        };
      })
      .filter(
        (fragment) => fragment.life > 0.08 && fragment.age < fragment.maxAge,
      );

    while (this.fragments.length > maxCount) {
      this.fragments.shift();
    }
  }

  #spawnFragment({
    frame,
    config,
    seed,
    clipId,
    drawMetrics,
    scale,
    beatStrength,
    strongest,
    persistence,
    serial,
  }) {
    const modeRoll = seededRandom(seed, clipId, serial, 'mode');
    let anchor = null;
    let kind = 'surface';

    if (modeRoll < 0.35 && strongest?.speed > 0.08) {
      kind = 'joint';
      anchor = {
        x: strongest.position.x,
        y: strongest.position.y,
      };
    } else if (modeRoll < 0.55 && frame.mask) {
      kind = 'surface';
      anchor = pickRandomMaskPoint(
        frame.mask,
        seed,
        clipId,
        serial,
        (s, ...parts) => seededRandom(s, ...parts),
      );
    } else if (modeRoll < 0.72 && frame.mask?.contour?.length) {
      kind = 'edge';
      const point =
        frame.mask.contour[
          seededInt(
            seed,
            0,
            frame.mask.contour.length - 1,
            clipId,
            serial,
            'edge',
          )
        ];
      anchor = point;
    } else if (beatStrength > 0.45 && modeRoll < 0.85) {
      kind = 'burst';
      anchor = frame.center;
    } else {
      const regionNames = Object.keys(JOINT_SPAWN);
      const regionName =
        regionNames[
          seededInt(seed, 0, regionNames.length - 1, clipId, serial, 'joint')
        ];
      const joints = JOINT_SPAWN[regionName];
      const jointIndex =
        joints[seededInt(seed, 0, joints.length - 1, clipId, serial, 'ji')];
      const landmark = frame.landmarks?.[jointIndex];
      if (landmark) anchor = { x: landmark.x, y: landmark.y };
    }

    if (!anchor) return null;

    const mapped = mapNormToCanvas(anchor.x, anchor.y, drawMetrics);
    const size = pickSize(seed, clipId, serial, scale);
    const spread = config.spread * (0.25 + (strongest?.speed || 0) * 0.9);
    const sourceX = mapped.x - size / 2;
    const sourceY = mapped.y - size / 2;

    return {
      kind,
      serial,
      anchorX: anchor.x,
      anchorY: anchor.y,
      x: sourceX,
      y: sourceY,
      sourceX,
      sourceY,
      size,
      vx:
        seededRange(seed, -1, 1, clipId, 'vx', serial) * spread * 28 +
        (frame.regions?.[strongest?.name]?.velocity?.x || 0) *
          drawMetrics.drawWidth *
          0.08,
      vy:
        seededRange(seed, -1, 1, clipId, 'vy', serial) * spread * 28 +
        (frame.regions?.[strongest?.name]?.velocity?.y || 0) *
          drawMetrics.drawHeight *
          0.08,
      life: 1,
      age: 0,
      maxAge: Math.round(
        12 + persistenceToFrames(persistence) + beatStrength * 8,
      ),
      rotation: seededRange(seed, -8, 8, clipId, serial, 'rot'),
    };
  }

  render(ctx, sourceCanvas, frame) {
    if (!this.fragments.length) return;
    ctx.save();
    this.fragments.forEach((fragment) => {
      const alpha = Math.min(1, fragment.life);
      if (alpha < 0.03) return;

      if (frame?.mask && !frame.simplified) {
        if (frame.mask.sampleMask(fragment.anchorX, fragment.anchorY) < 0.2)
          return;
      }

      ctx.save();
      ctx.globalAlpha = alpha * 0.94;
      ctx.translate(
        fragment.x + fragment.size / 2,
        fragment.y + fragment.size / 2,
      );
      ctx.rotate((fragment.rotation * Math.PI) / 180);
      ctx.drawImage(
        sourceCanvas,
        Math.max(0, fragment.sourceX),
        Math.max(0, fragment.sourceY),
        fragment.size,
        fragment.size,
        -fragment.size / 2,
        -fragment.size / 2,
        fragment.size,
        fragment.size,
      );
      ctx.strokeStyle = `rgba(240,240,236,${alpha * 0.22})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        -fragment.size / 2,
        -fragment.size / 2,
        fragment.size,
        fragment.size,
      );
      ctx.restore();
    });
    ctx.restore();
  }
}

function persistenceToFrames(value = 0.5) {
  return Math.round(8 + value * 18);
}
