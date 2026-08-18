import { useContext } from "react";

import { RouteSurfaceContext } from "./route-surface-context.ts";
import type { RouteSurfaceClose } from "./route-surface-context.ts";

export function useRouteSurfaceClose(): RouteSurfaceClose {
  const close = useContext(RouteSurfaceContext);

  if (!close) {
    throw new Error(
      "useRouteSurfaceClose must be used inside a RouteDrawer, RouteDialog, or RoutePage."
    );
  }

  return close;
}
