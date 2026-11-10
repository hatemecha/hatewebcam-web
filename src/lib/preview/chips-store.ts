import { readable } from 'svelte/store';
import {
  getDetectorChips,
  subscribeDetectorChips,
  type DetectorChips,
} from './preview-bridge.mjs';

export const detectorChips = readable<DetectorChips>(
  getDetectorChips(),
  (set) => subscribeDetectorChips(set),
);
