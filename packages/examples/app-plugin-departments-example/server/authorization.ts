import {
  anyScope,
  condition,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import { defineRecordAccess } from '@nocobase/authorization/core';
import type { DatabaseConnection } from '@nocobase/db';

import {
  DEPARTMENT_SUBJECT,
  directory,
  ORGANIZATION_SETTINGS,
  OWN_DEPARTMENTS,
} from './resources.js';
import type { OrganizationService } from './tokens.js';

/** The application-relative path of a department's settings page, without the deployment base path. */
export function departmentManagePath(id: string): string {
  return `/settings/organization/departments/${encodeURIComponent(id)}`;
}

/**
 * Registers what this plugin makes grantable and returns the function that releases the subject type.
 * Called from the provider's `boot`; the returned function is called from `shutdown`.
 */
export function registerOrganizationAuthorization(
  authz: AppAuthorization,
  organization: OrganizationService,
): () => void {
  authz.ui.sections.add({
    name: 'organization',
    title: 'Organization',
    parent: 'administration',
  });
  authz.settings.add({
    id: ORGANIZATION_SETTINGS,
    title: 'Organization',
    actions: [
      { name: 'read', title: 'View' },
      { name: 'update', title: 'Manage' },
    ],
  });
  authz.ui.place(
    { type: 'settings', id: ORGANIZATION_SETTINGS },
    { section: 'organization' },
  );

  authz.database.collections.add({
    name: 'departments',
    title: 'Departments',
    actions: ['read'],
  });
  authz.recordAccess.define(
    defineRecordAccess(OWN_DEPARTMENTS, (access) =>
      access
        .title('Departments I belong to')
        .collections('departments')
        .resolver(async ({ principal }) => {
          if (principal.type !== 'user') return false;
          const ids = await organization.departmentsOf(principal.id);
          // No memberships selects nothing, never every department.
          return ids.length
            ? anyScope(ids.map((id) => condition('id', '$eq', id)))
            : false;
        }),
    ),
  );
  const reference = authz.compositeResources.define(directory);
  authz.ui.sections.add({
    name: 'organization.business',
    title: 'Organization',
    parent: 'business',
  });
  authz.ui.place(reference, { section: 'organization.business' });

  return authz.subjects.add<DatabaseConnection>(DEPARTMENT_SUBJECT, {
    // Every request recomputes membership from the database, so nothing here is cached.
    resolveFor: async (principal) =>
      principal.type === 'user' ? organization.departmentsOf(principal.id) : [],
    // Protected assignment checks pass their transaction; read through it.
    filterActive: async (ids, transaction) =>
      organization.filterActive(ids, transaction),
    administration: {
      title: 'Departments',
      selection: {
        type: 'collection',
        list: (query) => organization.listDepartments(query),
        resolve: (ids) => organization.resolveDepartments(ids),
      },
      members: async (id, query) =>
        (await organization.getDepartment(id))
          ? organization.effectiveMembers(id, query)
          : { items: [], total: 0 },
      manage: (id) => departmentManagePath(id),
    },
  });
}
