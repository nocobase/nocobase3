import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      element.getAttribute('aria-hidden') !== 'true' &&
      !element.hasAttribute('inert'),
  );
}

interface BackgroundState {
  readonly element: HTMLElement;
  readonly inert: string | null;
  readonly ariaHidden: string | null;
}

export function useModalBehavior(
  open: boolean,
  contentRef: RefObject<HTMLElement | null>,
  close: () => void,
): void {
  useEffect(() => {
    const content = contentRef.current;
    if (!open || !content) return undefined;

    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = focusableElements(content);
    (focusable[0] ?? content).focus();

    const background: BackgroundState[] = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement &&
          element !== content &&
          !element.contains(content) &&
          !element.matches('[data-slot$="-overlay"]'),
      )
      .map((element) => ({
        element,
        inert: element.getAttribute('inert'),
        ariaHidden: element.getAttribute('aria-hidden'),
      }));

    for (const state of background) {
      state.element.setAttribute('inert', '');
      state.element.setAttribute('aria-hidden', 'true');
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const currentFocusable = focusableElements(content);
      if (currentFocusable.length === 0) {
        event.preventDefault();
        content.focus();
        return;
      }
      const first = currentFocusable[0];
      const last = currentFocusable[currentFocusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !content.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      for (const state of background) {
        if (state.inert === null) state.element.removeAttribute('inert');
        else state.element.setAttribute('inert', state.inert);
        if (state.ariaHidden === null) {
          state.element.removeAttribute('aria-hidden');
        } else {
          state.element.setAttribute('aria-hidden', state.ariaHidden);
        }
      }
      previousFocus?.focus();
    };
  }, [close, contentRef, open]);
}
