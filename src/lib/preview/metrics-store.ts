import { readable } from 'svelte/store';
import {
  getPreviewMetrics,
  subscribePreviewMetrics,
  type PreviewMetrics,
} from './metrics-state.ts';

export const previewMetrics = readable<PreviewMetrics>(
  getPreviewMetrics(),
  (set) => subscribePreviewMetrics(set),
);
