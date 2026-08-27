export interface AppClientOptions {
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export interface AppClientServiceRegistry {
  get<Service>(name: string): Service | undefined;
  has(name: string): boolean;
  register<Service>(name: string, service: Service): void;
  require<Service>(name: string): Service;
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
  readonly services: AppClientServiceRegistry;
}

export function createAppClient(options: AppClientOptions = {}): AppClient {
  const request = options.fetch ?? globalThis.fetch;
  const baseURL = (options.baseURL ?? resolveAppUrl('/api')).replace(/\/$/, '');
  const services = createAppClientServiceRegistry();
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
    services,
  };
}

export function createAppClientServiceRegistry(): AppClientServiceRegistry {
  const services = new Map<string, unknown>();

  return {
    get<Service>(name: string): Service | undefined {
      return services.get(normalizeServiceName(name)) as Service | undefined;
    },
    has(name: string): boolean {
      return services.has(normalizeServiceName(name));
    },
    register<Service>(name: string, service: Service): void {
      const normalizedName = normalizeServiceName(name);
      if (services.has(normalizedName)) {
        if (services.get(normalizedName) === service) {
          return;
        }
        throw new Error(
          `App client service "${normalizedName}" is already registered.`,
        );
      }
      services.set(normalizedName, service);
    },
    require<Service>(name: string): Service {
      const normalizedName = normalizeServiceName(name);
      if (!services.has(normalizedName)) {
        throw new Error(
          `App client service "${normalizedName}" is not registered.`,
        );
      }
      return services.get(normalizedName) as Service;
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

function normalizeServiceName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error('An app client service must define a non-empty name.');
  }
  return normalized;
}
