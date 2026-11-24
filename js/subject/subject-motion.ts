const POSE_CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [24, 26],
  [25, 27],
  [26, 28],
];

const WRIST_L = 15;
const WRIST_R = 16;
const HEAD = 0;

export interface SubjectPoint {
  x: number;
  y: number;
}

export interface PoseLandmark extends SubjectPoint {
  z?: number;
  visibility?: number;
  presence?: number;
}

interface MotionAnalyzerOptions {
  smoothing?: number;
  motionSensitivity?: number;
  confidenceThreshold?: number;
  holdMs?: number;
}

export interface SubjectMotionFrame {
  landmarks: PoseLandmark[];
  segmentationMask: null;
  boundingBox: ReturnType<typeof computeBoundingBox>;
  center: SubjectPoint;
  motionEnergy: number;
  movementDirection: number;
  bodyExpansion: number;
  jointVelocities: SubjectPoint[];
  headVelocity: SubjectPoint;
  wristVelocities: { left: SubjectPoint; right: SubjectPoint };
  timestamp: number;
  confidence: number;
  held: boolean;
  bodyExpansionBase: number;
}

function clampRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dist(a: SubjectPoint, b: SubjectPoint) {
  const dx = (a?.x || 0) - (b?.x || 0);
  const dy = (a?.y || 0) - (b?.y || 0);
  return Math.hypot(dx, dy);
}

function avgPoint(points: readonly SubjectPoint[]): SubjectPoint {
  if (!points.length) return { x: 0.5, y: 0.5 };
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export function computeBoundingBox(
  landmarks: readonly PoseLandmark[] | null | undefined,
  visibilityThreshold = 0.35,
) {
  const visible = (landmarks || []).filter(
    (point) => (point.visibility ?? point.presence ?? 1) >= visibilityThreshold,
  );
  if (!visible.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  visible.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function smoothLandmarks(
  current: PoseLandmark[] | null | undefined,
  previous: PoseLandmark[] | null | undefined,
  alpha = 0.35,
): PoseLandmark[] {
  if (!current?.length) return previous || [];
  if (!previous?.length) return current.map((point) => ({ ...point }));
  return current.map((point, index) => {
    const prev = previous[index] || point;
    const vis = point.visibility ?? point.presence ?? 1;
    const prevVis = prev.visibility ?? prev.presence ?? 1;
    const blend = vis < 0.35 ? 0.12 : alpha;
    return {
      ...point,
      x: prev.x + (point.x - prev.x) * blend,
      y: prev.y + (point.y - prev.y) * blend,
      z: (prev.z || 0) + ((point.z || 0) - (prev.z || 0)) * blend,
      visibility: Math.max(vis, prevVis * 0.92),
    };
  });
}

export class SubjectMotionAnalyzer {
  private readonly smoothing: number;
  private readonly motionSensitivity: number;
  private readonly confidenceThreshold: number;
  private readonly holdMs: number;
  private previousLandmarks: PoseLandmark[] | null = null;
  private previousCenter: SubjectPoint | null = null;
  private previousTimestamp = 0;
  private lastGood: SubjectMotionFrame | null = null;
  private lastGoodTimestamp = 0;

  constructor(options: MotionAnalyzerOptions = {}) {
    this.smoothing = options.smoothing ?? 0.35;
    this.motionSensitivity = options.motionSensitivity ?? 1;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.35;
    this.holdMs = options.holdMs ?? 280;
  }

  reset() {
    this.previousLandmarks = null;
    this.previousCenter = null;
    this.previousTimestamp = 0;
    this.lastGood = null;
    this.lastGoodTimestamp = 0;
  }

  analyze(
    rawLandmarks: PoseLandmark[] | null | undefined,
    timestampMs: number,
    confidence = 1,
  ): SubjectMotionFrame | null {
    const now = Number(timestampMs) || 0;
    const dt = Math.max(0.001, (now - this.previousTimestamp) / 1000);
    const visibleCount = (rawLandmarks || []).filter(
      (point) =>
        (point.visibility ?? point.presence ?? 1) >= this.confidenceThreshold,
    ).length;
    const hasSubject =
      visibleCount >= 6 && confidence >= this.confidenceThreshold;

    if (!hasSubject) {
      const held =
        this.lastGood && now - this.lastGoodTimestamp <= this.holdMs
          ? {
              ...this.lastGood,
              confidence: this.lastGood.confidence * 0.88,
              held: true,
            }
          : null;
      return held;
    }

    const landmarks = smoothLandmarks(
      rawLandmarks,
      this.previousLandmarks,
      this.smoothing,
    );
    const bbox = computeBoundingBox(landmarks, this.confidenceThreshold);
    const torso = [11, 12, 23, 24]
      .map((index) => landmarks[index])
      .filter(Boolean);
    const center = avgPoint(torso.length ? torso : landmarks.slice(0, 17));
    const head = landmarks[HEAD] || center;
    const wristL = landmarks[WRIST_L] || center;
    const wristR = landmarks[WRIST_R] || center;

    const centerVelocity = this.previousCenter
      ? {
          x: (center.x - this.previousCenter.x) / dt,
          y: (center.y - this.previousCenter.y) / dt,
        }
      : { x: 0, y: 0 };

    const headVelocity = this.previousLandmarks?.[HEAD]
      ? {
          x: (head.x - this.previousLandmarks[HEAD].x) / dt,
          y: (head.y - this.previousLandmarks[HEAD].y) / dt,
        }
      : { x: 0, y: 0 };

    const jointVelocities = landmarks.map((point, index) => {
      const prev = this.previousLandmarks?.[index];
      if (!prev) return { x: 0, y: 0 };
      return {
        x: (point.x - prev.x) / dt,
        y: (point.y - prev.y) / dt,
      };
    });

    let motionSum = 0;
    POSE_CONNECTIONS.forEach(([a, b]) => {
      const pA = landmarks[a];
      const pB = landmarks[b];
      const prevA = this.previousLandmarks?.[a];
      const prevB = this.previousLandmarks?.[b];
      if (!pA || !pB || !prevA || !prevB) return;
      motionSum += dist(pA, prevA) + dist(pB, prevB);
    });
    const motionEnergy = clampRange(
      motionSum * 18 * this.motionSensitivity,
      0,
      1,
    );

    const movementDirection =
      Math.hypot(centerVelocity.x, centerVelocity.y) > 0.0001
        ? Math.atan2(centerVelocity.y, centerVelocity.x)
        : 0;

    const bodyExpansion = bbox
      ? clampRange(
          (bbox.width * bbox.height) /
            Math.max(
              0.001,
              this.lastGood?.bodyExpansionBase || bbox.width * bbox.height,
            ),
          0.5,
          1.8,
        )
      : 1;

    const frame: SubjectMotionFrame = {
      landmarks,
      segmentationMask: null,
      boundingBox: bbox,
      center,
      motionEnergy,
      movementDirection,
      bodyExpansion,
      jointVelocities,
      headVelocity,
      wristVelocities: {
        left: {
          x:
            (wristL.x - (this.previousLandmarks?.[WRIST_L]?.x || wristL.x)) /
            dt,
          y:
            (wristL.y - (this.previousLandmarks?.[WRIST_L]?.y || wristL.y)) /
            dt,
        },
        right: {
          x:
            (wristR.x - (this.previousLandmarks?.[WRIST_R]?.x || wristR.x)) /
            dt,
          y:
            (wristR.y - (this.previousLandmarks?.[WRIST_R]?.y || wristR.y)) /
            dt,
        },
      },
      timestamp: now,
      confidence: clampRange(confidence, 0, 1),
      held: false,
      bodyExpansionBase:
        this.lastGood?.bodyExpansionBase ||
        (bbox && bbox.width * bbox.height) ||
        1,
    };

    this.previousLandmarks = landmarks;
    this.previousCenter = center;
    this.previousTimestamp = now;
    this.lastGood = frame;
    this.lastGoodTimestamp = now;
    return frame;
  }
}

export { POSE_CONNECTIONS };
