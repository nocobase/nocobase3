import type { CollectionBuilder } from '@nocobase/database';

/** Stores Better Auth credentials and provider accounts. */
export function createAccountCollection(builder: CollectionBuilder) {
  return builder.createCollection('account', (collection) => {
    collection.string('id', { length: 64 }).notNull();
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

    collection.belongsTo('user', 'user', { index: false })
      .foreignKey('userId')
      .constraints(false);

    collection.primary('id', { name: 'pk_account' });
    collection.unique(['providerId', 'accountId'], {
      name: 'uq_account_provider_account',
    });
    collection.index('userId', { name: 'idx_account_user' });
  });
}
