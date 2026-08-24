import type { AppClient } from '@nocobase/app-sdk';

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
}
