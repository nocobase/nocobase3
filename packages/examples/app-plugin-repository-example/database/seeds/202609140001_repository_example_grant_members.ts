import {
  defineSeed,
  type QueryAdapter,
  type SeedDefinition,
} from '@nocobase/db';

const SET = 'repository-example';

/** The Collections this example exposes over HTTP. */
const collections: readonly string[] = [
  'repositoryExampleCustomers',
  'repositoryExampleContacts',
  'repositoryExampleProducts',
  'repositoryExampleOrders',
  'repositoryExampleOrderItems',
  'repositoryExampleAtomicCounters',
  'repositoryExampleRelationUsers',
  'repositoryExampleRelationProjectProfiles',
  'repositoryExampleRelationTasks',
  'repositoryExampleRelationTags',
  'repositoryExampleRelationProjectTags',
  'repositoryExampleRelationProjects',
  'repositoryExampleFindManyRecords',
];

const actions: readonly string[] = ['read', 'create', 'update', 'delete'];

/**
 * A shared workspace: every signed-in user may work with the sample records.
 * The grants are what `authz.database.grant()` produces, written out because a
 * seed reaches the tables rather than the running authorization.
 */
const grants = collections.map((name) => ({
  resource: { type: 'database.collection', id: `main.${name}` },
  actions: actions.map((action) => ({
    action,
    policy: {
      type: 'database',
      fields: { input: '*', output: '*' },
      recordAccess: ['allRecords'],
    },
  })),
}));

const seed: SeedDefinition = defineSeed({
  name: '202609140001_repository_example_grant_members',

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
          title: 'Repository example',
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
