import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface HubPageMeta {
  total?: number;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

export interface HubEnvelope<T> {
  data: T;
  meta?: HubPageMeta;
  requestId?: string;
}

export interface HubErrorPayload {
  code?: string;
  message?: string;
  retryable?: boolean;
  issues?: Array<{ path?: string; code?: string; message?: string }>;
}

export interface HubErrorEnvelope {
  error?: HubErrorPayload | string;
  requestId?: string;
}

export type HubApplicationStatus = "active" | "disabled" | "archived" | string;

export interface HubApplication {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: HubApplicationStatus;
  defaultEnvironmentId: string;
  activeReleaseId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type HubReleaseVerificationStatus =
  "pending" | "verified" | "rejected" | string;

export interface HubRelease {
  id: string;
  applicationId: string;
  version: string;
  checksum: string;
  manifest: Record<string, unknown>;
  sizeBytes: number | null;
  sourceCommit: string | null;
  verificationStatus: HubReleaseVerificationStatus;
  createdBy: string;
  createdAt: string;
}

export type HubDeploymentStatus =
  | "queued"
  | "preparing"
  | "activating"
  | "checking"
  | "switching"
  | "draining"
  | "succeeded"
  | "failed"
  | "cancelled"
  | string;

export type HubDeploymentType = "deploy" | "rollback" | "redeploy" | string;

export interface HubDeploymentFailure {
  code: string;
  message: string;
}

export interface HubDeployment {
  id: string;
  applicationId: string;
  environmentId: string;
  targetReleaseId: string;
  previousReleaseId: string | null;
  type: HubDeploymentType;
  status: HubDeploymentStatus;
  requestedBy: string;
  hostOperationId?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  failure?: HubDeploymentFailure | null;
  /** Older server projections expose the two failure fields separately. */
  failureCode?: string | null;
  failureMessage?: string | null;
  createdAt: string;
}

export interface HubDeploymentEvent {
  id: string;
  deploymentId: string;
  sequence: number;
  type: string;
  status: HubDeploymentStatus;
  message: string | null;
  hostId: string | null;
  runtimeId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface HubCapability {
  resource: string;
  actions: string[];
}

export interface HubApplicationCapabilities {
  applicationId: string;
  capabilities: HubCapability[];
}

export interface HubCapabilities {
  global?: HubCapability[];
  application?: HubApplicationCapabilities[];
}

export interface HubUserSummary {
  id: string;
  name: string;
  email: string;
  username?: string | null;
}

export interface HubMe {
  user: HubUserSummary | null;
  roles: string[];
  capabilities: HubCapabilities;
}

export type HubFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const DEFAULT_API_BASE = "/hub/api";
const defaultFetcher: HubFetcher = (input, init) => fetch(input, init);
let unauthorizedHandler: (() => void) | undefined;

export function setHubUnauthorizedHandler(
  handler: (() => void) | undefined,
): void {
  unauthorizedHandler = handler;
}

/** Resolve the browser-injected Hub API base without coupling pages to the host. */
export function getHubApiBase(): string {
  const runtime = globalThis as typeof globalThis & {
    NOCOBASE_API_URL?: unknown;
  };
  const candidate =
    typeof globalThis !== "undefined" &&
    typeof runtime.NOCOBASE_API_URL === "string"
      ? runtime.NOCOBASE_API_URL
      : "";
  const value = candidate.trim();
  if (!value || value === "false" || value === "0") return DEFAULT_API_BASE;
  return value.replace(/\/+$/, "") || DEFAULT_API_BASE;
}

export function buildHubApiUrl(path: string, base = getHubApiBase()): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(base)) {
    return new URL(normalizedPath.replace(/^\//, ""), `${base}/`).toString();
  }
  return `${base.replace(/\/+$/, "")}${normalizedPath}`;
}

export class HubApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly retryable?: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      requestId?: string;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "HubApiError";
    this.status = options.status ?? 500;
    this.code = options.code ?? "HUB_REQUEST_FAILED";
    this.requestId = options.requestId;
    this.retryable = options.retryable;
  }
}

function parseErrorPayload(payload: unknown): HubErrorPayload {
  if (typeof payload === "string") return { message: payload };
  if (!payload || typeof payload !== "object") return {};
  const value = payload as HubErrorPayload;
  return {
    code: typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    retryable: value.retryable,
    issues: value.issues,
  };
}

/** Validate and return the stable Hub response envelope. */
export function unwrapHubResponse<T>(
  payload: unknown,
  status = 200,
): HubEnvelope<T> {
  if (!payload || typeof payload !== "object") {
    throw new HubApiError("Hub returned an invalid response.", { status });
  }

  const value = payload as Partial<HubEnvelope<T>> & HubErrorEnvelope;
  if (value.error) {
    const error = parseErrorPayload(value.error);
    throw new HubApiError(error.message ?? "Hub request failed.", {
      status,
      code: error.code,
      requestId: value.requestId,
      retryable: error.retryable,
    });
  }

  if (status >= 400) {
    throw new HubApiError("Hub request failed.", {
      status,
      requestId: value.requestId,
    });
  }

  if (!("data" in value)) {
    throw new HubApiError("Hub returned a response without data.", {
      status,
      requestId: value.requestId,
    });
  }

  return {
    data: value.data as T,
    meta: value.meta,
    requestId: value.requestId,
  };
}

export async function hubRequest<T>(
  path: string,
  init: RequestInit = {},
  fetcher: HubFetcher = defaultFetcher,
): Promise<HubEnvelope<T>> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetcher(buildHubApiUrl(path), {
      ...init,
      headers,
      credentials: init.credentials ?? "include",
    });
  } catch (error) {
    throw new HubApiError(
      error instanceof Error ? error.message : "Unable to reach Hub.",
      { code: "NETWORK_ERROR", status: 0, retryable: true },
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HubApiError("Hub returned an unreadable response.", {
      status: response.status,
    });
  }
  try {
    return unwrapHubResponse<T>(payload, response.status);
  } catch (error) {
    if (
      error instanceof HubApiError &&
      (error.status === 401 || error.code === "UNAUTHORIZED")
    ) {
      unauthorizedHandler?.();
    }
    throw error;
  }
}

export function hubGet<T>(
  path: string,
  fetcher?: HubFetcher,
): Promise<HubEnvelope<T>> {
  return hubRequest<T>(path, { method: "GET" }, fetcher);
}

export function hubPost<T>(
  path: string,
  body: unknown,
  fetcher?: HubFetcher,
): Promise<HubEnvelope<T>> {
  return hubRequest<T>(
    path,
    { method: "POST", body: JSON.stringify(body) },
    fetcher,
  );
}

function normalizeCapabilityPart(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

function resourceMatches(actual: string, requested: string): boolean {
  const left = normalizeCapabilityPart(actual);
  const right = normalizeCapabilityPart(requested);
  return (
    left === right || left === right.replace(/s$/, "") || right === `${left}s`
  );
}

/** Capability checks are intentionally fail-closed; the API remains authoritative. */
export function hasHubCapability(
  capabilities: HubCapabilities | undefined,
  resource: string,
  action: string,
  applicationId?: string,
): boolean {
  if (!capabilities) return false;
  const requestedAction = normalizeCapabilityPart(action);
  const applicationEntries = applicationId
    ? (capabilities.application ?? [])
        .filter((group) => group.applicationId === applicationId)
        .flatMap((group) => group.capabilities)
    : [];
  const entries = [...(capabilities.global ?? []), ...applicationEntries];
  return entries.some((entry) => {
    const resourceOkay =
      entry.resource === "*" || resourceMatches(entry.resource, resource);
    if (!resourceOkay) return false;
    return entry.actions.some(
      (candidate) =>
        candidate === "*" ||
        normalizeCapabilityPart(candidate) === requestedAction,
    );
  });
}

export interface HubQueryState<T> {
  data: T | null;
  meta: HubPageMeta | undefined;
  requestId: string | undefined;
  loading: boolean;
  error: HubApiError | Error | null;
  reload: () => void;
}

export interface UseHubQueryOptions<T> {
  path: string | null;
  fetcher?: HubFetcher;
  initialData?: T | null;
  enabled?: boolean;
  transform?: (value: T) => T;
}

export function useHubQuery<T>({
  path,
  fetcher = defaultFetcher,
  initialData = null,
  enabled = true,
  transform,
}: UseHubQueryOptions<T>): HubQueryState<T> {
  const [data, setData] = useState<T | null>(initialData);
  const [meta, setMeta] = useState<HubPageMeta | undefined>();
  const [requestId, setRequestId] = useState<string | undefined>();
  const [loading, setLoading] = useState(
    Boolean(path && enabled && !initialData),
  );
  const [error, setError] = useState<HubApiError | Error | null>(null);
  const [revision, setRevision] = useState(0);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  useEffect(() => {
    let cancelled = false;
    if (!path || !enabled) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    void hubGet<T>(path, fetcher)
      .then((result) => {
        if (cancelled) return;
        const next = transformRef.current
          ? transformRef.current(result.data)
          : result.data;
        setData(next);
        setMeta(result.meta);
        setRequestId(result.requestId);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason : new Error(String(reason)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetcher, path, enabled, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return useMemo(
    () => ({ data, meta, requestId, loading, error, reload }),
    [data, error, loading, meta, reload, requestId],
  );
}
