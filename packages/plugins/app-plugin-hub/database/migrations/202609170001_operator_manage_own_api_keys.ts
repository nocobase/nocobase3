import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609170001_operator_manage_own_api_keys',
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
          (action) =>
            action.action === 'manage-api-keys' && action.policy === undefined,
        ),
      )
    )
      return;

    // Key management checks creator ownership in HubApiKeyService.
    if (appGrants[0]) appGrants[0].actions.push({ action: 'manage-api-keys' });
    else
      grants.push({
        resource: { type: 'hub.app', id: '*' },
        actions: [{ action: 'manage-api-keys' }],
      });
    await query
      .updateTable('authorizationPermissionSets')
      .set({ grants: JSON.stringify(grants), updatedAt: new Date() })
      .where('key', '=', 'hub-operator')
      .execute();
  },
});

export default migration;
