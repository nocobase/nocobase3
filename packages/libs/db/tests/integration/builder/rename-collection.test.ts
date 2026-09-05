import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('collection rename', (context) => {
  it('renames the backing table and preserves data', async () => {
    await context.builder.createCollection('users', (collection) => {
      collection.increments('id');
      collection.string('email');
    });
    await context
      .db(context.table('users'))
      .insert({ email: 'ada@example.com' });

    await context.builder.renameCollection('users', 'appUsers');

    expect(await context.db.schema.hasTable(context.table('users'))).toBe(
      false,
    );
    expect(await context.db.schema.hasTable(context.table('appUsers'))).toBe(
      true,
    );
    await expect(
      context.db(context.table('appUsers')).select('email'),
    ).resolves.toEqual([{ email: 'ada@example.com' }]);
    await expect(
      context.metadataStore.get('appUsers'),
    ).resolves.toBeUndefined();
  });

  it('rejects rename before DDL when dependent metadata exists', async () => {
    await context.builder.createCollection('users', (collection) => {
      collection.increments('id');
    });
    await context.builder.createCollection('posts', (collection) => {
      collection.increments('id');
      collection
        .belongsTo('author', 'users')
        .targetKey('id')
        .foreignKey('authorId')
        .foreignKeyType('bigInt');
    });

    await expect(
      context.builder.renameCollection('users', 'appUsers'),
    ).rejects.toMatchObject({
      code: 'COLLECTION_RENAME_HAS_DEPENDENCIES',
    });
    expect(await context.db.schema.hasTable(context.table('users'))).toBe(true);
    expect(await context.db.schema.hasTable(context.table('appUsers'))).toBe(
      false,
    );
  });
});
