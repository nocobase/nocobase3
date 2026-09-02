import { createAppClient, type AppClient } from '@nocobase/app-client';

export type AppActionQuery = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

export interface AppActionOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly query?: AppActionQuery;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

const defaultAppClient: AppClient = createAppClient();

export function requestAIAction<T>(
  resource: string,
  action: string,
  options: AppActionOptions = {},
  client: AppClient = defaultAppClient,
): Promise<T> {
  return requestAction(client, `ai/${resource}:${action}`, options);
}

export function requestAppAction<T>(
  resource: string,
  action: string,
  options: AppActionOptions = {},
  client: AppClient = defaultAppClient,
): Promise<T> {
  return requestAction(client, `${resource}:${action}`, options);
}

function requestAction<T>(
  client: AppClient,
  endpoint: string,
  options: AppActionOptions,
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const query = search.toString();
  const body =
    options.body === undefined ? undefined : JSON.stringify(options.body);
  return client.request<T>(`${endpoint}${query ? `?${query}` : ''}`, {
    method: options.method ?? (body === undefined ? 'GET' : 'POST'),
    ...(body === undefined ? {} : { body }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
}
