import { translateCurrent } from '../../src/lib/i18n/translate.ts';

export function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createSection(title: string, html: string) {
  const element = document.createElement('div');
  element.className = 'panel-section fade-in';
  element.innerHTML = `<div class="section-title accent">${escapeHtml(translateCurrent(title))}</div><div class="effect-config">${html}</div>`;
  return element;
}

export function slider(
  id: string,
  valueId: string,
  label: string,
  value: unknown,
  min: number,
  max: number,
  step = 1,
) {
  const safeMin = toFiniteNumber(min, 0);
  const safeValue = toFiniteNumber(value, safeMin);
  const safeMax = toFiniteNumber(max, safeMin);
  const safeStep = toFiniteNumber(step, 1);
  const text = Number.isInteger(safeValue)
    ? String(safeValue)
    : safeValue.toFixed(2);
  return `
      <div class="slider-group">
        <div class="slider-label">
          <span>${escapeHtml(translateCurrent(label))}</span>
          <span class="value" id="${escapeHtml(valueId)}">${text}</span>
        </div>
        <input type="range" id="${escapeHtml(id)}" min="${safeMin}" max="${safeMax}" step="${safeStep}" value="${safeValue}">
      </div>`;
}

export function bindSlider(
  parent: HTMLElement,
  sliderId: string,
  valueId: string,
  callback: (value: number) => void,
) {
  const input = parent.querySelector<HTMLInputElement>(`#${sliderId}`);
  const label = parent.querySelector(`#${valueId}`);
  if (!input || !label) return;
  input.addEventListener('input', () => {
    const value = input.valueAsNumber;
    label.textContent = Number.isInteger(value)
      ? String(value)
      : value.toFixed(2);
    callback(value);
  });
}

export function isExportDebugVisible() {
  try {
    if (localStorage.getItem('hatewebcam-export-debug') === '1') return true;
  } catch {
    // Storage can be disabled while the URL preference remains available.
  }
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('exportdebug') === '1'
  );
}
