import { readable } from 'svelte/store';
import {
  getWebcamPanelState,
  subscribeWebcamPanelState,
  type WebcamPanelState,
} from './panel-state.ts';

export const webcamPanel = readable<WebcamPanelState>(
  getWebcamPanelState(),
  (set) => subscribeWebcamPanelState(set),
);
