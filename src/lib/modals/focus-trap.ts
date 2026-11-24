const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(modal: HTMLElement): HTMLElement[] {
  return Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => {
      if (element.getAttribute('aria-hidden') === 'true') return false;
      if (element.closest('.hidden')) return false;
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 || rect.height > 0 || element === document.activeElement
      );
    },
  );
}

export function trapModalFocus(
  modal: HTMLElement,
  preferred: HTMLElement | null,
): () => void {
  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(modal);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !modal.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (active === last || !modal.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };
  modal.addEventListener('keydown', onKeyDown);
  const focusTarget =
    preferred && !preferred.closest('.hidden')
      ? preferred
      : focusableElements(modal)[0];
  if (focusTarget) requestAnimationFrame(() => focusTarget.focus());
  return () => {
    modal.removeEventListener('keydown', onKeyDown);
    if (previouslyFocused && document.contains(previouslyFocused)) {
      previouslyFocused.focus();
    }
  };
}
