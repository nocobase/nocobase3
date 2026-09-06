import { expect, it } from 'vitest';
import type { RepositoryFilter } from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import {
  createDocumentationFixture,
  seedDocumentationProjects,
} from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository count contracts', (context) => {
  it('CT-01 does not inherit pagination, filters or context from another call', async () => {
    await createDocumentationFixture(context);
    const projects = context.database.repository('projects');
    expect(await projects.count()).toBe(0);
    await seedDocumentationProjects(context, 'ct');
    const before = await context.db(context.table('projects')).orderBy('id');
    const filter: RepositoryFilter<Record<string, unknown>> = (f) =>
      f.string('status').eq(f.variable('$status'));
    expect(
      await projects.findMany({
        filter,
        context: { status: 'active' },
        select: (s) => s.fields('id'),
        sort: (s) => s.field('id').asc(),
        limit: 1,
        offset: 1,
      }),
    ).toEqual([{ id: 'ct-b' }]);
    for (const [status, expected] of [
      ['active', 2],
      ['draft', 1],
      ['missing', 0],
    ] as const) {
      expect(await projects.count({ filter, context: { status } })).toBe(
        expected,
      );
    }
    expect(await projects.count()).toBe(3);
    await expect(projects.count({ filter })).rejects.toMatchObject({
      code: 'VARIABLE_NOT_FOUND',
    });
    expect(await context.db(context.table('projects')).orderBy('id')).toEqual(
      before,
    );
  });

  it('CT-02 counts matching parents once even when several children match', async () => {
    await createDocumentationFixture(context);
    await context.db(context.table('projects')).insert([
      { id: 'ct-parent-a', name: 'A', status: 'draft', version: 1 },
      { id: 'ct-parent-b', name: 'B', status: 'draft', version: 1 },
    ]);
    await context.db(context.table('tasks')).insert([
      {
        id: 'ct-task-a',
        title: 'A',
        status: 'open',
        project_id: 'ct-parent-a',
      },
      {
        id: 'ct-task-b',
        title: 'B',
        status: 'open',
        project_id: 'ct-parent-a',
      },
    ]);
    expect(
      await context.database.repository('projects').count({
        filter: (f) =>
          f.relation('tasks').some((t) => t.string('status').eq('open')),
      }),
    ).toBe(1);
  });
});
