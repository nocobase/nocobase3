import { RouteOverlay, type RouteOverlayProps } from './route-overlay';

export type RouteDialogProps = RouteOverlayProps;

export function RouteDialog(props: RouteDialogProps) {
  return <RouteOverlay {...props} />;
}
