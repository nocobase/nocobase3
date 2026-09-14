import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Boolean relation select', (context) => {
  it('reads boolean values through nested Repository relations', async () => {
    await context.builder.createCollections([
      {
        name: 'booleanRelationParents',
        definition: (collection) => {
          collection.increments('id');
          collection.string('name').notNull();
          collection.boolean('enabled').nullable();
          collection
            .hasMany('children', 'booleanRelationChildren')
            .sourceKey('id')
            .foreignKey('parentId');
        },
      },
      {
        name: 'booleanRelationChildren',
        definition: (collection) => {
          collection.increments('id');
          collection.integer('parentId').notNull();
          collection.boolean('enabled').nullable();
          collection
            .hasOne('profile', 'booleanRelationProfiles')
            .sourceKey('id')
            .foreignKey('childId');
        },
      },
      {
        name: 'booleanRelationProfiles',
        definition: (collection) => {
          collection.increments('id');
          collection.integer('childId').notNull();
          collection.boolean('enabled').nullable();
        },
      },
    ]);

    const parents = context.database.repository('booleanRelationParents');
    const children = context.database.repository('booleanRelationChildren');
    const profiles = context.database.repository('booleanRelationProfiles');
    const first = await parents.createOne({
      values: { name: 'First', enabled: true },
    });
    const second = await parents.createOne({
      values: { name: 'Second', enabled: null },
    });
    const firstChild = await children.createOne({
      values: { parentId: first.record.id, enabled: false },
    });
    await children.createOne({
      values: { parentId: second.record.id, enabled: true },
    });
    await profiles.createOne({
      values: { childId: firstChild.record.id, enabled: null },
    });

    await expect(
      parents.findMany({
        select: (select) =>
          select
            .fields('name', 'enabled')
            .include('children', (child) =>
              child
                .fields('enabled')
                .include('profile', (profile) => profile.fields('enabled')),
            ),
        sort: (sort) => sort.field('id').asc(),
      }),
    ).resolves.toEqual([
      {
        name: 'First',
        enabled: true,
        children: [
          {
            enabled: false,
            profile: { enabled: null },
          },
        ],
      },
      {
        name: 'Second',
        enabled: null,
        children: [
          {
            enabled: true,
            profile: null,
          },
        ],
      },
    ]);
  });
});
