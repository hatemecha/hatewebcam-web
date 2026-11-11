import { mount } from 'svelte';
import CaptureBar from './CaptureBar.svelte';
import CaptureStatusChrome from './CaptureStatusChrome.svelte';
import MobileHud from './MobileHud.svelte';
import type { MobileHudAdapter } from './types';

export function mountCaptureBar(target: HTMLElement | null) {
  if (!target) throw new Error('Capture bar mount point is missing');
  return mount(CaptureBar, { target });
}

export function mountCaptureChrome(target: HTMLElement | null) {
  if (!target) throw new Error('Capture status mount point is missing');
  return mount(CaptureStatusChrome, { target });
}

export function mountMobileHud(
  target: HTMLElement | null,
  adapter: MobileHudAdapter,
) {
  if (!target) throw new Error('Mobile HUD mount point is missing');
  return mount(MobileHud, { target, props: { adapter } });
}
