import type { AuthProvider } from "@refinedev/core";

import { nocobaseClient } from "../client/index.ts";
import {
  clearAcl,
  loadAcl,
  type Role,
} from "../acl/index.ts";
import {
  getNocoBaseErrorMessage,
  isNocoBaseServiceError,
  NocoBaseHttpError,
  type NocoBaseRuntimeError,
  normalizeNocoBaseRuntimeError,
} from "../client/index.ts";
import { portalRuntimeStore } from "../runtime/store.ts";

type NocoBaseUser = {
  id: number | string;
  nickname?: string;
  username?: string;
  email?: string;
  avatar?: string;
  roles?: Role[];
};

type NocoBaseSignInResponse = {
  token?: string;
  user?: NocoBaseUser;
};

type NocoBaseSignOutResponse = {
  redirect?: string;
};

type CurrentUserCache = {
  sessionKey: string;
  user: NocoBaseUser;
  expiresAt: number;
};

const CURRENT_USER_CACHE_MS = 30_000;
const STALE_ROLE_ERROR_CODES = new Set([
  "ROLE_NOT_FOUND_ERR",
  "ROLE_NOT_FOUND_FOR_USER",
]);
const NO_ROLE_ERROR_CODE = "USER_HAS_NO_ROLES_ERR";
const AUTHENTICATION_ERROR_CODES = new Set([
  "BLOCKED_TOKEN",
  "EMPTY_TOKEN",
  "EXPIRED_SESSION",
  "EXPIRED_TOKEN",
  "INVALID_TOKEN",
  "NOT_EXIST_USER",
  "SKIP_TOKEN_RENEW",
  "TOKEN_INVALID",
  "TOKEN_RENEW_FAILED",
  "USER_LOCKED",
]);
let currentUserCache: CurrentUserCache | undefined;
let currentUserRequest: Promise<NocoBaseUser> | undefined;

const getErrorMessage = (payload: unknown, fallback: string) => {
  if (payload instanceof NocoBaseHttpError) return payload.message;
  return getNocoBaseErrorMessage(payload, fallback);
};

const clearCurrentUserCache = () => {
  currentUserCache = undefined;
  currentUserRequest = undefined;
};

const clearCurrentRole = () => {
  nocobaseClient.setRole(null);
  clearCurrentUserCache();
  clearAcl();
};

const reportRuntimeError = (error: NocoBaseRuntimeError) =>
  portalRuntimeStore.setError(error);

const getCurrentUser = async (): Promise<NocoBaseUser> => {
  const token = nocobaseClient.getToken();
  const sessionKey = token ?? "cookie";

  const cached = currentUserCache;
  if (
    cached &&
    cached.sessionKey === sessionKey &&
    cached.expiresAt > Date.now()
  ) {
    return cached.user;
  }

  if (currentUserRequest) return currentUserRequest;

  currentUserRequest = (async () => {
    const user = await nocobaseClient.action<NocoBaseUser>("auth", "check", {
      token,
      // A default authenticator header would override the server's
      // authenticator cookie during a Cookie-only SSO session.
      authenticator: token ? undefined : null,
    });
    currentUserCache = {
      sessionKey: nocobaseClient.getToken() ?? "cookie",
      user,
      expiresAt: Date.now() + CURRENT_USER_CACHE_MS,
    };
    return user;
  })();

  try {
    return await currentUserRequest;
  } finally {
    currentUserRequest = undefined;
  }
};

export const authProvider: AuthProvider = {
  login: async (params) => {
    const {
      authenticator = nocobaseClient.getAuthenticator(),
      username,
      email,
      redirectTo = "/",
      ...values
    } = params ?? {};
    const account = values.account ?? username ?? email;
    const body = {
      ...values,
      ...(account ? { account } : {}),
    };

    if (Object.keys(body).length === 0) {
      return {
        success: false,
        error: {
          name: "LoginError",
          message: "Please enter your sign-in details.",
        },
      };
    }

    try {
      const result = await nocobaseClient.action<NocoBaseSignInResponse>(
        "auth",
        "signIn",
        {
          method: "POST",
          authenticator,
          body,
        }
      );
      if (!result.token) {
        return {
          success: false,
          error: {
            name: "LoginError",
            message: "NocoBase did not return an access token.",
          },
        };
      }

      nocobaseClient.setAuthenticator(authenticator);
      nocobaseClient.setToken(result.token);
      nocobaseClient.setRole(null);
      clearCurrentUserCache();
      clearAcl();
      return { success: true, redirectTo };
    } catch (error) {
      return {
        success: false,
        error: {
          name:
            error instanceof NocoBaseHttpError ? "LoginError" : "NetworkError",
          message: getErrorMessage(
            error,
            "Unable to reach the NocoBase server. If this is a remote NocoBase from localhost, enable backend CORS for X-Authenticator or use the Vite proxy."
          ),
        },
      };
    }
  },

  register: async (params) => {
    const {
      authenticator = nocobaseClient.getAuthenticator(),
      redirectTo = "/login",
      ...values
    } = params ?? {};

    try {
      await nocobaseClient.action("auth", "signUp", {
        method: "POST",
        authenticator,
        body: values,
      });
      return {
        success: true,
        redirectTo,
        successNotification: {
          message: "Account created",
          description: "You can now sign in with your new account.",
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: "RegistrationError",
          message: getErrorMessage(error, "Unable to create the account."),
        },
      };
    }
  },

  forgotPassword: async (params) => {
    const {
      authenticator = nocobaseClient.getAuthenticator(),
      ...values
    } = params ?? {};
    const baseURL =
      typeof window === "undefined"
        ? undefined
        : window.location.href.split("/forgot-password")[0];

    try {
      await nocobaseClient.action("auth", "lostPassword", {
        method: "POST",
        authenticator,
        body: { ...values, baseURL },
      });
      return {
        success: true,
        successNotification: {
          message: "Reset link sent",
          description: "Check your inbox for password reset instructions.",
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          name: "PasswordResetError",
          message: getErrorMessage(error, "Unable to send the reset link."),
        },
      };
    }
  },

  logout: async () => {
    const token = nocobaseClient.getToken();
    let redirect: string | undefined;
    try {
      const result = await nocobaseClient.action<NocoBaseSignOutResponse>(
        "auth",
        "signOut",
        {
          method: "POST",
          token,
          authenticator: token ? undefined : null,
        }
      );
      redirect = result?.redirect;
    } finally {
      nocobaseClient.clearAuthentication();
      clearCurrentUserCache();
      clearAcl();
    }

    if (redirect && typeof window !== "undefined") {
      window.location.assign(nocobaseClient.resolveUrl(redirect));
      return { success: true };
    }

    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    try {
      await getCurrentUser();
      return { authenticated: true };
    } catch (error) {
      let runtimeError = normalizeNocoBaseRuntimeError(error, "http");

      if (
        runtimeError.code &&
        STALE_ROLE_ERROR_CODES.has(runtimeError.code)
      ) {
        clearCurrentRole();
        try {
          await getCurrentUser();
          return { authenticated: true };
        } catch (retryError) {
          runtimeError = normalizeNocoBaseRuntimeError(retryError, "http");
          if (
            runtimeError.code === NO_ROLE_ERROR_CODE ||
            isNocoBaseServiceError(runtimeError)
          ) {
            reportRuntimeError(runtimeError);
            return { authenticated: true };
          }
        }
      }

      if (
        runtimeError.code === NO_ROLE_ERROR_CODE ||
        isNocoBaseServiceError(runtimeError)
      ) {
        reportRuntimeError(runtimeError);
        return { authenticated: true };
      }

      if (
        runtimeError.status !== 401 &&
        (!runtimeError.code ||
          !AUTHENTICATION_ERROR_CODES.has(runtimeError.code))
      ) {
        reportRuntimeError(runtimeError);
        return { authenticated: true };
      }

      nocobaseClient.clearAuthentication();
      clearCurrentUserCache();
      clearAcl();
      return { authenticated: false, redirectTo: "/login" };
    }
  },

  getPermissions: async () => {
    try {
      return await loadAcl();
    } catch {
      return null;
    }
  },

  getIdentity: async () => {
    try {
      const user = await getCurrentUser();
      const fullName =
        user.nickname ?? user.username ?? user.email ?? "NocoBase user";
      return {
        id: user.id,
        firstName: fullName,
        lastName: "",
        fullName,
        email: user.email ?? "",
        avatar: user.avatar,
        roles: user.roles ?? [],
      };
    } catch {
      return null;
    }
  },

  onError: async (error) => {
    const runtimeError = normalizeNocoBaseRuntimeError(error, "http");
    if (
      runtimeError.code &&
      STALE_ROLE_ERROR_CODES.has(runtimeError.code)
    ) {
      clearCurrentRole();
      reportRuntimeError(runtimeError);
      return {};
    }

    if (
      runtimeError.code === NO_ROLE_ERROR_CODE ||
      isNocoBaseServiceError(runtimeError)
    ) {
      reportRuntimeError(runtimeError);
      return {};
    }

    if (
      runtimeError.status === 401 ||
      (runtimeError.code !== undefined &&
        AUTHENTICATION_ERROR_CODES.has(runtimeError.code))
    ) {
      nocobaseClient.clearAuthentication();
      clearCurrentUserCache();
      clearAcl();
      return { logout: true, redirectTo: "/login" };
    }

    return { error };
  },
};
