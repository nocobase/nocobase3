import { expect, it } from 'vitest';
import type {
  FindManyOptions,
  RepositoryRecord,
} from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository findMany contracts', (context) => {
  it('FM-01 returns stable exclusive forward and backward pages with tied sort values', async () => {
    await createDocumentationFixture(context);
    const tasks = context.database.repository('tasks');
    expect(await tasks.findMany()).toEqual([]);
    await context.db(context.table('tasks')).insert([
      { id: 'fm-a', title: 'A', points: 10 },
      { id: 'fm-b', title: 'B', points: 10 },
      { id: 'fm-c', title: 'C', points: 20 },
      { id: 'fm-d', title: 'D', points: 30 },
    ]);
    const options: FindManyOptions<RepositoryRecord> = {
      select: (s) => s.fields('id', 'points'),
      sort: (s) => [s.field('points').asc(), s.field('id').asc()],
      limit: 2,
    };
    const first = [
      { id: 'fm-a', points: 10 },
      { id: 'fm-b', points: 10 },
    ];
    expect(await tasks.findMany(options)).toEqual(first);
    expect(
      await tasks.findMany({ ...options, cursor: { points: 10, id: 'fm-b' } }),
    ).toEqual([
      { id: 'fm-c', points: 20 },
      { id: 'fm-d', points: 30 },
    ]);
    expect(
      await tasks.findMany({
        ...options,
        cursor: { points: 20, id: 'fm-c' },
        direction: 'backward',
      }),
    ).toEqual(first);
    expect(
      await tasks.findMany({ ...options, cursor: { points: 30, id: 'fm-d' } }),
    ).toEqual([]);
    await expect(
      tasks.findMany({ ...options, cursor: { points: 10 } }),
    ).rejects.toMatchObject({ code: 'INVALID_PAGINATION' });
    await expect(
      tasks.findMany({
        ...options,
        cursor: { points: 10, id: 'fm-b' },
        offset: 1,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PAGINATION' });
  });

  it('FM-02 keeps parents with empty locally filtered relations and excludes unselected keys', async () => {
    await createDocumentationFixture(context);
    await context.db(context.table('projects')).insert([
      { id: 'fm-project-a', name: 'A', status: 'draft', version: 1 },
      { id: 'fm-project-b', name: 'B', status: 'draft', version: 1 },
    ]);
    await context.db(context.table('tasks')).insert([
      {
        id: 'fm-open',
        title: 'Open',
        status: 'open',
        project_id: 'fm-project-a',
      },
      {
        id: 'fm-closed',
        title: 'Closed',
        status: 'closed',
        project_id: 'fm-project-a',
      },
    ]);
    expect(
      await context.database.repository('projects').findMany({
        sort: (s) => s.field('id').asc(),
        select: (s) =>
          s.fields('id').include('tasks', (t) =>
            t
              .fields('id')
              .filter({ status: 'open' })
              .sort((s) => s.field('id').asc()),
          ),
      }),
    ).toEqual([
      { id: 'fm-project-a', tasks: [{ id: 'fm-open' }] },
      { id: 'fm-project-b', tasks: [] },
    ]);
  });
});
