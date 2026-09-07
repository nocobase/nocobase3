import type { ApiRequestMethod } from './types.js';

export interface ApiClientErrorOptions {
  readonly status: number;
  readonly payload?: unknown;
  readonly requestId?: string;
  readonly code?: string;
  readonly method: ApiRequestMethod;
  readonly url: string;
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly payload: unknown;
  public readonly requestId?: string;
  public readonly code?: string;
  public readonly method: ApiRequestMethod;
  public readonly url: string;

  public constructor(message: string, options: ApiClientErrorOptions) {
    super(message);
    this.name = 'ApiClientError';
    this.status = options.status;
    this.payload = options.payload;
    this.requestId = options.requestId;
    this.code = options.code;
    this.method = options.method;
    this.url = options.url;
  }
}
