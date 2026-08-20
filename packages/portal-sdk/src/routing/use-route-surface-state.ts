import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import type {
  RouteSurfaceClose,
  RouteSurfaceCloseOptions,
} from "./route-surface-context.ts";

export type RouteSurfaceBeforeClose = () => boolean | Promise<boolean>;

export type RouteSurfaceState = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  close: RouteSurfaceClose;
  navigateAfterClose: () => void;
};

export function useRouteSurfaceState({
  closeTo,
  beforeClose,
  animated,
}: {
  closeTo: string;
  beforeClose?: RouteSurfaceBeforeClose;
  animated: boolean;
}): RouteSurfaceState {
  const navigate = useNavigate();
  const [open, setOpen] = useState(!animated);
  const closingRef = useRef(false);

  useEffect(() => {
    if (!animated) return;

    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [animated]);

  const navigateAfterClose = useCallback((): void => {
    const navigation = navigate(closeTo, { replace: true });
    if (navigation instanceof Promise) {
      // Framework-mode navigation is async, while this callback also serves
      // synchronous animation hooks. Route failures are surfaced by the router.
      navigation.catch(() => undefined);
    }
  }, [closeTo, navigate]);

  const close = useCallback<RouteSurfaceClose>(
    async (options?: RouteSurfaceCloseOptions) => {
      if (closingRef.current) return false;

      closingRef.current = true;
      try {
        if (!options?.skipBeforeClose && beforeClose) {
          const allowed = await beforeClose();
          if (!allowed) return false;
        }

        if (animated) {
          setOpen(false);
        } else {
          navigateAfterClose();
        }
        return true;
      } finally {
        closingRef.current = false;
      }
    },
    [animated, beforeClose, navigateAfterClose],
  );

  return {
    open,
    setOpen,
    close,
    navigateAfterClose,
  };
}
