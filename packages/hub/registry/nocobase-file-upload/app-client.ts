interface AppFileClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export const appFileClient: AppFileClient = {
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(buildAppFileUrl(path), {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const text = await response.text();
    const payload: unknown = text ? parsePayload(text) : undefined;
    if (!response.ok) {
      throw new Error(readErrorMessage(payload, response.status));
    }
    return payload as T;
  },
};

export function buildAppFileUrl(
  path: string,
  query?: Readonly<Record<string, string>>,
): string {
  const base = resolveCurrentAppUrl(`/api/${path.replace(/^\/+/, '')}`);
  if (!query) {
    return base;
  }
  const search = new URLSearchParams(query).toString();
  return search ? `${base}${base.includes('?') ? '&' : '?'}${search}` : base;
}

function resolveCurrentAppUrl(path: string): string {
  if (typeof window === 'undefined') {
    return path;
  }
  const runtime = window as Window & { NOCOBASE_PORTAL_BASE?: unknown };
  const viteEnv = (import.meta as ImportMeta & { env?: { BASE_URL?: string } })
    .env;
  const configuredBase =
    typeof runtime.NOCOBASE_PORTAL_BASE === 'string'
      ? runtime.NOCOBASE_PORTAL_BASE
      : (viteEnv?.BASE_URL ?? '/');
  const base =
    configuredBase === '/'
      ? '/'
      : `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`;
  return new URL(path.replace(/^\/+/, ''), `${window.location.origin}${base}`)
    .pathname;
}

function parsePayload(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function readErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    return String(payload.message);
  }
  if (payload && typeof payload === 'object' && 'error' in payload) {
    return String(payload.error);
  }
  return `Unable to complete file request (${status}).`;
}
