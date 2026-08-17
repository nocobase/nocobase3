import {
  API_ORIGIN,
  API_URL,
  NOCOBASE_AUTHENTICATOR,
} from "../runtime/constants.ts";
import { getNocoBasePortalName } from "../runtime/config.ts";
import { portalRuntimeStore } from "../runtime/store.ts";
import { authSession } from "./auth-session.ts";
import {
  getNocoBaseErrorMessage,
  isNocoBaseLifecycleError,
  NocoBaseHttpError,
  normalizeNocoBaseRuntimeError,
} from "./error.ts";

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

export type NocoBaseRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  token?: string;
  authenticator?: string | null;
  role?: string;
  includeRole?: boolean;
  withAclMeta?: boolean;
  headers?: Record<string, string>;
  accept?: "json" | "stream";
  unwrap?: "data" | "deep-data" | "none";
};

const getBrowserLocale = () =>
  typeof navigator === "undefined" ? undefined : navigator.language;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const readResponsePayload = async (response: Response) => {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const createResponseError = (
  response: Response,
  payload: unknown,
  fallback: string
) =>
  new NocoBaseHttpError({
    status: response.status,
    payload,
    requestId: response.headers.get("x-request-id") ?? undefined,
    message: getNocoBaseErrorMessage(payload, fallback),
  });

const getClientTimezone = () => {
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
};

const unwrapPayload = (
  payload: unknown,
  mode: NocoBaseRequestOptions["unwrap"]
) => {
  if (mode === "none") return payload;
  if (!payload || typeof payload !== "object") return payload;
  const data = (payload as { data?: unknown }).data;
  if (mode === "deep-data" && data && typeof data === "object") {
    return (data as { data?: unknown }).data ?? data;
  }
  return data ?? payload;
};

export class NocoBaseClient {
  private readonly apiOrigin?: string;
  private runtimeLocale?: string;

  constructor(
    private readonly apiUrl = API_URL,
    apiOrigin = getUrlOrigin(apiUrl) ?? API_ORIGIN
  ) {
    this.apiOrigin = apiOrigin;
  }

  getApiUrl() {
    return this.apiUrl;
  }

  getAppName() {
    return authSession.appName;
  }

  resolveUrl(value: string) {
    if (!value || /^[a-z][a-z\d+.-]*:/i.test(value)) return value;
    const base =
      this.apiOrigin ??
      (typeof window === "undefined" ? undefined : window.location.origin);
    if (!base) return value;
    try {
      return new URL(value, `${base.replace(/\/$/, "")}/`).toString();
    } catch {
      return value;
    }
  }

  getToken() {
    return authSession.get("token") ?? import.meta.env?.NOCOBASE_API_TOKEN;
  }

  getStoredAuthenticator() {
    return authSession.get("auth");
  }

  getAuthenticator() {
    return this.getStoredAuthenticator() ?? NOCOBASE_AUTHENTICATOR;
  }

  setAuthenticator(authenticator?: string | null) {
    authSession.set("auth", authenticator);
  }

  setToken(token?: string | null) {
    authSession.set("token", token);
  }

  getRole() {
    return authSession.get("role") ?? authSession.getCookie("role");
  }

  setRole(role?: string | null) {
    authSession.set("role", role);
  }

  getStoredLocale() {
    return authSession.get("locale");
  }

  getLocale() {
    return this.getStoredLocale() ?? this.runtimeLocale ?? getBrowserLocale();
  }

  setLocale(locale?: string | null) {
    authSession.set("locale", locale);
  }

  clearAuthentication() {
    authSession.clearAuthentication();
  }

  setRuntimeLocale(locale?: string | null) {
    this.runtimeLocale = locale || undefined;
  }

  buildUrl(endpoint: string, query?: Record<string, QueryValue>) {
    const base = `${this.apiUrl.replace(/\/$/, "")}/${endpoint.replace(
      /^\//,
      ""
    )}`;
    const url = /^https?:\/\//.test(base)
      ? new URL(base)
      : new URL(base, window.location.origin);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
      } else if (value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  getHeaders({
    method = "GET",
    token = this.getToken(),
    authenticator,
    role = this.getRole(),
    includeRole = true,
    withAclMeta = true,
    headers,
    accept = "json",
    body,
  }: Pick<
    NocoBaseRequestOptions,
    | "method"
    | "token"
    | "authenticator"
    | "role"
    | "includeRole"
    | "withAclMeta"
    | "headers"
    | "accept"
    | "body"
  > = {}): Record<string, string> {
    const resolvedAuthenticator =
      authenticator === null
        ? undefined
        : authenticator ?? this.getStoredAuthenticator();
    const locale = this.getLocale();
    const portalName = getNocoBasePortalName();
    const formData =
      typeof FormData !== "undefined" && body instanceof FormData;
    const requestHeaders: Record<string, string> = {
      Accept: accept === "stream" ? "text/event-stream" : "application/json",
      ...(body !== undefined && !formData
        ? { "Content-Type": "application/json" }
        : {}),
      ...(accept === "stream"
        ? { "Cache-Control": "no-cache", Pragma: "no-cache" }
        : {}),
      ...(resolvedAuthenticator
        ? { "X-Authenticator": resolvedAuthenticator }
        : {}),
      ...(includeRole && role ? { "X-Role": role } : {}),
      ...(withAclMeta ? { "X-With-ACL-Meta": "true" } : {}),
      ...(locale ? { "X-Locale": locale } : {}),
      ...(portalName ? { "X-Portal": portalName } : {}),
      "X-Timezone": getClientTimezone(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    };
    const csrfToken = authSession.getCookie("csrfToken");
    if (
      !SAFE_METHODS.has(method) &&
      csrfToken &&
      !Object.keys(requestHeaders).some(
        (key) => key.toLowerCase() === "x-csrf-token"
      )
    ) {
      requestHeaders["X-CSRF-Token"] = csrfToken;
    }
    return requestHeaders;
  }

  async request<T>(
    endpoint: string,
    options: NocoBaseRequestOptions = {}
  ): Promise<T> {
    const method =
      options.method ?? (options.body === undefined ? "GET" : "POST");
    const headers = this.getHeaders({ ...options, method, body: options.body });
    const response = await fetch(this.buildUrl(endpoint, options.query), {
      method,
      headers,
      credentials: "include",
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body),
      signal: options.signal,
    });
    this.captureRenewedToken(response);
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      const error = createResponseError(
        response,
        payload,
        `NocoBase request failed (${response.status})`
      );
      this.reportRuntimeResponseError(error);
      throw error;
    }
    return unwrapPayload(payload, options.unwrap ?? "data") as T;
  }

  action<T>(
    resource: string,
    action: string,
    options: Omit<NocoBaseRequestOptions, "accept"> = {}
  ) {
    const method =
      options.method ?? (["get", "list"].includes(action) ? "GET" : "POST");
    return this.request<T>(`${resource}:${action}`, { ...options, method });
  }

  async stream(
    endpoint: string,
    options: Omit<NocoBaseRequestOptions, "accept" | "unwrap"> = {}
  ) {
    const method = options.method ?? "POST";
    const headers = this.getHeaders({
      ...options,
      method,
      accept: "stream",
      body: options.body,
    });
    const response = await fetch(this.buildUrl(endpoint, options.query), {
      method,
      headers,
      credentials: "include",
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
    this.captureRenewedToken(response);
    if (!response.ok || !response.body) {
      const payload = await readResponsePayload(response);
      const error = createResponseError(
        response,
        payload,
        `NocoBase stream failed (${response.status})`
      );
      this.reportRuntimeResponseError(error);
      throw error;
    }
    return response.body;
  }

  private reportRuntimeResponseError(error: NocoBaseHttpError) {
    const runtimeError = normalizeNocoBaseRuntimeError(error, "http");
    if (!isNocoBaseLifecycleError(runtimeError)) return;
    portalRuntimeStore.setError(runtimeError);
  }

  private captureRenewedToken(response: Response) {
    const token = response.headers.get("x-new-token");
    if (token) this.setToken(token);
  }
}

const getUrlOrigin = (value: string) => {
  if (!/^https?:\/\//i.test(value)) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
};

export const nocobaseClient = new NocoBaseClient();

export * from "./auth-session.ts";
export * from "./error.ts";
export * from "./websocket.ts";
