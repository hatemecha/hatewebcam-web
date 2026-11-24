import { readable, type Readable } from 'svelte/store';
import {
  getCaptureChromeState,
  getCapturePreviewState,
  getExportModalState,
  subscribeCaptureChromeState,
  subscribeCapturePreviewState,
  subscribeExportModalState,
  type CaptureChromeState,
  type CapturePreviewState,
  type ExportModalState,
} from './session-state';

export const captureChrome: Readable<CaptureChromeState> = readable(
  getCaptureChromeState(),
  (set) => subscribeCaptureChromeState(set),
);

export const capturePreview: Readable<CapturePreviewState> = readable(
  getCapturePreviewState(),
  (set) => subscribeCapturePreviewState(set),
);

export const exportModal: Readable<ExportModalState> = readable(
  getExportModalState(),
  (set) => subscribeExportModalState(set),
);
