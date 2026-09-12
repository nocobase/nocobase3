import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createRelationFixture } from '../fixtures/relations.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository deep relation Sort', (context) => {
  it('traverses two to-one hops and a to-one hop followed by a to-many aggregate', async () => {
    await createRelationFixture(context);
    const books = context.database.repository('repositoryBooks');
    expect(
      await books.findMany({
        select: (s) => s.fields('title'),
        sort: (s) => [
          s.field('author.profile.bio').asc().nullsLast(),
          s.field('title').asc(),
        ],
      }),
    ).toEqual([{ title: 'Alpha' }, { title: 'Beta' }, { title: 'Gamma' }]);
    expect(
      await books.findMany({
        select: (s) => s.fields('title'),
        sort: (s) => [
          s.relation('author.books').sum('pages').asc(),
          s.field('title').asc(),
        ],
      }),
    ).toEqual([{ title: 'Gamma' }, { title: 'Alpha' }, { title: 'Beta' }]);
    await expect(
      books.findMany({ sort: (s) => s.field('author.books.title').asc() }),
    ).rejects.toMatchObject({ code: 'INVALID_SORT' });
    await expect(
      books.findMany({
        sort: (s) => s.relation('author.profile').count().asc(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SORT' });
  });

  it.each(['sum', 'avg', 'min', 'max'] as const)(
    '%s sorts empty and all-null relations with explicit null positions',
    async (aggregate) => {
      await createDocumentationFixture(context);
      const projects = context.database.repository('projects');
      await projects.createMany({
        values: [
          { id: 'P', name: 'Empty' },
          { id: 'Q', name: 'Null' },
          { id: 'R', name: 'Value' },
        ],
      });
      await context.database.repository('tasks').createMany({
        values: [
          { id: 'A', title: 'Null', projectId: 'Q' },
          { id: 'B', title: 'Value', projectId: 'R', priority: 2 },
        ],
      });
      expect(
        await projects.findMany({
          select: (s) => s.fields('id'),
          sort: (s) => [
            s.relation('tasks')[aggregate]('priority').desc().nullsFirst(),
            s.field('id').asc(),
          ],
        }),
      ).toEqual(
        (aggregate === 'sum' ? ['R', 'P', 'Q'] : ['P', 'Q', 'R']).map((id) => ({
          id,
        })),
      );
    },
  );
});
