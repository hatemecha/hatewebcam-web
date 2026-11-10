/**
 * Small dependency-free bridge between the legacy controller and Svelte.
 * Keep this module free of Svelte imports so Node-based tests can load it.
 *
 * @typedef {'camera' | 'video'} SourceMode
 * @typedef {'es' | 'en'} Locale
 * @typedef {{ mode: SourceMode, exportEnabled: boolean, locale: Locale }} ShellState
 */

/** @type {ShellState} */
let state = {
  mode: 'camera',
  exportEnabled: false,
  locale: 'es',
};

/** @type {Set<(state: ShellState) => void>} */
const listeners = new Set();

/** @returns {ShellState} */
export function getShellState() {
  return state;
}

/**
 * @param {Partial<ShellState>} patch
 * @returns {void}
 */
export function updateShellState(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

/**
 * @param {(state: ShellState) => void} listener
 * @returns {() => void}
 */
export function subscribeShellState(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}
