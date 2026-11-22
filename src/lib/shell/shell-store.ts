import { readable } from 'svelte/store';
import {
  getShellState,
  subscribeShellState,
  type ShellState,
} from './shell-bridge.ts';

export const shellState = readable<ShellState>(getShellState(), (set) =>
  subscribeShellState(set),
);
