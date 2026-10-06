import { describe, expect, it } from 'vitest';
import { parseColumnDefault } from '@nocobase/db';
import { oceanbaseDefaultLiteral } from '../src/inspectors/mysql.js';

describe('oceanbaseDefaultLiteral', () => {
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
      ['date', '2020-01-02'],
    ] as const) {
      expect(
        parseColumnDefault(
          oceanbaseDefaultLiteral({ column_default: raw, data_type: dataType }),
        ),
        `${dataType} ${raw}`,
      ).toMatchObject({ value: raw });
    }
  });

  it('leaves numeric literals, CURRENT_TIMESTAMP and non-string values alone', () => {
    expect(
      parseColumnDefault(
        oceanbaseDefaultLiteral({
          column_default: '1.50',
          data_type: 'decimal',
        }),
      ),
    ).toEqual({ expression: '1.50', value: 1.5 });
    for (const dataType of ['datetime', 'timestamp']) {
      const literal = oceanbaseDefaultLiteral({
        column_default: 'CURRENT_TIMESTAMP',
        data_type: dataType,
      });
      expect(literal).toBe('CURRENT_TIMESTAMP');
      expect(parseColumnDefault(literal)).not.toHaveProperty('value');
    }
    expect(
      oceanbaseDefaultLiteral({ column_default: null, data_type: 'int' }),
    ).toBeNull();
  });
});
