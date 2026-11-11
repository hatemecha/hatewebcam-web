import { mount, unmount } from 'svelte';
import VideoEditor from './VideoEditor.svelte';

export interface VideoEditorHandle {
  destroy(): void;
}

/** Mount the Svelte editor shell into the slot declared by index.html. */
export function mountVideoEditor(
  target: HTMLElement | null,
): VideoEditorHandle | null {
  if (!target) return null;
  const instance = mount(VideoEditor, { target });
  return {
    destroy() {
      void unmount(instance);
    },
  };
}
