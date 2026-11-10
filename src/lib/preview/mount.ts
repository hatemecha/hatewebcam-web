import { mount } from 'svelte';
import DetectorChips from './DetectorChips.svelte';

export function mountDetectorChips(target: HTMLElement | null) {
  if (!target) throw new Error('Detector chips mount point is missing');
  return mount(DetectorChips, { target });
}
