import { RouteOverlay, type RouteOverlayProps } from './route-overlay';

export type RouteDrawerProps = RouteOverlayProps;

export function RouteDrawer(props: RouteDrawerProps) {
  return <RouteOverlay {...props} drawer />;
}
