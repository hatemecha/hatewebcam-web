import { readonly, writable } from 'svelte/store';
import type { EditAssistController } from '../../../js/app/edit-assist-controller.ts';
import type { MessageKey } from '../i18n/catalog.ts';

export interface EditAssistView {
  loaded: boolean;
  analyzing: boolean;
  canAnalyze: boolean;
  canAdjust: boolean;
  canGenerate: boolean;
  canClear: boolean;
  detectedBpm: number;
  bpm: number;
  offsetMs: number;
  markerStep: number;
  confidence: number;
  hasResult: boolean;
  status: {
    message: MessageKey;
    type: 'success' | 'warning' | 'error';
    count?: number;
  } | null;
}

type EditAssistActions = Pick<
  EditAssistController,
  | 'analyze'
  | 'setBpm'
  | 'setOffset'
  | 'setMarkerStep'
  | 'scaleBpm'
  | 'shiftOffset'
  | 'applyMarkers'
  | 'clearMarkers'
>;

const panel = writable<{
  view: EditAssistView;
  actions: EditAssistActions | null;
}>({
  view: {
    loaded: false,
    analyzing: false,
    canAnalyze: false,
    canAdjust: false,
    canGenerate: false,
    canClear: false,
    detectedBpm: 0,
    bpm: 0,
    offsetMs: 0,
    markerStep: 4,
    confidence: 0,
    hasResult: false,
    status: null,
  },
  actions: null,
});

export const editAssistPanel = readonly(panel);
export function updateEditAssistPanel(
  view: EditAssistView,
  actions: EditAssistActions,
) {
  panel.set({ view, actions });
}
