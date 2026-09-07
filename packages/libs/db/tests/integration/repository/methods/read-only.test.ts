import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';

describeIntegrationDatabases('Repository read-only collections', (context) => {
  async function prepare(): Promise<void> {
    await context.builder.createCollection('viewSource', (c) => {
      c.string('code').primary().notNull();
      c.string('label').notNull();
    });
    await context
      .db(context.table('viewSource'))
      .insert({ code: 'A', label: 'Original' });
    await context.builder.createViewCollection('readOnlyRows', (v) => {
      v.string('code');
      v.string('label');
      v.as((q) => q.from('viewSource').select('code', 'label'));
    });
  }

  it.each([
    'createOne',
    'createMany',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'upsertOne',
  ] as const)(
    '%s refuses a view before mutating its source',
    async (method) => {
      await prepare();
      const repository = context.database.repository('readOnlyRows');
      const values = { code: 'B', label: 'Changed' };
      const result =
        method === 'createOne'
          ? repository.createOne({ values })
          : method === 'createMany'
            ? repository.createMany({ values: [values] })
            : method === 'updateOne'
              ? repository.updateOne({
                  filter: { code: 'A' },
                  values: { label: 'Changed' },
                })
              : method === 'updateMany'
                ? repository.updateMany({
                    all: true,
                    values: { label: 'Changed' },
                  })
                : method === 'deleteOne'
                  ? repository.deleteOne({ filter: { code: 'A' } })
                  : method === 'deleteMany'
                    ? repository.deleteMany({ all: true })
                    : repository.upsertOne({
                        filter: { code: 'A' },
                        create: { code: 'A', label: 'New' },
                        update: { label: 'Changed' },
                      });
      await expect(result).rejects.toMatchObject({
        code: 'READ_ONLY_COLLECTION',
        collection: 'readOnlyRows',
      });
      expect(await context.db(context.table('viewSource'))).toEqual([
        { code: 'A', label: 'Original' },
      ]);
    },
  );

  it('allows reads and returns read-only validation diagnostics without writes', async () => {
    await prepare();
    const repository = context.database.repository('readOnlyRows');
    expect(
      await repository.findMany({ select: (s) => s.fields('code') }),
    ).toEqual([{ code: 'A' }]);
    expect(await repository.findOne({ filter: { code: 'A' } })).toEqual({
      code: 'A',
      label: 'Original',
    });
    expect(await repository.count()).toBe(1);
    expect(await repository.exists({ filter: { code: 'missing' } })).toBe(
      false,
    );
    for (const operation of ['createOne', 'updateOne'] as const) {
      expect(
        await repository.validateMutation({
          operation,
          filter: { code: 'A' },
          values: { label: 'Changed' },
        }),
      ).toMatchObject({
        valid: false,
        errors: [{ code: 'READ_ONLY_COLLECTION' }],
      });
    }
    expect(await context.db(context.table('viewSource'))).toEqual([
      { code: 'A', label: 'Original' },
    ]);
  });
});
