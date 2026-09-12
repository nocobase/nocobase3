import { createContext, useContext } from 'react';

interface RouteOverlayContextValue {
  close: () => Promise<void>;
  isClosing: boolean;
}

/** Internal context shared by both route overlay components. */
export const RouteOverlayContext =
  createContext<RouteOverlayContextValue | null>(null);

export function useRouteOverlay(): RouteOverlayContextValue {
  const value = useContext(RouteOverlayContext);
  if (!value) {
    throw new Error(
      'useRouteOverlay must be used inside RouteDialog or RouteDrawer',
    );
  }
  return value;
}
