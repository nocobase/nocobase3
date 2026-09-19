import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202609160003_recoverable_api_keys',
  irreversible: true,
  async up({ builder }) {
    await builder.alterCollection('hubApiKeys', (c) => {
      // Legacy hashes cannot be recovered; only newly issued keys have a ciphertext.
      c.text('encryptedSecret');
    });
  },
});
export default migration;
