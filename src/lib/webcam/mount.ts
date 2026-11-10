import { mount } from 'svelte';
import CameraSourcePanel from './CameraSourcePanel.svelte';
import type { CameraSourceAdapter } from './types';

export function mountCameraSource(
  target: HTMLElement | null,
  adapter: CameraSourceAdapter,
) {
  if (!target) throw new Error('Camera source mount point is missing');
  return mount(CameraSourcePanel, { target, props: { adapter } });
}
