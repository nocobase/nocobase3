import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  createDocumentationFixture,
  seedDocumentationProjects,
} from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository createMany contracts', (context) => {
  it('binds JSON and binary values consistently with and without returning', async () => {
    await context.builder.createCollection('batchValues', (c) => {
      c.string('code').primary();
      c.json('payload').nullable();
      c.field({ name: 'bytes', type: 'blob' }).nullable();
    });
    const repository = context.database.repository('batchValues');
    for (const returning of [false, true]) {
      const prefix = returning ? 'R' : 'C';
      await repository.createMany({
        values: [
          {
            code: `${prefix}A`,
            payload: { nested: [1, true, 'text'] },
            bytes: new Uint8Array([1, 2, 3]),
          },
          { code: `${prefix}B`, payload: [1, 2], bytes: null },
        ],
        ...(returning
          ? {
              select: (s: import('../../../../src/index.js').SelectBuilder) =>
                s.fields('code'),
            }
          : {}),
      });
      const rows = await repository.findMany({
        sort: (s) => s.field('code').asc(),
      });
      const first = rows.find((row) => row.code === `${prefix}A`)!;
      const second = rows.find((row) => row.code === `${prefix}B`)!;
      const decode = (value: unknown): unknown =>
        typeof value === 'string' ? JSON.parse(value) : value;
      expect(decode(first.payload)).toEqual({ nested: [1, true, 'text'] });
      expect(Buffer.from(first.bytes as Uint8Array)).toEqual(
        Buffer.from([1, 2, 3]),
      );
      expect(decode(second.payload)).toEqual([1, 2]);
      expect(second.bytes).toBeNull();
      await repository.updateOne({
        filter: { code: `${prefix}A` },
        values: { bytes: null, payload: { changed: true } },
      });
      const updated = await repository.findOne({
        filter: { code: `${prefix}A` },
      });
      expect(updated?.bytes).toBeNull();
      expect(decode(updated?.payload)).toEqual({ changed: true });
    }
  });

  it.each([
    ['empty array', []],
    [
      'invalid later row',
      [
        { id: 'new-a', name: 'A' },
        { id: 'new-b', name: 'B', missingField: 1 },
      ],
    ],
  ])('rejects %s without inserting earlier rows', async (_label, values) => {
    await createDocumentationFixture(context);
    const repository = context.database.repository('projects');
    await expect(
      // Invalid external input must also be rejected at runtime.
      repository.createMany({ values: values as never }),
    ).rejects.toMatchObject({
      code:
        Array.isArray(values) && values.length
          ? 'FIELD_NOT_FOUND'
          : 'INVALID_MUTATION',
    });
    expect(await context.db(context.table('projects'))).toEqual([]);
  });

  it('rolls back earlier inserts on a later database constraint failure', async () => {
    await createDocumentationFixture(context);
    await seedDocumentationProjects(context, 'safe');
    const table = context.table('projects');
    const before = await context.db(table).orderBy('id');
    await expect(
      context.database.repository('projects').createMany({
        values: [
          { id: 'new-a', name: 'New' },
          { id: 'safe-a', name: 'Duplicate' },
        ],
      }),
    ).rejects.toThrow();
    expect(await context.db(table).orderBy('id')).toEqual(before);
  });

  it('initializes managed defaults and returns only selected fields with context values', async () => {
    await createDocumentationFixture(context);
    expect(
      await context.database.repository('projects').createMany({
        values: (v) => [
          { id: 'new-a', name: v.variable('$input.name') },
          { id: 'new-b', name: 'B' },
        ],
        context: { input: { name: 'A' } },
        select: (s) => s.fields('id', 'name'),
      }),
    ).toEqual({
      createdCount: 2,
      records: [
        { id: 'new-a', name: 'A' },
        { id: 'new-b', name: 'B' },
      ],
    });
    expect(
      await context
        .db(context.table('projects'))
        .select('id', 'name', 'status', 'version')
        .orderBy('id'),
    ).toEqual([
      { id: 'new-a', name: 'A', status: 'draft', version: 1 },
      { id: 'new-b', name: 'B', status: 'draft', version: 1 },
    ]);
  });
});
