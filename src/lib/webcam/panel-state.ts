export type WebcamSourceMode = 'camera' | 'video';
export type ImagePresetName = 'natural' | 'vivid' | 'cinema' | 'bw';

export interface WebcamImageState {
  blackAndWhite: boolean;
  exposure: number;
  shadows: number;
  highlights: number;
  contrast: number;
  saturation: number;
  temperature: number;
  detail: number;
  sharpness: number;
  jpegQuality: number;
  videoFormat: string;
  qualityEnhancer: boolean;
  qualityEnhancerStrength: number;
  shutterSound: boolean;
  captureTimerSeconds: number;
}

export interface WebcamPanelState {
  sourceMode: WebcamSourceMode;
  contextual: boolean;
  adjustContext: string;
  adjustHelp: string;
  adjustClipStatus: string;
  adjustClipVisible: boolean;
  advancedOpen: boolean;
  activePreset: ImagePresetName | null;
  detectors: {
    blob: boolean;
    face: boolean;
    blink: boolean;
    faceBusy: boolean;
    blinkBusy: boolean;
  };
  showBlobExtras: boolean;
  showFaceExtras: boolean;
  showFaceBoxVisuals: boolean;
  blobColor: string;
  faceColor: string;
  faceShowBox: boolean;
  faceShowBlur: boolean;
  faceLabel: string;
  image: WebcamImageState;
  orientation: {
    flipH: boolean;
    flipV: boolean;
    rotation: number;
  };
  profiles: string[];
  selectedProfile: string;
  previewQualityLabel: string;
}

export const PALETTE_COLORS = [
  '#ff2222',
  '#ffb300',
  '#00c853',
  '#00b8d4',
  '#ffffff',
] as const;

const initialImage: WebcamImageState = {
  blackAndWhite: false,
  exposure: 0,
  shadows: 0,
  highlights: 0,
  contrast: 100,
  saturation: 100,
  temperature: 0,
  detail: 0,
  sharpness: 0,
  jpegQuality: 92,
  videoFormat: 'auto',
  qualityEnhancer: false,
  qualityEnhancerStrength: 35,
  shutterSound: true,
  captureTimerSeconds: 0,
};

const initialState: WebcamPanelState = {
  sourceMode: 'camera',
  contextual: false,
  adjustContext: 'look',
  adjustHelp: '',
  adjustClipStatus: '',
  adjustClipVisible: false,
  advancedOpen: false,
  activePreset: 'natural',
  detectors: {
    blob: false,
    face: false,
    blink: false,
    faceBusy: false,
    blinkBusy: false,
  },
  showBlobExtras: false,
  showFaceExtras: false,
  showFaceBoxVisuals: true,
  blobColor: '#ff2222',
  faceColor: '#ff2222',
  faceShowBox: true,
  faceShowBlur: false,
  faceLabel: 'CARA',
  image: { ...initialImage },
  orientation: { flipH: false, flipV: false, rotation: 0 },
  profiles: [],
  selectedProfile: '',
  previewQualityLabel: 'Balanceada',
};

let state: WebcamPanelState = cloneState(initialState);
const listeners = new Set<(value: WebcamPanelState) => void>();

function cloneState(value: WebcamPanelState): WebcamPanelState {
  return {
    ...value,
    detectors: { ...value.detectors },
    image: { ...value.image },
    orientation: { ...value.orientation },
    profiles: [...value.profiles],
  };
}

export function getWebcamPanelState(): WebcamPanelState {
  return cloneState(state);
}

export function replaceWebcamPanelState(next: WebcamPanelState): void {
  state = cloneState(next);
  const snapshot = getWebcamPanelState();
  for (const listener of listeners) listener(snapshot);
}

export function subscribeWebcamPanelState(
  listener: (value: WebcamPanelState) => void,
): () => void {
  listeners.add(listener);
  listener(getWebcamPanelState());
  return () => listeners.delete(listener);
}

export function resetWebcamPanelState(): void {
  replaceWebcamPanelState(initialState);
}

export interface DetectorExtraInput {
  sourceMode: WebcamSourceMode;
  blobOn: boolean;
  faceOn: boolean;
  selectedEffect: string | null;
  faceShowBox: boolean;
}

export function deriveDetectorExtras(input: DetectorExtraInput): {
  showBlobExtras: boolean;
  showFaceExtras: boolean;
  showFaceBoxVisuals: boolean;
} {
  const showBlobExtras =
    input.sourceMode === 'video'
      ? input.selectedEffect === 'blob'
      : input.blobOn;
  const showFaceExtras =
    input.sourceMode === 'video'
      ? input.selectedEffect === 'face'
      : input.faceOn;
  return {
    showBlobExtras,
    showFaceExtras,
    showFaceBoxVisuals: input.faceShowBox,
  };
}
