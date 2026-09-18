import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useMemo } from 'react';
import type {
  AccessScope,
  AuthorizationRecordOption,
} from '@nocobase/app-plugin-authorization/client/management';
export interface DefaultAccessRule {
  resource: { type: string; id: string };
  actions: readonly { action: string; scopeKey?: string; scope: AccessScope }[];
}
class DefaultAccessClient {
  constructor(private readonly api: ApiClient) {}
  listDefaultAccess(): Promise<readonly DefaultAccessRule[]> {
    return this.get<readonly DefaultAccessRule[]>('authz/default-access');
  }
  setDefaultAccess(rule: DefaultAccessRule): Promise<DefaultAccessRule> {
    return this.send<DefaultAccessRule>('authz/default-access', 'PUT', rule);
  }
  async deleteDefaultAccess(resource: {
    type: string;
    id: string;
  }): Promise<void> {
    await this.api.request({
      path: `authz/default-access/${encodeURIComponent(resource.type)}/${encodeURIComponent(resource.id)}`,
      method: 'DELETE',
    });
  }
  listDefaultAccessRecords(
    collection: string,
  ): Promise<readonly AuthorizationRecordOption[]> {
    return this.get<readonly AuthorizationRecordOption[]>(
      `authz/default-access/records/${encodeURIComponent(collection)}`,
    );
  }
  private get<T>(path: string): Promise<T> {
    return this.api
      .request<{ data: T }>({ path })
      .then((response) => response.data);
  }
  private send<T>(
    path: string,
    method: 'POST' | 'PUT',
    json: unknown,
  ): Promise<T> {
    return this.api
      .request<{ data: T }>({ path, method, json })
      .then((response) => response.data);
  }
}
export function useDefaultAccessClient(): DefaultAccessClient {
  const api = useApiClient();
  return useMemo(() => new DefaultAccessClient(api), [api]);
}
