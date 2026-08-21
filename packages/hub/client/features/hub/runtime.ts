import type { AuthProvider } from "@refinedev/core";

import {
  HubApiError,
  buildHubApiUrl,
  getHubApiBase,
  type HubFetcher,
} from "./api";

export interface HubAuthSessionUser {
  id: string;
  name: string;
  username?: string | null;
  email: string;
  image?: string | null;
}

export interface HubAuthSession {
  user: HubAuthSessionUser;
  session: {
    id: string;
    expiresAt: string;
  };
}

export interface CreateHubAuthRuntimeOptions {
  baseURL?: string;
  fetcher?: HubFetcher;
}

export interface HubAuthClient {
  getSession(): Promise<HubAuthSession | null>;
  signIn(identifier: string, password: string): Promise<HubAuthSession>;
  signOut(): Promise<void>;
}

export interface HubAuthRuntime {
  client: HubAuthClient;
  authProvider: AuthProvider;
}

const defaultFetcher: HubFetcher = (input, init) => fetch(input, init);

export function createHubAuthRuntime(
  options: CreateHubAuthRuntimeOptions = {},
): HubAuthRuntime {
  const baseURL = options.baseURL ?? getHubApiBase();
  const fetcher = options.fetcher ?? defaultFetcher;
  const request = async <T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> => {
    let response: Response;
    try {
      response = await fetcher(buildHubApiUrl(`/auth/${path}`, baseURL), {
        ...init,
        credentials: "include",
        headers: {
          accept: "application/json",
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      throw new HubApiError(
        error instanceof Error ? error.message : "Unable to reach Hub.",
        { code: "NETWORK_ERROR", status: 0, retryable: true },
      );
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      const message = readAuthErrorMessage(payload);
      throw new HubApiError(message, {
        code: readAuthErrorCode(payload),
        status: response.status,
      });
    }
    return payload as T;
  };

  const client: HubAuthClient = {
    getSession: () => request<HubAuthSession | null>("get-session"),
    signIn: (identifier, password) => {
      const isEmail = identifier.includes("@");
      return request<HubAuthSession>(
        isEmail ? "sign-in/email" : "sign-in/username",
        {
          method: "POST",
          body: JSON.stringify(
            isEmail
              ? { email: identifier, password }
              : { username: identifier, password },
          ),
        },
      );
    },
    signOut: async () => {
      await request<unknown>("sign-out", {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
  };

  let currentSession: HubAuthSession | null | undefined;
  let currentRequest: Promise<HubAuthSession | null> | undefined;
  const clear = () => {
    currentSession = undefined;
    currentRequest = undefined;
  };
  const getSession = async () => {
    if (currentSession !== undefined) return currentSession;
    currentRequest ??= client
      .getSession()
      .then((session) => {
        currentSession = session;
        return session;
      })
      .finally(() => {
        currentRequest = undefined;
      });
    return currentRequest;
  };

  const authProvider: AuthProvider = {
    login: async (params) => {
      try {
        const values = asUnknownRecord(params);
        const identifier = stringValue(
          values.identifier ?? values.email ?? values.username ?? "",
        ).trim();
        const password = stringValue(values.password);
        if (!identifier || !password) {
          throw new HubApiError(
            "Username or email and password are required.",
            {
              code: "VALIDATION_ERROR",
              status: 422,
            },
          );
        }
        await client.signIn(identifier, password);
        clear();
        return {
          success: true,
          redirectTo:
            typeof values.redirectTo === "string" ? values.redirectTo : "/",
        };
      } catch (error) {
        return {
          success: false,
          error: toAuthError(error, "Unable to sign in."),
        };
      }
    },
    logout: async () => {
      try {
        await client.signOut();
      } finally {
        clear();
      }
      return { success: true, redirectTo: "/login" };
    },
    check: async () => {
      try {
        return (await getSession())
          ? { authenticated: true }
          : { authenticated: false, redirectTo: "/login" };
      } catch (error) {
        clear();
        return {
          authenticated: false,
          redirectTo: "/login",
          error: toAuthError(error, "Unable to check authentication."),
        };
      }
    },
    getIdentity: async () => {
      const session = await getSession();
      if (!session) return null;
      const { user } = session;
      return {
        id: user.id,
        fullName: user.name,
        firstName: user.name,
        lastName: "",
        email: user.email,
        avatar: user.image ?? undefined,
      };
    },
    getPermissions: async () => undefined,
    onError: async (error) => {
      if (
        error instanceof HubApiError &&
        (error.status === 401 || error.code === "UNAUTHORIZED")
      ) {
        clear();
        return { logout: true, redirectTo: "/login" };
      }
      return {
        error: error instanceof Error ? error : new Error(String(error)),
      };
    },
  };

  return { client, authProvider };
}

function readAuthErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload) return payload;
  if (!payload || typeof payload !== "object") return "Authentication failed.";
  const value = payload as { message?: unknown; error?: unknown };
  if (typeof value.message === "string") return value.message;
  if (typeof value.error === "string") return value.error;
  if (value.error && typeof value.error === "object") {
    const nested = value.error as { message?: unknown };
    if (typeof nested.message === "string") return nested.message;
  }
  return "Authentication failed.";
}

function readAuthErrorCode(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "AUTHENTICATION_FAILED";
  const value = payload as { code?: unknown; error?: unknown };
  if (typeof value.code === "string") return value.code;
  if (value.error && typeof value.error === "object") {
    const nested = value.error as { code?: unknown };
    if (typeof nested.code === "string") return nested.code;
  }
  return "AUTHENTICATION_FAILED";
}

function toAuthError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  return new Error(fallback);
}

function asUnknownRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function getHubBrowserBase(): string {
  if (typeof window === "undefined") return "/hub";
  const raw = window.NOCOBASE_PORTAL_BASE?.trim() || "/hub";
  const normalized = raw.replace(/^\/+|\/+$/g, "");
  return normalized ? `/${normalized}` : "";
}

export const hubAuthRuntime = createHubAuthRuntime();
