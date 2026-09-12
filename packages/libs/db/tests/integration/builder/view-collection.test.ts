import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('view collections', (context) => {
  it('creates and replaces views', async () => {
    const adultUsersView = context.table('adultUsers');

    await context.builder.createCollection('users', (collection) => {
      collection.increments('id');
      collection.string('firstName');
      collection.integer('age');
    });
    await context.db(context.table('users')).insert([
      { first_name: 'Ada', age: 22 },
      { first_name: 'Tim', age: 17 },
    ]);

    await context.builder.createViewCollection('adultUsers', (view) => {
      view.string('firstName');
      view.as((query) =>
        query.from('users').select('firstName').where('age', '>', 18),
      );
    });

    await expect(context.db(adultUsersView).select('*')).resolves.toEqual([
      { first_name: 'Ada' },
    ]);

    await context.builder.replaceViewCollection('adultUsers', (view) => {
      view.string('firstName');
      view.as((query) =>
        query.from('users').select('firstName').where('age', '>', 16),
      );
    });

    await expect(
      context.db(adultUsersView).select('*').orderBy('first_name'),
    ).resolves.toEqual([{ first_name: 'Ada' }, { first_name: 'Tim' }]);
  });
});
