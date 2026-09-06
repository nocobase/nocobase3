import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Physical scalar capabilities', (context) => {
  it('preserves char semantics, numeric capacity and boolean identity', async () => {
    const dialect = context.spec.dialect;
    const native = {
      postgres: ['char(8)', 'varchar(16)', 'integer', 'real', 'boolean'],
      mysql: ['char(8)', 'varchar(16)', 'int unsigned', 'float', 'tinyint(1)'],
      sqlite: ['CHAR(8)', 'VARCHAR(16)', 'INTEGER', 'REAL', 'BOOLEAN'],
      oracle: [
        'CHAR(8 CHAR)',
        'VARCHAR2(16 BYTE)',
        'NUMBER(10,0)',
        'BINARY_FLOAT',
        'NUMBER(1,0)',
      ],
      mssql: ['nchar(8)', 'nvarchar(16)', 'tinyint', 'real', 'bit'],
    }[dialect];
    await context.db.schema.createTable(context.table('scalars'), (table) => {
      ['fixed', 'label', 'quantity', 'ratio', 'enabled'].forEach(
        (name, index) => table.specificType(name, native[index]).nullable(),
      );
    });
    const connection = context.database.connection(context.spec.name);
    const schema = await connection.schemaInspector.getPhysicalCollection({
      tableName: context.table('scalars'),
    });
    const columns = new Map(
      schema?.columns.map((column) => [column.columnName, column]),
    );
    expect(columns.get('fixed')).toMatchObject({ dataType: 'char', length: 8 });
    expect(columns.get('label')).toMatchObject({
      dataType: 'string',
      length: 16,
    });
    if (dialect === 'sqlite') {
      expect(schema?.strict).toBe(false);
      expect(columns.get('fixed')?.affinity).toBe('text');
      expect(columns.get('enabled')?.affinity).toBe('numeric');
      expect(columns.get('label')?.lengthUnit).toBeUndefined();
    } else {
      expect(columns.get('ratio')?.binaryPrecision).toBe(24);
      expect(columns.get('label')?.lengthUnit).toBe(
        dialect === 'mssql'
          ? 'utf16CodeUnits'
          : dialect === 'oracle'
            ? 'bytes'
            : 'characters',
      );
      if (dialect !== 'oracle')
        expect(columns.get('label')?.collation).toBeTruthy();
      if (dialect === 'mysql' || dialect === 'postgres')
        expect(columns.get('label')?.characterSet).toBeTruthy();
    }
    if (dialect === 'oracle') {
      expect(columns.get('label')?.nativeType).toBe('VARCHAR2(16 BYTE)');
      expect(columns.get('fixed')?.nativeType).toBe('CHAR(8 CHAR)');
      expect(columns.get('quantity')).toMatchObject({
        dataType: 'decimal',
        precision: 10,
        scale: 0,
      });
    }
    if (dialect === 'mysql')
      expect(columns.get('quantity')).toMatchObject({
        integerBits: 32,
        unsigned: true,
      });
    if (dialect === 'mssql')
      expect(columns.get('quantity')).toMatchObject({
        integerBits: 8,
        unsigned: true,
      });
    expect(columns.get('enabled')?.dataType).toBe(
      dialect === 'mysql'
        ? 'integer'
        : dialect === 'oracle'
          ? 'decimal'
          : 'boolean',
    );
    const collection = await connection.collections.get('scalars');
    expect(collection?.fields).toContainEqual(
      expect.objectContaining({
        name: 'fixed',
        type: 'string',
        db: expect.objectContaining({ physicalDataType: 'char' }),
      }),
    );
    await context
      .db(context.table('scalars'))
      .insert({ fixed: 'code', label: 'visible' });
    const records = await connection.repository('scalars').findMany({
      filter: (f) =>
        f.string('fixed').eq(dialect === 'oracle' ? 'code    ' : 'code'),
      select: (s) => s.fields('label'),
    });
    expect(records).toEqual([{ label: 'visible' }]);
  });

  it.runIf(context.spec.dialect === 'sqlite')(
    'reports STRICT independently from declaration affinity',
    async () => {
      await context.db.raw('CREATE TABLE ?? (value ANY, label TEXT) STRICT', [
        context.table('strict_values'),
      ]);
      const schema = await context.database
        .connection(context.spec.name)
        .schemaInspector.getPhysicalCollection({
          tableName: context.table('strict_values'),
        });
      expect(schema?.strict).toBe(true);
      expect(
        schema?.columns.find((column) => column.columnName === 'label')
          ?.affinity,
      ).toBe('text');
    },
  );
});
