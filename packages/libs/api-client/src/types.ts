export type ApiRequestMethod =
  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export type ApiQueryScalar = string | number | boolean | null;

export type ApiQueryValue =
  ApiQueryScalar | readonly ApiQueryScalar[] | undefined;

export type ApiQuery = Readonly<Record<string, ApiQueryValue>>;

export interface ApiRequestBaseOptions {
  readonly path: string;
  readonly method?: ApiRequestMethod;
  readonly query?: ApiQuery;
  readonly headers?: HeadersInit;
  readonly signal?: AbortSignal;
  readonly credentials?: RequestCredentials;
}

export interface ApiJsonRequestOptions<
  TJson = unknown,
> extends ApiRequestBaseOptions {
  readonly json?: TJson;
  readonly body?: never;
}

export interface ApiBodyRequestOptions extends ApiRequestBaseOptions {
  readonly json?: never;
  readonly body?: BodyInit;
}

export type ApiRequestOptions<TJson = unknown> =
  ApiJsonRequestOptions<TJson> | ApiBodyRequestOptions;

export type ApiClientHeaders =
  HeadersInit | (() => HeadersInit | Promise<HeadersInit>);

export interface CreateApiClientOptions {
  readonly baseURL: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly headers?: ApiClientHeaders;
  readonly credentials?: RequestCredentials;
}
