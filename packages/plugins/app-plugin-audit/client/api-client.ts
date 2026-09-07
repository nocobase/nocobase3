import type { AppClient } from '@nocobase/app-client';
import type {
  AuditEventDto,
  AuditEventsPage,
  AuditEventsQuery,
} from './contracts.js';

export type AuditReadScope = Pick<AuditEventsQuery, 'store' | 'target'>;

function params(query: AuditEventsQuery): string {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      values.set(
        key,
        key === 'target'
          ? JSON.stringify({
              dataSource: query.target?.dataSource,
              resource: query.target?.resource,
              key: query.target?.key,
            })
          : String(value),
      );
    }
  }
  return values.toString();
}

export class AuditApiClient {
  constructor(private readonly client: AppClient) {}

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.client.request<{ data: T }>(path, { signal });
    if (!response || !Object.hasOwn(response, 'data')) {
      throw new Error('Invalid audit response envelope.');
    }
    return response.data;
  }

  list(
    query: AuditEventsQuery,
    signal?: AbortSignal,
  ): Promise<AuditEventsPage> {
    return this.get('audit/events?' + params(query), signal);
  }

  detail(
    id: string,
    scope: AuditReadScope,
    signal?: AbortSignal,
  ): Promise<AuditEventDto> {
    return this.get(
      'audit/events/' + encodeURIComponent(id) + '?' + params(scope),
      signal,
    );
  }

  operation(
    id: string,
    scope: AuditReadScope,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<AuditEventsPage> {
    return this.get(
      'audit/operations/' +
        encodeURIComponent(id) +
        '?' +
        params({ ...scope, cursor, pageSize: 25 }),
      signal,
    );
  }
}

export function auditErrorKey(error: unknown): string {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? error.status
      : undefined;
  if (status === 401 || status === 403) return 'events.forbidden';
  if (status === 404) return 'events.notFound';
  if (status === 503) return 'events.degraded';
  if (status === 400) return 'events.invalid';
  return 'events.networkError';
}
