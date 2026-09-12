import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';

describeIntegrationDatabases('Repository Select shared targets', (context) => {
  async function prepare(): Promise<void> {
    await context.builder.createCollections([
      {
        name: 'selectOwners',
        definition: (c) => {
          c.string('code').primary().notNull();
          c.string('name').notNull();
          c.hasMany('projects', 'selectProjects')
            .sourceKey('code')
            .foreignKey('ownerCode');
        },
      },
      {
        name: 'selectTags',
        definition: (c) => {
          c.string('code').primary().notNull();
          c.string('label').notNull();
          c.string('category').notNull();
          c.integer('rank').notNull();
        },
      },
      {
        name: 'selectEdges',
        definition: (c) => {
          c.string('projectCode').notNull();
          c.string('tagCode').notNull();
          c.unique(['projectCode', 'tagCode']);
        },
      },
      {
        name: 'selectProjects',
        definition: (c) => {
          c.string('code').primary().notNull();
          c.string('title').notNull();
          c.string('ownerCode').notNull();
          c.belongsTo('owner', 'selectOwners')
            .foreignKey('ownerCode')
            .targetKey('code');
          c.belongsToMany('tags', 'selectTags')
            .sourceKey('code')
            .targetKey('code')
            .through('selectEdges')
            .foreignKey('projectCode')
            .otherKey('tagCode');
        },
      },
    ]);
    await context.db(context.table('selectOwners')).insert([
      { code: 'A', name: 'Ada' },
      { code: 'B', name: 'Bob' },
    ]);
    await context.db(context.table('selectProjects')).insert([
      { code: 'P', title: 'First', owner_code: 'A' },
      { code: 'Q', title: 'Second', owner_code: 'A' },
      { code: 'R', title: 'Empty', owner_code: 'B' },
    ]);
    await context.db(context.table('selectTags')).insert([
      { code: 'T1', label: 'One', category: 'a', rank: 1 },
      { code: 'T2', label: 'Two', category: 'a', rank: 1 },
      { code: 'T3', label: 'Three', category: 'b', rank: 2 },
      { code: 'T4', label: 'Four', category: 'b', rank: 3 },
    ]);
    await context.db(context.table('selectEdges')).insert([
      { project_code: 'P', tag_code: 'T1' },
      { project_code: 'P', tag_code: 'T2' },
      { project_code: 'P', tag_code: 'T3' },
      { project_code: 'Q', tag_code: 'T2' },
      { project_code: 'Q', tag_code: 'T3' },
      { project_code: 'Q', tag_code: 'T4' },
    ]);
  }

  it.each([false, true])(
    'isolates deep shared-target projections regardless of branch order (reverse=%s)',
    async (reverse) => {
      await prepare();
      const rows = await context.database
        .repository('selectProjects')
        .findMany({
          sort: (s) => s.field('code').asc(),
          select: (s) =>
            s.fields('title').include('owner', (o) =>
              o.fields('name').include('projects', (p) => {
                const brief = p
                  .fields('title')
                  .include('tags', (t) =>
                    t.filter({ category: 'a' }).fields('label'),
                  );
                const detailed = p
                  .filter({ code: 'Q' })
                  .fields()
                  .include('tags', (t) =>
                    t.filter({ category: 'b' }).fields('category'),
                  );
                return p.combine(
                  reverse ? { detailed, brief } : { brief, detailed },
                );
              }),
            ),
        });
      const ada = {
        name: 'Ada',
        projects: {
          brief: [
            { title: 'First', tags: [{ label: 'One' }, { label: 'Two' }] },
            { title: 'Second', tags: [{ label: 'Two' }] },
          ],
          detailed: [{ tags: [{ category: 'b' }, { category: 'b' }] }],
        },
      };
      expect(rows).toEqual([
        { title: 'First', owner: ada },
        { title: 'Second', owner: ada },
        {
          title: 'Empty',
          owner: {
            name: 'Bob',
            projects: { brief: [{ title: 'Empty', tags: [] }], detailed: [] },
          },
        },
      ]);
    },
  );

  it('keeps belongsToMany filter, sorting and limits local to each parent', async () => {
    await prepare();
    const rows = await context.database.repository('selectProjects').findMany({
      sort: (s) => s.field('code').asc(),
      select: (s) =>
        s.fields('title').include('tags', (t) =>
          t
            .filter({ category: 'b' })
            .sort((s) => s.field('code').desc())
            .limit(1)
            .fields('label'),
        ),
    });
    expect(rows).toEqual([
      { title: 'First', tags: [{ label: 'Three' }] },
      { title: 'Second', tags: [{ label: 'Four' }] },
      { title: 'Empty', tags: [] },
    ]);
  });

  it.each(['forward', 'backward'] as const)(
    'uses tied compound cursors per parent in the %s direction',
    async (direction) => {
      await prepare();
      const rows = await context.database
        .repository('selectProjects')
        .findMany({
          sort: (s) => s.field('code').asc(),
          select: (s) =>
            s.fields('title').include('tags', (t) =>
              t
                .fields('label')
                .sort((s) => [s.field('rank').asc(), s.field('code').asc()])
                .cursor({ rank: 1, code: 'T2' })
                .direction(direction)
                .limit(1),
            ),
        });
      expect(rows).toEqual(
        direction === 'forward'
          ? [
              { title: 'First', tags: [{ label: 'Three' }] },
              { title: 'Second', tags: [{ label: 'Three' }] },
              { title: 'Empty', tags: [] },
            ]
          : [
              { title: 'First', tags: [{ label: 'One' }] },
              { title: 'Second', tags: [] },
              { title: 'Empty', tags: [] },
            ],
      );
    },
  );

  it('deduplicates shared targets within each parent before taking the local page', async () => {
    await prepare();
    const rows = await context.database.repository('selectProjects').findMany({
      sort: (s) => s.field('code').asc(),
      select: (s) =>
        s.fields('title').include('tags', (t) =>
          t
            .fields('label')
            .sort((s) => s.field('code').asc())
            .distinct(['category'])
            .limit(2),
        ),
    });
    expect(rows).toEqual([
      { title: 'First', tags: [{ label: 'One' }, { label: 'Three' }] },
      { title: 'Second', tags: [{ label: 'Two' }, { label: 'Three' }] },
      { title: 'Empty', tags: [] },
    ]);
  });

  it('combines independent records, counts and nested combine for shared many-to-many targets', async () => {
    await prepare();
    const rows = await context.database.repository('selectProjects').findMany({
      sort: (s) => s.field('code').asc(),
      select: (s) =>
        s.fields('title').include('tags', (t) =>
          t.combine({
            records: t
              .fields('label')
              .sort((s) => s.field('code').desc())
              .limit(1),
            all: t.count(),
            categories: t.distinct(['category']).count(),
            grouped: t.filter({ category: 'b' }).combine({
              count: t.count(),
              records: t.fields('label'),
            }),
          }),
        ),
    });
    expect(rows).toEqual([
      {
        title: 'First',
        tags: {
          records: [{ label: 'Three' }],
          all: 3,
          categories: 2,
          grouped: { count: 1, records: [{ label: 'Three' }] },
        },
      },
      {
        title: 'Second',
        tags: {
          records: [{ label: 'Four' }],
          all: 3,
          categories: 2,
          grouped: {
            count: 2,
            records: [{ label: 'Three' }, { label: 'Four' }],
          },
        },
      },
      {
        title: 'Empty',
        tags: {
          records: [],
          all: 0,
          categories: 0,
          grouped: { count: 0, records: [] },
        },
      },
    ]);
  });
});
