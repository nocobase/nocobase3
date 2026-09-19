import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases(
  'Repository relation pagination boundaries',
  (context) => {
    it.each(['forward', 'backward'] as const)(
      'applies distinct before a shared %s cursor independently per parent',
      async (direction) => {
        await createDocumentationFixture(context);
        const projects = context.database.repository('projects');
        await projects.createMany({
          values: [
            { id: 'P', name: 'P' },
            { id: 'Q', name: 'Q' },
            { id: 'R', name: 'R' },
          ],
        });
        await context.database.repository('tasks').createMany({
          values: [
            { id: 'A', title: 'P first', status: 'draft', projectId: 'P' },
            { id: 'B', title: 'Q first', status: 'draft', projectId: 'Q' },
            { id: 'C', title: 'P duplicate', status: 'draft', projectId: 'P' },
            { id: 'D', title: 'Q duplicate', status: 'draft', projectId: 'Q' },
            { id: 'E', title: 'P done', status: 'done', projectId: 'P' },
            { id: 'F', title: 'Q done', status: 'done', projectId: 'Q' },
          ],
        });
        expect(
          await projects.findMany({
            select: (s) =>
              s.fields('id').include('tasks', (t) =>
                t
                  .fields('title')
                  .distinct(['status'])
                  .sort((sort) => sort.field('id').asc())
                  .cursor({ id: 'D' })
                  .direction(direction)
                  .limit(1),
              ),
          }),
        ).toEqual([
          {
            id: 'P',
            tasks: [{ title: direction === 'forward' ? 'P done' : 'P first' }],
          },
          {
            id: 'Q',
            tasks: [{ title: direction === 'forward' ? 'Q done' : 'Q first' }],
          },
          { id: 'R', tasks: [] },
        ]);
      },
    );

    it.each([-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
      'rejects invalid local limit %s even with no parents',
      async (limit) => {
        await createDocumentationFixture(context);
        await expect(
          context.database.repository('projects').findMany({
            select: (s) => s.include('tasks', (t) => t.limit(limit)),
          }),
        ).rejects.toMatchObject({ code: 'INVALID_PAGINATION' });
      },
    );

    it.each([{}, { id: null }, { id: 1 }, { id: 'A', extra: 'B' }])(
      'rejects malformed local cursor %j even with no parents',
      async (cursor) => {
        await createDocumentationFixture(context);
        await expect(
          context.database.repository('projects').findMany({
            select: (s) =>
              s.include('tasks', (t) =>
                t
                  .sort((sort) => sort.field('id').asc())
                  .cursor(cursor as never),
              ),
          }),
        ).rejects.toMatchObject({ code: 'INVALID_PAGINATION' });
      },
    );
  },
);
