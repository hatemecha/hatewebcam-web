import { readable } from 'svelte/store';
import {
  getCameraSourceState,
  subscribeCameraSourceState,
  type CameraSourceState,
} from './camera-source-bridge.ts';

export const cameraSourceState = readable<CameraSourceState>(
  getCameraSourceState(),
  (set) => subscribeCameraSourceState(set),
);
