export interface AppClientOptions {
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class AppRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
    this.name = 'AppRequestError';
  }
}

export interface AppClient {
  request<T = unknown>(path: string, init?: RequestInit): Promise<T>;
}

export function createAppClient(options: AppClientOptions = {}): AppClient {
  const request = options.fetch ?? globalThis.fetch;
  const baseURL = (options.baseURL ?? resolveAppUrl('/api')).replace(/\/$/, '');
  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const response = await request(`${baseURL}/${path.replace(/^\/+/, '')}`, {
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
        throw new AppRequestError(
          readErrorMessage(payload),
          response.status,
          payload,
        );
      }
      return payload as T;
    },
  };
}

export function resolveAppUrl(path: string = '/'): string {
  if (typeof window === 'undefined') {
    return path;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) {
    return path;
  }
  const runtime = window as Window & { NOCOBASE_PORTAL_BASE?: unknown };
  const viteEnv = (
    import.meta as ImportMeta & {
      env?: { BASE_URL?: string };
    }
  ).env;
  const base =
    typeof runtime.NOCOBASE_PORTAL_BASE === 'string'
      ? runtime.NOCOBASE_PORTAL_BASE
      : (viteEnv?.BASE_URL ?? '/');
  const normalizedBase =
    base === '/' ? '/' : `/${base.replace(/^\/+|\/+$/g, '')}/`;
  const url = new URL(
    path.replace(/^\/+/, ''),
    `${window.location.origin}${normalizedBase}`,
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

function readErrorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    return String(payload.message);
  }
  return 'NocoBase request failed.';
}
