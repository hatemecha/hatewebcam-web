import { mount } from 'svelte';
import CaptureModal from './CaptureModal.svelte';
import ExportModal from './ExportModal.svelte';

export function mountCaptureModal(target: HTMLElement | null) {
  if (!target) throw new Error('Capture modal mount point is missing');
  return mount(CaptureModal, { target });
}

export function mountExportModal(target: HTMLElement | null) {
  if (!target) throw new Error('Export modal mount point is missing');
  return mount(ExportModal, { target });
}
