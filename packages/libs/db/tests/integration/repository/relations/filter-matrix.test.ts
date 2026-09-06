import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createRelationFixture } from '../fixtures/relations.js';

describeIntegrationDatabases('Repository relation filter matrix', (context) => {
  const cases = [
    {
      type: 'belongsTo',
      root: 'repositoryBooks',
      field: 'title',
      relation: 'publisher',
      target: 'name',
      value: 'North',
      some: ['Alpha'],
      none: ['Beta', 'Gamma'],
      empty: ['Beta'],
      notEmpty: ['Alpha', 'Gamma'],
    },
    {
      type: 'hasOne',
      root: 'repositoryAuthors',
      field: 'name',
      relation: 'profile',
      target: 'bio',
      value: 'compiler engineer',
      some: ['Ada'],
      none: ['Bob', 'Cara'],
      empty: ['Bob', 'Cara'],
      notEmpty: ['Ada'],
    },
    {
      type: 'hasMany',
      root: 'repositoryAuthors',
      field: 'name',
      relation: 'books',
      target: 'title',
      value: 'Alpha',
      some: ['Ada'],
      none: ['Bob', 'Cara'],
      empty: ['Cara'],
      notEmpty: ['Ada', 'Bob'],
    },
    {
      type: 'belongsToMany',
      root: 'repositoryBooks',
      field: 'title',
      relation: 'tags',
      target: 'label',
      value: 'database',
      some: ['Alpha', 'Gamma'],
      none: ['Beta'],
      empty: ['Beta'],
      notEmpty: ['Alpha', 'Gamma'],
    },
  ] as const;
  for (const operation of ['some', 'none', 'empty', 'notEmpty'] as const) {
    it.each(cases)(
      `$type ${operation} preserves empty-relation semantics`,
      async (c) => {
        await createRelationFixture(context);
        const rows = await context.database.repository(c.root).findMany({
          filter: (f) =>
            operation === 'some' || operation === 'none'
              ? f
                  .relation(c.relation)
                  [operation]((t) => t.string(c.target).eq(c.value))
              : f.relation(c.relation)[operation](),
          select: (s) => s.fields(c.field),
          sort: (s) => s.field(c.field).asc(),
        });
        expect(rows).toEqual(
          c[operation].map((value) => ({ [c.field]: value })),
        );
      },
    );
  }

  it('combines multi-hop relation predicates with OR and context without leaking local scope', async () => {
    await createRelationFixture(context);
    const authors = context.database.repository('repositoryAuthors');
    expect(
      await authors.findMany({
        filter: (f) =>
          f.and([
            f
              .relation('books')
              .some((b) =>
                b
                  .relation('tags')
                  .some((t) => t.string('label').eq(t.variable('$tag'))),
              ),
            f.or([f.string('name').eq('Bob'), f.string('name').eq('Cara')]),
          ]),
        context: { tag: 'database' },
        select: (s) => s.fields('name'),
      }),
    ).toEqual([{ name: 'Bob' }]);
    expect(
      await authors.count({
        filter: (f) =>
          f.relation('books').some((b) => b.relation('tags').notEmpty()),
      }),
    ).toBe(2);
    expect(
      await authors.exists({
        filter: (f) =>
          f
            .relation('books')
            .some((b) =>
              b.relation('tags').some((t) => t.string('label').eq('missing')),
            ),
      }),
    ).toBe(false);
  });
});
