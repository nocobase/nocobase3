import { authProvider } from "@nocobase/portal-sdk/auth";
import {
  isNocoBaseServiceError,
  nocobaseClient,
  nocobaseWebSocket,
  normalizeNocoBaseRuntimeError,
} from "@nocobase/portal-sdk/client";
import {
  portalRuntimeStore,
  resolvePortalUrl,
} from "@nocobase/portal-sdk/runtime";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";

import { NocoBaseRuntimeStatus } from "@/extensions/nocobase-error-boundary";

export function PortalRuntimeGate({ children }: PropsWithChildren) {
  const runtimeState = useSyncExternalStore(
    portalRuntimeStore.subscribe,
    portalRuntimeStore.getState,
    portalRuntimeStore.getState
  );
  const runtimeError = runtimeState.error;
  const errorRef = useRef(runtimeError);
  const hasLoadErrorRef = useRef(false);
  errorRef.current = runtimeError;
  if (
    runtimeError?.source !== "websocket" &&
    runtimeError &&
    isNocoBaseServiceError(runtimeError)
  ) {
    hasLoadErrorRef.current = true;
  }

  useEffect(() => {
    const unsubscribeMessages = nocobaseWebSocket.subscribe((message) => {
      if (!message.payload) return;

      if (message.payload.refresh) {
        window.location.reload();
        return;
      }

      if (message.type !== "maintaining") return;
      const nextError = normalizeNocoBaseRuntimeError(
        message.payload,
        "websocket"
      );

      if (nextError.code === "APP_RUNNING") {
        const currentError = errorRef.current;
        if (currentError && !isNocoBaseServiceError(currentError)) return;
        const shouldReload = hasLoadErrorRef.current;
        nocobaseWebSocket.authenticate();
        errorRef.current = undefined;
        portalRuntimeStore.clear();
        if (shouldReload) window.location.reload();
        return;
      }

      errorRef.current = nextError;
      portalRuntimeStore.setError(nextError);
    });

    const handleOnline = () => {
      const currentError = errorRef.current;
      if (currentError && isNocoBaseServiceError(currentError)) {
        nocobaseWebSocket.reconnect();
      }
    };

    window.addEventListener("online", handleOnline);
    nocobaseWebSocket.connect();
    return () => {
      window.removeEventListener("online", handleOnline);
      unsubscribeMessages();
      nocobaseWebSocket.close();
    };
  }, []);

  useEffect(() => {
    if (
      runtimeError &&
      ["ROLE_NOT_FOUND_ERR", "ROLE_NOT_FOUND_FOR_USER"].includes(
        runtimeError.code ?? ""
      )
    ) {
      errorRef.current = undefined;
      portalRuntimeStore.clear();
      window.location.reload();
    }
  }, [runtimeError]);

  if (!runtimeError) return children;

  const handleRetry = () => window.location.reload();

  const handleLogout = async () => {
    try {
      const result = await authProvider.logout?.({});
      errorRef.current = undefined;
      portalRuntimeStore.clear();
      if (result?.redirectTo) {
        window.location.assign(resolvePortalUrl(result.redirectTo));
      }
    } catch {
      nocobaseClient.clearAuthentication();
      errorRef.current = undefined;
      portalRuntimeStore.clear();
      window.location.assign(resolvePortalUrl("/login"));
    }
  };

  return (
    <NocoBaseRuntimeStatus
      error={runtimeError}
      onRetry={handleRetry}
      onLogout={
        runtimeError.code === "USER_HAS_NO_ROLES_ERR"
          ? handleLogout
          : undefined
      }
      context={{
        templateName: __PORTAL_TEMPLATE_NAME__,
        templateVersion: __PORTAL_TEMPLATE_VERSION__,
      }}
    />
  );
}
