/** @param {import('./controller.mjs').AppController} proto */
export function applyModalfocusmanagementMixin(proto) {
  proto.getFocusableModalElements = function (container) {
    if (!container) return [];
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    return Array.from(container.querySelectorAll(selector)).filter((el) => {
      if (el.getAttribute('aria-hidden') === 'true') return false;
      if (el.closest('.hidden')) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 || rect.height > 0 || el === document.activeElement;
    });
  }

  proto.activateModalFocusTrap = function (modal, preferredFocus = null) {
    if (!modal || this.modalFocusState.has(modal)) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const handleKeydown = (event) => {
      if (event.key !== 'Tab') return;
      const focusable = this.getFocusableModalElements(modal);
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
      } else if (active === last || !modal.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    modal.addEventListener('keydown', handleKeydown);
    this.modalFocusState.set(modal, { handleKeydown, previouslyFocused });
    const focusTarget = (preferredFocus && !preferredFocus.disabled && !preferredFocus.closest('.hidden'))
      ? preferredFocus
      : this.getFocusableModalElements(modal)[0];
    if (focusTarget) {
      requestAnimationFrame(() => focusTarget.focus());
    }
  }

  proto.deactivateModalFocusTrap = function (modal) {
    const state = this.modalFocusState.get(modal);
    if (!state) return;
    modal.removeEventListener('keydown', state.handleKeydown);
    this.modalFocusState.delete(modal);
    if (state.previouslyFocused && document.contains(state.previouslyFocused)) {
      state.previouslyFocused.focus();
    }
  }


}
