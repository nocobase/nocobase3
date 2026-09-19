import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609160007_release_config_fingerprint',
  async up({ builder }) {
    await builder.alterCollection('hubReleaseChecksums', (collection) => {
      collection.string('configFingerprint', { length: 64 }).nullable();
    });
  },
  async down({ builder }) {
    await builder.dropField('hubReleaseChecksums', 'configFingerprint');
  },
});
export default migration;
