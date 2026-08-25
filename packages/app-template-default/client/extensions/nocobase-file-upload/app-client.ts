interface AppFileClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export const appFileClient: AppFileClient = {
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await globalThis.fetch(buildAppFileUrl(path), {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const text = await response.text();
    const payload = text ? parsePayload(text) : undefined;
    if (!response.ok) {
      throw new Error(
        readErrorMessage(payload) ??
          `Unable to complete file request (${response.status}).`,
      );
    }
    return payload as T;
  },
};

export function buildAppFileUrl(
  path: string,
  query?: Readonly<Record<string, string>>,
): string {
  const base = resolveAppUrl(`/api/${path.replace(/^\/+/, '')}`);
  const search = query ? new URLSearchParams(query).toString() : '';
  return search ? `${base}${base.includes('?') ? '&' : '?'}${search}` : base;
}

function resolveAppUrl(path: string): string {
  if (typeof window === 'undefined') {
    return path;
  }
  const runtime = window as Window & { NOCOBASE_PORTAL_BASE?: unknown };
  const viteEnv = (
    import.meta as ImportMeta & {
      env?: { BASE_URL?: string };
    }
  ).env;
  const configuredBase =
    typeof runtime.NOCOBASE_PORTAL_BASE === 'string'
      ? runtime.NOCOBASE_PORTAL_BASE
      : (viteEnv?.BASE_URL ?? '/');
  const base =
    configuredBase === '/'
      ? '/'
      : `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`;
  const url = new URL(
    path.replace(/^\/+/, ''),
    `${window.location.origin}${base}`,
  );
  return `${url.pathname}${url.search}${url.hash}`;
}

function parsePayload(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function readErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  if ('message' in payload) {
    return String(payload.message);
  }
  if ('error' in payload) {
    return String(payload.error);
  }
  return undefined;
}
