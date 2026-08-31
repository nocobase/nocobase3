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

/**
 * The path the application is mounted at, always with a leading and a trailing slash: `/main/` for an application
 * served from `/main`, and `/` for one served from the origin root.
 *
 * The server injects `window.APP_BASE_PATH` at runtime; `import.meta.env.BASE_URL` is what the bundler knows at build
 * time and covers the development server, where nothing is injected.
 */
export function resolveAppBase(): string {
  const trimmed = readAppBasePath().replace(/^\/+|\/+$/gu, '');
  return trimmed ? `/${trimmed}/` : '/';
}

export function resolveAppUrl(path: string = '/'): string {
  if (typeof window === 'undefined') {
    return path;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) {
    return path;
  }
  const url = new URL(
    path.replace(/^\/+/, ''),
    `${window.location.origin}${resolveAppBase()}`,
  );
  return `${url.pathname}${url.search}${url.hash}`;
}

function readAppBasePath(): string {
  const runtime =
    typeof window === 'undefined'
      ? undefined
      : (window as Window & { APP_BASE_PATH?: unknown });
  if (typeof runtime?.APP_BASE_PATH === 'string') {
    return runtime.APP_BASE_PATH;
  }
  const viteEnv = (
    import.meta as ImportMeta & {
      env?: { BASE_URL?: string };
    }
  ).env;
  return viteEnv?.BASE_URL ?? '/';
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
