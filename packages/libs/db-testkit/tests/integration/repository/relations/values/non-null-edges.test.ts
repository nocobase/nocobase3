import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../../helpers.js';

describeIntegrationDatabases(
  'Repository non-null relation edges',
  (context) => {
    async function prepare(): Promise<void> {
      await context.builder.createCollections([
        {
          name: 'edgeOwners',
          definition: (c) => {
            c.string('code').primary().notNull();
          },
        },
        {
          name: 'edgeChildren',
          definition: (c) => {
            c.string('code').primary().notNull();
            c.string('parentCode').notNull();
          },
        },
        {
          name: 'edgeProfiles',
          definition: (c) => {
            c.string('code').primary().notNull();
            c.string('parentCode').notNull();
          },
        },
        {
          name: 'edgeParents',
          definition: (c) => {
            c.string('code').primary().notNull();
            c.string('label').notNull();
            c.integer('version').notNull();
            c.optimisticLock('version');
            c.string('ownerCode').notNull();
            c.belongsTo('owner', 'edgeOwners')
              .foreignKey('ownerCode')
              .targetKey('code');
            c.hasOne('profile', 'edgeProfiles')
              .sourceKey('code')
              .foreignKey('parentCode');
            c.hasMany('children', 'edgeChildren')
              .sourceKey('code')
              .foreignKey('parentCode');
          },
        },
      ]);
      await context.db(context.table('edgeOwners')).insert({ code: 'O' });
      await context
        .db(context.table('edgeParents'))
        .insert({ code: 'P', label: 'Original', version: 1, owner_code: 'O' });
      await context
        .db(context.table('edgeProfiles'))
        .insert({ code: 'S', parent_code: 'P' });
      await context
        .db(context.table('edgeChildren'))
        .insert({ code: 'C', parent_code: 'P' });
    }

    const tables = [
      'edgeParents',
      'edgeOwners',
      'edgeProfiles',
      'edgeChildren',
    ];
    const snapshot = () =>
      Promise.all(
        tables.map((t) => context.db(context.table(t)).orderBy('code')),
      );

    it.each([
      ['belongsTo disconnect', { owner: { disconnect: true } }],
      ['belongsTo delete', { owner: { delete: {} } }],
      ['hasOne disconnect', { profile: { disconnect: true } }],
      ['hasMany disconnect', { children: { disconnect: { code: 'C' } } }],
      ['hasMany empty replacement', { children: { set: [] } }],
      ['hasMany unchanged replacement', { children: { set: [{ code: 'C' }] } }],
    ] as const)(
      'rejects %s and preserves physical data and root version',
      async (_label, relationValues) => {
        await prepare();
        const before = await snapshot();
        await expect(
          context.database.repository('edgeParents').updateOne({
            filter: { code: 'P' },
            ifVersion: 1,
            values: { label: 'Must roll back', ...relationValues },
          }),
        ).rejects.toMatchObject({ code: 'RELATION_ACTION_NOT_ALLOWED' });
        expect(await snapshot()).toEqual(before);
      },
    );

    it('allows deleting a child without attempting to null its foreign key', async () => {
      await prepare();
      const repository = context.database.repository('edgeParents');
      expect(await context.db(context.table('edgeChildren'))).toEqual([
        { code: 'C', parent_code: 'P' },
      ]);
      await repository.updateOne({
        filter: { code: 'P' },
        values: { children: { delete: { filter: { code: 'C' } } } },
      });
      expect(await context.db(context.table('edgeChildren'))).toEqual([]);
      expect(
        await context
          .db(context.table('edgeParents'))
          .select('code', 'owner_code'),
      ).toEqual([{ code: 'P', owner_code: 'O' }]);
    });
  },
);
