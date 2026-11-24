import { mount } from 'svelte';
import type { CaptureModalAdapter, ExportModalAdapter } from '../capture/types';
import CaptureModal from './CaptureModal.svelte';
import ExportModal from './ExportModal.svelte';

export function mountCaptureModal(
  target: HTMLElement | null,
  adapter: CaptureModalAdapter,
) {
  if (!target) throw new Error('Capture modal mount point is missing');
  return mount(CaptureModal, { target, props: { adapter } });
}

export function mountExportModal(
  target: HTMLElement | null,
  adapter: ExportModalAdapter,
) {
  if (!target) throw new Error('Export modal mount point is missing');
  return mount(ExportModal, { target, props: { adapter } });
}
