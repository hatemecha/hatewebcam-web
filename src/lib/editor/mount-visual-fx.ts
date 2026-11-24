import { mount, unmount } from 'svelte';
import type { VisualFxSession } from '../../../js/app/video-editor/visual-fx-session.ts';
import VisualFxInspector from './VisualFxInspector.svelte';

export function mountVisualFxInspector(
  target: HTMLElement,
  session: VisualFxSession,
) {
  const inspector = mount(VisualFxInspector, { target, props: { session } });
  return () => void unmount(inspector);
}
