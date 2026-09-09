import { expect, it } from 'vitest';
import type { RepositoryFilter } from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository findOne contracts', (context) => {
  it('FO-01 returns the same exact projection for shorthand, Builder and AST', async () => {
    await createDocumentationFixture(context);
    await context.db(context.table('projects')).insert([
      { id: 'fo-a', name: 'A', status: 'draft', version: 1 },
      { id: 'fo-b', name: 'B', status: 'active', version: 1 },
    ]);
    const projects = context.database.repository('projects');
    const before = await context.db(context.table('projects')).orderBy('id');
    const filters: RepositoryFilter<Record<string, unknown>>[] = [
      { id: 'fo-b' },
      (f) => f.string('id').eq('fo-b'),
      {
        kind: 'filter',
        version: 1,
        root: {
          kind: 'group',
          logic: 'and',
          items: [
            { kind: 'condition', path: ['id'], operator: '$eq', value: 'fo-b' },
          ],
        },
      },
    ];
    for (const filter of filters) {
      expect(
        await projects.findOne({
          filter,
          select: (s) => s.fields('id', 'name'),
        }),
      ).toEqual({ id: 'fo-b', name: 'B' });
    }
    expect(await context.db(context.table('projects')).orderBy('id')).toEqual(
      before,
    );
  });

  it('FO-02 distinguishes a missing record from a missing variable without writes', async () => {
    await createDocumentationFixture(context);
    await context.db(context.table('projects')).insert([
      { id: 'fo-a', name: 'A', status: 'draft', version: 1 },
      { id: 'fo-b', name: 'B', status: 'active', version: 1 },
    ]);
    const before = await context.db(context.table('projects')).orderBy('id');
    const projects = context.database.repository('projects');
    const filter: RepositoryFilter<Record<string, unknown>> = (f) =>
      f.string('id').eq(f.variable('$input.code'));
    expect(
      await projects.findOne({
        filter,
        context: { input: { code: 'not-found' } },
        select: (s) => s.fields('id'),
      }),
    ).toBeUndefined();
    await expect(
      projects.findOne({ filter, context: { input: {} } }),
    ).rejects.toMatchObject({
      code: 'VARIABLE_NOT_FOUND',
      details: { variable: '$input.code' },
    });
    expect(await context.db(context.table('projects')).orderBy('id')).toEqual(
      before,
    );
  });

  it('accepts nonunique filters and sort-only queries but rejects missing selection criteria', async () => {
    await createDocumentationFixture(context);
    const projects = context.database.repository('projects');
    expect(
      await projects.findOne({ sort: (s) => s.field('id').asc() }),
    ).toBeUndefined();
    await context.db(context.table('projects')).insert([
      { id: 'a', name: 'A', status: 'active', version: 1 },
      { id: 'b', name: 'B', status: 'active', version: 1 },
    ]);
    for (const filter of [undefined, { status: 'active' }]) {
      expect(
        await projects.findOne({
          filter,
          sort: (s) => s.field('id').desc(),
          select: (s) => s.fields('id'),
        }),
      ).toEqual({ id: 'b' });
    }
    // Exercise invalid runtime inputs that the public types already reject.
    await expect(projects.findOne({} as never)).rejects.toMatchObject({
      code: 'INVALID_FILTER',
    });
    await expect(
      projects.findOne({ sort: () => [] } as never),
    ).rejects.toMatchObject({
      code: 'INVALID_FILTER',
    });
  });
});
