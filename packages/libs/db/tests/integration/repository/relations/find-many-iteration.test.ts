import { expect, it } from 'vitest';
import type {
  FindManyOptions,
  RepositoryRecord,
} from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createRelationFixture } from '../fixtures/relations.js';

async function collect<T>(query: AsyncIterable<T>): Promise<T[]> {
  const rows: T[] = [];
  for await (const row of query) rows.push(row);
  return rows;
}

describeIntegrationDatabases(
  'Repository relation iteration parity',
  (context) => {
    it('matches four cardinalities, nested projections, relation filters, relation sorting and combine', async () => {
      await createRelationFixture(context);
      const books = context.database.repository('repositoryBooks');
      const inputs: FindManyOptions<RepositoryRecord>[] = [
        {
          select: (s) =>
            s
              .fields('title')
              .include('author', (a) =>
                a.fields('name').include('profile', (p) => p.fields('bio')),
              )
              .include('tags', (t) => t.fields('label').limit(1)),
          sort: (s) => s.field('publisher.name').asc().nullsLast(),
        },
        {
          select: (s) =>
            s.fields().include('author', (a) =>
              a.fields('name').include('books', (b) =>
                b
                  .fields('title')
                  .sort((s) => s.field('id').desc())
                  .limit(1),
              ),
            ),
          filter: (f) =>
            f.relation('tags').some((t) => t.string('label').eq('database')),
        },
        {
          select: (s) =>
            s.fields('title').include('tags', (t) =>
              t.combine({
                records: t
                  .fields('label')
                  .sort((s) => s.field('id').asc())
                  .distinct(['label'])
                  .cursor({ id: 3 })
                  .direction('backward')
                  .limit(1),
                n: t.count(),
              }),
            ),
          sort: (s) => s.relation('tags').count().desc(),
        },
        {
          select: (s) =>
            s.fields('title').include('publisher', (p) => p.fields('name')),
          distinct: ['authorId'],
          offset: 1,
          limit: 1,
        },
        {
          select: (s) =>
            s.fields('title').include('author', (a) => a.fields('name')),
          sort: (s) => s.field('id').asc(),
          cursor: { id: 3 },
          direction: 'backward',
          limit: 1,
        },
      ];
      for (const input of inputs)
        expect(await collect(books.findMany(input))).toEqual(
          await books.findMany(input),
        );
      const authors = context.database.repository('repositoryAuthors');
      const query: FindManyOptions<RepositoryRecord> = {
        select: (s) =>
          s.fields('name').include('books', (b) =>
            b.combine({
              records: b.fields('title').limit(1),
              total: b.sum('pages'),
              n: b.count(),
              average: b.avg('pages'),
            }),
          ),
      };
      expect(await collect(authors.findMany(query))).toEqual(
        await authors.findMany(query),
      );
    });

    it('loads shared relations per root batch, not per row, and never re-queries root pages', async () => {
      await createRelationFixture(context);
      const books = context.database.repository('repositoryBooks');
      const alpha = await books.findOne({ filter: { title: 'Alpha' } });
      await context.db(context.table('repositoryBooks')).insert(
        Array.from({ length: 202 }, (_, i) => ({
          title: `Extra-${i}`,
          pages: i,
          author_id: alpha!.authorId,
        })),
      );
      const input: FindManyOptions<RepositoryRecord> = {
        select: (s) =>
          s.fields('title').include('author', (a) => a.fields('name')),
        sort: (s) => s.field('id').asc(),
      };
      const expected = await books.findMany(input);
      let rootQueries = 0;
      let relationQueries = 0;
      const listener = (event: { sql: string }) => {
        if (!/^\s*select\b/i.test(event.sql)) return;
        if (event.sql.includes(context.table('repositoryBooks'))) rootQueries++;
        if (event.sql.includes(context.table('repositoryAuthors')))
          relationQueries++;
      };
      context.db.on('query', listener);
      try {
        expect(await collect(books.findMany(input))).toEqual(expected);
        expect(rootQueries).toBe(1);
        expect(relationQueries).toBe(3);
      } finally {
        context.db.off('query', listener);
      }
    });
  },
);
