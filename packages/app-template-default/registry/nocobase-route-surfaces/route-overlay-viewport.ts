import { useContext, type CSSProperties } from "react";
import { RouteOverlayViewportContext } from "@nocobase/portal-sdk/routing";

export function useRouteOverlayViewportStyle() {
  const viewport = useContext(RouteOverlayViewportContext);
  const inlineEnd = viewport?.inlineEnd ?? 0;

  return {
    "--route-overlay-inline-end":
      typeof inlineEnd === "number" ? `${inlineEnd}px` : inlineEnd,
  } as CSSProperties;
}
