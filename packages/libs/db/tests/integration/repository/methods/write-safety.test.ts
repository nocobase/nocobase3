import { expect, it } from 'vitest';
import type { FilterAst } from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  createDocumentationFixture,
  seedDocumentationProjects,
} from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository write safety contracts', (context) => {
  for (const method of ['updateOne', 'deleteOne'] as const) {
    it.each([
      ['missing', { id: 'missing' }, undefined, 'RECORD_NOT_FOUND'],
      ['multiple', { status: 'active' }, undefined, 'MULTIPLE_RECORDS_MATCHED'],
      ['stale version', { id: 'safe-a' }, 2, 'VERSION_CONFLICT'],
      ['empty filter', {}, undefined, 'INVALID_FILTER'],
    ] as const)(
      `${method} rejects %s without changing physical rows`,
      async (_label, filter, ifVersion, code) => {
        await createDocumentationFixture(context);
        await seedDocumentationProjects(context, 'safe');
        const table = context.table('projects');
        const before = await context.db(table).orderBy('id');
        const repository = context.database.repository('projects');
        await expect(
          repository[method]({
            filter,
            ifVersion,
            values: { name: 'Changed' },
          }),
        ).rejects.toMatchObject({ code });
        expect(await context.db(table).orderBy('id')).toEqual(before);
      },
    );

    it(`${method} refuses an invalid returning projection before mutation`, async () => {
      await createDocumentationFixture(context);
      await seedDocumentationProjects(context, 'safe');
      const table = context.table('projects');
      const before = await context.db(table).orderBy('id');
      await expect(
        context.database.repository('projects')[method]({
          filter: { id: 'safe-a' },
          values: { name: 'Changed' },
          select: (s) => s.fields('missing'),
        }),
      ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND' });
      expect(await context.db(table).orderBy('id')).toEqual(before);
    });
  }

  const emptyAst: FilterAst = {
    kind: 'filter',
    version: 1,
    root: { kind: 'group', logic: 'and', items: [] },
  };
  for (const method of ['updateMany', 'deleteMany'] as const) {
    it.each([
      ['missing range', {}],
      ['empty shorthand', { filter: {} }],
      ['empty AST', { filter: emptyAst }],
      ['ambiguous range', { all: true, filter: { status: 'active' } }],
    ] as const)(
      `${method} refuses %s without touching rows`,
      async (_label, range) => {
        await createDocumentationFixture(context);
        await seedDocumentationProjects(context, 'safe');
        const table = context.table('projects');
        const before = await context.db(table).orderBy('id');
        await expect(
          context.database
            .repository('projects')
            [method]({ ...range, values: { name: 'Changed' } } as never),
        ).rejects.toMatchObject({ code: 'INVALID_FILTER' });
        expect(await context.db(table).orderBy('id')).toEqual(before);
      },
    );

    it(`${method} reports zero for no matches and accepts explicit all-record scope`, async () => {
      await createDocumentationFixture(context);
      await seedDocumentationProjects(context, 'safe');
      const repository = context.database.repository('projects');
      const table = context.table('projects');
      const before = await context.db(table).orderBy('id');
      const countKey =
        method === 'updateMany' ? 'updatedCount' : 'deletedCount';
      expect(
        await repository[method]({
          filter: { id: 'missing' },
          values: { name: 'Changed' },
          select: (s) => s.fields('id'),
        }),
      ).toEqual({ [countKey]: 0, records: [] });
      expect(await context.db(table).orderBy('id')).toEqual(before);
      expect(
        await repository[method]({ all: true, values: { name: 'Changed' } }),
      ).toEqual({ [countKey]: 3 });
      const after = await context
        .db(table)
        .select('id', 'name', 'version')
        .orderBy('id');
      expect(after).toEqual(
        method === 'deleteMany'
          ? []
          : [
              { id: 'safe-a', name: 'Changed', version: 2 },
              { id: 'safe-b', name: 'Changed', version: 2 },
              { id: 'safe-c', name: 'Changed', version: 2 },
            ],
      );
    });
  }
});
