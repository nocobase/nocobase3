import {
  defineMigration,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/app-database';

const migration: MigrationDefinition = defineMigration({
  name: '202608200001_create_authentication_tables',

  async up({ builder }: MigrationContext): Promise<void> {
    await builder.createCollection('user', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('username', { length: 255 }).nullable();
      collection.string('email', { length: 320 }).notNull();
      collection.boolean('emailVerified').notNull().defaultTo(false);
      collection.text('image').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_user' });
      collection.unique('username', { name: 'uq_user_username' });
      collection.unique('email', { name: 'uq_user_email' });
    });

    await builder.createCollection('session', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.datetime('expiresAt').notNull();
      collection.string('token', { length: 255 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.string('ipAddress', { length: 128 }).nullable();
      collection.text('userAgent').nullable();
      collection.string('userId', { length: 64 }).notNull();
      collection.primary('id', { name: 'pk_session' });
      collection.unique('token', { name: 'uq_session_token' });
      collection.index('userId', { name: 'idx_session_user' });
      collection.index('expiresAt', { name: 'idx_session_expires_at' });
    });

    await builder.createCollection('account', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('issuer', { length: 255 }).notNull();
      collection.string('accountId', { length: 320 }).notNull();
      collection.string('providerId', { length: 128 }).notNull();
      collection.string('userId', { length: 64 }).notNull();
      collection.text('accessToken').nullable();
      collection.text('refreshToken').nullable();
      collection.text('idToken').nullable();
      collection.datetime('accessTokenExpiresAt').nullable();
      collection.datetime('refreshTokenExpiresAt').nullable();
      collection.text('scope').nullable();
      collection.text('password').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_account' });
      collection.unique(['issuer', 'accountId'], {
        name: 'uq_account_issuer_account',
      });
      collection.index('userId', { name: 'idx_account_user' });
    });

    await builder.createCollection('verification', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('identifier', { length: 320 }).notNull();
      collection.text('value').notNull();
      collection.datetime('expiresAt').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_verification' });
      collection.index('identifier', { name: 'idx_verification_identifier' });
      collection.index('expiresAt', { name: 'idx_verification_expires_at' });
    });
  },

  async down({ builder }: MigrationContext): Promise<void> {
    await builder.dropCollection('verification');
    await builder.dropCollection('account');
    await builder.dropCollection('session');
    await builder.dropCollection('user');
  },
});

export default migration;
