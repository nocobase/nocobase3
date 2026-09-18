import type { ApiClient } from '@nocobase/app-client';
import type {
  ResourceRef,
  AuthorizationPermissionsSnapshot,
} from '@nocobase/authorization/core';

export type {
  ResourceRef,
  AuthorizationPermission,
  AuthorizationPermissionsSnapshot,
} from '@nocobase/authorization/core';

export interface AuthorizationCheck {
  resource: ResourceRef;
  action: string;
}

export interface PermissionGrantAction {
  action: string;
  policy?: Readonly<Record<string, unknown>> & { type: string };
}

export interface PermissionGrant {
  resource: { type: string; id: string };
  actions: readonly PermissionGrantAction[];
}

export type PermissionSetWriteOperation =
  'create' | 'update' | 'delete' | 'assign' | 'revoke';

export interface PermissionSetProtection {
  owner: string;
  allow: readonly PermissionSetWriteOperation[];
  /** Subject types the set may be assigned to. Absent means any. */
  assignableTo?: readonly string[];
}

export interface PermissionSet {
  key: string;
  title?: string | { key: string; ns: string };
  grants: readonly PermissionGrant[];
  /** Present when the set is protected; `allow` lists the operations the generic API still performs. */
  readonly protection?: PermissionSetProtection;
  /** True when holding this set grants unrestricted access. */
  readonly unrestricted?: boolean;
}

export interface PermissionSetAssignment {
  id: string;
  subject: { type: string; id: string };
  permissionSet: string;
}

export interface PermissionSetInput {
  key: string;
  title?: string | { key: string; ns: string };
  grants: readonly PermissionGrant[];
}

export interface PermissionAssignmentInput {
  subject: { type: string; id: string };
}

export type LocalizedText =
  string | { key: string; ns: string; defaultValue?: string };

export interface SelectOption<Text = string> {
  category?: 'business' | 'pages' | 'administration';
  value: string;
  label: Text;
  description?: Text;
}
export interface ResourceOption<Text = string> extends SelectOption<Text> {
  searchText?: string;
  ruleScopes?: readonly {
    action: string;
    scopeKey: string;
    label: Text;
    collection: string;
    policies?: readonly string[];
  }[];
  actionScopes?: Readonly<
    Record<
      string,
      {
        policyType: string;
        fields: readonly {
          key: string;
          collectionFields?: readonly string[];
          label: Text;
          defaultValue: string;
          options: readonly SelectOption<Text>[];
        }[];
      }
    >
  >;
  group?: string;
  actions?: readonly SelectOption<Text>[];
}
export interface ResourceGroupOption<Text = string> extends SelectOption<Text> {
  children?: readonly ResourceGroupOption<Text>[];
}
export interface ResourceTypeOption<Text = string> {
  category?: 'business' | 'pages' | 'administration';
  groups?: readonly ResourceGroupOption<Text>[];
  value: string;
  label: Text;
  resources: readonly ResourceOption<Text>[];
  actions: readonly SelectOption<Text>[];
}
export interface DatabaseCollectionOption {
  name: string;
  fields: readonly string[];
}
export interface SubjectTypeOption<Text = string> extends SelectOption<Text> {
  selection?: { type: 'fixed'; id: string } | { type: 'collection' };
}
export interface SubjectOption {
  id: string;
  title: string;
  description?: string;
}
export type SubjectSettings = string;
export interface AuthorizationOptions<Text = string> {
  resourceGroups?: readonly SelectOption<Text>[];
  plugins: readonly string[];
  resourceTypes: readonly ResourceTypeOption<Text>[];
  subjectTypes: readonly SubjectTypeOption<Text>[];
  collections: readonly DatabaseCollectionOption[];
  recordAccessPolicies: readonly SelectOption<Text>[];
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

export interface AuthorizationSubject {
  type: string;
  id: string;
}

/** One reason a decision came out as it did, as the core gave it. */
export interface AuthorizationReason {
  code: string;
  message: string;
  /** The plugin the reason came from; absent when the core itself said it. */
  plugin?: string;
  details?: Readonly<Record<string, unknown>>;
}

export type AuthorizationEffect = 'permit' | 'conditional' | 'deny';

/** What the core decided, with why, and what it holds for when conditional. */
export interface AuthorizationDecision {
  checks?: readonly AuthorizationInspection[];
  effect: AuthorizationEffect;
  conditions?: Readonly<Record<string, unknown>> & { type: string };
  reasons: readonly AuthorizationReason[];
}

export interface AuthorizationInspectInput {
  subject: AuthorizationSubject;
  resource: { type: string; id: string };
  action: string;
}

export interface AuthorizationInspection {
  resource: { type: string; id: string };
  action: string;
  decision: AuthorizationDecision;
}

interface DataResponse<T> {
  data: T;
}

/** One page is the whole picker; the Users page is where a large directory is searched. */
const USER_PAGE_SIZE = 200;

export class AuthorizationClient {
  private snapshot?: Promise<AuthorizationPermissionsSnapshot>;
  private permissionsRevision = 0;
  private readonly invalidationListeners = new Set<() => void>();

  constructor(private readonly api: ApiClient) {}

  async can({ resource, action }: AuthorizationCheck): Promise<boolean> {
    const snapshot = await this.permissions();
    if (snapshot.unrestricted) return true;
    return snapshot.permissions.some(
      (permission) =>
        permission.resource.type === resource.type &&
        (permission.resource.id === '*' ||
          permission.resource.id === resource.id) &&
        permission.actions.includes(action),
    );
  }

  permissions(): Promise<AuthorizationPermissionsSnapshot> {
    if (!this.snapshot) {
      const request: Promise<AuthorizationPermissionsSnapshot> = this.api
        .request<DataResponse<AuthorizationPermissionsSnapshot>>({
          path: 'authz/permissions',
        })
        .then(
          (response) =>
            this.snapshot === request ? response.data : this.permissions(),
          (error: unknown) => {
            // A request from an earlier session must not evict its successor.
            if (this.snapshot !== request) return this.permissions();
            this.snapshot = undefined;
            throw error;
          },
        );
      this.snapshot = request;
    }
    return this.snapshot;
  }

  getPermissionsRevision(): number {
    return this.permissionsRevision;
  }

  listPermissionSets(): Promise<readonly PermissionSet[]> {
    return this.api
      .request<DataResponse<readonly PermissionSet[]>>({
        path: 'authz/permission-sets',
      })
      .then((response) => response.data);
  }

  loadOptions(path: string): Promise<AuthorizationOptions<LocalizedText>> {
    return this.get<AuthorizationOptions<LocalizedText>>(path);
  }
  /**
   * Users come from the Users API rather than from Authorization, which knows
   * subject ids and nothing about accounts. It authorizes separately, so this
   * request can be refused while the settings page itself is allowed.
   */
  listSubjects(
    settings: SubjectSettings,
    type: string,
    query: { search?: string; page: number; pageSize: number },
  ): Promise<{ items: readonly SubjectOption[]; total: number }> {
    return this.api
      .request<
        DataResponse<{ items: readonly SubjectOption[]; total: number }>
      >({
        path: `authz/${settings}/subjects/${encodeURIComponent(type)}`,
        query,
      })
      .then((response) => response.data);
  }
  resolveSubjects(
    settings: SubjectSettings,
    type: string,
    ids: readonly string[],
  ): Promise<readonly SubjectOption[]> {
    return this.send<readonly SubjectOption[]>(
      `authz/${settings}/subjects/${encodeURIComponent(type)}/resolve`,
      'POST',
      { ids },
    );
  }
  listUsers(): Promise<readonly AuthorizationUser[]> {
    return this.api
      .request<DataResponse<{ items: readonly AuthorizationUser[] }>>({
        path: 'users',
        query: { pageSize: USER_PAGE_SIZE },
      })
      .then((response) => response.data.items);
  }
  /** What one person may do on one resource, and why the application says so. */
  inspect(input: AuthorizationInspectInput): Promise<AuthorizationDecision> {
    return this.send<AuthorizationDecision>('authz/inspect', 'POST', input);
  }
  inspectConfigured(subject: AuthorizationSubject): Promise<{
    unrestricted: boolean;
    types: readonly string[];
    resources: readonly { type: string; id: string }[];
  }> {
    return this.send('authz/inspect/configured', 'POST', { subject });
  }
  inspectBatch(
    subject: AuthorizationSubject,
    checks: readonly Omit<AuthorizationInspectInput, 'subject'>[],
  ): Promise<readonly AuthorizationInspection[]> {
    return this.send('authz/inspect/batch', 'POST', { subject, checks });
  }
  createPermissionSet(input: PermissionSetInput): Promise<PermissionSet> {
    return this.api
      .request<DataResponse<PermissionSet>>({
        path: 'authz/permission-sets',
        method: 'POST',
        json: input,
      })
      .then((response) => response.data);
  }

  updatePermissionSet(
    key: string,
    input: PermissionSetInput,
  ): Promise<PermissionSet> {
    return this.api
      .request<DataResponse<PermissionSet>>({
        path: `authz/permission-sets/${encodeURIComponent(key)}`,
        method: 'PUT',
        json: input,
      })
      .then((response) => response.data);
  }

  async deletePermissionSet(key: string): Promise<void> {
    await this.api.request({
      path: `authz/permission-sets/${encodeURIComponent(key)}`,
      method: 'DELETE',
    });
  }

  listAssignments(
    permissionSet: string,
  ): Promise<readonly PermissionSetAssignment[]> {
    return this.api
      .request<DataResponse<readonly PermissionSetAssignment[]>>({
        path: `authz/permission-sets/${encodeURIComponent(permissionSet)}/assignments`,
      })
      .then((response) => response.data);
  }

  assign(
    permissionSet: string,
    input: PermissionAssignmentInput,
  ): Promise<PermissionSetAssignment> {
    return this.api
      .request<DataResponse<PermissionSetAssignment>>({
        path: `authz/permission-sets/${encodeURIComponent(permissionSet)}/assignments`,
        method: 'POST',
        json: input,
      })
      .then((response) => response.data);
  }

  async revoke(assignmentId: string): Promise<void> {
    await this.api.request({
      path: `authz/permission-sets/assignments/${encodeURIComponent(assignmentId)}`,
      method: 'DELETE',
    });
  }

  invalidatePermissions(): void {
    this.snapshot = undefined;
    this.permissionsRevision += 1;
    for (const listener of this.invalidationListeners) listener();
  }

  onPermissionsInvalidated(listener: () => void): () => void {
    this.invalidationListeners.add(listener);
    return () => {
      this.invalidationListeners.delete(listener);
    };
  }

  private get<T>(path: string): Promise<T> {
    return this.api
      .request<DataResponse<T>>({ path })
      .then((response) => response.data);
  }
  private send<T>(
    path: string,
    method: 'POST' | 'PUT',
    value: unknown,
  ): Promise<T> {
    return this.api
      .request<DataResponse<T>>({ path, method, json: value })
      .then((response) => response.data);
  }
}
