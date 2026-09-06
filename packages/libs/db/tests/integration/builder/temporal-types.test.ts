import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Declared temporal field types', (context) => {
  it('persists semantic types and resolves all four physical representations', async () => {
    await context.builder.createCollection('events', (c) => {
      c.string('code').primary();
      c.date('day').nullable();
      c.time('clock').nullable();
      c.datetime('local').nullable();
      c.datetimeTz('instant').nullable();
      c.float('ratio').nullable();
      c.double('score').nullable();
    });
    const expected = {
      code: 'string',
      day: 'date',
      clock: 'time',
      local: 'datetime',
      instant: 'datetimeTz',
      ratio: 'float',
      score: 'double',
    };
    const connection = context.database.connection(context.spec.name);
    const resolved = await connection.collections.get('events');
    expect(
      Object.fromEntries(
        resolved?.fields?.map((field) => [field.name, field.type]) ?? [],
      ),
    ).toEqual(expected);
    expect(
      (await context.metadataStore.get('events'))?.document.fields,
    ).toEqual(
      Object.fromEntries(
        Object.entries(expected).map(([name, type]) => [name, { type }]),
      ),
    );
    const physical = await connection.schemaInspector.getPhysicalCollection({
      tableName: context.table('events'),
    });
    expect(
      physical?.columns.find((column) => column.columnName === 'local')
        ?.dataType,
    ).toBe(context.spec.dialect === 'sqlite' ? 'text' : 'datetime');
    const instant = physical?.columns.find(
      (column) => column.columnName === 'instant',
    );
    expect(instant?.dataType).toBe(
      context.spec.dialect === 'sqlite'
        ? 'text'
        : context.spec.dialect === 'mysql'
          ? 'datetime'
          : 'datetimeTz',
    );
    if (context.spec.dialect !== 'sqlite')
      expect(instant?.fractionalSecondsPrecision).toBe(3);
    await expect(
      connection.collectionMetadata.updateField('events', 'code', {
        type: 'datetimeTz',
      }),
    ).rejects.toThrow();
    expect(
      (await context.metadataStore.get('events'))?.document.fields?.code,
    ).toEqual({ type: 'string' });
  });

  it('updates metadata against the final shape of a combined field alteration', async () => {
    await context.builder.createCollection('events', (c) => {
      c.string('oldCode');
      c.datetime('local');
    });
    await context.builder.alterCollection('events', (c) => {
      c.dropField('oldCode');
      c.dropField('local');
      c.datetimeTz('instant');
      c.date('day');
    });
    expect(
      (await context.metadataStore.get('events'))?.document.fields,
    ).toEqual({ instant: { type: 'datetimeTz' }, day: { type: 'date' } });
    await context.builder.dropField('events', 'day');
    expect(
      (await context.metadataStore.get('events'))?.document.fields,
    ).toEqual({ instant: { type: 'datetimeTz' } });
  });
});
