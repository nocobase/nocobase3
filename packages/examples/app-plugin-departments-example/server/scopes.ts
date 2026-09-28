import {
  anyScope,
  condition,
  type AppAuthorization,
  type DatabaseScope,
} from '@nocobase/app-plugin-authorization/server';
import {
  defineRecordAccess,
  type RecordAccessContext,
} from '@nocobase/authorization/core';
import type { DatabaseManager } from '@nocobase/db';

import {
  label,
  ORDERS,
  PROJECTS,
  QUOTES,
  SCOPE_MY_DEPARTMENTS,
  SCOPE_MY_DEPARTMENTS_AND_BELOW,
} from './resources.js';
import type { OrganizationService } from './tokens.js';

/** The column holding the record's owner; orders have none and follow their project's. */
const OWNER_FIELD: Readonly<Record<string, string>> = {
  [PROJECTS]: 'ownerId',
  [QUOTES]: 'preparedById',
};

function anyOf(
  field: string,
  values: readonly string[],
): DatabaseScope | false {
  // No `$in` operator: a union of equality conditions. No value selects nothing, never every record.
  return values.length
    ? anyScope(values.map((value) => condition(field, '$eq', value)))
    : false;
}

/**
 * The records whose owner is an active member of one of the departments. Orders carry no owner and no relation
 * to their project, so they match the ids of the projects those members own.
 */
async function ownedBy(
  database: DatabaseManager,
  organization: OrganizationService,
  collection: string,
  departmentIds: readonly string[],
): Promise<DatabaseScope | false> {
  const owners = await organization.membersOf(departmentIds);
  if (!owners.length) return false;
  const field = OWNER_FIELD[collection];
  if (field) return anyOf(field, owners);
  if (collection !== ORDERS)
    throw new TypeError(`Unsupported department scope target: ${collection}`);
  const projects = await database
    .connection()
    .query.selectFrom(PROJECTS)
    .select('id')
    .where('ownerId', 'in', [...owners])
    .execute();
  return anyOf(
    'projectId',
    projects.map((row) => String(row.id)),
  );
}

/**
 * Registers the two department data scopes on the sales example's projects, quotes and orders. Each resolves
 * from the database on every request; the principal is the only input taken from the request.
 */
export function registerDepartmentScopes(
  authz: AppAuthorization,
  database: DatabaseManager,
  organization: OrganizationService,
): void {
  const viewerScope =
    (descendants: boolean) =>
    async ({ principal, collection }: RecordAccessContext) => {
      if (principal.type !== 'user') return false;
      const departments = await organization.viewerDepartments(principal.id, {
        descendants,
      });
      return ownedBy(database, organization, collection, departments);
    };

  authz.recordAccess.define(
    defineRecordAccess(SCOPE_MY_DEPARTMENTS, (access) =>
      access
        .title(label('scopes.mine'))
        .description(label('scopes.mineHint'))
        .collections(PROJECTS, QUOTES, ORDERS)
        .resolver(viewerScope(false)),
    ),
  );
  authz.recordAccess.define(
    defineRecordAccess(SCOPE_MY_DEPARTMENTS_AND_BELOW, (access) =>
      access
        .title(label('scopes.mineAndBelow'))
        .description(label('scopes.mineAndBelowHint'))
        .collections(PROJECTS, QUOTES, ORDERS)
        .resolver(viewerScope(true)),
    ),
  );
}
