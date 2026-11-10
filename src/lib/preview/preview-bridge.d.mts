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

export interface DetectorChips {
  blob: DetectorChip;
  face: DetectorChip;
  blink: DetectorChip;
}

export function getDetectorChips(): DetectorChips;
export function updateDetectorChip(
  name: 'blob' | 'face' | 'blink',
  chip: DetectorChip,
): boolean;
export function subscribeDetectorChips(
  listener: (chips: DetectorChips) => void,
): () => void;
