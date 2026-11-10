/**
 * Presentation state for the detector chips. Dependency-free so legacy
 * controller modules remain loadable by Node-based tests.
 *
 * @typedef {'off' | 'searching' | 'active' | 'detected' | 'error'} DetectorState
 * @typedef {{ text: string, state: DetectorState }} DetectorChip
 * @typedef {{ blob: DetectorChip, face: DetectorChip, blink: DetectorChip }} DetectorChips
 */

/** @type {DetectorChips} */
let chips = {
  blob: { text: 'Color', state: 'off' },
  face: { text: 'Caras', state: 'off' },
  blink: { text: 'Pestañeos', state: 'off' },
};

/** @type {Set<(chips: DetectorChips) => void>} */
const listeners = new Set();

/** @returns {DetectorChips} */
export function getDetectorChips() {
  return chips;
}

/**
 * @param {'blob' | 'face' | 'blink'} name
 * @param {DetectorChip} chip
 * @returns {boolean} true when the state changed
 */
export function updateDetectorChip(name, chip) {
  const current = chips[name];
  if (current.text === chip.text && current.state === chip.state) return false;
  chips = { ...chips, [name]: chip };
  for (const listener of listeners) listener(chips);
  return true;
}

/**
 * @param {(chips: DetectorChips) => void} listener
 * @returns {() => void}
 */
export function subscribeDetectorChips(listener) {
  listeners.add(listener);
  listener(chips);
  return () => listeners.delete(listener);
}
