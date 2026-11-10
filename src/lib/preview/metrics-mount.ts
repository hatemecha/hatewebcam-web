import { mount } from 'svelte';
import PreviewMetrics from './PreviewMetrics.svelte';

export function mountPreviewMetrics(target: HTMLElement | null) {
  if (!target) throw new Error('Preview metrics mount point is missing');
  return mount(PreviewMetrics, { target });
}
