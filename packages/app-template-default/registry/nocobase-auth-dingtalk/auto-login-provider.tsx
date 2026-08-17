import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

import { LoadingState } from "@/components/app-shell/loading-state";
import { clearAcl } from "@nocobase/portal-sdk/acl";
import { nocobaseClient } from "@nocobase/portal-sdk/client";
import { resolvePortalUrl } from "@nocobase/portal-sdk/runtime";

import { isDingtalkBrowser } from "./use-dingtalk-sign-in";

type CheckLoginResponse = {
  success?: boolean;
  autoLoginType?: "oauth" | "internal";
  authUrl?: string;
  authenticator?: string;
  corpId?: string;
};

type SignInResponse = {
  token?: string;
};

type DingtalkAuthCodeResult = {
  code?: string;
  authCode?: string;
};

type DingtalkAuthCodeOptions = {
  corpId: string;
  success: (result: DingtalkAuthCodeResult) => void;
  fail: (error: { errorMessage?: string; message?: string }) => void;
};

type DingtalkApi = {
  ready?: (callback: () => void) => void;
  getAuthCode?: (options: DingtalkAuthCodeOptions) => void;
  runtime?: {
    permission?: {
      requestAuthCode?: (
        options: DingtalkAuthCodeOptions
      ) => Promise<DingtalkAuthCodeResult> | void;
    };
  };
};

const publicAuthPaths = new Set([
  "/login",
  "/signin",
  "/register",
  "/forgot-password",
]);

async function requestDingtalkAuthCode(corpId: string) {
  const module = await import("dingtalk-jsapi");
  const dd = ((module as { default?: unknown }).default ??
    module) as DingtalkApi;

  return new Promise<string>((resolve, reject) => {
    const success = (result: DingtalkAuthCodeResult) => {
      const code = result?.code ?? result?.authCode;
      if (code) {
        resolve(String(code));
      } else {
        reject(new Error("DingTalk did not return an authorization code."));
      }
    };
    const fail = (error: { errorMessage?: string; message?: string }) =>
      reject(
        new Error(
          error?.errorMessage ||
            error?.message ||
            "Unable to request a DingTalk authorization code."
        )
      );
    const run = () => {
      const requestAuthCode = dd?.runtime?.permission?.requestAuthCode;
      if (typeof requestAuthCode === "function") {
        const result = requestAuthCode({ corpId, success, fail });
        if (result?.then) result.then(success).catch(fail);
        return;
      }
      if (typeof dd?.getAuthCode === "function") {
        dd.getAuthCode({ corpId, success, fail });
        return;
      }
      fail({ message: "DingTalk auth-code API is unavailable." });
    };

    try {
      if (typeof dd.ready === "function") {
        dd.ready(run);
      } else {
        run();
      }
    } catch (error) {
      fail(error as Error);
    }
  });
}

export default function DingtalkAutoLoginProvider({
  children,
}: React.PropsWithChildren) {
  const { pathname, search } = useLocation();
  const attemptedRef = useRef(false);
  const insideDingtalk = isDingtalkBrowser();
  const redirect = resolvePortalUrl(`${pathname}${search}`);
  const shouldCheck =
    insideDingtalk &&
    !nocobaseClient.getToken() &&
    !publicAuthPaths.has(pathname);
  const [isChecking, setIsChecking] = useState(shouldCheck);

  useEffect(() => {
    if (!shouldCheck || attemptedRef.current) {
      setIsChecking(false);
      return;
    }
    attemptedRef.current = true;
    setIsChecking(true);
    const controller = new AbortController();

    void (async () => {
      try {
        const result = await nocobaseClient.action<CheckLoginResponse>(
          "dingtalk",
          "checkLogin",
          {
            method: "GET",
            query: { isDingTalkBrowser: true, redirect },
            signal: controller.signal,
            authenticator: null,
            includeRole: false,
            withAclMeta: false,
          }
        );

        if (result?.success !== false) return;
        if (result.autoLoginType === "oauth" && result.authUrl) {
          window.location.replace(nocobaseClient.resolveUrl(result.authUrl));
          return;
        }
        if (
          result.autoLoginType !== "internal" ||
          !result.authenticator ||
          !result.corpId
        ) {
          return;
        }

        const authCode = await requestDingtalkAuthCode(result.corpId);
        const signedIn = await nocobaseClient.action<SignInResponse>(
          "auth",
          "signIn",
          {
            method: "POST",
            authenticator: result.authenticator,
            body: { authCode, loginType: "internal" },
          }
        );
        if (!signedIn.token) {
          throw new Error("NocoBase did not return an access token.");
        }
        nocobaseClient.setAuthenticator(result.authenticator);
        nocobaseClient.setToken(signedIn.token);
        nocobaseClient.setRole(null);
        clearAcl();
        window.location.replace(redirect);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("Unable to complete DingTalk automatic login", error);
        }
      } finally {
        setIsChecking(false);
      }
    })();

    return () => controller.abort();
  }, [redirect, shouldCheck]);

  if (isChecking) {
    return <LoadingState fullscreen />;
  }
  return children;
}
