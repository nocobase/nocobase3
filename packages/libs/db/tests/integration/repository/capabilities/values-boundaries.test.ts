import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository Values boundaries', (context) => {
  it.each([null, false, [], 'value', 42])(
    'rejects malformed values and callback returns %j before writes',
    async (value) => {
      await createDocumentationFixture(context);
      const tasks = context.database.repository('tasks');
      await tasks.createOne({ values: { id: 'A', title: 'Original' } });
      const before = await context.db(context.table('tasks'));
      for (const values of [value, () => value]) {
        await expect(
          tasks.createOne({ values: values as never }),
        ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
        await expect(
          tasks.updateOne({ filter: { id: 'A' }, values: values as never }),
        ).rejects.toMatchObject({ code: 'INVALID_MUTATION' });
        expect(
          await tasks.validateMutation({
            operation: 'createOne',
            values: values as never,
          }),
        ).toMatchObject({
          valid: false,
          errors: [{ code: 'INVALID_MUTATION' }],
        });
      }
      expect(await context.db(context.table('tasks'))).toEqual(before);
    },
  );

  it('distinguishes omitted defaults, explicit null and unchanged update fields', async () => {
    await createDocumentationFixture(context);
    const tasks = context.database.repository('tasks');
    const values = Object.freeze({ id: 'A', title: 'Initial', priority: null });
    expect((await tasks.createOne({ values })).record).toEqual({
      id: 'A',
      title: 'Initial',
      status: 'draft',
      priority: null,
      points: 0,
      projectId: null,
    });
    await tasks.updateOne({
      filter: { id: 'A' },
      values: { priority: 3, points: 5 },
    });
    expect(
      (
        await tasks.updateOne({
          filter: { id: 'A' },
          values: { priority: null },
        })
      ).record,
    ).toEqual({
      id: 'A',
      title: 'Initial',
      status: 'draft',
      priority: null,
      points: 5,
      projectId: null,
    });
    const before = await context.db(context.table('tasks'));
    await expect(
      tasks.updateOne({ filter: { id: 'A' }, values: { title: null } }),
    ).rejects.toThrow();
    expect(await context.db(context.table('tasks'))).toEqual(before);
    expect(values).toEqual({ id: 'A', title: 'Initial', priority: null });
  });

  it('reuses frozen variable and atomic inputs without capturing prior context', async () => {
    await createDocumentationFixture(context);
    const tasks = context.database.repository('tasks');
    await tasks.createMany({
      values: [
        { id: 'A', title: 'A' },
        { id: 'B', title: 'B' },
      ],
    });
    const variable = Object.freeze({
      kind: 'variable' as const,
      path: '$delta',
    });
    const values = Object.freeze({
      points: Object.freeze({ increment: variable }),
    });
    for (const [id, delta] of [
      ['A', 2],
      ['B', 7],
    ] as const) {
      await tasks.updateOne({
        filter: { id },
        values,
        context: Object.freeze({ delta }),
      });
    }
    expect(
      await tasks.findMany({
        sort: (s) => s.field('id').asc(),
        select: (s) => s.fields('id', 'points'),
      }),
    ).toEqual([
      { id: 'A', points: 2 },
      { id: 'B', points: 7 },
    ]);
    expect(values).toEqual({
      points: { increment: { kind: 'variable', path: '$delta' } },
    });
  });

  it.each(['create', 'update'] as const)(
    'validates the unused %s upsert branch without writing',
    async (branch) => {
      await createDocumentationFixture(context);
      const tasks = context.database.repository('tasks');
      if (branch === 'create')
        await tasks.createOne({ values: { id: 'A', title: 'Original' } });
      const before = await context.db(context.table('tasks'));
      await expect(
        tasks.upsertOne({
          filter: { id: 'A' },
          create:
            branch === 'create'
              ? { id: 'A', title: 'New', missing: 1 }
              : { id: 'A', title: 'New' },
          update: branch === 'update' ? { missing: 1 } : { title: 'Changed' },
        }),
      ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND', field: 'missing' });
      expect(await context.db(context.table('tasks'))).toEqual(before);
    },
  );

  it.each(['updateOne', 'deleteOne', 'upsertOne'] as const)(
    'rejects ifVersion on an unversioned collection for %s',
    async (method) => {
      await createDocumentationFixture(context);
      const tasks = context.database.repository('tasks');
      await tasks.createOne({ values: { id: 'A', title: 'Original' } });
      const before = await context.db(context.table('tasks'));
      const options = { filter: { id: 'A' }, ifVersion: 1 };
      const result =
        method === 'updateOne'
          ? tasks.updateOne({ ...options, values: { title: 'Changed' } })
          : method === 'deleteOne'
            ? tasks.deleteOne(options)
            : tasks.upsertOne({
                ...options,
                create: { id: 'A', title: 'New' },
                update: { title: 'Changed' },
              });
      await expect(result).rejects.toMatchObject({
        code: 'INVALID_MUTATION',
        path: ['ifVersion'],
      });
      expect(await context.db(context.table('tasks'))).toEqual(before);
    },
  );
});
