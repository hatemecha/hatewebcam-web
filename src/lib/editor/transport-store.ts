import { readonly, writable } from 'svelte/store';
import type { VideoTransport } from '../../../js/app/video-editor/transport.ts';

interface TransportReadout {
  timeLabel: string;
  paused: boolean;
}

interface TransportPosition {
  currentTime: number;
  duration: number;
}

type TransportActions = Pick<
  VideoTransport,
  'seek' | 'boundary' | 'jump' | 'toggle'
>;

const readout = writable<TransportReadout>({
  timeLabel: '00:00 / 00:00',
  paused: true,
});
const position = writable<TransportPosition>({ currentTime: 0, duration: 0 });
const actions = writable<TransportActions | null>(null);

export const transportReadout = readonly(readout);
export const transportPosition = readonly(position);
export const transportActions = readonly(actions);

export const publishTransportReadout = readout.set;
export const publishTransportPosition = position.set;
export const setTransportActions = actions.set;
