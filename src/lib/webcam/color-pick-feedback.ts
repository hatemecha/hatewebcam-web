import { writable } from 'svelte/store';
import type { StatusType } from '../../../js/app/feedback.ts';

export type ColorPickTarget = 'quick' | 'advanced';
export interface ColorPickFeedback {
  message: string;
  type: StatusType;
}

export const colorPickFeedback = writable<
  Record<ColorPickTarget, ColorPickFeedback | null>
>({ quick: null, advanced: null });

export function setColorPickFeedback(
  target: ColorPickTarget,
  feedback: ColorPickFeedback | null,
) {
  colorPickFeedback.update((state) => ({ ...state, [target]: feedback }));
}
