import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the table the Better Auth API Key plugin reads and writes.
 *
 * The shape is spelled out here rather than derived from the plugin's own
 * schema, so a later release of `@better-auth/api-key` cannot change what this
 * migration did. When that schema gains a field, add it in a new migration.
 *
 * The duration fields are milliseconds held in a 32-bit integer, which caps a
 * refill interval or rate-limit window at roughly 24 days. That is well past
 * the one-day default and keeps every dialect returning a number; a longer
 * window needs a widening migration rather than a value that silently wraps.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609150001_create_api_key_table',

  async up({ builder }) {
    await builder.createCollection('apikey', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection
        .string('configId', { length: 128 })
        .notNull()
        .defaultTo('default');
      collection.string('name', { length: 255 }).nullable();
      collection.string('prefix', { length: 64 }).nullable();
      // The first few characters, shown in the UI so a listed key is
      // recognizable. `key` itself is a hash and is never displayed.
      collection.string('start', { length: 64 }).nullable();
      collection.string('key', { length: 255 }).notNull();
      collection.string('referenceId', { length: 64 }).notNull();
      collection.integer('refillInterval').nullable();
      collection.integer('refillAmount').nullable();
      collection.datetime('lastRefillAt').nullable();
      collection.boolean('enabled').notNull().defaultTo(true);
      collection.boolean('rateLimitEnabled').notNull().defaultTo(true);
      collection.integer('rateLimitTimeWindow').nullable();
      collection.integer('rateLimitMax').nullable();
      collection.integer('requestCount').notNull().defaultTo(0);
      collection.integer('remaining').nullable();
      collection.datetime('lastRequest').nullable();
      collection.datetime('expiresAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.text('permissions').nullable();
      collection.text('metadata').nullable();

      collection.primary('id', { name: 'pk_apikey' });
      collection.index('key', { name: 'idx_apikey_key' });
      collection.index('referenceId', { name: 'idx_apikey_reference' });
      collection.index('configId', { name: 'idx_apikey_config' });
      collection.index('expiresAt', { name: 'idx_apikey_expires_at' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('apikey');
  },
});

export default migration;
