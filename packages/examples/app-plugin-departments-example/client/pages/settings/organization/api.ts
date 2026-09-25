import { useApiClient } from '@nocobase/app-client';
import { useMemo } from 'react';

export interface Department {
  readonly id: string;
  readonly title: string;
  readonly parentId: string | null;
  readonly active: boolean;
  readonly sortOrder: number;
}

export interface DirectMember {
  readonly userId: string;
  readonly title: string;
  readonly description?: string;
  readonly primary: boolean;
}

export interface UserOption {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

/** What the tree page hands its department child route through the outlet. */
export interface OrganizationOutletContext {
  readonly departments: readonly Department[];
  readonly canUpdate: boolean;
  /** Reloads the tree after a child route changed it. */
  readonly reload: () => void;
}

export interface OrganizationApi {
  listDepartments(signal?: AbortSignal): Promise<readonly Department[]>;
  createDepartment(input: {
    title: string;
    parentId?: string;
  }): Promise<Department>;
  setActive(id: string, active: boolean): Promise<void>;
  listMembers(
    id: string,
    signal?: AbortSignal,
  ): Promise<readonly DirectMember[]>;
  addMember(id: string, userId: string): Promise<void>;
  removeMember(id: string, userId: string): Promise<void>;
  setPrimary(id: string, userId: string): Promise<void>;
  searchUsers(
    search: string,
    signal?: AbortSignal,
  ): Promise<readonly UserOption[]>;
}

const BASE = 'departments-example';

function department(id: string): string {
  return `${BASE}/departments/${encodeURIComponent(id)}`;
}

export function useOrganizationApi(): OrganizationApi {
  const api = useApiClient();
  return useMemo<OrganizationApi>(
    () => ({
      async listDepartments(signal) {
        const body = await api.request<{ data: Department[] }>({
          path: `${BASE}/departments`,
          ...(signal ? { signal } : {}),
        });
        return body.data;
      },
      async createDepartment(input) {
        const body = await api.request<{ data: Department }>({
          path: `${BASE}/departments`,
          method: 'POST',
          json: input,
        });
        return body.data;
      },
      async setActive(id, active) {
        await api.request({
          path: `${department(id)}/active`,
          method: 'PUT',
          json: { active },
        });
      },
      async listMembers(id, signal) {
        const body = await api.request<{ data: DirectMember[] }>({
          path: `${department(id)}/members`,
          ...(signal ? { signal } : {}),
        });
        return body.data;
      },
      async addMember(id, userId) {
        await api.request({
          path: `${department(id)}/members`,
          method: 'POST',
          json: { userId },
        });
      },
      async removeMember(id, userId) {
        await api.request({
          path: `${department(id)}/members/${encodeURIComponent(userId)}`,
          method: 'DELETE',
        });
      },
      async setPrimary(id, userId) {
        await api.request({
          path: `${department(id)}/members/${encodeURIComponent(userId)}/primary`,
          method: 'PUT',
        });
      },
      async searchUsers(search, signal) {
        const body = await api.request<{ data: { items: UserOption[] } }>({
          path: `${BASE}/users`,
          query: { search, page: 1, pageSize: 10 },
          ...(signal ? { signal } : {}),
        });
        return body.data.items;
      },
    }),
    [api],
  );
}
