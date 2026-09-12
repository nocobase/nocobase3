import { expect, it } from 'vitest';
import type {
  RepositorySelect,
  RepositoryRecord,
} from '../../../../src/index.js';
import { DefaultSelectBuilder } from '../../../../src/repository/select-builder.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository Select contracts', (context) => {
  async function prepare(): Promise<void> {
    await createDocumentationFixture(context);
    await context
      .db(context.table('projects'))
      .insert({ id: 'P', name: 'Project', status: 'draft', version: 1 });
    await context
      .db(context.table('tasks'))
      .insert({ id: 'T', title: 'Task', project_id: 'P' });
  }

  it('distinguishes omitted fields from explicit empty fields in Builder and AST', async () => {
    await prepare();
    const repository = context.database.repository('projects');
    const full = { id: 'P', name: 'Project', status: 'draft', version: 1 };
    expect(await repository.findMany()).toEqual([full]);
    expect(await repository.findMany({ select: (s) => s })).toEqual([full]);
    expect(
      await repository.findMany({
        select: (s) => s.include('tasks', (t) => t.fields('title')),
      }),
    ).toEqual([{ ...full, tasks: [{ title: 'Task' }] }]);
    const selections: RepositorySelect<RepositoryRecord>[] = [
      (s) => s.fields(),
      { kind: 'select', version: 1, root: { kind: 'selection', fields: [] } },
    ];
    for (const select of selections) {
      expect(await repository.findMany({ select })).toEqual([{}]);
      expect(await repository.findOne({ filter: { id: 'P' }, select })).toEqual(
        {},
      );
    }
    expect(
      await repository.findMany({
        select: (s) => s.fields().include('tasks', (t) => t.fields()),
      }),
    ).toEqual([{ tasks: [{}] }]);
    expect(
      await repository.findMany({
        select: (s) => s.fields('name').fields('status'),
      }),
    ).toEqual([{ name: 'Project', status: 'draft' }]);
  });

  it('uses an empty returning projection without exposing identity or managed fields', async () => {
    await createDocumentationFixture(context);
    const repository = context.database.repository('projects');
    expect(
      await repository.createOne({
        values: { id: 'P', name: 'New' },
        select: (s) => s.fields(),
      }),
    ).toEqual({ record: {}, version: 1, createdTargets: [] });
    expect(
      await repository.updateOne({
        filter: { id: 'P' },
        values: { name: 'Changed' },
        select: (s) => s.fields(),
      }),
    ).toEqual({ record: {}, version: 2, createdTargets: [] });
    expect(
      await repository.deleteOne({
        filter: { id: 'P' },
        select: (s) => s.fields(),
      }),
    ).toEqual({ deleted: true, record: {} });
    expect(await context.db(context.table('projects'))).toEqual([]);
  });

  const malformed: readonly [string, unknown][] = [
    ['null selection', null],
    [
      'non-string field',
      {
        kind: 'select',
        version: 1,
        root: { kind: 'selection', fields: [null] },
      },
    ],
    ['wrong kind', { kind: 'filter', version: 1, root: { kind: 'selection' } }],
    [
      'wrong version',
      { kind: 'select', version: 2, root: { kind: 'selection' } },
    ],
    [
      'wrong collection',
      {
        kind: 'select',
        version: 1,
        collection: 'tasks',
        root: { kind: 'selection' },
      },
    ],
    ['missing root', { kind: 'select', version: 1 }],
    ['wrong root', { kind: 'select', version: 1, root: { kind: 'group' } }],
    [
      'fields is not an array',
      {
        kind: 'select',
        version: 1,
        root: { kind: 'selection', fields: 'name' },
      },
    ],
    [
      'includes is not an array',
      { kind: 'select', version: 1, root: { kind: 'selection', includes: {} } },
    ],
    [
      'null include',
      {
        kind: 'select',
        version: 1,
        root: { kind: 'selection', includes: [null] },
      },
    ],
    [
      'wrong include kind',
      {
        kind: 'select',
        version: 1,
        root: {
          kind: 'selection',
          includes: [{ kind: 'selection', relation: 'tasks' }],
        },
      },
    ],
  ];
  it.each(malformed)(
    'rejects %s with a Select diagnostic before writing',
    async (_name, input) => {
      await prepare();
      const repository = context.database.repository('projects');
      const before = await context.db(context.table('projects'));
      const select = input as RepositorySelect<RepositoryRecord>;
      await expect(repository.findMany({ select })).rejects.toMatchObject({
        code: 'INVALID_SELECT',
      });
      await expect(
        repository.updateOne({
          filter: { id: 'P' },
          values: {
            name: 'Forbidden',
            tasks: { create: { id: 'NEW', title: 'Forbidden' } },
          },
          select,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
      expect(await context.db(context.table('projects'))).toEqual(before);
      expect(await context.db(context.table('tasks')).select('id')).toEqual([
        { id: 'T' },
      ]);
    },
  );

  it('rejects callbacks returning a different root Builder or arbitrary relation objects', async () => {
    await prepare();
    const repository = context.database.repository('projects');
    await expect(
      repository.findMany({ select: (() => undefined) as never }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
    await expect(
      repository.findMany({
        select: () => new DefaultSelectBuilder().fields('name'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
    await expect(
      repository.findMany({
        select: (s) => s.include('tasks', (() => ({})) as never),
      }),
    ).rejects.toThrow();
  });
});
