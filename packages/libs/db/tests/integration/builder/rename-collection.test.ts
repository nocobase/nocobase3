import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('collection rename', (context) => {
  it('renames only collection metadata by default without renaming the backing table', async () => {
    await context.builder.createCollection('users', (collection) => {
      collection.increments('id');
      collection.string('email');
    });

    await context
      .db(context.table('users'))
      .insert({ email: 'ada@example.com' });
    await context.builder.renameCollection('users', 'appUsers');

    expect(await context.db.schema.hasTable(context.table('users'))).toBe(true);
    expect(await context.db.schema.hasTable(context.table('appUsers'))).toBe(
      false,
    );
    expect(await context.metadataStore.getCollection('appUsers')).toMatchObject(
      {
        name: 'appUsers',
        tableName: context.table('users'),
      },
    );
    await expect(
      context.db(context.table('users')).select('email'),
    ).resolves.toEqual([{ email: 'ada@example.com' }]);
  });

  it('renames the backing table by convention when requested', async () => {
    await context.builder.createCollection('users', (collection) => {
      collection.increments('id');
      collection.string('email');
    });

    await context
      .db(context.table('users'))
      .insert({ email: 'ada@example.com' });
    await context.builder.renameCollection('users', 'appUsers', {
      renameTable: true,
    });

    expect(await context.db.schema.hasTable(context.table('users'))).toBe(
      false,
    );
    expect(await context.db.schema.hasTable(context.table('appUsers'))).toBe(
      true,
    );
    await expect(
      context.db(context.table('appUsers')).select('email'),
    ).resolves.toEqual([{ email: 'ada@example.com' }]);
  });

  it('renames the backing table to an explicit physical table name', async () => {
    const renamedTable = context.identifier('renamed_users');

    await context.builder.createCollection('legacyUsers', (collection) => {
      collection.tableName(context.identifier('legacy_users'));
      collection.increments('id');
    });

    await context.builder.renameCollection('legacyUsers', 'users', {
      renameTableTo: renamedTable,
    });

    expect(
      await context.db.schema.hasTable(context.identifier('legacy_users')),
    ).toBe(false);
    expect(await context.db.schema.hasTable(renamedTable)).toBe(true);
    expect(await context.metadataStore.getCollection('users')).toMatchObject({
      name: 'users',
      tableName: renamedTable,
    });
  });
});
