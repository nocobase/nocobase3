import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609160001_global_hub_api_keys',
  // A multi-App binding cannot be represented by the previous single-App schema.
  irreversible: true,
  async up({ builder, query }) {
    await builder.createCollection('hubApiKeys', (c) => {
      c.string('id', { length: 64 }).primary().notNull();
      c.json('scopes').notNull();
      c.datetime('createdAt').notNull();
      c.datetime('disabledAt');
      c.datetime('lastUsedAt');
      c.foreignKey('id', {
        references: { collection: 'apikey', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
    await builder.createCollection('hubApiKeyApps', (c) => {
      c.string('keyId', { length: 64 }).notNull();
      c.string('appId', { length: 128 }).notNull();
      c.primary(['keyId', 'appId']);
      c.index(['appId']);
      c.foreignKey('keyId', {
        references: { collection: 'hubApiKeys', fields: ['id'] },
        onDelete: 'cascade',
      });
      c.foreignKey('appId', {
        references: { collection: 'hubApps', fields: ['id'] },
        onDelete: 'cascade',
      });
    });
    const rows = await query.selectFrom('hubAppApiKeys').selectAll().execute();
    for (const row of rows) {
      const previous = (
        typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes
      ) as string[];
      // Never turn a legacy read permission into a write permission.
      const scopes = previous.filter(
        (action) => action === 'upload-release' || action === 'deploy',
      );
      await query
        .insertInto('hubApiKeys')
        .values({
          id: row.id,
          scopes: JSON.stringify(scopes),
          createdAt: row.createdAt,
          disabledAt: row.disabledAt,
          lastUsedAt: row.lastUsedAt,
        })
        .execute();
      await query
        .insertInto('hubApiKeyApps')
        .values({ keyId: row.id, appId: row.appId })
        .execute();
    }
    await builder.dropCollection('hubAppApiKeys');
  },
});
export default migration;
