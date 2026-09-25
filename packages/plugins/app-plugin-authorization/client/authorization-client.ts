import type { ApiClient } from '@nocobase/app-client';
import type {
  AuthorizationSnapshot,
  ResourceRef,
} from '@nocobase/authorization/core';

export type {
  AuthorizationPermission,
  AuthorizationSnapshot,
  RecordSelection,
  ResourceRef,
} from '@nocobase/authorization/core';

export interface AuthorizationCheck {
  resource: ResourceRef;
  action: string;
}

/**
 * A check, or `'unrestricted'` to require unrestricted access, such as root's.
 * Nothing grants `'unrestricted'`; it holds only when the snapshot is unrestricted.
 */
export type AuthorizationRequirement = AuthorizationCheck | 'unrestricted';

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
  /** Present when the set is protected; `allow` lists what the generic API may still do. */
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

/** A title as the server sends it. */
export type LocalizedText =
  string | { key: string; ns?: string; defaultValue?: string };

/** One grantable action as the server sends it. */
interface OptionsActionResponse {
  name: string;
  title: LocalizedText;
}

/** What every `options` route answers. */
export interface AuthorizationOptionsResponse {
  readonly sections: readonly {
    name: string;
    title: LocalizedText;
    order: number;
    subsections: readonly {
      name: string;
      title: LocalizedText;
      /** Set when the client supplies the resources, such as pages. */
      recordType?: { type: string; actions: readonly OptionsActionResponse[] };
      resources: readonly {
        type: string;
        id: string;
        title: LocalizedText;
        description?: LocalizedText;
        group?: string;
        actions: readonly OptionsActionResponse[];
        dataScopes?: Readonly<
          Record<
            string,
            readonly {
              key: string;
              title: LocalizedText;
              collection: string;
              fields: readonly string[];
              recordAccess: readonly string[];
              defaultValue?: string;
            }[]
          >
        >;
      }[];
    }[];
  }[];
  readonly resourceGroups?: readonly {
    name: string;
    title: LocalizedText;
    parent?: string;
    order?: number;
  }[];
  readonly subjectTypes: readonly {
    type: string;
    title: LocalizedText;
    selection: { type: 'fixed'; id: string } | { type: 'collection' };
  }[];
  readonly recordAccess: readonly {
    key: string;
    title: LocalizedText;
    description?: LocalizedText;
    collections: readonly string[];
  }[];
  readonly collections: readonly { name: string; fields: readonly string[] }[];
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

/** One data scope of a composite action, as the workspace edits it. */
export interface DataScopeOption {
  key: string;
  label: string;
  collection: string;
  collectionFields: readonly string[];
  /** `''` selects nothing: only default access and sharing apply. */
  defaultValue: string;
  /** `''` first, then the record access this scope offers. */
  options: readonly SelectOption[];
}

export interface ResourceOption extends SelectOption {
  /** The resource type grants store; never displayed. */
  type: string;
  searchText?: string;
  group?: string;
  actions?: readonly SelectOption[];
  /** Composite items only: the data scopes of each action. */
  dataScopes?: Readonly<Record<string, readonly DataScopeOption[]>>;
}

export interface ResourceGroupOption extends SelectOption {
  children?: readonly ResourceGroupOption[];
}

/** A left-side entry: its resources, grouped by `groups`. */
export interface SubsectionOption {
  value: string;
  label: string;
  /** Set when the client supplies the resources, such as `page`. */
  recordType?: string;
  /** The record type's actions, else every action its resources name. */
  actions: readonly SelectOption[];
  groups: readonly ResourceGroupOption[];
  resources: readonly ResourceOption[];
}

/** A left-side heading. */
export interface SectionOption {
  value: string;
  label: string;
  order: number;
  subsections: readonly SubsectionOption[];
}

export interface DatabaseCollectionOption {
  name: string;
  fields: readonly string[];
}

export interface SubjectTypeOption extends SelectOption {
  selection?: { type: 'fixed'; id: string } | { type: 'collection' };
}

export interface SubjectOption {
  id: string;
  title: string;
  description?: string;
}

/** The workspace model an `options` response is localized into. */
export interface AuthorizationOptions {
  sections: readonly SectionOption[];
  subjectTypes: readonly SubjectTypeOption[];
  collections: readonly DatabaseCollectionOption[];
  recordAccess: readonly SelectOption[];
}

export interface AuthorizationRecordOption {
  id: string;
  label: string;
  description?: string;
}

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

/** What a subject's stored grants cover, without deciding any of them. */
export interface ConfiguredAccess {
  unrestricted: boolean;
  types: readonly string[];
  resources: readonly { type: string; id: string }[];
}

export interface SubjectPage {
  items: readonly SubjectOption[];
  total: number;
}

interface DataResponse<T> {
  data: T;
}

/** Session-scoped access to `/api/authz`. */
export class AuthorizationClient {
  private cached?: Promise<AuthorizationSnapshot>;
  private currentRevision = 0;
  private readonly invalidationListeners = new Set<() => void>();

  constructor(private readonly api: ApiClient) {}

  /** Whether the session's snapshot permits the check. */
  async can(requirement: AuthorizationRequirement): Promise<boolean> {
    const snapshot = await this.snapshot();
    if (snapshot.unrestricted) return true;
    if (requirement === 'unrestricted') return false;
    const { resource, action } = requirement;
    return snapshot.permissions.some(
      (permission) =>
        permission.resource.type === resource.type &&
        (permission.resource.id === '*' ||
          permission.resource.id === resource.id) &&
        permission.actions.includes(action),
    );
  }

  /** `GET authz/permissions`, cached until `invalidate()`. */
  snapshot(): Promise<AuthorizationSnapshot> {
    if (!this.cached) {
      const request: Promise<AuthorizationSnapshot> = this.api
        .request<DataResponse<AuthorizationSnapshot>>({
          path: 'authz/permissions',
        })
        .then(
          (response) =>
            this.cached === request ? response.data : this.snapshot(),
          (error: unknown) => {
            // A request from an earlier session must not evict its successor.
            if (this.cached !== request) return this.snapshot();
            this.cached = undefined;
            throw error;
          },
        );
      this.cached = request;
    }
    return this.cached;
  }

  /** Changes whenever the snapshot is invalidated. */
  revision(): number {
    return this.currentRevision;
  }

  invalidate(): void {
    this.cached = undefined;
    this.currentRevision += 1;
    for (const listener of this.invalidationListeners) listener();
  }

  onInvalidated(listener: () => void): () => void {
    this.invalidationListeners.add(listener);
    return () => {
      this.invalidationListeners.delete(listener);
    };
  }

  listPermissionSets(): Promise<readonly PermissionSet[]> {
    return this.get('authz/permission-sets');
  }

  getPermissionSet(key: string): Promise<PermissionSet> {
    return this.get(`authz/permission-sets/${encodeURIComponent(key)}`);
  }

  createPermissionSet(input: PermissionSetInput): Promise<PermissionSet> {
    return this.send('authz/permission-sets', 'POST', input);
  }

  updatePermissionSet(
    key: string,
    input: PermissionSetInput,
  ): Promise<PermissionSet> {
    return this.send(
      `authz/permission-sets/${encodeURIComponent(key)}`,
      'PUT',
      input,
    );
  }

  async deletePermissionSet(key: string): Promise<void> {
    await this.api.request({
      path: `authz/permission-sets/${encodeURIComponent(key)}`,
      method: 'DELETE',
    });
  }

  /** The sets a subject holds. */
  getEffective(
    subject: AuthorizationSubject,
  ): Promise<readonly PermissionSet[]> {
    return this.get(
      `authz/permission-sets/effective/${encodeURIComponent(subject.type)}/${encodeURIComponent(subject.id)}`,
    );
  }

  listAssignments(
    permissionSet: string,
  ): Promise<readonly PermissionSetAssignment[]> {
    return this.get(
      `authz/permission-sets/${encodeURIComponent(permissionSet)}/assignments`,
    );
  }

  assign(
    permissionSet: string,
    input: PermissionAssignmentInput,
  ): Promise<PermissionSetAssignment> {
    return this.send(
      `authz/permission-sets/${encodeURIComponent(permissionSet)}/assignments`,
      'POST',
      input,
    );
  }

  async revoke(permissionSet: string, assignmentId: string): Promise<void> {
    await this.api.request({
      path: `authz/permission-sets/${encodeURIComponent(permissionSet)}/assignments/${encodeURIComponent(assignmentId)}`,
      method: 'DELETE',
    });
  }

  /** `GET authz/<path>/options`; `path` is the surface, such as `permission-sets`. */
  loadOptions(path: string): Promise<AuthorizationOptionsResponse> {
    return this.get(`authz/${path}/options`);
  }

  /** Subjects of one type, from the surface's own directory route. */
  listSubjects(
    path: string,
    type: string,
    query: { search?: string; page: number; pageSize: number },
  ): Promise<SubjectPage> {
    return this.api
      .request<DataResponse<SubjectPage>>({
        path: `authz/${path}/subjects/${encodeURIComponent(type)}`,
        query,
      })
      .then((response) => response.data);
  }

  resolveSubjects(
    path: string,
    type: string,
    ids: readonly string[],
  ): Promise<readonly SubjectOption[]> {
    return this.send(
      `authz/${path}/subjects/${encodeURIComponent(type)}/resolve`,
      'POST',
      { ids },
    );
  }

  listRecords(
    path: string,
    collection: string,
  ): Promise<readonly AuthorizationRecordOption[]> {
    return this.get(`authz/${path}/records/${encodeURIComponent(collection)}`);
  }

  /** What one subject may do on one resource, and why. */
  inspect(input: AuthorizationInspectInput): Promise<AuthorizationDecision> {
    return this.send('authz/inspector/decision', 'POST', input);
  }

  inspectBatch(
    subject: AuthorizationSubject,
    checks: readonly Omit<AuthorizationInspectInput, 'subject'>[],
  ): Promise<readonly AuthorizationInspection[]> {
    return this.send('authz/inspector/batch', 'POST', { subject, checks });
  }

  inspectConfigured(subject: AuthorizationSubject): Promise<ConfiguredAccess> {
    return this.send('authz/inspector/configured', 'POST', { subject });
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
