export interface CaptureChromeState {
  cameraRunning: boolean;
  recording: boolean;
  countdownActive: boolean;
  countdownRemaining: number;
  countdownTotal: number;
  previewOpen: boolean;
  mobileFxOpen: boolean;
  recordingTime: string;
  recordingFormat: string;
  flashToken: number;
  blobEnabled: boolean;
  faceEnabled: boolean;
  lockCaptureSettings: boolean;
  lockDetectors: boolean;
}

export interface CapturePreviewRow {
  key: string;
  value: string;
}

export interface CapturePreviewState {
  open: boolean;
  kind: 'none' | 'photo' | 'video';
  title: string;
  filename: string;
  downloadLabel: string;
  mediaUrl: string;
  rows: CapturePreviewRow[];
  enhancerEnabled: boolean;
  enhancerStrength: number;
}

export type ExportTitleState =
  | 'idle'
  | 'running'
  | 'success'
  | 'muted'
  | 'error';

export interface ExportModalState {
  open: boolean;
  titleState: ExportTitleState;
  summary: string;
  progress: number;
  debug: string;
  help: string;
  showCancel: boolean;
  showClose: boolean;
}

const initialChrome: CaptureChromeState = {
  cameraRunning: false,
  recording: false,
  countdownActive: false,
  countdownRemaining: 0,
  countdownTotal: 0,
  previewOpen: false,
  mobileFxOpen: false,
  recordingTime: '00:00',
  recordingFormat: 'WebM',
  flashToken: 0,
  blobEnabled: false,
  faceEnabled: false,
  lockCaptureSettings: false,
  lockDetectors: false,
};

const initialPreview: CapturePreviewState = {
  open: false,
  kind: 'none',
  title: 'Captura lista',
  filename: '-',
  downloadLabel: 'Descargar',
  mediaUrl: '',
  rows: [],
  enhancerEnabled: false,
  enhancerStrength: 35,
};

const initialExport: ExportModalState = {
  open: false,
  titleState: 'idle',
  summary: 'Preparando exportación…',
  progress: 0,
  debug: 'stage: idle',
  help: 'No cierres esta pestaña mientras se procesa el archivo.',
  showCancel: true,
  showClose: false,
};

let chromeState: CaptureChromeState = { ...initialChrome };
let previewState: CapturePreviewState = {
  ...initialPreview,
  rows: [],
};
let exportState: ExportModalState = { ...initialExport };

const chromeListeners = new Set<(value: CaptureChromeState) => void>();
const previewListeners = new Set<(value: CapturePreviewState) => void>();
const exportListeners = new Set<(value: ExportModalState) => void>();

function cloneChrome(value: CaptureChromeState): CaptureChromeState {
  return { ...value };
}

function clonePreview(value: CapturePreviewState): CapturePreviewState {
  return { ...value, rows: value.rows.map((row) => ({ ...row })) };
}

function cloneExport(value: ExportModalState): ExportModalState {
  return { ...value };
}

export function getCaptureChromeState(): CaptureChromeState {
  return cloneChrome(chromeState);
}

export function getCapturePreviewState(): CapturePreviewState {
  return clonePreview(previewState);
}

export function getExportModalState(): ExportModalState {
  return cloneExport(exportState);
}

export function replaceCaptureChromeState(next: CaptureChromeState): void {
  chromeState = cloneChrome(next);
  const snapshot = getCaptureChromeState();
  for (const listener of chromeListeners) listener(snapshot);
}

export function replaceCapturePreviewState(next: CapturePreviewState): void {
  previewState = clonePreview(next);
  const snapshot = getCapturePreviewState();
  for (const listener of previewListeners) listener(snapshot);
}

export function replaceExportModalState(next: ExportModalState): void {
  exportState = cloneExport(next);
  const snapshot = getExportModalState();
  for (const listener of exportListeners) listener(snapshot);
}

export function patchCaptureChromeState(
  patch: Partial<CaptureChromeState>,
): void {
  replaceCaptureChromeState({ ...chromeState, ...patch });
}

export function patchCapturePreviewState(
  patch: Partial<CapturePreviewState>,
): void {
  replaceCapturePreviewState({
    ...previewState,
    ...patch,
    rows: patch.rows
      ? patch.rows.map((row) => ({ ...row }))
      : previewState.rows,
  });
}

export function patchExportModalState(patch: Partial<ExportModalState>): void {
  replaceExportModalState({ ...exportState, ...patch });
}

export function subscribeCaptureChromeState(
  listener: (value: CaptureChromeState) => void,
): () => void {
  chromeListeners.add(listener);
  listener(getCaptureChromeState());
  return () => chromeListeners.delete(listener);
}

export function subscribeCapturePreviewState(
  listener: (value: CapturePreviewState) => void,
): () => void {
  previewListeners.add(listener);
  listener(getCapturePreviewState());
  return () => previewListeners.delete(listener);
}

export function subscribeExportModalState(
  listener: (value: ExportModalState) => void,
): () => void {
  exportListeners.add(listener);
  listener(getExportModalState());
  return () => exportListeners.delete(listener);
}

export function resetCaptureSessionState(): void {
  replaceCaptureChromeState(initialChrome);
  replaceCapturePreviewState(initialPreview);
  replaceExportModalState(initialExport);
}
