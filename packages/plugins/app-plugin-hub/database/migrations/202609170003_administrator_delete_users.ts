import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609170003_administrator_delete_users',
  irreversible: true,
  async up({ query }) {
    const role = await query
      .selectFrom('authorizationPermissionSets')
      .select('grants')
      .where('key', '=', 'hub-administrator')
      .executeTakeFirstOrThrow();
    const grants = (
      typeof role.grants === 'string' ? JSON.parse(role.grants) : role.grants
    ) as Array<{
      resource: { type: string; id: string };
      actions: Array<{ action: string; policy?: unknown }>;
    }>;
    const appGrants = grants.filter(
      (grant) => grant.resource.type === 'user' && grant.resource.id === '*',
    );
    if (
      appGrants.some((grant) =>
        grant.actions.some(
          (action) => action.action === 'delete' && action.policy === undefined,
        ),
      )
    )
      return;

    // Deletion lifecycle rules are enforced by the Users service and Hub role scope.
    if (appGrants[0]) appGrants[0].actions.push({ action: 'delete' });
    else
      grants.push({
        resource: { type: 'user', id: '*' },
        actions: [{ action: 'delete' }],
      });
    await query
      .updateTable('authorizationPermissionSets')
      .set({ grants: JSON.stringify(grants), updatedAt: new Date() })
      .where('key', '=', 'hub-administrator')
      .execute();
  },
});

export default migration;
