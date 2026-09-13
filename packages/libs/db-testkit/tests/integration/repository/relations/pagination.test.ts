import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases('Repository relations/pagination', (context) => {
  it('applies relation-local limit and one shared cursor per parent', async () => {
    await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');
    const first = await repository.createOne({
      values: {
        name: 'First paged project',
        tasks: {
          create: [
            { title: 'First A' },
            { title: 'First B' },
            { title: 'First C' },
          ],
        },
      },
      select: (select) =>
        select
          .fields('id')
          .include('tasks', (tasks) => tasks.fields('id', 'title')),
    });
    await repository.createOne({
      values: {
        name: 'Second paged project',
        tasks: {
          create: [{ title: 'Second A' }, { title: 'Second B' }],
        },
      },
    });

    await expect(
      repository.findMany({
        filter: (filter) => filter.string('name').includes('paged project'),
        select: (select) =>
          select.fields('name').include('tasks', (tasks) =>
            tasks
              .fields('id', 'title')
              .sort((sort) => sort.field('id').desc())
              .limit(2),
          ),
      }),
    ).resolves.toMatchObject([
      {
        name: 'First paged project',
        tasks: [{ title: 'First C' }, { title: 'First B' }],
      },
      {
        name: 'Second paged project',
        tasks: [{ title: 'Second B' }, { title: 'Second A' }],
      },
    ]);

    const firstTasks = first.record.tasks as unknown as Array<{
      id: number;
      title: string;
    }>;
    const cursorId = firstTasks[1]?.id;
    await expect(
      repository.findMany({
        filter: (filter) => filter.string('name').includes('paged project'),
        select: (select) =>
          select.fields('name').include('tasks', (tasks) =>
            tasks
              .fields('title')
              .sort((sort) => sort.field('id').asc())
              .cursor({ id: cursorId })
              .direction('backward')
              .limit(1),
          ),
      }),
    ).resolves.toEqual([
      { name: 'First paged project', tasks: [{ title: 'First A' }] },
      { name: 'Second paged project', tasks: [] },
    ]);
    await expect(
      repository.findMany({
        filter: (filter) => filter.string('name').includes('paged project'),
        select: (select) =>
          select.fields('name').include('tasks', (tasks) =>
            tasks
              .fields('id', 'title')
              .sort((sort) => sort.field('id').asc())
              .cursor({ id: cursorId })
              .limit(1),
          ),
      }),
    ).resolves.toMatchObject([
      {
        name: 'First paged project',
        tasks: [{ title: 'First C' }],
      },
      {
        name: 'Second paged project',
        tasks: [{ title: 'Second A' }],
      },
    ]);
  });
});
