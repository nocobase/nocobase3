import {
  createApiClient,
  resolveAppUrl,
  type ApiClient,
} from '@nocobase/app-client';

export type AppActionQuery = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

export interface AppActionOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly query?: AppActionQuery;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

const defaultApiClient: ApiClient = createApiClient({
  baseURL: resolveAppUrl('/api'),
});

export function requestAIAction<T>(
  resource: string,
  action: string,
  options: AppActionOptions = {},
  api: ApiClient = defaultApiClient,
): Promise<T> {
  return requestAction(api, `ai/${resource}:${action}`, options);
}

export function requestAppAction<T>(
  resource: string,
  action: string,
  options: AppActionOptions = {},
  api: ApiClient = defaultApiClient,
): Promise<T> {
  return requestAction(api, `${resource}:${action}`, options);
}

function requestAction<T>(
  api: ApiClient,
  endpoint: string,
  options: AppActionOptions,
): Promise<T> {
  return api.request<T>({
    path: endpoint,
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    ...(options.query === undefined ? {} : { query: options.query }),
    ...(options.body === undefined ? {} : { json: options.body }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
}
