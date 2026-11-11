import { mount } from 'svelte';
import DetectorChips from './DetectorChips.svelte';
import PreviewPlaceholder from './PreviewPlaceholder.svelte';

export function mountDetectorChips(target: HTMLElement | null) {
  if (!target) throw new Error('Detector chips mount point is missing');
  return mount(DetectorChips, { target });
}

export function mountPreviewPlaceholder(target: HTMLElement | null) {
  if (!target) throw new Error('Preview placeholder mount point is missing');
  return mount(PreviewPlaceholder, { target });
}
