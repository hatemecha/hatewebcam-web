import { translateCurrent } from '../../src/lib/i18n/translate.ts';

export type StatusType = 'info' | 'success' | 'warning' | 'error';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function showStatus(
  element: HTMLElement | null | undefined,
  message: string,
  type: StatusType,
) {
  if (!element) return;
  element.textContent = translateCurrent(message);
  element.classList.remove('hidden', 'success', 'warning', 'info', 'error');
  element.classList.add('status-msg', type);
}

export function hideStatus(element: HTMLElement | null | undefined) {
  if (!element) return;
  element.textContent = '';
  element.classList.add('hidden');
  element.classList.remove('success', 'warning', 'info', 'error');
}
