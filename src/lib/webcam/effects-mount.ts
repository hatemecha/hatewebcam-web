import { mount } from 'svelte';
import EffectsControls from './EffectsControls.svelte';
import type { WebcamControlsAdapter } from './types';

export function mountEffectsControls(
  target: HTMLElement | null,
  adapter: WebcamControlsAdapter,
) {
  if (!target) throw new Error('Effects controls mount point is missing');
  return mount(EffectsControls, { target, props: { adapter } });
}
