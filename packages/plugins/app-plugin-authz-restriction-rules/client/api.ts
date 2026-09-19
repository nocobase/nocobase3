import { useApiClient, type ApiClient } from '@nocobase/app-client';
import { useMemo } from 'react';
import type {
  AccessScope,
  AuthorizationSubject,
  AuthorizationRecordOption,
} from '@nocobase/app-plugin-authorization/client/management';
export interface RestrictionRule {
  key: string;
  title?: string | { key: string; ns: string };
  resource: { type: string; id: string };
  actions: readonly { action: string; scopeKey?: string; scope: AccessScope }[];
  subjects: readonly AuthorizationSubject[];
  reason?: string;
}
class RestrictionRulesClient {
  constructor(private readonly api: ApiClient) {}
  listRestrictionRules(): Promise<readonly RestrictionRule[]> {
    return this.get<readonly RestrictionRule[]>('authz/restriction-rules');
  }
  listRestrictionRecords(
    collection: string,
  ): Promise<readonly AuthorizationRecordOption[]> {
    return this.get<readonly AuthorizationRecordOption[]>(
      `authz/restriction-rules/records/${encodeURIComponent(collection)}`,
    );
  }
  createRestrictionRule(rule: RestrictionRule): Promise<RestrictionRule> {
    return this.send<RestrictionRule>('authz/restriction-rules', 'POST', rule);
  }
  updateRestrictionRule(
    key: string,
    rule: RestrictionRule,
  ): Promise<RestrictionRule> {
    return this.send<RestrictionRule>(
      `authz/restriction-rules/${encodeURIComponent(key)}`,
      'PUT',
      rule,
    );
  }
  async deleteRestrictionRule(key: string): Promise<void> {
    await this.api.request({
      path: `authz/restriction-rules/${encodeURIComponent(key)}`,
      method: 'DELETE',
    });
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
export function useRestrictionRulesClient(): RestrictionRulesClient {
  const api = useApiClient();
  return useMemo(() => new RestrictionRulesClient(api), [api]);
}
