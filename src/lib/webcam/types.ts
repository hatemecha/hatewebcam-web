import type { PerformanceMode } from './camera-source-bridge.mjs';

export interface CameraSourceAdapter {
  toggleCamera(): void;
  selectCamera(deviceId: string): void;
  setPerformanceMode(mode: PerformanceMode): void;
  toggleMirror(): void;
}

export type DetectorKind = 'blob' | 'face' | 'blink';
export type FaceVisualKind = 'box' | 'blur';

export interface WebcamControlsAdapter {
  toggleDetector(type: DetectorKind, checked: boolean): void;
  setBlobColor(color: string): void;
  setFaceColor(color: string): void;
  setFaceLabel(value: string): void;
  commitFaceLabel(value: string): void;
  setFaceVisual(kind: FaceVisualKind, checked: boolean): void;
  pickColor(): void;
  toggleAdvanced(): void;
  setImageNumber(key: string, value: number): void;
  setBlackAndWhite(checked: boolean): void;
  setVideoFormat(format: string): void;
  setQualityEnhancer(checked: boolean): void;
  setShutterSound(checked: boolean): void;
  setFlipH(checked: boolean): void;
  setFlipV(checked: boolean): void;
  setRotation(value: number): void;
  applyPreset(name: string): void;
  resetImage(): void;
  saveProfile(): void;
  deleteProfile(): void;
  deleteAllProfiles(): void;
  selectProfile(name: string): void;
  resetWebcam(): void;
  openAdjustContext(context: string): void;
}
