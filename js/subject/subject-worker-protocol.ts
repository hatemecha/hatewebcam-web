import type { SubjectAssets } from './mediapipe-paths.ts';
import type { SubjectMotionFrame } from './subject-motion.ts';

export interface AnalyzeSubjectRequest {
  type: 'analyze';
  id: number;
  timestampMs: number;
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

export type SubjectWorkerRequest =
  | { type: 'init'; assets: SubjectAssets; maskWidth: number }
  | AnalyzeSubjectRequest
  | { type: 'reset' }
  | { type: 'dispose' };

export type SubjectWorkerFrame = Omit<
  SubjectMotionFrame,
  'segmentationMask' | 'bodyExpansionBase'
>;
export type SegmentationSource = 'none' | 'pose' | 'segmenter';

export interface SubjectWorkerResult {
  id: number;
  timestampMs: number;
  frame: SubjectWorkerFrame | null;
  maskBuffer: ArrayBuffer | null;
  maskWidth: number;
  maskHeight: number;
  segmentationSource: SegmentationSource;
  confidence: number;
}

export type SubjectWorkerResponse =
  | { type: 'ready'; segmenter: boolean }
  | { type: 'reset' }
  | { type: 'disposed' }
  | ({ type: 'result' } & SubjectWorkerResult)
  | { type: 'error'; id?: number; message: string };
