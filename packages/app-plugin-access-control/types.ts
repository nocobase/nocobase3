export type AppAccessMemberStatus = 'active' | 'disabled';
export type AppAccessPermissionScope = 'all' | 'own';
export type AppAccessPermissionCapability =
  'read' | 'create' | 'update' | 'destroy';

export interface AppAccessRoleSummary {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly memberCount: number;
  readonly system: boolean;
}

export interface AppAccessMemberSummary {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
  readonly status: AppAccessMemberStatus;
  readonly roleKey: string;
  readonly roleTitle: string;
  readonly createdAt: string;
}

export interface AppAccessPermissionRow {
  readonly resource: string;
  readonly resourceTitle: string;
  readonly capabilities: AppAccessPermissionCapability[];
  readonly scope: AppAccessPermissionScope;
  readonly supportsOwnScope: boolean;
}

export interface AppAccessRolePermissionSettings {
  readonly role: AppAccessRoleSummary;
  readonly permissions: AppAccessPermissionRow[];
}

export interface AppAccessMemberUpdate {
  readonly status: AppAccessMemberStatus;
  readonly roleKey: string;
}

export interface AppAccessMemberCreate {
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly roleKey: string;
}

export interface AppAccessControlResponse {
  readonly role: string;
  readonly roles: string[];
  readonly resources: string[];
  readonly actions: Record<string, Record<string, never>>;
  readonly snippets: string[];
  readonly allowConfigure: boolean;
}

export interface AppAccessResourceDefinition {
  readonly name: string;
  readonly title: string;
  readonly supportsOwnScope?: boolean;
}

export interface AppAccessDefaultPermission {
  readonly resource: string;
  readonly capabilities: readonly AppAccessPermissionCapability[];
  readonly scope?: AppAccessPermissionScope;
}

export interface AppAccessRoleDefinition {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly system?: boolean;
  readonly permissions: readonly AppAccessDefaultPermission[];
}

export interface AppAccessControlDefinition {
  readonly appKey: string;
  readonly appName: string;
  readonly adminRoleKey: string;
  readonly memberTableName?: string;
  readonly roles: readonly AppAccessRoleDefinition[];
  readonly resources: readonly AppAccessResourceDefinition[];
}
