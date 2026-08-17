export type RouteLocation = {
  pathname: string;
  search?: string;
  hash?: string;
  state?: unknown;
};

export type RouteSurfaceNavigationState = Record<string, unknown> & {
  routeSurfaceReturnTo: string;
};

export function buildRouteLocationHref(location: RouteLocation) {
  return `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
}

export function createRouteSurfaceNavigationState(
  location: RouteLocation
): RouteSurfaceNavigationState {
  const existingState =
    location.state &&
    typeof location.state === "object" &&
    !Array.isArray(location.state)
      ? (location.state as Record<string, unknown>)
      : {};

  return {
    ...existingState,
    routeSurfaceReturnTo: buildRouteLocationHref(location),
  };
}

export function resolveRouteSurfaceCloseTo(
  state: unknown,
  fallback: RouteLocation
) {
  const returnTo =
    state && typeof state === "object" && !Array.isArray(state)
      ? (state as Record<string, unknown>).routeSurfaceReturnTo
      : undefined;

  return typeof returnTo === "string" && returnTo.length > 0
    ? returnTo
    : buildRouteLocationHref(fallback);
}
