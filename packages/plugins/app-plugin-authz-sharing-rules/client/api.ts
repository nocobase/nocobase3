import type { ApiClient } from '@nocobase/app-client';
import { getAuthorizationApiClient } from '@nocobase/app-plugin-authorization/client/management';
import type {
  AccessScope,
  AuthorizationSubject,
  AuthorizationRecordOption,
} from '@nocobase/app-plugin-authorization/client/management';
export interface SharingRule {
  key: string;
  title?: string;
  resource: { type: string; id: string };
  actions: readonly {
    action: string;
    selection:
      | { type: 'records'; ids: readonly string[] }
      | { type: 'policy'; policy: AccessScope };
  }[];
  subjects: readonly AuthorizationSubject[];
  reason?: string;
}
class SharingRulesClient {
  private get api(): ApiClient {
    return getAuthorizationApiClient();
  }
  listSharingRules(): Promise<readonly SharingRule[]> {
    return this.get<readonly SharingRule[]>('authz/sharing-rules');
  }
  listSharingRecords(
    collection: string,
  ): Promise<readonly AuthorizationRecordOption[]> {
    return this.get<readonly AuthorizationRecordOption[]>(
      `authz/sharing-rules/records/${encodeURIComponent(collection)}`,
    );
  }
  createSharingRule(rule: SharingRule): Promise<SharingRule> {
    return this.send<SharingRule>('authz/sharing-rules', 'POST', rule);
  }
  updateSharingRule(key: string, rule: SharingRule): Promise<SharingRule> {
    return this.send<SharingRule>(
      `authz/sharing-rules/${encodeURIComponent(key)}`,
      'PUT',
      rule,
    );
  }
  async deleteSharingRule(key: string): Promise<void> {
    await this.api.request({
      path: `authz/sharing-rules/${encodeURIComponent(key)}`,
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
export const authz: SharingRulesClient = new SharingRulesClient();
