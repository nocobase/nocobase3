import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Supplemental logical field types', (context) => {
  it('persists explicit types through creation, metadata changes, addition and removal', async () => {
    await context.builder.createCollection('flags', (c) => {
      c.string('code').primary();
      c.boolean('enabled').nullable();
      c.json('payload').nullable();
      c.field({ name: 'day', type: 'date' }).nullable();
      c.integer('quantity');
    });
    expect((await context.metadataStore.get('flags'))?.document.fields).toEqual(
      {
        enabled: { type: 'boolean' },
        payload: { type: 'json' },
        day: { type: 'date' },
      },
    );
    const connection = context.database.connection(context.spec.name);
    expect((await connection.collections.get('flags'))?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'enabled', type: 'boolean' }),
        expect.objectContaining({ name: 'payload', type: 'json' }),
        expect.objectContaining({ name: 'quantity', type: 'integer' }),
      ]),
    );
    await connection.collectionMetadata.updateField('flags', 'enabled', {
      title: 'Enabled',
    });
    expect((await context.metadataStore.get('flags'))?.document.fields).toEqual(
      {
        enabled: { type: 'boolean', title: 'Enabled' },
        payload: { type: 'json' },
        day: { type: 'date' },
      },
    );
    await context.builder.dropField('flags', 'payload');
    expect((await context.metadataStore.get('flags'))?.document.fields).toEqual(
      { enabled: { type: 'boolean', title: 'Enabled' }, day: { type: 'date' } },
    );
    await context.builder.addField('flags', {
      name: 'extra',
      type: 'boolean',
      nullable: true,
    });
    expect(
      (await context.metadataStore.get('flags'))?.document.fields?.extra,
    ).toEqual({ type: 'boolean' });
    await context.builder.alterField('flags', 'extra', { type: 'integer' });
    expect(
      (await context.metadataStore.get('flags'))?.document.fields?.extra,
    ).toBeUndefined();
  });

  it('allows metadata type patches only when compatible with physical columns', async () => {
    await context.builder.createCollection('flags', (c) => {
      c.integer('value').nullable();
      c.string('label');
    });
    const connection = context.database.connection(context.spec.name);
    await connection.collectionMetadata.updateField('flags', 'value', {
      type: 'boolean',
    });
    expect((await connection.collections.get('flags'))?.fields).toContainEqual(
      expect.objectContaining({ name: 'value', type: 'boolean' }),
    );
    await expect(
      connection.collectionMetadata.updateField('flags', 'label', {
        type: 'boolean',
      }),
    ).rejects.toThrow();
    expect(
      (await context.metadataStore.get('flags'))?.document.fields?.label,
    ).toBeUndefined();
    await connection.collectionMetadata.updateField('flags', 'value', {
      type: null,
    });
    expect((await connection.collections.get('flags'))?.fields).toContainEqual(
      expect.objectContaining({ name: 'value', type: 'integer' }),
    );
  });
});
