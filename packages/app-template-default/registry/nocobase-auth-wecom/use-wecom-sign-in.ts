import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import type { Authenticator } from "@nocobase/portal-sdk/auth";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { resolvePortalUrl } from "@nocobase/portal-sdk/runtime";

type WecomAuthUrlResponse = {
  url?: string;
};

export function isWecomBrowser() {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent.toLowerCase().includes("wxwork")
  );
}

export function useWecomSignIn(authenticator: Authenticator) {
  const [searchParams] = useSearchParams();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error>();
  const callbackError = useMemo(() => {
    if (searchParams.get("authenticator") !== authenticator.name) {
      return undefined;
    }
    const message = searchParams.get("errorMsg");
    return message ? new Error(message) : undefined;
  }, [authenticator.name, searchParams]);

  const signIn = useCallback(async () => {
    setError(undefined);
    setIsPending(true);
    try {
      const redirect = resolvePortalUrl(
        searchParams.get("to") || searchParams.get("redirect") || "/"
      );
      const result = await nocobaseClient.action<WecomAuthUrlResponse>(
        "wecom",
        "getAuthUrl",
        {
          method: "POST",
          authenticator: authenticator.name,
          includeRole: false,
          withAclMeta: false,
          body: { redirect, isWeComBrowser: isWecomBrowser() },
        }
      );
      if (!result?.url) {
        throw new Error("NocoBase did not return a WeCom authorization URL.");
      }
      window.location.replace(nocobaseClient.resolveUrl(result.url));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause
          : new Error("Unable to start WeCom sign-in.")
      );
      setIsPending(false);
    }
  }, [authenticator.name, searchParams]);

  return { signIn, isPending, error: error ?? callbackError };
}
