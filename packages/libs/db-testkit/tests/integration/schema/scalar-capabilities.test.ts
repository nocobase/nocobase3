import { expect, it } from 'vitest';
import { describeIntegrationDatabases } from '../helpers.js';

describeIntegrationDatabases('Physical scalar capabilities', (context) => {
  it('preserves char semantics, numeric capacity and boolean identity', async () => {
    const dialect = context.spec.dialect;
    const native = context.profile.schema.scalarTypes;
    await context.db.schema.createTable(context.table('scalars'), (table) => {
      ['fixed', 'label', 'quantity', 'ratio', 'enabled'].forEach(
        (name, index) =>
          table.specificType(name, native?.[index] ?? '').nullable(),
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
        context.profile.character.lengthUnit === 'none'
          ? undefined
          : context.profile.character.lengthUnit,
      );
      if (context.profile.character.collation)
        expect(columns.get('label')?.collation).toBeTruthy();
      if (context.profile.character.characterSet)
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
    if (dialect === 'dameng') {
      expect(columns.get('quantity')).toMatchObject({
        dataType: 'integer',
      });
      expect(columns.get('ratio')).toMatchObject({ dataType: 'float' });
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
      context.profile.schema.booleanStorage === 'integer'
        ? 'integer'
        : context.profile.schema.booleanStorage === 'decimal'
          ? 'decimal'
          : 'boolean',
    );
    const collection = await connection.collections.get('scalars');
    expect(collection?.fields).toContainEqual(
      expect.objectContaining({
        name: 'fixed',
        type: 'char',
        db: expect.objectContaining({ physicalDataType: 'char' }),
      }),
    );
    await context
      .db(context.table('scalars'))
      .insert({ fixed: 'code', label: 'visible' });
    const records = await connection.repository('scalars').findMany({
      filter: (f) =>
        f
          .string('fixed')
          .eq(
            context.profile.character.charRead === 'padded'
              ? 'code    '
              : 'code',
          ),
      select: (s) => s.fields('label'),
    });
    expect(records).toEqual([{ label: 'visible' }]);
  });

  it.runIf(context.profile.schema.defaultSchema === 'main')(
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
