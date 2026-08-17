import type { APIRequestContext } from "@playwright/test";
import {
  getNocoBaseErrorMessage,
  NocoBaseHttpError,
} from "@nocobase/portal-sdk/client";

import {
  resolvePortalApiActionURL,
  type PortalE2ECredentials,
  type PortalE2EEnvironment,
} from "./environment";

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

export type PortalE2ESession = {
  token: string;
  authenticator: string;
  role?: string;
  locale?: string;
  user?: Record<string, unknown>;
};

export type PortalActionOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  session?: PortalE2ESession;
  authenticator?: string;
  unwrap?: "data" | "deep-data" | "none";
};

export { NocoBaseHttpError as PortalE2EApiError };

const getTimezone = () => {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(
    absolute % 60
  ).padStart(2, "0")}`;
};

const readPayload = async (text: string) => {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const unwrapPayload = <T>(
  payload: unknown,
  mode: PortalActionOptions["unwrap"]
): T => {
  if (mode === "none" || !payload || typeof payload !== "object") {
    return payload as T;
  }
  const data = (payload as { data?: unknown }).data;
  if (mode === "deep-data" && data && typeof data === "object") {
    return ((data as { data?: unknown }).data ?? data) as T;
  }
  return (data ?? payload) as T;
};

export async function portalAction<T>(
  request: APIRequestContext,
  environment: PortalE2EEnvironment,
  resource: string,
  action: string,
  options: PortalActionOptions = {}
) {
  const method =
    options.method ??
    (["get", "list"].includes(action) ? "GET" : "POST");
  const url = new URL(resolvePortalApiActionURL(environment, resource, action));

  Object.entries(options.query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, String(item)));
    } else {
      url.searchParams.set(key, String(value));
    }
  });

  const authenticator =
    options.authenticator ?? options.session?.authenticator;
  const role = options.session?.role;
  const locale = options.session?.locale ?? environment.locale;
  const response = await request.fetch(url.toString(), {
    method,
    data: options.body,
    headers: {
      Accept: "application/json",
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(authenticator ? { "X-Authenticator": authenticator } : {}),
      ...(role ? { "X-Role": role } : {}),
      ...(locale ? { "X-Locale": locale } : {}),
      ...(environment.portalName
        ? { "X-Portal": environment.portalName }
        : {}),
      ...(options.session?.token
        ? { Authorization: `Bearer ${options.session.token}` }
        : {}),
      "X-With-ACL-Meta": "true",
      "X-Timezone": getTimezone(),
      ...options.headers,
    },
  });
  const payload = await readPayload(await response.text());

  if (!response.ok()) {
    throw new NocoBaseHttpError({
      message: getNocoBaseErrorMessage(
        payload,
        `NocoBase request failed (${response.status()})`
      ),
      status: response.status(),
      payload,
      requestId: response.headers()["x-request-id"],
    });
  }

  const renewedToken = response.headers()["x-new-token"];
  if (renewedToken && options.session) options.session.token = renewedToken;
  return unwrapPayload<T>(payload, options.unwrap ?? "data");
}

export async function signInPortal(
  request: APIRequestContext,
  environment: PortalE2EEnvironment,
  credentials: PortalE2ECredentials
): Promise<PortalE2ESession> {
  const result = await portalAction<{
    token?: string;
    user?: Record<string, unknown>;
  }>(request, environment, "auth", "signIn", {
    method: "POST",
    authenticator: credentials.authenticator,
    body: {
      account: credentials.account,
      password: credentials.password,
    },
  });

  if (!result?.token) {
    throw new Error("NocoBase did not return an access token after sign-in.");
  }

  return {
    token: result.token,
    authenticator: credentials.authenticator,
    role: credentials.role,
    locale: environment.locale,
    user: result.user,
  };
}

export function checkPortalSession(
  request: APIRequestContext,
  environment: PortalE2EEnvironment,
  session: PortalE2ESession
) {
  return portalAction<Record<string, unknown>>(
    request,
    environment,
    "auth",
    "check",
    { session }
  );
}

export function signOutPortal(
  request: APIRequestContext,
  environment: PortalE2EEnvironment,
  session: PortalE2ESession
) {
  return portalAction<unknown>(request, environment, "auth", "signOut", {
    method: "POST",
    session,
  });
}
