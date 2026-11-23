export type BlobDetectionMode = 'manual' | 'lights' | 'shadows';

export interface DetectedBlob {
  x: number;
  y: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  area: number;
}

export interface BlobWorkerRequest {
  seq: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  hsvMin: number[];
  hsvMax: number[];
  detectionMode: BlobDetectionMode;
  erodeIterations: number;
  dilateIterations: number;
  minAreaScaled: number;
  maxAreaScaled: number;
  maxObjects: number;
}

export interface BlobWorkerResponse {
  seq: number;
  blobs: DetectedBlob[];
}
