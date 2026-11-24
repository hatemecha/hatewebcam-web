export type PerformanceMode = 'auto' | 'performance' | 'normal' | 'quality';

type CameraDevicesStatus = 'loading' | 'empty' | 'ready';

interface CameraDeviceOption {
  id: string;
  label: string;
}

export interface CameraSourceState {
  running: boolean;
  deviceId: string;
  devices: CameraDeviceOption[];
  devicesStatus: CameraDevicesStatus;
  selectDisabled: boolean;
  performanceMode: PerformanceMode;
  mirrored: boolean;
}

type CameraDeviceInput = Partial<Pick<MediaDeviceInfo, 'deviceId' | 'label'>>;
type CameraDeviceSelection = Pick<
  CameraSourceState,
  'devices' | 'devicesStatus' | 'selectDisabled' | 'deviceId'
>;

const initialState: CameraSourceState = {
  running: false,
  deviceId: '',
  devices: [],
  devicesStatus: 'loading',
  selectDisabled: true,
  performanceMode: 'normal',
  mirrored: false,
};

let state = cloneState(initialState);

const listeners = new Set<(state: CameraSourceState) => void>();

function cloneState(value: CameraSourceState): CameraSourceState {
  return {
    ...value,
    devices: value.devices.map((device) => ({ ...device })),
  };
}

export function getCameraSourceState() {
  return cloneState(state);
}

export function updateCameraSourceState(patch: Partial<CameraSourceState>) {
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

export function subscribeCameraSourceState(
  listener: (state: CameraSourceState) => void,
): () => void {
  listeners.add(listener);
  listener(getCameraSourceState());
  return () => listeners.delete(listener);
}

/**
 * Choose the device shown in the camera select.
 * An unknown preferred id falls through to the first real device.
 */
export function resolveCameraDeviceSelection(
  devices?: CameraDeviceInput[] | null,
  preferredId?: string | null,
  currentId?: string | null,
): CameraDeviceSelection {
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

export function resetCameraSourceState() {
  state = cloneState(initialState);
  const snapshot = getCameraSourceState();
  for (const listener of listeners) listener(snapshot);
}
