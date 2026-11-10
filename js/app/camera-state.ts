export type CameraUiState =
  | 'off'
  | 'requesting'
  | 'starting'
  | 'running'
  | 'denied'
  | 'missing'
  | 'busy'
  | 'unsupported'
  | 'unknown';

export interface CameraStateCopy {
  title: string;
  message: string;
  action?: string;
  hint?: string;
  icon: string;
}

export interface CameraStatePresentation extends CameraStateCopy {
  state: CameraUiState;
  error: unknown;
}

const CAMERA_STATES: Record<CameraUiState, CameraStateCopy> = {
  off: {
    title: 'Cámara apagada',
    message: 'Encendé la cámara para empezar.',
    action: 'Encender cámara',
    icon: 'fa-video-slash',
  },
  requesting: {
    title: 'Permiso de cámara',
    message: 'Aceptá el permiso del sitio para continuar.',
    icon: 'fa-shield-halved',
  },
  starting: {
    title: 'Iniciando cámara',
    message: 'Estamos preparando la imagen.',
    icon: 'fa-spinner fa-spin',
  },
  running: {
    title: 'Cámara funcionando',
    message: 'La cámara está lista.',
    icon: 'fa-video',
  },
  denied: {
    title: 'Permiso de cámara denegado',
    message: 'Habilitá la cámara para este sitio y volvé a intentarlo.',
    hint: 'Revisá el ícono de permisos junto a la dirección del sitio.',
    action: 'Reintentar',
    icon: 'fa-shield-halved',
  },
  missing: {
    title: 'No se encontró una cámara',
    message: 'Conectá una cámara o revisá que esté habilitada.',
    action: 'Reintentar',
    icon: 'fa-video-slash',
  },
  busy: {
    title: 'La cámara está ocupada',
    message: 'Cerrá la aplicación que la está usando y reintentá.',
    action: 'Reintentar',
    icon: 'fa-triangle-exclamation',
  },
  unsupported: {
    title: 'Configuración no soportada',
    message: 'Probá otra cámara o el modo Balanceado.',
    action: 'Reintentar',
    icon: 'fa-triangle-exclamation',
  },
  unknown: {
    title: 'No se pudo iniciar la cámara',
    message: 'Revisá los permisos y volvé a intentarlo.',
    action: 'Reintentar',
    icon: 'fa-video-slash',
  },
};

export function getCameraStatePresentation(
  state: string,
  error: unknown = null,
): CameraStatePresentation {
  const normalized = Object.prototype.hasOwnProperty.call(CAMERA_STATES, state)
    ? (state as CameraUiState)
    : 'unknown';
  return { ...CAMERA_STATES[normalized], state: normalized, error };
}

export function classifyCameraError(error: unknown): CameraUiState {
  const name = (error as { name?: string } | null)?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return 'missing';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'busy';
  if (
    name === 'OverconstrainedError' ||
    name === 'ConstraintNotSatisfiedError' ||
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  )
    return 'unsupported';
  return 'unknown';
}
