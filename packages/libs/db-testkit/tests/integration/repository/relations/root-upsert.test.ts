import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';
import { createMutationFixture } from '../fixtures/mutations.js';

describeIntegrationDatabases('Repository relations/root-upsert', (context) => {
  it('upserts root records with relation values in both branches', async () => {
    const fixture = await createMutationFixture(context);
    const repository = context.database.repository('repositoryProjects');

    const created = await repository.upsertOne({
      filter: { externalId: 'project-upsert' },
      create: {
        externalId: 'project-upsert',
        name: 'Created branch',
        owner: { connect: { id: fixture.ada } },
      },
      update: {
        name: 'Ignored update',
      },
      select: (select) =>
        select
          .fields('id', 'name', 'version')
          .include('owner', (owner) => owner.fields('name')),
    });

    expect(created).toMatchObject({
      record: {
        name: 'Created branch',
        version: 1,
        owner: { name: 'Ada' },
      },
      version: 1,
    });

    await expect(
      repository.upsertOne({
        filter: { externalId: 'project-upsert' },
        create: {
          externalId: 'project-upsert',
          name: 'Ignored create',
        },
        update: {
          name: 'Updated branch',
          owner: { connect: { id: fixture.bob } },
        },
        ifVersion: 1,
        select: (select) =>
          select
            .fields('id', 'name', 'version')
            .include('owner', (owner) => owner.fields('name')),
      }),
    ).resolves.toMatchObject({
      record: {
        id: created.record.id,
        name: 'Updated branch',
        version: 2,
        owner: { name: 'Bob' },
      },
      version: 2,
    });
  });
});
