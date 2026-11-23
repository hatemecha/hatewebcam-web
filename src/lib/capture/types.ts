import type { DetectorKind, FaceVisualKind } from '../webcam/types';

export interface CaptureBarAdapter {
  takePhoto(): void;
  toggleRecording(): void;
  setCaptureTimer(seconds: number): void;
}

export interface MobileHudAdapter extends CaptureBarAdapter {
  toggleEffects(): void;
  closeEffects(): void;
  toggleMirror(): void;
  toggleDetector(type: DetectorKind, checked: boolean): void;
  pickColor(): void;
  setBlobColor(color: string): void;
  setFaceColor(color: string): void;
  setFaceVisual(kind: FaceVisualKind, checked: boolean): void;
  setFaceLabel(value: string): void;
  commitFaceLabel(value: string): void;
  applyPreset(name: string): void;
}

export interface CaptureModalAdapter {
  download(): void;
  discard(): void;
  setEnhancer(enabled: boolean): void;
  setEnhancerStrength(strength: number): void;
}

export interface ExportModalAdapter {
  cancel(): void;
  close(): void;
}
