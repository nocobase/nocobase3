import { expect, it } from 'vitest';
import type {
  RepositoryRecord,
  RepositorySelect,
  SelectAst,
} from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

function freezeGraph(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeGraph(child);
    Object.freeze(value);
  }
}

describeIntegrationDatabases('Repository Select isolation', (context) => {
  async function prepare(): Promise<void> {
    await createDocumentationFixture(context);
    await context.db(context.table('projects')).insert([
      { id: 'P', name: 'Project', version: 1 },
      { id: 'Q', name: 'Empty', version: 1 },
    ]);
    await context.db(context.table('tasks')).insert([
      {
        id: 'A',
        title: 'Alpha',
        status: 'draft',
        priority: 0,
        project_id: 'P',
      },
      { id: 'B', title: 'Beta', status: 'draft', priority: 1, project_id: 'P' },
      { id: 'C', title: 'Gamma', status: 'done', priority: 2, project_id: 'P' },
      {
        id: 'D',
        title: 'Delta',
        status: 'draft',
        priority: 3,
        project_id: 'P',
      },
      {
        id: 'E',
        title: 'Epsilon',
        status: 'done',
        priority: 4,
        project_id: 'P',
      },
    ]);
  }

  it('inherits common options and permits independent branch overrides while ANDing filters', async () => {
    await prepare();
    const rows = await context.database.repository('projects').findMany({
      sort: (s) => s.field('id').asc(),
      select: (s) =>
        s.fields('id').include('tasks', (t) =>
          t
            .filter((f) => f.number('priority').gt(0))
            .sort((s) => s.field('id').asc())
            .cursor({ id: 'A' })
            .direction('forward')
            .limit(1)
            .distinct(['status'])
            .combine({
              inherited: t.fields('id'),
              count: t.count(),
              done: t.filter({ status: 'done' }).fields('id'),
              excluded: t.filter({ id: 'A' }).count(),
              overridden: t
                .sort((s) => s.field('id').desc())
                .cursor({ id: 'E' })
                .direction('forward')
                .limit(3)
                .distinct(['id'])
                .fields('id'),
              backward: t
                .cursor({ id: 'E' })
                .direction('backward')
                .fields('id'),
            }),
        ),
    });
    expect(rows).toEqual([
      {
        id: 'P',
        tasks: {
          inherited: [{ id: 'B' }],
          count: 1,
          done: [{ id: 'C' }],
          excluded: 0,
          overridden: [{ id: 'D' }, { id: 'C' }, { id: 'B' }],
          backward: [{ id: 'C' }],
        },
      },
      {
        id: 'Q',
        tasks: {
          inherited: [],
          count: 0,
          done: [],
          excluded: 0,
          overridden: [],
          backward: [],
        },
      },
    ]);
  });

  it('reuses frozen AST and Builder callbacks across contexts without leaking bound values', async () => {
    await prepare();
    const ast: SelectAst = {
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
            filter: {
              kind: 'filter',
              version: 1,
              root: {
                kind: 'group',
                logic: 'and',
                items: [
                  {
                    kind: 'condition',
                    path: ['status'],
                    operator: '$eq',
                    value: { kind: 'variable', path: '$status' },
                  },
                ],
              },
            },
            result: {
              kind: 'combine',
              branches: {
                count: {
                  select: { kind: 'selection' },
                  result: { kind: 'count' },
                },
                records: { select: { kind: 'selection', fields: ['id'] } },
              },
            },
          },
        ],
      },
    };
    const before = JSON.stringify(ast);
    freezeGraph(ast);
    const builder: RepositorySelect<RepositoryRecord> = (s) =>
      s
        .fields('id')
        .include('tasks', (t) =>
          t
            .filter((f) => f.string('status').eq(f.variable('$status')))
            .combine({ count: t.count(), records: t.fields('id') }),
        );
    const repository = context.database.repository('projects');
    for (const select of [ast, builder]) {
      for (const status of ['draft', 'done', 'draft']) {
        const ids = status === 'draft' ? ['A', 'B', 'D'] : ['C', 'E'];
        const rows = await repository.findMany({
          filter: { id: 'P' },
          select,
          context: { status },
        });
        expect(rows).toEqual([
          {
            id: 'P',
            tasks: { count: ids.length, records: ids.map((id) => ({ id })) },
          },
        ]);
      }
    }
    expect(JSON.stringify(ast)).toBe(before);
  });

  it('distinguishes all-null aggregate inputs from absent children', async () => {
    await prepare();
    await context.db(context.table('tasks')).update({ priority: null });
    const rows = await context.database.repository('projects').findMany({
      sort: (s) => s.field('id').asc(),
      select: (s) =>
        s.fields('id').include('tasks', (t) =>
          t.combine({
            count: t.count(),
            populated: t.count('priority'),
            sum: t.sum('priority'),
            avg: t.avg('priority'),
            min: t.min('priority'),
            max: t.max('priority'),
          }),
        ),
    });
    const emptyAggregates = {
      populated: 0,
      sum: null,
      avg: null,
      min: null,
      max: null,
    };
    expect(rows).toEqual([
      { id: 'P', tasks: { count: 5, ...emptyAggregates } },
      { id: 'Q', tasks: { count: 0, ...emptyAggregates } },
    ]);
  });
});
