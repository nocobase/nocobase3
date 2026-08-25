import type { AppClient } from '@nocobase/app-sdk';

import type {
  AppAccessMemberCreate,
  AppAccessMemberSummary,
  AppAccessMemberUpdate,
  AppAccessPermissionRow,
  AppAccessRolePermissionSettings,
  AppAccessRoleSummary,
} from '../types.js';

interface DataResponse<T> {
  readonly data: T;
}

export interface AppAccessControlClient {
  createMember(input: AppAccessMemberCreate): Promise<AppAccessMemberSummary[]>;
  fetchMembers(): Promise<AppAccessMemberSummary[]>;
  fetchRoles(): Promise<AppAccessRoleSummary[]>;
  fetchRolePermissions(
    roleKey: string,
  ): Promise<AppAccessRolePermissionSettings>;
  saveRolePermissions(
    roleKey: string,
    permissions: readonly AppAccessPermissionRow[],
  ): Promise<AppAccessRolePermissionSettings>;
  updateMember(
    userId: string,
    input: AppAccessMemberUpdate,
  ): Promise<AppAccessMemberSummary[]>;
}

export function createAppAccessControlClient(
  appClient: AppClient,
): AppAccessControlClient {
  return {
    async createMember(
      input: AppAccessMemberCreate,
    ): Promise<AppAccessMemberSummary[]> {
      return (
        await appClient.request<DataResponse<AppAccessMemberSummary[]>>(
          'settings/members',
          { method: 'POST', body: JSON.stringify(input) },
        )
      ).data;
    },
    async fetchMembers(): Promise<AppAccessMemberSummary[]> {
      return (
        await appClient.request<DataResponse<AppAccessMemberSummary[]>>(
          'settings/members',
        )
      ).data;
    },
    async fetchRoles(): Promise<AppAccessRoleSummary[]> {
      return (
        await appClient.request<DataResponse<AppAccessRoleSummary[]>>(
          'settings/roles',
        )
      ).data;
    },
    async fetchRolePermissions(
      roleKey: string,
    ): Promise<AppAccessRolePermissionSettings> {
      return (
        await appClient.request<DataResponse<AppAccessRolePermissionSettings>>(
          `settings/roles/${encodeURIComponent(roleKey)}/permissions`,
        )
      ).data;
    },
    async saveRolePermissions(
      roleKey: string,
      permissions: readonly AppAccessPermissionRow[],
    ): Promise<AppAccessRolePermissionSettings> {
      return (
        await appClient.request<DataResponse<AppAccessRolePermissionSettings>>(
          `settings/roles/${encodeURIComponent(roleKey)}/permissions`,
          {
            method: 'POST',
            body: JSON.stringify({ permissions }),
          },
        )
      ).data;
    },
    async updateMember(
      userId: string,
      input: AppAccessMemberUpdate,
    ): Promise<AppAccessMemberSummary[]> {
      return (
        await appClient.request<DataResponse<AppAccessMemberSummary[]>>(
          `settings/members/${encodeURIComponent(userId)}`,
          { method: 'POST', body: JSON.stringify(input) },
        )
      ).data;
    },
  };
}

export function requestErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试。';
}
