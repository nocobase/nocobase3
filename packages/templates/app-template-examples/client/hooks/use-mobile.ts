import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;
function subscribe(callback: () => void) {
  const media = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}
// Same shadcn breakpoint, subscribed without an effect-triggered render.
export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
