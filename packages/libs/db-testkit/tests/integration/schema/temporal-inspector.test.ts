import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Temporal physical inspection', (context) => {
  it('retains native type and separates fractional seconds from numeric modifiers', async () => {
    const names = ['day', 'clock', 'local', 'instant'];
    await context.db.schema.createTable(context.table('temporal'), (table) => {
      const types = context.profile.temporal.fixtureTypes;
      names.forEach((name, index) =>
        table.specificType(name, types[index]).nullable(),
      );
    });
    const schema = await context.database
      .connection(context.spec.name)
      .schemaInspector.getPhysicalCollection({
        tableName: context.table('temporal'),
      });
    expect(schema).toBeDefined();
    const columns = new Map(
      schema?.columns.map((column) => [column.columnName, column]),
    );
    expect(columns.get('day')).toMatchObject({
      dataType: context.profile.temporal.inspectorDataTypes.day,
    });
    expect(columns.get('clock')).toMatchObject({
      dataType: context.profile.temporal.inspectorDataTypes.clock,
    });
    expect(columns.get('local')).toMatchObject({
      dataType: 'datetime',
      fractionalSecondsPrecision: 3,
    });
    expect(columns.get('local')?.length).toBeUndefined();
    expect(columns.get('local')?.scale).toBeUndefined();
    expect(columns.get('instant')).toMatchObject({
      dataType: context.profile.temporal.inspectorDataTypes.instant,
    });
    expect(columns.get('instant')?.fractionalSecondsPrecision).toBe(
      context.profile.temporal.inspectorDataTypes.instant === 'text'
        ? undefined
        : 6,
    );
    expect(columns.get('instant')?.nativeType).toBeTruthy();
    if (context.profile.temporal.inspectorDataTypes.clock === 'time')
      expect(columns.get('clock')?.fractionalSecondsPrecision).toBe(3);
  });
});
