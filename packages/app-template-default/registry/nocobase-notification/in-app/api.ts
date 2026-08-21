export type InboxMutationAction = "read" | "unread" | "delete";

export interface InboxItem {
  readonly id: string;
  readonly deliveryId: string;
  readonly notificationId: string;
  readonly title: string;
  readonly body: string;
  readonly actionUrl?: string;
  readonly readAt?: string;
  readonly createdAt: string;
  readonly version: number;
}

export interface InboxFilters {
  readonly unreadOnly?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface InboxListResponse {
  readonly data: readonly InboxItem[];
  readonly nextCursor?: string;
}

export async function fetchInbox(
  filters: InboxFilters,
  signal?: AbortSignal,
): Promise<InboxListResponse> {
  const query = new URLSearchParams({ limit: String(filters.limit ?? 25) });
  if (filters.unreadOnly) query.set("unreadOnly", "true");
  if (filters.cursor) query.set("cursor", filters.cursor);
  return requestJson<InboxListResponse>(`${getInboxBaseUrl()}?${query}`, {
    signal,
  });
}

export async function fetchUnreadCount(signal?: AbortSignal): Promise<number> {
  const response = await requestJson<{ readonly count: number }>(
    `${getInboxBaseUrl()}/unread-count`,
    {
      signal,
    },
  );
  return response.count;
}

export async function mutateInboxItem(
  id: string,
  action: InboxMutationAction,
  expectedVersion: number,
): Promise<InboxItem> {
  const response = await mutation<{ readonly data: InboxItem }>(
    `${getInboxBaseUrl()}/${encodeURIComponent(id)}`,
    { action, expectedVersion },
  );
  return response.data;
}

export async function markInboxRead(): Promise<number> {
  const response = await mutation<{ readonly updated: number }>(
    `${getInboxBaseUrl()}/read-all`,
    {},
  );
  return response.updated;
}

async function mutation<T>(url: string, body: object): Promise<T> {
  const csrf = await requestJson<{ readonly token: string }>(
    `${getInboxBaseUrl()}/csrf`,
  );
  return requestJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrf.token },
    body: JSON.stringify(body),
  });
}

function getInboxBaseUrl(): string {
  const portalBase =
    typeof window === "undefined" ? "" : (window.NOCOBASE_PORTAL_BASE ?? "");
  return `${portalBase.replace(/\/$/, "")}/api/notifications/in-app`;
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
        ? (value.error as { readonly message?: unknown })
        : undefined;
    throw new Error(
      typeof error?.message === "string"
        ? error.message
        : `Inbox request failed (${response.status}).`,
    );
  }
  return value as T;
}
