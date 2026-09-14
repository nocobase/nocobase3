import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createRelationFixture } from '../fixtures/relations.js';

describeIntegrationDatabases('Repository relation batching', (context) => {
  it('does not grow relation read query count with parents or leak execution keys', async () => {
    await createRelationFixture(context);
    const books = context.database.repository('repositoryBooks');
    const alpha = await books.findOne({ filter: { title: 'Alpha' } });
    for (let i = 0; i < 12; i += 1) {
      await context.db(context.table('repositoryBooks')).insert({
        title: `Extra-${i}`,
        pages: 1,
        author_id: alpha!.authorId,
        publisher_id: alpha!.publisherId,
      });
    }
    const query = (filter?: { title: string }) =>
      books.findMany({
        filter,
        sort: (s) => s.field('title').asc(),
        select: (s) =>
          s
            .fields('title')
            .include('author', (a) =>
              a.fields('name').include('profile', (p) => p.fields('bio')),
            )
            .include('tags', (t) => t.fields('label')),
      });
    // Warm metadata resolution before measuring only the data-read phase.
    await query({ title: 'Alpha' });
    let queries = 0;
    const listener = (event: { sql: string }) => {
      if (/^\s*select\b/i.test(event.sql)) queries += 1;
    };
    context.db.on('query', listener);
    try {
      const one = await query({ title: 'Alpha' });
      const oneCount = queries;
      queries = 0;
      const many = await query();
      expect(oneCount).toBeGreaterThan(0);
      expect(queries).toBe(oneCount);
      expect(many).toHaveLength(15);
      expect(one[0]).toEqual({
        title: 'Alpha',
        author: { name: 'Ada', profile: { bio: 'compiler engineer' } },
        tags: expect.arrayContaining([
          { label: 'database' },
          { label: 'typescript' },
        ]),
      });
      expect(many.find((r) => r.title === 'Extra-0')).toEqual({
        title: 'Extra-0',
        author: { name: 'Ada', profile: { bio: 'compiler engineer' } },
        tags: [],
      });
      expect(many.find((r) => r.title === 'Gamma')).toEqual({
        title: 'Gamma',
        author: { name: 'Bob', profile: null },
        tags: [{ label: 'database' }],
      });
    } finally {
      context.db.off('query', listener);
    }
  });
});
