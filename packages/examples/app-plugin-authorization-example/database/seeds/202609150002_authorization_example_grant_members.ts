import {
  defineSeed,
  type QueryAdapter,
  type SeedDefinition,
} from '@nocobase/db';

const SET = 'authorization-example-member';
const RESOURCE = 'authorizationExampleTasks';

/**
 * What `authz.db.grant()` emits, written out: a seed reaches the tables
 * rather than the running authorization.
 *
 * `recordsIOwn` compares `ownerId`, so a signed-in user reads, updates and
 * deletes their own rows and nobody else's. `create` carries no record access
 * — a create selects no rows — and has to name every column the route stores,
 * timestamps included.
 */
const grants = [
  {
    resource: { type: 'database.collection', id: RESOURCE },
    actions: [
      {
        action: 'read',
        policy: {
          type: 'database',
          fields: { output: '*' },
          recordAccess: ['recordsIOwn'],
        },
      },
      {
        action: 'create',
        policy: {
          type: 'database',
          fields: {
            input: ['title', 'status', 'ownerId', 'createdAt', 'updatedAt'],
          },
        },
      },
      {
        action: 'update',
        policy: {
          type: 'database',
          fields: { input: ['title', 'status', 'updatedAt'] },
          recordAccess: ['recordsIOwn'],
        },
      },
      {
        action: 'delete',
        policy: { type: 'database', recordAccess: ['recordsIOwn'] },
      },
    ],
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609150002_authorization_example_grant_members',

  async run({ query }) {
    if (!(await authorizationInstalled(query))) return;
    const now = new Date();
    const existingSet = await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .where('key', '=', SET)
      .executeTakeFirst();
    if (!existingSet) {
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: SET,
          title: 'Authorization example: my tasks',
          grants: JSON.stringify(grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const assignmentId = `authenticated:*:${SET}`;
    const existingAssignment = await query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('id')
      .where('id', '=', assignmentId)
      .executeTakeFirst();
    if (!existingAssignment) {
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id: assignmentId,
          subjectType: 'authenticated',
          subjectId: '*',
          permissionSetKey: SET,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

/** An application may run this example without the authorization plugin. */
async function authorizationInstalled(query: QueryAdapter): Promise<boolean> {
  try {
    await query
      .selectFrom('authorizationPermissionSets')
      .select('key')
      .limit(1)
      .execute();
    return true;
  } catch {
    return false;
  }
}

export default seed;
