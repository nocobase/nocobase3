export type DeliveryStatus =
  | "queued"
  | "sending"
  | "accepted"
  | "delivered"
  | "failed"
  | "submission_unknown";
export type DeliveryChannel = "in-app" | "email";

export interface DeliveryListItem {
  readonly id: string;
  readonly notificationId: string;
  readonly channel: DeliveryChannel;
  readonly status: DeliveryStatus;
  readonly version: number;
  readonly recipient: string;
  readonly provider?: string;
  readonly attemptCount: number;
  readonly lastError?: {
    readonly category?: string;
    readonly code?: string;
    readonly message?: string;
  };
  readonly source: { readonly type: string; readonly referenceId?: string };
  readonly updatedAt: string;
}

export interface DeliveryListResponse {
  readonly data: readonly DeliveryListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly accessBoundary: string;
}

export interface DeliveryDetail {
  readonly id: string;
  readonly notificationId: string;
  readonly channel: DeliveryChannel;
  readonly status: DeliveryStatus;
  readonly version: number;
  readonly recipient: {
    readonly kind?: string;
    readonly userId?: string;
    readonly email?: string;
  };
  readonly content: {
    readonly schemaVersion: number;
    readonly fields: readonly string[];
    readonly byteLengths: Readonly<Record<string, number>>;
    readonly templateKey?: string;
    readonly templateVersion?: string;
    readonly templateContentHash?: string;
    readonly messageId?: string;
  };
  readonly source: {
    readonly type: string;
    readonly referenceId?: string;
    readonly principalService: string;
  };
  readonly providerChain: readonly string[];
  readonly providerCursor: number;
  readonly attempts: readonly {
    readonly id: string;
    readonly sequence: number;
    readonly providerInstance: string;
    readonly providerType: string;
    readonly configRevision?: string;
    readonly status: string;
    readonly startedAt: string;
    readonly finishedAt?: string;
    readonly providerMessageId?: string;
    readonly error?: {
      readonly category?: string;
      readonly code?: string;
      readonly message?: string;
    };
  }[];
  readonly events: readonly {
    readonly sequence: number;
    readonly fromStatus?: string;
    readonly toStatus: string;
    readonly attemptId?: string;
    readonly reason?: string;
    readonly actor?: string;
    readonly occurredAt: string;
  }[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProviderSummary {
  readonly id: string;
  readonly order: number;
  readonly channel: "email";
  readonly type: "smtp" | "fake";
  readonly enabled: boolean;
  readonly active: boolean;
  readonly configRevision: string;
  readonly connection?: {
    readonly host: string;
    readonly port: number;
    readonly secure: boolean;
  };
  readonly secrets: readonly {
    readonly reference: string;
    readonly configured: boolean;
  }[];
}

export interface ProviderConnectionResult {
  readonly providerId: string;
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface DeliveryFilters {
  readonly status?: DeliveryStatus;
  readonly channel?: DeliveryChannel;
  readonly search?: string;
  readonly page: number;
  readonly pageSize: number;
}

export async function fetchDeliveries(
  filters: DeliveryFilters,
  signal?: AbortSignal
): Promise<DeliveryListResponse> {
  const search = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  if (filters.status) search.set("status", filters.status);
  if (filters.channel) search.set("channel", filters.channel);
  if (filters.search) search.set("search", filters.search);
  return requestJson<DeliveryListResponse>(
    `${getAdminBaseUrl()}/deliveries?${search}`,
    { signal }
  );
}

export async function fetchDelivery(
  id: string,
  signal?: AbortSignal
): Promise<DeliveryDetail> {
  const response = await requestJson<{ readonly data: DeliveryDetail }>(
    `${getAdminBaseUrl()}/deliveries/${encodeURIComponent(id)}`,
    { signal }
  );
  return response.data;
}

export async function fetchProviders(
  signal?: AbortSignal
): Promise<readonly ProviderSummary[]> {
  const response = await requestJson<{
    readonly data: readonly ProviderSummary[];
  }>(`${getAdminBaseUrl()}/providers`, { signal });
  return response.data;
}

export async function retryDelivery(
  id: string,
  input: {
    readonly expectedVersion: number;
    readonly reason: string;
    readonly acknowledgeDuplicateRisk: boolean;
  }
): Promise<void> {
  await mutation(
    `${getAdminBaseUrl()}/deliveries/${encodeURIComponent(id)}/retry`,
    input
  );
}

export async function testProvider(
  id: string
): Promise<ProviderConnectionResult> {
  const response = await mutation<{ readonly data: ProviderConnectionResult }>(
    `${getAdminBaseUrl()}/providers/${encodeURIComponent(id)}/test`,
    {}
  );
  return response.data;
}

async function mutation<T = Record<string, never>>(
  url: string,
  body: object
): Promise<T> {
  const csrf = await requestJson<{ readonly token: string }>(
    `${getAdminBaseUrl()}/csrf`
  );
  return requestJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf.token },
    body: JSON.stringify(body),
  });
}

function getAdminBaseUrl(): string {
  const portalBase =
    typeof window === "undefined" ? "" : window.NOCOBASE_PORTAL_BASE ?? "";
  return `${portalBase.replace(/\/$/, "")}/api/notifications/admin`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const value: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error =
      value &&
      typeof value === "object" &&
      "error" in value &&
      value.error &&
      typeof value.error === "object"
        ? (value.error as { code?: unknown; message?: unknown })
        : undefined;
    throw new Error(
      typeof error?.message === "string"
        ? error.message
        : `Notification administration request failed (${response.status}).`
    );
  }
  return value as T;
}
