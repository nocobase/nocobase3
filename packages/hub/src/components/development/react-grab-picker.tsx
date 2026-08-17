import { useEffect } from "react";
import type { ReactGrabAPI } from "react-grab";

import { configureReactGrabPicker } from "./react-grab-picker-customization";

export default function ReactGrabPicker() {
  useEffect(() => {
    let disposed = false;
    let currentApi: ReactGrabAPI | null = null;
    let removeCustomizations: (() => void) | null = null;

    void import("react-grab/core")
      .then(({ init }) => {
        if (disposed) return;

        currentApi = init({
          telemetry: false,
        });
        removeCustomizations = configureReactGrabPicker(currentApi);
      })
      .catch((error) => {
        if (!disposed) {
          console.error("Unable to initialize the component picker", error);
        }
      });

    return () => {
      disposed = true;
      removeCustomizations?.();
      currentApi?.dispose();
    };
  }, []);

  return null;
}
