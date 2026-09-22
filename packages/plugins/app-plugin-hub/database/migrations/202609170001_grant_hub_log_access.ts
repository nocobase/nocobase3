import { defineMigration, type MigrationDefinition } from '@nocobase/db';

interface Grant {
  resource?: { type?: string; id?: string };
  actions?: { action: string }[];
}
const logGrant: Grant = {
  resource: { type: 'hub.app', id: '*' },
  actions: [{ action: 'read-log' }],
};
const migration: MigrationDefinition = defineMigration({
  name: '202609170001_grant_hub_log_access',
  async up({ query }) {
    const rows = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', 'in', ['hub-administrator', 'hub-operator'])
      .execute();
    for (const row of rows) {
      const grants = (
        typeof row.grants === 'string' ? JSON.parse(row.grants) : row.grants
      ) as Grant[];
      if (
        grants.some(
          (grant) =>
            grant.resource?.type === 'hub.app' &&
            grant.resource.id === '*' &&
            grant.actions?.some(({ action }) => action === 'read-log'),
        )
      )
        continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({
          grants: JSON.stringify([...grants, logGrant]),
          updatedAt: new Date(),
        })
        .where('key', '=', row.key)
        .execute();
    }
  },
  async down({ query }) {
    const rows = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', 'in', ['hub-administrator', 'hub-operator'])
      .execute();
    for (const row of rows) {
      const grants = (
        typeof row.grants === 'string' ? JSON.parse(row.grants) : row.grants
      ) as Grant[];
      const remaining = grants.filter(
        (grant) =>
          !(
            grant.resource?.type === 'hub.app' &&
            grant.resource.id === '*' &&
            grant.actions?.length === 1 &&
            grant.actions[0]?.action === 'read-log'
          ),
      );
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(remaining), updatedAt: new Date() })
        .where('key', '=', row.key)
        .execute();
    }
  },
});
export default migration;
