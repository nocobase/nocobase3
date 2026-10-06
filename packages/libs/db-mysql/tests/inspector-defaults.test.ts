import { describe, expect, it } from 'vitest';
import { parseColumnDefault } from '@nocobase/db';
import { mysqlDefaultLiteral } from '../src/inspectors/mysql.js';

describe('mysqlDefaultLiteral', () => {
  it('reduces an expression default to the SQL literal the shared parser reads', () => {
    const literal = mysqlDefaultLiteral({
      column_default: `_utf8mb4\\'{"enabled":true}\\'`,
      extra: 'DEFAULT_GENERATED',
      data_type: 'text',
    });
    expect(literal).toBe(`'{"enabled":true}'`);
    expect(parseColumnDefault(literal)).toEqual({
      expression: `'{"enabled":true}'`,
      value: '{"enabled":true}',
    });
  });

  it('undoes both escaping layers of a text default, as information_schema reports them', () => {
    // A default written as ('it\'s here') is stored as _utf8mb4'it\'s here', which information_schema escapes again.
    const quoted = mysqlDefaultLiteral({
      column_default: String.raw`_utf8mb4\'it\\\'s here\'`,
      extra: 'DEFAULT_GENERATED',
      data_type: 'text',
    });
    expect(quoted).toBe(`'it''s here'`);
    expect(parseColumnDefault(quoted)).toMatchObject({ value: "it's here" });

    // ('C:\\temp') holds a single backslash: C:\temp.
    const backslash = mysqlDefaultLiteral({
      column_default: String.raw`_utf8mb4\'C:\\\\temp\'`,
      extra: 'DEFAULT_GENERATED',
      data_type: 'text',
    });
    expect(parseColumnDefault(backslash)).toMatchObject({
      value: String.raw`C:\temp`,
    });

    expect(
      parseColumnDefault(
        mysqlDefaultLiteral({
          column_default: String.raw`_utf8mb4\'\'`,
          extra: 'DEFAULT_GENERATED',
          data_type: 'text',
        }),
      ),
    ).toMatchObject({ value: '' });
  });

  it('quotes the bare literal default of a character, enum or temporal column', () => {
    // information_schema reports `default 'it''s \\ x'` as the bare text it's \ x, neither quoted nor escaped.
    for (const [dataType, raw] of [
      ['varchar', 'draft'],
      ['char', 'NULL'],
      ['varchar', '42'],
      ['varchar', String.raw`it's \ x`],
      ['varchar', ''],
      ['varchar', 'CURRENT_TIMESTAMP'],
      ['enum', 'paid'],
      ['set', 'a,b'],
      ['date', '2020-01-02'],
      ['time', '10:00:00'],
    ] as const) {
      expect(
        parseColumnDefault(
          mysqlDefaultLiteral({
            column_default: raw,
            extra: '',
            data_type: dataType,
          }),
        ),
        `${dataType} ${raw}`,
      ).toMatchObject({ value: raw });
    }
  });

  it('leaves numeric literals, expressions and non-string values alone', () => {
    for (const [dataType, raw, value] of [
      ['int', '0', 0],
      ['decimal', '1.50', 1.5],
      ['tinyint', '1', 1],
    ] as const) {
      expect(
        parseColumnDefault(
          mysqlDefaultLiteral({
            column_default: raw,
            extra: '',
            data_type: dataType,
          }),
        ),
      ).toEqual({ expression: raw, value });
    }
    for (const [dataType, raw, extra] of [
      ['datetime', 'CURRENT_TIMESTAMP(3)', 'DEFAULT_GENERATED'],
      ['timestamp', 'CURRENT_TIMESTAMP', ''],
      ['bit', "b'1'", ''],
      ['varbinary', '0x6162', ''],
    ] as const) {
      const literal = mysqlDefaultLiteral({
        column_default: raw,
        extra,
        data_type: dataType,
      });
      expect(literal).toBe(raw);
      expect(parseColumnDefault(literal)).not.toHaveProperty('value');
    }
    expect(
      mysqlDefaultLiteral({
        column_default: null,
        extra: '',
        data_type: 'int',
      }),
    ).toBeNull();
    expect(
      mysqlDefaultLiteral({
        column_default: `_utf8mb4\\'x\\'`,
        extra: 'auto_increment',
        data_type: 'int',
      }),
    ).toBe(`_utf8mb4\\'x\\'`);
  });
});
