import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609160008_operator_remove_own_apps',
  irreversible: true,
  async up({ query }) {
    const role = await query
      .selectFrom('authorizationPermissionSets')
      .select('grants')
      .where('key', '=', 'hub-operator')
      .executeTakeFirstOrThrow();
    const grants = (
      typeof role.grants === 'string' ? JSON.parse(role.grants) : role.grants
    ) as Array<{
      resource: { type: string; id: string };
      actions: Array<{ action: string; policy?: unknown }>;
    }>;
    const appGrants = grants.filter(
      (grant) => grant.resource.type === 'hub.app' && grant.resource.id === '*',
    );
    if (
      appGrants.some((grant) =>
        grant.actions.some(
          (action) => action.action === 'remove' && action.policy === undefined,
        ),
      )
    )
      return;

    // The Hub resource handler also requires ownership for every concrete App.
    if (appGrants[0]) appGrants[0].actions.push({ action: 'remove' });
    else
      grants.push({
        resource: { type: 'hub.app', id: '*' },
        actions: [{ action: 'remove' }],
      });
    await query
      .updateTable('authorizationPermissionSets')
      .set({ grants: JSON.stringify(grants), updatedAt: new Date() })
      .where('key', '=', 'hub-operator')
      .execute();
  },
});

export default migration;
