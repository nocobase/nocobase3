import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Temporal physical inspection', (context) => {
  it('retains native type and separates fractional seconds from numeric modifiers', async () => {
    const nativeTypes = {
      postgres: [
        'date',
        'time(3)',
        'timestamp(3) without time zone',
        'timestamp(6) with time zone',
      ],
      mysql: ['date', 'time(3)', 'datetime(3)', 'timestamp(6)'],
      sqlite: ['DATE', 'TIME(3)', 'DATETIME(3)', 'TEXT'],
      oracle: [
        'DATE',
        'VARCHAR2(18)',
        'TIMESTAMP(3)',
        'TIMESTAMP(6) WITH TIME ZONE',
      ],
      mssql: ['date', 'time(3)', 'datetime2(3)', 'datetimeoffset(6)'],
    }[context.spec.dialect];
    const names = ['day', 'clock', 'local', 'instant'];
    await context.db.schema.createTable(context.table('temporal'), (table) => {
      names.forEach((name, index) =>
        table.specificType(name, nativeTypes[index]).nullable(),
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
    const oracle = context.spec.dialect === 'oracle';
    const sqlite = context.spec.dialect === 'sqlite';
    expect(columns.get('day')).toMatchObject({
      dataType: oracle ? 'datetime' : 'date',
    });
    expect(columns.get('clock')).toMatchObject({
      dataType: oracle ? 'string' : 'time',
    });
    expect(columns.get('local')).toMatchObject({
      dataType: 'datetime',
      fractionalSecondsPrecision: 3,
    });
    expect(columns.get('local')?.length).toBeUndefined();
    expect(columns.get('local')?.scale).toBeUndefined();
    expect(columns.get('instant')).toMatchObject({
      dataType: sqlite ? 'text' : 'datetimeTz',
    });
    expect(columns.get('instant')?.fractionalSecondsPrecision).toBe(
      sqlite ? undefined : 6,
    );
    expect(columns.get('instant')?.nativeType).toBeTruthy();
    if (!oracle)
      expect(columns.get('clock')?.fractionalSecondsPrecision).toBe(3);
  });
});
