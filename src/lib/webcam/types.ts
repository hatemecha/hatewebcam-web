import type { PerformanceMode } from './camera-source-bridge.mjs';

export interface CameraSourceAdapter {
  toggleCamera(): void;
  selectCamera(deviceId: string): void;
  setPerformanceMode(mode: PerformanceMode): void;
  toggleMirror(): void;
}
