import { useTranslate } from "@refinedev/core";
import { createContext, useContext, type PropsWithChildren } from "react";
import { useParams } from "react-router";

import type { HubFetcher, HubMe } from "./api";
import { hasHubCapability, useHubQuery } from "./api";
import { HubEmptyState, HubErrorState, HubLoadingState } from "./components";

export interface HubRuntimeContextValue {
  me: HubMe;
  reload: () => void;
}

const HubRuntimeContext = createContext<HubRuntimeContextValue | null>(null);

export function HubRuntimeProvider({
  children,
  fetcher,
}: PropsWithChildren<{ fetcher?: HubFetcher }>) {
  const translate = useTranslate();
  const me = useHubQuery<HubMe>({ path: "/me", fetcher });

  if (me.loading) {
    return (
      <HubLoadingState
        label={translate("hub.session.loading", "Loading Hub session")}
      />
    );
  }
  if (me.error) {
    return (
      <div className="mx-auto flex min-h-svh max-w-xl items-center px-6">
        <HubErrorState
          error={me.error}
          onRetry={me.reload}
          title={translate(
            "hub.access.loadError",
            "Unable to load your Hub access",
          )}
        />
      </div>
    );
  }
  if (!me.data) {
    return (
      <HubLoadingState
        label={translate("hub.session.loading", "Loading Hub session")}
      />
    );
  }

  return (
    <HubRuntimeContext.Provider value={{ me: me.data, reload: me.reload }}>
      {children}
    </HubRuntimeContext.Provider>
  );
}

export function useHubRuntime(): HubRuntimeContextValue {
  const value = useContext(HubRuntimeContext);
  if (!value) {
    throw new Error("useHubRuntime must be used inside HubRuntimeProvider.");
  }
  return value;
}

export function useOptionalHubRuntime(): HubRuntimeContextValue | null {
  return useContext(HubRuntimeContext);
}

export function HubCapabilityGate({
  resource,
  action,
  applicationId,
  children,
}: PropsWithChildren<{
  resource: string;
  action: string;
  applicationId?: string;
}>) {
  const translate = useTranslate();
  const { me } = useHubRuntime();
  if (hasHubCapability(me.capabilities, resource, action, applicationId)) {
    return children;
  }
  return (
    <HubEmptyState
      title={translate("hub.access.denied.title", "403 · Access denied")}
      description={translate(
        "hub.access.denied.description",
        { resource, action },
        `Your Hub assignment does not include ${resource}:${action}. Ask an Owner or Admin to grant access.`,
      )}
    />
  );
}

export function HubCapabilityRouteGate({
  resource,
  action,
  applicationParam,
  allowAnyApplication = false,
  children,
}: PropsWithChildren<{
  resource: string;
  action: string;
  applicationParam?: string;
  allowAnyApplication?: boolean;
}>) {
  const params = useParams<Record<string, string | undefined>>();
  const { me } = useHubRuntime();
  const applicationId = applicationParam ? params[applicationParam] : undefined;
  const allowedByApplication =
    allowAnyApplication &&
    (me.capabilities.application ?? []).some((entry) =>
      hasHubCapability(me.capabilities, resource, action, entry.applicationId),
    );
  if (allowedByApplication) return children;
  return (
    <HubCapabilityGate
      resource={resource}
      action={action}
      applicationId={applicationId}
    >
      {children}
    </HubCapabilityGate>
  );
}
