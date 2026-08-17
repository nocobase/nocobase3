import { createContext } from "react";

export type RouteSurfaceCloseOptions = {
  skipBeforeClose?: boolean;
};

export type RouteSurfaceClose = (
  options?: RouteSurfaceCloseOptions
) => Promise<boolean>;

export const RouteSurfaceContext = createContext<RouteSurfaceClose | null>(null);

export const RouteOverlayDepthContext = createContext(0);

export type RouteOverlayViewport = {
  inlineEnd?: number | string;
};

// Layouts with persistent side regions can scope route overlays to the page
// viewport while React portals preserve the surrounding route context.
export const RouteOverlayViewportContext =
  createContext<RouteOverlayViewport | null>(null);
