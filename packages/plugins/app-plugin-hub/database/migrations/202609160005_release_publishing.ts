import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609160005_release_publishing',
  async up({ builder, query }) {
    await builder.alterCollection('hubApps', (c) => {
      c.string('deploymentMode', { length: 16 }).notNull().defaultTo('manual');
    });
    // Preserve existing Release identities and deployment history. A canonical
    // checksum mapping deduplicates future uploads without deleting old records.
    await builder.createCollection('hubReleaseChecksums', (c) => {
      c.string('appId', { length: 128 }).notNull();
      c.string('checksum', { length: 64 }).notNull();
      c.string('releaseId', { length: 36 }).notNull();
      c.string('operationId', { length: 36 }).nullable();
      c.primary(['appId', 'checksum']);
    });
    await builder.createCollection('hubReleaseRequests', (c) => {
      c.string('appId', { length: 128 }).notNull();
      c.string('requestKey', { length: 128 }).notNull();
      c.string('checksum', { length: 64 }).notNull();
      c.string('releaseId', { length: 36 }).notNull();
      c.primary(['appId', 'requestKey']);
    });
    await builder.createCollection('hubDeploymentRequests', (c) => {
      c.string('appId', { length: 128 }).notNull();
      c.string('requestKey', { length: 128 }).notNull();
      c.string('fingerprint', { length: 64 }).notNull();
      c.string('deploymentId', { length: 36 }).notNull();
      c.primary(['appId', 'requestKey']);
    });
    const rows = await query
      .selectFrom('hubAppReleases')
      .select(['id', 'appId', 'checksum'])
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    const seen = new Set<string>();
    for (const row of rows) {
      const identity = JSON.stringify([row.appId, row.checksum]);
      if (seen.has(identity)) continue;
      seen.add(identity);
      await query
        .insertInto('hubReleaseChecksums')
        .values({
          appId: row.appId,
          checksum: row.checksum,
          releaseId: row.id,
          operationId: null,
        })
        .execute();
    }
  },
  async down({ builder }) {
    await builder.dropCollection('hubDeploymentRequests');
    await builder.dropCollection('hubReleaseRequests');
    await builder.dropCollection('hubReleaseChecksums');
    await builder.dropField('hubApps', 'deploymentMode');
  },
});
export default migration;
