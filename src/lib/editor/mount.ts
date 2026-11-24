import { mount, unmount } from 'svelte';
import VideoEditor from './VideoEditor.svelte';
import type { ProjectActions } from './editor-state.ts';

export interface VideoEditorHandle {
  destroy(): void;
}

/** Mount the Svelte editor shell into the slot declared by index.html. */
export function mountVideoEditor(
  target: HTMLElement | null,
  projects: ProjectActions,
): VideoEditorHandle | null {
  if (!target) return null;
  const instance = mount(VideoEditor, { target, props: { projects } });
  return {
    destroy() {
      void unmount(instance);
    },
  };
}
