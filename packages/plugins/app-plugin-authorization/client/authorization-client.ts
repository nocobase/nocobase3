import type { AppClient } from '@nocobase/app-client';

export interface PermissionGrantAction {
  action: string;
  policy?: Readonly<Record<string, unknown>> & { type: string };
}

export interface PermissionGrant {
  resource: { type: string; id: string };
  actions: readonly PermissionGrantAction[];
}

export interface PermissionSet {
  key: string;
  title?: string;
  grants: readonly PermissionGrant[];
}

export interface PermissionSetAssignment {
  id: string;
  subject: { type: string; id: string };
  permissionSet: string;
}

export interface PermissionSetInput {
  key: string;
  title?: string;
  grants: readonly PermissionGrant[];
}

export interface PermissionAssignmentInput {
  subject: { type: string; id: string };
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}
export interface ResourceOption extends SelectOption {
  actions?: readonly SelectOption[];
}
export interface ResourceTypeOption {
  value: string;
  label: string;
  resources: readonly ResourceOption[];
  actions: readonly SelectOption[];
}
export interface DatabaseCollectionOption {
  name: string;
  title?: string;
  description?: string;
  actions: readonly string[];
  fields: readonly string[];
  attributes?: Readonly<Record<string, string>>;
}
export interface AuthorizationOptions {
  plugins: readonly string[];
  resourceTypes: readonly ResourceTypeOption[];
  subjectTypes: readonly SelectOption[];
  collections: readonly DatabaseCollectionOption[];
  recordAccessPolicies: readonly SelectOption[];
}
export interface AuthorizationUser {
  id: string;
  name: string;
  username?: string;
  email: string;
}
export interface AuthorizationRecordOption {
  id: string;
  label: string;
  description?: string;
}
export type AccessScope =
  | { type: 'all' }
  | { type: 'ids'; ids: readonly string[] }
  | {
      type: 'database';
      recordAccess: string | { key: string; params?: unknown };
    };
export interface DefaultAccessRule {
  resource: { type: string; id: string };
  actions: readonly { action: string; scope: AccessScope }[];
}
export interface AuthorizationSubject {
  type: string;
  id: string;
}
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
export interface RestrictionRule {
  key: string;
  title?: string;
  resource: { type: string; id: string };
  actions: readonly { action: string; scope: AccessScope }[];
  subjects: readonly AuthorizationSubject[];
  reason?: string;
}

interface PermissionsSnapshot {
  permissions: readonly {
    resource: { type: string; id: string };
    actions: readonly string[];
  }[];
}

interface DataResponse<T> {
  data: T;
}

export class AuthorizationClient {
  private snapshot?: Promise<PermissionsSnapshot>;

  constructor(private readonly client: AppClient) {}

  async can(
    resource: { type: string; id: string },
    action: string,
  ): Promise<boolean> {
    const snapshot = await this.permissions();
    return snapshot.permissions.some(
      (permission) =>
        permission.resource.type === resource.type &&
        (permission.resource.id === '*' ||
          permission.resource.id === resource.id) &&
        permission.actions.includes(action),
    );
  }

  permissions(): Promise<PermissionsSnapshot> {
    this.snapshot ??= this.client
      .request<DataResponse<PermissionsSnapshot>>('authz/permissions')
      .then((response) => response.data)
      .catch((error: unknown) => {
        this.snapshot = undefined;
        throw error;
      });
    return this.snapshot;
  }

  listPermissionSets(): Promise<readonly PermissionSet[]> {
    return this.client
      .request<DataResponse<readonly PermissionSet[]>>('authz/permission-sets')
      .then((response) => response.data);
  }

  loadOptions(path: string): Promise<AuthorizationOptions> {
    return this.get<AuthorizationOptions>(path);
  }
  loadUsers(path: string): Promise<readonly AuthorizationUser[]> {
    return this.get<readonly AuthorizationUser[]>(path);
  }
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
    await this.client.request(
      `authz/default-access/${encodeURIComponent(resource.type)}/${encodeURIComponent(resource.id)}`,
      { method: 'DELETE' },
    );
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
  listDefaultAccessRecords(
    collection: string,
  ): Promise<readonly AuthorizationRecordOption[]> {
    return this.get<readonly AuthorizationRecordOption[]>(
      `authz/default-access/records/${encodeURIComponent(collection)}`,
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
    await this.client.request(
      `authz/sharing-rules/${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    );
  }
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
    await this.client.request(
      `authz/restriction-rules/${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    );
  }

  createPermissionSet(input: PermissionSetInput): Promise<PermissionSet> {
    return this.client
      .request<DataResponse<PermissionSet>>('authz/permission-sets', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      .then((response) => response.data);
  }

  updatePermissionSet(
    key: string,
    input: PermissionSetInput,
  ): Promise<PermissionSet> {
    return this.client
      .request<DataResponse<PermissionSet>>(
        `authz/permission-sets/${encodeURIComponent(key)}`,
        { method: 'PUT', body: JSON.stringify(input) },
      )
      .then((response) => response.data);
  }

  async deletePermissionSet(key: string): Promise<void> {
    await this.client.request(
      `authz/permission-sets/${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    );
  }

  listAssignments(
    permissionSet: string,
  ): Promise<readonly PermissionSetAssignment[]> {
    return this.client
      .request<DataResponse<readonly PermissionSetAssignment[]>>(
        `authz/permission-sets/${encodeURIComponent(permissionSet)}/assignments`,
      )
      .then((response) => response.data);
  }

  assign(
    permissionSet: string,
    input: PermissionAssignmentInput,
  ): Promise<PermissionSetAssignment> {
    return this.client
      .request<DataResponse<PermissionSetAssignment>>(
        `authz/permission-sets/${encodeURIComponent(permissionSet)}/assignments`,
        { method: 'POST', body: JSON.stringify(input) },
      )
      .then((response) => response.data);
  }

  async revoke(assignmentId: string): Promise<void> {
    await this.client.request(
      `authz/permission-sets/assignments/${encodeURIComponent(assignmentId)}`,
      { method: 'DELETE' },
    );
  }

  invalidatePermissions(): void {
    this.snapshot = undefined;
  }

  private get<T>(path: string): Promise<T> {
    return this.client
      .request<DataResponse<T>>(path)
      .then((response) => response.data);
  }
  private send<T>(
    path: string,
    method: 'POST' | 'PUT',
    value: unknown,
  ): Promise<T> {
    return this.client
      .request<DataResponse<T>>(path, { method, body: JSON.stringify(value) })
      .then((response) => response.data);
  }
}
