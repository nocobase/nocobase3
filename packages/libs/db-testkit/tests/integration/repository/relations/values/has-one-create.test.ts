import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../../helpers.js';

describeIntegrationDatabases('Repository hasOne nested create', (context) => {
  async function prepare(nullableForeignKey: boolean): Promise<void> {
    await context.builder.createCollections([
      {
        name: 'oneProfiles',
        definition: (c) => {
          c.string('code').primary().notNull();
          c.string('summary').notNull();
          if (nullableForeignKey) c.string('projectCode').nullable();
          else c.string('projectCode').notNull();
          c.unique(['projectCode']);
        },
      },
      {
        name: 'oneProjects',
        definition: (c) => {
          c.string('code').primary().notNull();
          c.string('name').notNull();
          c.hasOne('profile', 'oneProfiles')
            .sourceKey('code')
            .foreignKey('projectCode');
        },
      },
    ]);
    await context.database.repository('oneProjects').createOne({
      values: {
        code: 'P',
        name: 'Project',
        profile: { create: { code: 'OLD', summary: 'old' } },
      },
    });
  }

  const profiles = () =>
    context
      .db(context.table('oneProfiles'))
      .select('code', 'project_code')
      .orderBy('code');

  it('replaces the current target, detaching it before the new one is inserted', async () => {
    await prepare(true);

    await context.database.repository('oneProjects').updateOne({
      filter: { code: 'P' },
      values: { profile: { create: { code: 'NEW', summary: 'new' } } },
    });

    expect(await profiles()).toEqual([
      { code: 'NEW', project_code: 'P' },
      { code: 'OLD', project_code: null },
    ]);
  });

  it('refuses the replacement when the foreign key cannot be cleared, and writes nothing', async () => {
    await prepare(false);
    const before = await profiles();

    await expect(
      context.database.repository('oneProjects').updateOne({
        filter: { code: 'P' },
        values: { profile: { create: { code: 'NEW', summary: 'new' } } },
      }),
    ).rejects.toMatchObject({ code: 'RELATION_ACTION_NOT_ALLOWED' });

    expect(await profiles()).toEqual(before);
  });
});
