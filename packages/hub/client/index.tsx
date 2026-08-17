import React from "react";
import { createRoot } from "react-dom/client";
import { captureAuthenticationCallback } from "@nocobase/portal-sdk/auth";
import {
  NocoBaseErrorBoundary,
  NocoBaseErrorFallback,
} from "@/extensions/nocobase-error-boundary";

import "./locales";
import { portalI18nReady } from "./providers/i18n/runtime";
import App from "./App";

async function bootstrap() {
  const container = document.getElementById("root") as HTMLElement;
  const root = createRoot(container);
  const errorContext = {
    templateName: __PORTAL_TEMPLATE_NAME__,
    templateVersion: __PORTAL_TEMPLATE_VERSION__,
  };

  try {
    captureAuthenticationCallback();
    try {
      await portalI18nReady;
    } catch (error) {
      console.warn("Unable to initialize Portal translations", error);
    }

    root.render(
      <NocoBaseErrorBoundary variant="root" context={errorContext}>
        <App />
      </NocoBaseErrorBoundary>
    );
  } catch (error) {
    console.error("Unable to bootstrap Portal", error);
    root.render(
      <NocoBaseErrorFallback
        variant="root"
        error={error}
        context={errorContext}
        onReload={() => window.location.reload()}
      />
    );
  }
}

void bootstrap();
