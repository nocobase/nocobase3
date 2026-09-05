import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Repository identity safety', (context) => {
  it('rejects keyless single mutations without leaving side effects', async () => {
    await context.builder.createCollection('keyless', (c) => {
      c.string('id');
      c.string('message');
    });
    const records = context.database.repository('keyless');
    await expect(
      records.createOne({ values: { id: 'new', message: 'new' } }),
    ).rejects.toMatchObject({ code: 'INVALID_UNIQUE_SELECTOR' });
    expect(await records.count()).toBe(0);
    await records.createMany({ values: [{ id: 'A', message: 'original' }] });
    await expect(
      records.updateOne({
        filter: { id: 'A' },
        values: { message: 'changed' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_UNIQUE_SELECTOR' });
    await expect(
      records.deleteOne({ filter: { id: 'A' } }),
    ).rejects.toMatchObject({ code: 'INVALID_UNIQUE_SELECTOR' });
    expect(await records.findMany()).toEqual([
      { id: 'A', message: 'original' },
    ]);
  });

  it('does not identify rows by a null unique value', async () => {
    await context.builder.createCollection('nullableKeys', (c) => {
      c.string('email').nullable().unique();
      c.string('label').notNull();
    });
    const records = context.database.repository('nullableKeys');
    await records.createMany({
      values: [
        { email: null, label: 'A' },
        { email: null, label: 'B' },
      ],
    });
    await expect(
      records.updateOne({
        filter: { label: 'A' },
        values: { label: 'changed' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_UNIQUE_SELECTOR' });
    await expect(
      records.deleteOne({ filter: { label: 'B' } }),
    ).rejects.toMatchObject({ code: 'INVALID_UNIQUE_SELECTOR' });
    await expect(
      records.createOne({ values: { email: null, label: 'C' } }),
    ).rejects.toMatchObject({ code: 'INVALID_UNIQUE_SELECTOR' });
    expect(
      await records.findMany({ sort: (s) => s.field('label').asc() }),
    ).toEqual([
      { email: null, label: 'A' },
      { email: null, label: 'B' },
    ]);
  });

  it('uses another complete unique key when a nullable unique key is null', async () => {
    await context.builder.createCollection('alternateKeys', (c) => {
      c.string('email').nullable().unique();
      c.string('account').notNull().unique();
      c.string('label');
    });
    const records = context.database.repository('alternateKeys');
    await records.createOne({
      values: { email: null, account: 'A', label: 'first' },
    });
    await records.createOne({
      values: { email: null, account: 'B', label: 'second' },
    });
    expect(
      (
        await records.updateOne({
          filter: { account: 'A' },
          values: { label: 'changed' },
          select: (s) => s.fields('label'),
        })
      ).record,
    ).toEqual({ label: 'changed' });
    await records.deleteOne({ filter: { account: 'B' } });
    expect(await records.findMany()).toEqual([
      { email: null, account: 'A', label: 'changed' },
    ]);
  });

  it.each(['connect', 'set'] as const)(
    'rolls back partial %s and preserves other parents',
    async (operation) => {
      await context.database.transaction(async (connection) => {
        await connection.builder.createCollection('safetyParents', (c) => {
          c.string('code').primary().notNull();
          c.string('label');
          c.hasMany('children', 'safetyChildren')
            .sourceKey('code')
            .foreignKey('parentCode');
        });
        await connection.builder.createCollection('safetyChildren', (c) => {
          c.string('code').primary().notNull();
          c.string('parentCode').nullable();
        });
      });
      const parents = context.database.repository('safetyParents');
      const children = context.database.repository('safetyChildren');
      await parents.createMany({
        values: [
          { code: 'A', label: 'original' },
          { code: 'B', label: 'other' },
        ],
      });
      await children.createMany({
        values: [
          { code: 'old', parentCode: 'A' },
          { code: 'free', parentCode: null },
          { code: 'other', parentCode: 'B' },
        ],
      });
      const before = await children.findMany();
      await expect(
        parents.updateOne({
          filter: { code: 'A' },
          values: {
            label: 'changed',
            children: { [operation]: [{ code: 'free' }, { code: 'other' }] },
          },
        }),
      ).rejects.toMatchObject({ code: 'RELATION_REASSIGNMENT_REQUIRED' });
      expect(await children.findMany()).toEqual(before);
      expect(await parents.findOne({ filter: { code: 'A' } })).toEqual({
        code: 'A',
        label: 'original',
      });
      await expect(
        parents.createOne({
          values: {
            code: 'C',
            children: { connect: [{ code: 'free' }, { code: 'missing' }] },
          },
        }),
      ).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
      expect(await parents.exists({ filter: { code: 'C' } })).toBe(false);
      expect(await children.findMany()).toEqual(before);
    },
  );
});
