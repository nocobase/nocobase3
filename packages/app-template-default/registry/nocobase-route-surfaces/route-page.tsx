import { type ReactNode } from "react";
import {
  RouteSurfaceContext,
  type RouteSurfaceBeforeClose,
  useRouteSurfaceState,
} from "@nocobase/portal-sdk/routing";

export function RoutePage({
  children,
  closeTo,
  beforeClose,
}: {
  children: ReactNode;
  closeTo: string;
  beforeClose?: RouteSurfaceBeforeClose;
}) {
  const { close } = useRouteSurfaceState({
    closeTo,
    beforeClose,
    animated: false,
  });

  return (
    <RouteSurfaceContext.Provider value={close}>
      {children}
    </RouteSurfaceContext.Provider>
  );
}
