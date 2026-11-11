import { mount } from 'svelte';
import AppHeader from './AppHeader.svelte';
import SkipLink from './SkipLink.svelte';
import { updateShellState, type ShellState } from './shell-bridge.mjs';
import type { ShellAdapter } from './types';

export function mountSkipLink(target: HTMLElement | null) {
  if (!target) throw new Error('Skip link mount point is missing');
  return mount(SkipLink, { target });
}

export function mountAppHeader(
  target: HTMLElement | null,
  adapter: ShellAdapter,
  initial: ShellState,
) {
  if (!target) throw new Error('App header mount point is missing');
  updateShellState(initial);
  return mount(AppHeader, { target, props: { adapter } });
}
