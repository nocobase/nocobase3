import { expect, it } from 'vitest';
import type {
  Repository,
  RepositoryRecord,
  SelectAst,
} from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

function selectionWithResult(result: unknown): SelectAst {
  return {
    kind: 'select',
    version: 1,
    root: {
      kind: 'selection',
      fields: ['id'],
      includes: [
        {
          kind: 'include',
          relation: 'tasks',
          select: { kind: 'selection' },
          result,
        },
      ],
    },
  } as SelectAst;
}

const invalidResults: readonly [string, unknown][] = [
  ['null result', null],
  ['false result', false],
  ['array result', []],
  ['string result', 'count'],
  ['missing kind', {}],
  ['missing branches', { kind: 'combine' }],
  ['null branches', { kind: 'combine', branches: null }],
  [
    'array branches',
    {
      kind: 'combine',
      branches: [{ select: { kind: 'selection' }, result: { kind: 'count' } }],
    },
  ],
  ['null branch', { kind: 'combine', branches: { broken: null } }],
  ['primitive branch', { kind: 'combine', branches: { broken: 1 } }],
  [
    'missing branch selection',
    { kind: 'combine', branches: { broken: { result: { kind: 'count' } } } },
  ],
];

describeIntegrationDatabases(
  'Repository relation Select validation',
  (context) => {
    async function prepare(): Promise<void> {
      await createDocumentationFixture(context);
      await context
        .db(context.table('projects'))
        .insert({ id: 'P', name: 'Project', version: 1 });
      await context
        .db(context.table('tasks'))
        .insert({ id: 'T', title: 'Task', project_id: 'P' });
    }

    it.each(invalidResults)(
      'rejects %s with a structured Select error',
      async (_name, result) => {
        await prepare();
        await expect(
          context.database
            .repository('projects')
            .findMany({ select: selectionWithResult(result) }),
        ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
      },
    );

    it('preserves aggregate diagnostics for an unknown aggregate function', async () => {
      await prepare();
      await expect(
        context.database
          .repository('projects')
          .findMany({ select: selectionWithResult({ kind: 'mystery' }) }),
      ).rejects.toMatchObject({ code: 'INVALID_AGGREGATE' });
    });

    it('identifies malformed combine containers and branch names in diagnostics', async () => {
      await prepare();
      const repository = context.database.repository('projects');
      for (const [branches, path] of [
        [[], ['result', 'branches']],
        [{ broken: null }, ['result', 'branches', 'broken']],
      ] as const) {
        await expect(
          repository.findMany({
            select: selectionWithResult({ kind: 'combine', branches }),
          }),
        ).rejects.toMatchObject({
          code: 'INVALID_SELECT',
          collection: 'projects',
          relation: 'tasks',
          path,
        });
      }
    });

    const writes: readonly [
      string,
      (repository: Repository, select: SelectAst) => Promise<unknown>,
    ][] = [
      [
        'createOne',
        (r, select) =>
          r.createOne({
            values: {
              id: 'NEW',
              name: 'New',
              tasks: { create: { id: 'CHILD', title: 'New' } },
            },
            select,
          }),
      ],
      [
        'createMany',
        (r, select) =>
          r.createMany({ values: [{ id: 'NEW', name: 'New' }], select }),
      ],
      [
        'updateOne',
        (r, select) =>
          r.updateOne({
            filter: { id: 'P' },
            values: {
              name: 'Changed',
              tasks: { create: { id: 'CHILD', title: 'New' } },
            },
            select,
          }),
      ],
      [
        'updateMany',
        (r, select) =>
          r.updateMany({
            filter: { id: 'P' },
            values: { name: 'Changed' },
            select,
          }),
      ],
      [
        'upsertOne create',
        (r, select) =>
          r.upsertOne({
            filter: { id: 'NEW' },
            create: { id: 'NEW', name: 'New' },
            update: { name: 'Changed' },
            select,
          }),
      ],
      [
        'upsertOne update',
        (r, select) =>
          r.upsertOne({
            filter: { id: 'P' },
            create: { id: 'P', name: 'New' },
            update: { name: 'Changed' },
            select,
          }),
      ],
      [
        'deleteOne',
        (r, select) => r.deleteOne({ filter: { id: 'P' }, select }),
      ],
      [
        'deleteMany',
        (r, select) => r.deleteMany({ filter: { id: 'P' }, select }),
      ],
    ];
    it.each(writes)(
      'rejects invalid returning before %s modifies any rows',
      async (_name, write) => {
        await prepare();
        async function snapshot(): Promise<RepositoryRecord[][]> {
          return Promise.all(
            ['projects', 'tasks'].map((name) =>
              context.db(context.table(name)).orderBy('id'),
            ),
          );
        }
        const before = await snapshot();
        await expect(
          write(
            context.database.repository('projects'),
            selectionWithResult({
              kind: 'combine',
              branches: { broken: null },
            }),
          ),
        ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
        expect(await snapshot()).toEqual(before);
      },
    );
  },
);
