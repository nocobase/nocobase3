import { expect, it } from 'vitest';
import type { RepositoryFilter } from '../../../../src/index.js';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createDocumentationFixture } from '../fixtures/documentation.js';

describeIntegrationDatabases('Repository exists contracts', (context) => {
  it('EX-01 returns booleans for zero, one and multiple matching records', async () => {
    await createDocumentationFixture(context);
    const projects = context.database.repository('projects');
    expect(await projects.exists()).toBe(false);
    await context.db(context.table('projects')).insert([
      { id: 'ex-a', name: 'A', status: 'active', version: 1 },
      { id: 'ex-b', name: 'B', status: 'active', version: 1 },
    ]);
    const before = await context.db(context.table('projects')).orderBy('id');
    expect(await projects.exists({ filter: { id: 'ex-a' } })).toBe(true);
    expect(await projects.exists({ filter: { status: 'active' } })).toBe(true);
    expect(await projects.exists({ filter: { status: 'draft' } })).toBe(false);
    expect(await context.db(context.table('projects')).orderBy('id')).toEqual(
      before,
    );
  });

  it('EX-02 reuses a filter without retaining context or hiding invalid inputs', async () => {
    await createDocumentationFixture(context);
    await context.db(context.table('projects')).insert([
      { id: 'ex-a', name: 'A', status: 'active', version: 1 },
      { id: 'ex-b', name: 'B', status: 'active', version: 1 },
    ]);
    const projects = context.database.repository('projects');
    const before = await context.db(context.table('projects')).orderBy('id');
    const filter: RepositoryFilter<Record<string, unknown>> = (f) =>
      f.string('id').eq(f.variable('$input.code'));
    expect(
      await projects.exists({ filter, context: { input: { code: 'ex-a' } } }),
    ).toBe(true);
    expect(
      await projects.exists({
        filter,
        context: { input: { code: 'missing' } },
      }),
    ).toBe(false);
    await expect(projects.exists({ filter })).rejects.toMatchObject({
      code: 'VARIABLE_NOT_FOUND',
    });
    await expect(projects.exists({ filter: {} })).rejects.toMatchObject({
      code: 'INVALID_FILTER',
    });
    await expect(
      projects.exists({ filter: { missing: 'x' } }),
    ).rejects.toMatchObject({ code: 'FIELD_NOT_FOUND' });
    expect(await context.db(context.table('projects')).orderBy('id')).toEqual(
      before,
    );
  });
});
