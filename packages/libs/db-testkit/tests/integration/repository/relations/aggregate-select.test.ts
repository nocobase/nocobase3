import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createRelationFixture, sorting } from '../fixtures/relations.js';

describeIntegrationDatabases(
  'Repository relations/aggregate-select',
  (context) => {
    it('combines independent record and aggregate branches per parent', async () => {
      await createRelationFixture(context);
      const repository = context.database.repository('repositoryAuthors');
      const rows = await repository.findMany({
        select: (s) =>
          s.fields('id').include('books', (books) =>
            books.combine({
              records: books
                .fields('title')
                .sort((s) => [s.field('id').asc()])
                .limit(1),
              count: books.count(),
              sum: books.sum('pages'),
              avg: books.avg('pages'),
              min: books.min('pages'),
              max: books.max('pages'),
              pageCount: books
                .sort((s) => [s.field('id').asc()])
                .limit(1)
                .count(),
              unique: books
                .sort((s) => [s.field('id').asc()])
                .distinct(['authorId'])
                .count(),
            }),
          ),
        sort: (s) => [s.field('id').asc()],
      });
      expect(rows[0]).toMatchObject({
        id: 1,
        books: {
          records: [{ title: 'Alpha' }],
          count: 2,
          pageCount: 1,
          unique: 1,
        },
      });
      expect(rows[1]).toMatchObject({
        id: 2,
        books: { records: [{ title: 'Gamma' }], count: 1 },
      });
      expect(rows[2]).toEqual({
        id: 3,
        books: {
          records: [],
          count: 0,
          sum: null,
          avg: null,
          min: null,
          max: null,
          pageCount: 0,
          unique: 0,
        },
      });
      const aggregates = rows[0].books as Record<string, unknown>;
      expect({
        sum: Number(aggregates.sum),
        avg: Number(aggregates.avg),
        min: Number(aggregates.min),
        max: Number(aggregates.max),
      }).toEqual({ sum: 440, avg: 220, min: 180, max: 260 });
      expect(Number(aggregates.sum)).toBe(
        Number(aggregates.min) + Number(aggregates.max),
      );
      expect(Number(aggregates.avg) * 2).toBe(Number(aggregates.sum));
      const filtered = await repository.findMany({
        select: (s) =>
          s.fields('id').include('books', (books) =>
            books.filter({ title: 'Alpha' }).combine({
              count: books.count(),
              impossible: books.filter({ title: 'Beta' }).count(),
            }),
          ),
        sort: (s) => [s.field('id').asc()],
      });
      expect(filtered[0]).toEqual({
        id: 1,
        books: { count: 1, impossible: 0 },
      });
      const tags = await context.database
        .repository('repositoryBooks')
        .findMany({
          select: (s) => s.fields('id').include('tags', (tags) => tags.count()),
          sort: (s) => [s.field('id').asc()],
        });
      expect(tags).toEqual([
        { id: 1, tags: 2 },
        { id: 2, tags: 0 },
        { id: 3, tags: 1 },
      ]);
      const distinctRows = await repository.findMany({
        select: (s) =>
          s.fields('id').include('books', (books) =>
            books
              .sort((s) => [s.field('id').asc()])
              .distinct(['authorId'])
              .fields('title'),
          ),
        sort: (s) => [s.field('id').asc()],
      });
      expect(distinctRows[0]).toEqual({ id: 1, books: [{ title: 'Alpha' }] });
      const astRows = await repository.findMany({
        select: {
          kind: 'select',
          version: 1,
          root: {
            kind: 'selection',
            fields: ['id'],
            includes: [
              {
                kind: 'include',
                relation: 'books',
                select: { kind: 'selection' },
                result: {
                  kind: 'combine',
                  branches: {
                    count: {
                      select: { kind: 'selection' },
                      result: { kind: 'count' },
                    },
                    previous: {
                      select: { kind: 'selection' },
                      result: { kind: 'sum', field: 'pages' },
                      sort: sorting('id', 'asc'),
                      cursor: { id: 2 },
                      direction: 'backward',
                      limit: 1,
                    },
                  },
                },
              },
            ],
          },
        },
        sort: (s) => [s.field('id').asc()],
      });
      expect(astRows[0]).toMatchObject({ id: 1, books: { count: 2 } });
      expect(
        Number((astRows[0].books as Record<string, unknown>).previous),
      ).toBe(180);
      await expect(
        repository.findMany({
          select: (s) =>
            s.include('books', (books) => books.fields('title').count()),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
      await expect(
        repository.findMany({
          select: (s) => s.include('profile', (profile) => profile.count()),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_SELECT' });
    });
  },
);
