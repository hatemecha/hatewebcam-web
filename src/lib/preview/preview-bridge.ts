import type { DetectorKind } from '../webcam/types.ts';

export type DetectorState =
  | 'off'
  | 'searching'
  | 'active'
  | 'detected'
  | 'error';

export interface DetectorChip {
  text: string;
  state: DetectorState;
}

export type DetectorChips = Record<DetectorKind, DetectorChip>;

let chips: DetectorChips = {
  blob: { text: 'Color', state: 'off' },
  face: { text: 'Caras', state: 'off' },
  blink: { text: 'Pestañeos', state: 'off' },
};

const listeners = new Set<(chips: DetectorChips) => void>();

export function getDetectorChips() {
  return chips;
}

export function updateDetectorChip(name: DetectorKind, chip: DetectorChip) {
  const current = chips[name];
  if (current.text === chip.text && current.state === chip.state) return false;
  chips = { ...chips, [name]: chip };
  for (const listener of listeners) listener(chips);
  return true;
}

export function subscribeDetectorChips(
  listener: (chips: DetectorChips) => void,
): () => void {
  listeners.add(listener);
  listener(chips);
  return () => listeners.delete(listener);
}
