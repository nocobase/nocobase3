# Department scopes and heads

Part of [the organisation dimension](../organization.md). It registers the department-head subject type and three owner-based data scopes; [permission design](permission-design.md) explains when to use each. Everything here needs only the authorization plugin.

## Department heads

Add a nullable head to the department in the organisation migration, `c.string('managerId', { length: 64 }).nullable()` with `c.index('managerId')`. The head is a user id and need not be a member. Accept `managerId` in `createDepartment` and `updateDepartment`, check the user exists and is enabled through `userAdministrationServiceToken`, and edit it in the department's basic information with a user picker; the list and detail routes return the head's display name read through the same service.

A head change moves access, so `updateDepartment` returns the previous and the new head in `changed` along with the members it already returns, and `setActive` returns the heads of every department in the subtree. The route notifies each of them after the transaction commits, as [refresh sessions](subjects.md#refresh-sessions-after-membership-changes) describes.

Register the heads subject beside the department subject, in the same provider, and release both on shutdown. It is fixed, like the built-in `authenticated`: one id, `*`, meaning every head of an active department.

```ts
export const DEPARTMENT_HEAD_SUBJECT = 'org.departmentHead';

const releaseHeads = authz.subjects.add<DatabaseConnection>(
  DEPARTMENT_HEAD_SUBJECT,
  {
    resolveFor: async (principal) =>
      principal.type === 'user' &&
      (await organization.headedBy(principal.id)).length
        ? ['*']
        : [],
    filterActive: async (ids) => ids.filter((id) => id === '*'),
    administration: {
      // The same localized term as the department's Head field.
      title: label('heads'),
      selection: { type: 'fixed', id: '*' },
    },
  },
);
```

`headedBy(userId)` returns the departments whose `managerId` is the user and whose whole ancestor chain is active, from one tree read. Assign the head set to `{ type: 'org.departmentHead', id: '*' }` once.

## Three owner-based data scopes

Add three reads to the organisation service. Each loads the tree once and counts only departments whose whole ancestor chain is active.

```ts
/** Active memberships and headed departments, plus every active descendant when `descendants` is set. */
viewerDepartments(userId: string, options: { descendants: boolean }): Promise<readonly string[]>;
/** One active department, plus its active descendants when asked; empty when it is missing or inactive. */
selectedDepartments(departmentId: string, options: { descendants: boolean }): Promise<readonly string[]>;
/** Users with an active direct membership in any of the departments. */
membersOf(departmentIds: readonly string[]): Promise<readonly string[]>;
```

Register the record accesses in the provider's `boot`. `projects.ownerId` and `quotes.preparedById` name each record's owner; orders carry neither and follow their project's owner. There is no `$in` operator, so match a list as a union of equality conditions, and answer `false`, never `true`, when nothing matches.

```ts
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

const OWNER: Record<string, string> = {
  projects: 'ownerId',
  quotes: 'preparedById',
};

function anyOf(
  field: string,
  values: readonly string[],
): DatabaseScope | false {
  return values.length
    ? anyScope(values.map((value) => condition(field, '$eq', value)))
    : false;
}

async function ownedBy(
  database: DatabaseManager,
  organization: OrganizationService,
  collection: string,
  departmentIds: readonly string[],
): Promise<DatabaseScope | false> {
  const owners = await organization.membersOf(departmentIds);
  if (!owners.length) return false;
  const field = OWNER[collection];
  if (field) return anyOf(field, owners);
  // `orders` has no owner: match the projects those members own.
  const projects = await database
    .connection()
    .query.selectFrom('projects')
    .select('id')
    .where('ownerId', 'in', [...owners])
    .execute();
  return anyOf(
    'projectId',
    projects.map((row) => String(row.id)),
  );
}

export function registerDepartmentScopes(
  authz: AppAuthorization,
  database: DatabaseManager,
  organization: OrganizationService,
): void {
  const viewer =
    (descendants: boolean) =>
    async ({ principal, collection }: RecordAccessContext) =>
      principal.type === 'user'
        ? ownedBy(
            database,
            organization,
            collection,
            await organization.viewerDepartments(principal.id, { descendants }),
          )
        : false;

  authz.recordAccess.define(
    defineRecordAccess('org.myDepartments', (access) =>
      access
        .title(label('scopes.mine'))
        .collections('projects', 'quotes', 'orders')
        .resolver(viewer(false)),
    ),
  );
  authz.recordAccess.define(
    defineRecordAccess('org.myDepartmentsAndBelow', (access) =>
      access
        .title(label('scopes.mineAndBelow'))
        .collections('projects', 'quotes', 'orders')
        .resolver(viewer(true)),
    ),
  );
  authz.recordAccess.define(
    defineRecordAccess('org.selectedDepartment', (access) =>
      access
        .title(label('scopes.selected'))
        .collections('projects', 'quotes', 'orders')
        .params<{ departmentId: string; includeDescendants?: boolean }>({
          type: 'object',
          properties: {
            departmentId: { type: 'string' },
            includeDescendants: { type: 'boolean' },
          },
          required: ['departmentId'],
        })
        .resolver(async ({ params, collection }) => {
          // Stored params are data: anything but the documented shape selects nothing.
          const departmentId: unknown = Reflect.get(
            Object(params),
            'departmentId',
          );
          const below: unknown = Reflect.get(
            Object(params),
            'includeDescendants',
          );
          if (typeof departmentId !== 'string' || !departmentId) return false;
          if (below !== undefined && typeof below !== 'boolean') return false;
          return ownedBy(
            database,
            organization,
            collection,
            await organization.selectedDepartments(departmentId, {
              descendants: below === true,
            }),
          );
        }),
    ),
  );
}
```

Call `params()` before `resolver()`: it starts a new builder without the resolver. Localize every title as a `{ key, ns }` descriptor, such as 本部门 / My departments, 本部门及下属部门 / My departments and below and 指定部门 / Selected department, and add a description where the title alone is ambiguous.

A resolver receives the principal and the stored params, never client input. Collection names above are illustrative; use the application's own, and resolve a record without an owner through its real parent relationship.

The permission workspace and the rule editors list these scopes, but they edit params only for the built-in custom filter. Choosing 指定部门 there stores it without params, which selects nothing, so provision it where the params are written explicitly:

```ts
import { selection } from '@nocobase/authorization/core';

const salesCenterAndBelow = selection.recordAccess('org.selectedDepartment', {
  departmentId: 'sales-center',
  includeDescendants: true,
});
// A permission-set grant: projects.grant({ view: { projects: salesCenterAndBelow } })
```

## Provision with optional rule plugins

Default access, sharing rules and restriction rules may be absent. Never write code or seeds that assume them; read the authorization Skill's `references/optional-capabilities.md` first.

At runtime, check the capability before using its service, and skip that part when it is missing:

```ts
import type { SharingRulesAuthorizationApi } from '@nocobase/authorization/sharing-rules';

if ('sharingRules' in authz) {
  const rules = (
    authz as typeof authz & SharingRulesAuthorizationApi<DatabaseConnection>
  ).sharingRules;
  // create or update the rule
}
```

In a seed, probe the plugin's Collection before writing its rows. A missing Collection is reported before any SQL runs, so the probe leaves the seed's transaction usable:

```ts
async run(context) {
  const installed = async (collection: string): Promise<boolean> => {
    try {
      await context.repository(collection).exists();
      return true;
    } catch (error) {
      if (error instanceof Error && Reflect.get(error, 'code') === 'COLLECTION_NOT_FOUND')
        return false;
      throw error;
    }
  };
  if (await installed('authorizationSharingRules')) {
    // insert the rule and its department assignment, as the sharing-rules Skill describes
  }
}
```

Declare the optional plugins as optional peers, or as development dependencies when only tests use them, and test the application once without them.

## Verify

- 本部门 with a viewer in two departments, and without any department; 本部门及下属部门 with a disabled child, a disabled ancestor and a removed member; 指定部门 with and without descendants and with missing or malformed params.
- Heads: `resolveFor` for a head, a non-head and a head of a disabled department; a head change moves access from the previous head to the new one on the next request and notifies both.
- A transfer: moving an owner between departments moves their records between the two departments' viewers and heads.
- The whole organisation boots, migrates and seeds with the authorization plugin alone.
