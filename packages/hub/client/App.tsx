import { Refine, type ResourceProps } from "@refinedev/core";
import { lazy, Suspense } from "react";

import { BrowserRouter } from "react-router";
import routerProvider, {
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import {
  accessControlProvider,
  AclStoreProvider,
  aclStore,
} from "@nocobase/portal-sdk/acl";
import { authProvider } from "@nocobase/portal-sdk/auth";
import { dataProvider } from "@nocobase/portal-sdk/data";
import { i18nProvider } from "@nocobase/portal-sdk/i18n";
import { getPortalBase } from "@nocobase/portal-sdk/runtime";
import { DocumentTitleHandler } from "./components/app-shell/document-title-handler";
import { useNotificationProvider } from "./components/notifications/use-notification-provider";
import { Toaster } from "./components/notifications/toaster";
import { ThemeProvider } from "./components/theme/theme-provider";
import { TooltipProvider } from "./components/ui/tooltip";
import { BrandLogo } from "./components/app-shell/brand";
import {
  AppAuthRuntimeProviders,
  configuredResources,
} from "./app/extensions";
import "./App.css";
import { SystemSettingsProvider } from "./providers/system-settings/provider";
import { AppRoutes } from "./app/routes";
import { PortalRuntimeGate } from "./components/app-shell/portal-runtime-gate";

const getResourcePriority = (resource: ResourceProps) =>
  typeof resource.meta?.priority === "number" ? resource.meta.priority : 100;

const appResources = [...configuredResources].sort(
  (left, right) => getResourcePriority(left) - getResourcePriority(right)
);

const basename = getPortalBase().replace(/\/+$/, "");

const ReactGrabPicker = import.meta.env.DEV
  ? lazy(() => import("./components/development/react-grab-picker"))
  : null;

function App() {
  return (
    <BrowserRouter basename={basename || undefined}>
      <ThemeProvider>
        <TooltipProvider>
          <PortalRuntimeGate>
            <AppAuthRuntimeProviders>
              <SystemSettingsProvider>
                <AclStoreProvider store={aclStore}>
                  <Refine
                    dataProvider={dataProvider}
                    notificationProvider={useNotificationProvider()}
                    routerProvider={routerProvider}
                    authProvider={authProvider}
                    accessControlProvider={accessControlProvider}
                    i18nProvider={i18nProvider}
                    resources={appResources}
                    options={{
                      syncWithLocation: true,
                      warnWhenUnsavedChanges: true,
                      disableTelemetry: true,
                      title: {
                        text: "NocoBase",
                        icon: <BrandLogo className="size-14 rounded-2xl" />,
                      },
                    }}
                  >
                    <AppRoutes />

                    <Toaster />
                    <UnsavedChangesNotifier />
                    <DocumentTitleHandler appName="NocoBase" />
                  </Refine>
                </AclStoreProvider>
              </SystemSettingsProvider>
            </AppAuthRuntimeProviders>
          </PortalRuntimeGate>
          {ReactGrabPicker ? (
            <Suspense fallback={null}>
              <ReactGrabPicker />
            </Suspense>
          ) : null}
        </TooltipProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
