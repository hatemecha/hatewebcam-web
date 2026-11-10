/**
 * Dependency-free presentation state for the camera source controls.
 * Node tests can load this module because it does not import Svelte.
 *
 * @typedef {'auto' | 'performance' | 'normal' | 'quality'} PerformanceMode
 * @typedef {'loading' | 'empty' | 'ready'} CameraDevicesStatus
 * @typedef {{ id: string, label: string }} CameraDeviceOption
 * @typedef {{
 *   running: boolean,
 *   deviceId: string,
 *   devices: CameraDeviceOption[],
 *   devicesStatus: CameraDevicesStatus,
 *   selectDisabled: boolean,
 *   performanceMode: PerformanceMode,
 *   mirrored: boolean,
 * }} CameraSourceState
 * @typedef {{ deviceId?: string, label?: string }} CameraDeviceInput
 */

/** @type {CameraSourceState} */
const initialState = {
  running: false,
  deviceId: '',
  devices: [],
  devicesStatus: 'loading',
  selectDisabled: true,
  performanceMode: 'normal',
  mirrored: false,
};

/** @type {CameraSourceState} */
let state = cloneState(initialState);

/** @type {Set<(state: CameraSourceState) => void>} */
const listeners = new Set();

/** @param {CameraSourceState} value */
function cloneState(value) {
  return {
    ...value,
    devices: value.devices.map((device) => ({ ...device })),
  };
}

/** @returns {CameraSourceState} */
export function getCameraSourceState() {
  return cloneState(state);
}

/**
 * @param {Partial<CameraSourceState>} patch
 * @returns {void}
 */
export function updateCameraSourceState(patch) {
  state = {
    ...state,
    ...patch,
    devices: patch.devices
      ? patch.devices.map((device) => ({ ...device }))
      : state.devices.map((device) => ({ ...device })),
  };
  const snapshot = getCameraSourceState();
  for (const listener of listeners) listener(snapshot);
}

/**
 * @param {(state: CameraSourceState) => void} listener
 * @returns {() => void}
 */
export function subscribeCameraSourceState(listener) {
  listeners.add(listener);
  listener(getCameraSourceState());
  return () => listeners.delete(listener);
}

/**
 * Choose the device shown in the camera select.
 * An unknown preferred id falls through to the first real device.
 *
 * @param {CameraDeviceInput[] | null | undefined} devices
 * @param {string | null | undefined} preferredId
 * @param {string | null | undefined} currentId
 * @returns {Pick<CameraSourceState, 'devices' | 'devicesStatus' | 'selectDisabled' | 'deviceId'>}
 */
export function resolveCameraDeviceSelection(devices, preferredId, currentId) {
  const list = Array.isArray(devices) ? devices : [];
  if (list.length === 0) {
    return {
      devices: [],
      devicesStatus: 'empty',
      selectDisabled: true,
      deviceId: '',
    };
  }

  const options = list.map((device, index) => ({
    id: String(device?.deviceId || ''),
    label: device?.label || `Cámara ${index + 1}`,
  }));
  const wanted = preferredId || currentId || '';
  const match = options.find((device) => device.id === wanted);
  return {
    devices: options,
    devicesStatus: 'ready',
    selectDisabled: false,
    deviceId: match ? match.id : options[0].id,
  };
}

/** @returns {void} */
export function resetCameraSourceState() {
  state = cloneState(initialState);
  const snapshot = getCameraSourceState();
  for (const listener of listeners) listener(snapshot);
}
