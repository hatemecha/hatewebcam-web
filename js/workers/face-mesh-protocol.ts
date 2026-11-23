export interface FaceLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface FaceMeshSettings {
  maxNumFaces?: number;
  refineLandmarks?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

export interface FaceMeshOptions {
  locateFile(file: string): string;
}

export interface FaceMeshResults {
  multiFaceLandmarks: FaceLandmark[][];
}

export interface FaceMesh<Source, Results = FaceMeshResults> {
  setOptions(settings: FaceMeshSettings): void;
  onResults(callback: (results: Results) => void): void;
  initialize(): Promise<void>;
  send(input: { image: Source }): Promise<void>;
  close(): Promise<void> | void;
}

export type FaceMeshRequest =
  | { type: 'init'; baseUrl: string }
  | { type: 'analyze'; bitmap: ImageBitmap; settings: FaceMeshSettings };

export type FaceMeshWorkerRequest = FaceMeshRequest & { id: number };

export type FaceMeshWorkerResponse = { id: number } & (
  | { results: FaceMeshResults }
  | { error: string }
);
