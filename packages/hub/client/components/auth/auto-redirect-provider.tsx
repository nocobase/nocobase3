import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { resolvePortalUrl } from "@nocobase/portal-sdk/runtime";

import { LoadingState } from "@/components/app-shell/loading-state";

type AutoRedirectResponse = {
  success?: boolean;
  authUrl?: string;
};

type AuthAutoRedirectProviderProps = React.PropsWithChildren<{
  resource: string;
  action: string;
  enabled?: boolean;
  query?: Record<string, string | number | boolean | null | undefined>;
}>;

const publicAuthPaths = new Set([
  "/login",
  "/signin",
  "/register",
  "/forgot-password",
]);

export function AuthAutoRedirectProvider({
  resource,
  action,
  enabled = true,
  query,
  children,
}: AuthAutoRedirectProviderProps) {
  const { pathname, search } = useLocation();
  const attemptedRef = useRef(false);
  const redirect = resolvePortalUrl(`${pathname}${search}`);
  const shouldCheck =
    enabled &&
    !nocobaseClient.getToken() &&
    !publicAuthPaths.has(pathname);
  const [isChecking, setIsChecking] = useState(shouldCheck);
  const stableQuery = useMemo(() => query, [JSON.stringify(query)]);

  useEffect(() => {
    if (!shouldCheck || attemptedRef.current) {
      setIsChecking(false);
      return;
    }

    attemptedRef.current = true;
    setIsChecking(true);
    const controller = new AbortController();

    void nocobaseClient
      .action<AutoRedirectResponse>(resource, action, {
        method: "GET",
        query: { redirect, ...stableQuery },
        signal: controller.signal,
        authenticator: null,
        includeRole: false,
        withAclMeta: false,
      })
      .then((result) => {
        if (result?.success === false && result.authUrl) {
          window.location.replace(nocobaseClient.resolveUrl(result.authUrl));
          return;
        }
        setIsChecking(false);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setIsChecking(false);
      });

    return () => controller.abort();
  }, [action, redirect, resource, shouldCheck, stableQuery]);

  if (isChecking) {
    return <LoadingState fullscreen />;
  }

  return children;
}
