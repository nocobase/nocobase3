import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/db';

/**
 * The request headers a model service sends with every call.
 *
 * - `headers`: `{ name, secret, value }[]`, in order; a secret header's `value` is null, its value is in
 *   `headersEncrypted`.
 * - `headersEncrypted`: the secret headers' values as one JSON object keyed by lower-case name, sealed with the
 *   application's secrets keys like the API key and bound to the service's name; null when there are none.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610080001_ag_add_model_service_headers',

  async up({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection('agModelServices', (collection) => {
      collection.json('headers').notNull().defaultTo([]);
      collection.text('headersEncrypted').nullable();
    });
  },

  async down({ builder }: MigrationContext): Promise<void> {
    await builder.alterCollection('agModelServices', (collection) => {
      collection.dropField('headersEncrypted');
      collection.dropField('headers');
    });
  },
});

export default migration;
