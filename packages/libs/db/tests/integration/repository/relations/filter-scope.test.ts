import { expect, it } from 'vitest';
import type {
  FilterBuilder,
  FilterNode,
  FilterAst,
} from '../../../../src/index.js';
import { DefaultFilterBuilder } from '../../../../src/repository/filter-builder.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createRelationFixture } from '../fixtures/relations.js';

describeIntegrationDatabases('Repository Filter relation scope', (context) => {
  it('distinguishes independent existential matches from predicates on the same child', async () => {
    await createRelationFixture(context);
    const repository = context.database.repository('repositoryAuthors');
    const split = (f: FilterBuilder): FilterNode =>
      f.and([
        f.relation('books').some((b) => b.string('title').eq('Alpha')),
        f.relation('books').some((b) => b.number('pages').gt(200)),
      ]);
    const same = (f: FilterBuilder): FilterNode =>
      f
        .relation('books')
        .some((b) =>
          b.and([b.string('title').eq('Alpha'), b.number('pages').gt(200)]),
        );
    for (const [predicate, expected] of [
      [split, [{ name: 'Ada' }]],
      [same, []],
    ] as const) {
      const node = predicate(new DefaultFilterBuilder());
      const ast: FilterAst = JSON.parse(
        JSON.stringify({
          kind: 'filter',
          version: 1,
          root: { kind: 'group', logic: 'and', items: [node] },
        }),
      );
      for (const filter of [predicate, ast]) {
        expect(
          await repository.findMany({
            filter,
            select: (s) => s.fields('name'),
          }),
        ).toEqual(expected);
      }
    }
  });

  it('keeps nested OR within the relation and counts parents rather than matched children', async () => {
    await createRelationFixture(context);
    const repository = context.database.repository('repositoryAuthors');
    const filter = (f: FilterBuilder): FilterNode =>
      f.and([
        f.string('name').ne('Bob'),
        f
          .relation('books')
          .some((b) =>
            b.or([
              b.string('title').eq('Alpha'),
              b.string('title').eq('Gamma'),
              b.string('title').eq('Beta'),
            ]),
          ),
      ]);
    expect(
      await repository.findMany({ filter, select: (s) => s.fields('name') }),
    ).toEqual([{ name: 'Ada' }]);
    expect(await repository.count({ filter })).toBe(1);
    expect(await repository.exists({ filter })).toBe(true);
  });

  it('uses relation filters to update only matching parents and preserves shared targets', async () => {
    await createRelationFixture(context);
    const repository = context.database.repository('repositoryBooks');
    const tagsBefore = await context
      .db(context.table('repositoryTags'))
      .orderBy('id');
    const edgesBefore = await context
      .db(context.table('repositoryBookTags'))
      .orderBy('id');
    const before = await context
      .db(context.table('repositoryBooks'))
      .orderBy('id');
    expect(
      await repository.updateMany({
        filter: (f) =>
          f.and([
            f.relation('tags').some((t) => t.string('label').eq('database')),
            f.number('pages').gt(100),
          ]),
        values: { pages: 181 },
      }),
    ).toEqual({ updatedCount: 1 });
    expect(
      await context.db(context.table('repositoryBooks')).orderBy('id'),
    ).toEqual(
      before.map((row) =>
        row.title === 'Alpha' ? { ...row, pages: 181 } : row,
      ),
    );
    expect(
      await context.db(context.table('repositoryTags')).orderBy('id'),
    ).toEqual(tagsBefore);
    expect(
      await context.db(context.table('repositoryBookTags')).orderBy('id'),
    ).toEqual(edgesBefore);
  });
});
