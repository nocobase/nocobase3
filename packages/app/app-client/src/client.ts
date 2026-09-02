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
  stream(path: string, init?: RequestInit): Promise<ReadableStream<Uint8Array>>;
}

export function createAppClient(options: AppClientOptions = {}): AppClient {
  const request = options.fetch ?? globalThis.fetch;
  const baseURL = (options.baseURL ?? resolveAppUrl('/api')).replace(/\/$/, '');

  const execute = (
    path: string,
    init: RequestInit,
    accept: string,
  ): Promise<Response> =>
    request(`${baseURL}/${path.replace(/^\/+/, '')}`, {
      ...init,
      credentials: 'include',
      headers: createRequestHeaders(init, accept),
    });

  return {
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const response = await execute(path, init, 'application/json');
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

    async stream(
      path: string,
      init: RequestInit = {},
    ): Promise<ReadableStream<Uint8Array>> {
      const response = await execute(path, init, 'text/event-stream');
      if (!response.ok) {
        const text = await response.text();
        const payload = text ? parsePayload(text) : undefined;
        throw new AppRequestError(
          readErrorMessage(payload),
          response.status,
          payload,
        );
      }
      if (!response.body) {
        throw new AppRequestError(
          'NocoBase streaming response has no body.',
          response.status,
          undefined,
        );
      }
      return response.body;
    },
  };
}

function createRequestHeaders(init: RequestInit, accept: string): Headers {
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', accept);
  }
  if (
    init.body != null &&
    !isFormData(init.body) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

function isFormData(body: BodyInit): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
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
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    const detail = payload as { message?: unknown; error?: unknown };
    const message = detail.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    const nested = detail.error;
    if (nested && typeof nested === 'object') {
      const nestedMessage = (nested as { message?: unknown }).message;
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        return nestedMessage;
      }
    }
  }
  return 'NocoBase request failed.';
}
