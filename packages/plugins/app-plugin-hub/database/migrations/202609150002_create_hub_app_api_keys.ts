import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609150002_create_hub_app_api_keys',
  async up({ builder, query }) {
    await builder.createCollection('hubAppApiKeys', (c) => {
      c.string('id', { length: 64 }).primary().notNull();
      c.string('appId', { length: 128 }).notNull();
      c.json('scopes').notNull();
      c.datetime('createdAt').notNull();
      c.datetime('disabledAt');
      c.datetime('lastUsedAt');
      c.index(['appId', 'createdAt']);
      c.foreignKey('id', {
        references: { collection: 'apikey', fields: ['id'] },
        onDelete: 'cascade',
      });
      c.foreignKey('appId', {
        references: { collection: 'hubApps', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
    const role = await query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'grants'])
      .where('key', '=', 'hub-administrator')
      .executeTakeFirst();
    if (role) {
      const grants = (
        typeof role.grants === 'string' ? JSON.parse(role.grants) : role.grants
      ) as Array<{
        resource: { type: string; id: string };
        actions: Array<{ action: string }>;
      }>;
      const grant = grants.find(
        (g) => g.resource.type === 'hub.app' && g.resource.id === '*',
      );
      if (grant && !grant.actions.some((a) => a.action === 'manage-api-keys'))
        grant.actions.push({ action: 'manage-api-keys' });
      else if (!grant)
        grants.push({
          resource: { type: 'hub.app', id: '*' },
          actions: [{ action: 'manage-api-keys' }],
        });
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(grants), updatedAt: new Date() })
        .where('key', '=', 'hub-administrator')
        .execute();
    }
  },
  async down({ builder, query }) {
    const role = await query
      .selectFrom('authorizationPermissionSets')
      .select(['grants'])
      .where('key', '=', 'hub-administrator')
      .executeTakeFirst();
    if (role) {
      const grants = (
        typeof role.grants === 'string' ? JSON.parse(role.grants) : role.grants
      ) as Array<{
        resource: { type: string; id: string };
        actions: Array<{ action: string }>;
      }>;
      for (const grant of grants)
        if (grant.resource.type === 'hub.app' && grant.resource.id === '*')
          grant.actions = grant.actions.filter(
            (a) => a.action !== 'manage-api-keys',
          );
      await query
        .updateTable('authorizationPermissionSets')
        .set({ grants: JSON.stringify(grants), updatedAt: new Date() })
        .where('key', '=', 'hub-administrator')
        .execute();
    }
    await builder.dropCollection('hubAppApiKeys');
  },
});
export default migration;
