import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseConnection } from '@nocobase/db';

import {
  DEPARTMENT_SUBJECT,
  DEPARTMENTS_SETTINGS,
  label,
} from './resources.js';
import type { OrganizationService } from './tokens.js';

/**
 * Registers the Departments settings item and the department subject type, and returns the function that releases
 * the subject type. Called from the provider's `boot`; the returned function is called from `shutdown`.
 *
 * The subject type, the settings item, its workspace subsection and the settings menu entry all carry one localized
 * name, so an administrator meets the same word everywhere.
 */
export function registerOrganizationAuthorization(
  authz: AppAuthorization,
  organization: OrganizationService,
): () => void {
  authz.ui.sections.add({
    name: DEPARTMENTS_SETTINGS,
    title: label('departments'),
    parent: 'administration',
  });
  authz.settings.add({
    id: DEPARTMENTS_SETTINGS,
    title: label('departments'),
    actions: [
      { name: 'read', title: label('authz.read') },
      { name: 'update', title: label('authz.update') },
    ],
  });
  authz.ui.place(
    { type: 'settings', id: DEPARTMENTS_SETTINGS },
    { section: DEPARTMENTS_SETTINGS },
  );

  return authz.subjects.add<DatabaseConnection>(DEPARTMENT_SUBJECT, {
    // Every request recomputes membership from the database, so nothing here is cached.
    resolveFor: async (principal) =>
      principal.type === 'user' ? organization.departmentsOf(principal.id) : [],
    // Protected assignment checks pass their transaction; read through it.
    filterActive: async (ids, transaction) =>
      organization.filterActive(ids, transaction),
    administration: {
      title: label('departments'),
      selection: {
        type: 'collection',
        list: (query) => organization.listDepartments(query),
        resolve: (ids) => organization.resolveDepartments(ids),
      },
    },
  });
}
