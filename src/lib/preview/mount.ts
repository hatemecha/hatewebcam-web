import { mount } from 'svelte';
import DetectorChips from './DetectorChips.svelte';
import PreviewPlaceholder from './PreviewPlaceholder.svelte';
import type { PreviewPlaceholderActions } from './placeholder-state';

export function mountDetectorChips(target: HTMLElement | null) {
  if (!target) throw new Error('Detector chips mount point is missing');
  return mount(DetectorChips, { target });
}

export function mountPreviewPlaceholder(
  target: HTMLElement | null,
  actions: PreviewPlaceholderActions,
) {
  if (!target) throw new Error('Preview placeholder mount point is missing');
  return mount(PreviewPlaceholder, { target, props: { actions } });
}
