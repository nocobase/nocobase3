import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609010001_create_hub_app_tables',

  async up({ builder }): Promise<void> {
    await builder.createCollection('hubApps', (collection) => {
      collection.string('id', { length: 128 }).primary().notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.text('description');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });

    await builder.createCollection('hubAppReleases', (collection) => {
      collection.string('id', { length: 36 }).primary().notNull();
      collection.string('appId', { length: 128 }).notNull();
      collection.string('version', { length: 255 }).notNull();
      collection.string('artifactKey', { length: 1024 }).notNull();
      collection.string('checksum', { length: 64 }).notNull();
      collection.bigInt('size').notNull();
      collection.json('configSchema').notNull();
      collection.integer('configSchemaFormatVersion').notNull();
      collection.string('configSchemaDigest', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.unique(['appId', 'version'], { mode: 'index' });
      collection.index(['appId', 'createdAt']);
    });

    await builder.createCollection('hubAppDeployments', (collection) => {
      collection.string('id', { length: 36 }).primary().notNull();
      collection
        .string('appId', { length: 128 })
        .notNull()
        .unique({ mode: 'index' });
      collection.string('desiredReleaseId', { length: 36 });
      collection.string('observedReleaseId', { length: 36 });
      collection.string('desiredState', { length: 16 }).notNull();
      collection.string('observedState', { length: 16 }).notNull();
      collection.bigInt('observedRevision');
      collection.string('basePath', { length: 255 }).notNull();
      collection.string('backend', { length: 32 }).notNull();
      collection.string('activation', { length: 16 }).notNull();
      collection.json('config').notNull();
      collection.text('error');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
    });
  },

  async down({ builder }): Promise<void> {
    await builder.dropCollection('hubAppDeployments');
    await builder.dropCollection('hubAppReleases');
    await builder.dropCollection('hubApps');
  },
});

export default migration;
