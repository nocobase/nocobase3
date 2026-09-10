import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../../helpers.js';

describeIntegrationDatabases('Repository default-only inserts', (context) => {
  it('returns generated identities and database defaults with physical column names', async () => {
    await context.builder.createCollection('defaultRows', (collection) => {
      collection.increments('recordId');
      collection.string('displayName').defaultTo('Default');
    });
    const repository = context.database.repository('defaultRows');
    const created = await repository.createOne({ values: {} });
    expect(created.record).toMatchObject({
      recordId: expect.any(Number),
      displayName: 'Default',
    });
    expect(
      await repository.findOne({
        filter: { recordId: created.record.recordId as number },
      }),
    ).toEqual(created.record);

    const batch = await repository.createMany({
      values: [{}, {}],
      select: (s) => s.fields('recordId', 'displayName'),
    });
    expect(batch).toMatchObject({
      createdCount: 2,
      records: [
        { recordId: expect.any(Number), displayName: 'Default' },
        { recordId: expect.any(Number), displayName: 'Default' },
      ],
    });
    const rows = await repository.findMany();
    expect(new Set(rows.map((row) => row.recordId)).size).toBe(3);
  });

  it('creates a row containing only an auto-generated primary key', async () => {
    await context.builder.createCollection('identityRows', (collection) => {
      collection.increments('recordId');
    });
    const repository = context.database.repository('identityRows');
    const created = await repository.createOne({ values: {} });
    expect(created.record).toEqual({ recordId: expect.any(Number) });
    expect(await repository.count()).toBe(1);
  });
});
