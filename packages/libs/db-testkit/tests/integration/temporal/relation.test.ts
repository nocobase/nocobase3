import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Temporal relation select', (context) => {
  it('reads nested temporal values through Repository relations', async () => {
    await context.builder.createCollections([
      {
        name: 'temporalRelationParents',
        definition: (collection) => {
          collection.increments('id');
          collection.string('name').notNull();
          collection.datetimeTz('instant').nullable();
          collection
            .hasMany('children', 'temporalRelationChildren')
            .sourceKey('id')
            .foreignKey('parentId');
        },
      },
      {
        name: 'temporalRelationChildren',
        definition: (collection) => {
          collection.increments('id');
          collection.integer('parentId').notNull();
          collection.date('day').nullable();
          collection.time('clock').nullable();
          collection.datetime('local').nullable();
          collection.datetimeTz('instant').nullable();
          collection
            .belongsTo('parent', 'temporalRelationParents')
            .targetKey('id')
            .foreignKey('parentId')
            .constraints(false);
        },
      },
    ]);

    const parents = context.database.repository('temporalRelationParents');
    const children = context.database.repository('temporalRelationChildren');
    const parent = await parents.createOne({
      values: {
        name: 'Parent',
        instant: '2026-09-06T01:30:00Z',
      },
    });
    await children.createOne({
      values: {
        parentId: parent.record.id,
        day: '2026-09-06',
        clock: '09:30:00',
        local: '2026-09-06T09:30:00',
        instant: '2026-09-06T01:30:00Z',
      },
    });

    await expect(
      parents.findOne({
        filter: { id: Number(parent.record.id) },
        select: (select) =>
          select
            .fields('name', 'instant')
            .include('children', (child) =>
              child.fields('day', 'clock', 'local', 'instant'),
            ),
      }),
    ).resolves.toEqual({
      name: 'Parent',
      instant: '2026-09-06T01:30:00.000Z',
      children: [
        {
          day: '2026-09-06',
          clock: '09:30:00.000',
          local: '2026-09-06T09:30:00.000',
          instant: '2026-09-06T01:30:00.000Z',
        },
      ],
    });
  });
});
