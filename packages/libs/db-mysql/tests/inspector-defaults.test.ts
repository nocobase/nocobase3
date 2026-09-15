import { describe, expect, it } from 'vitest';
import { parseColumnDefault } from '@nocobase/db';
import { mysqlDefaultLiteral } from '../src/inspectors/mysql.js';

describe('mysqlDefaultLiteral', () => {
  it('reduces an expression default to the SQL literal the shared parser reads', () => {
    const literal = mysqlDefaultLiteral({
      column_default: `_utf8mb4\\'{"enabled":true}\\'`,
      extra: 'DEFAULT_GENERATED',
    });
    expect(literal).toBe(`'{"enabled":true}'`);
    expect(parseColumnDefault(literal)).toEqual({
      expression: `'{"enabled":true}'`,
      value: '{"enabled":true}',
    });
  });

  it('unescapes quotes and backslashes inside the expression text', () => {
    expect(
      mysqlDefaultLiteral({
        column_default: `_utf8mb4\\'{"note":"it\\'s a \\\\ path"}\\'`,
        extra: 'DEFAULT_GENERATED',
      }),
    ).toBe(`'{"note":"it's a \\ path"}'`);
  });

  it('leaves literal defaults and non-string values alone', () => {
    expect(mysqlDefaultLiteral({ column_default: 'pending', extra: '' })).toBe(
      'pending',
    );
    expect(mysqlDefaultLiteral({ column_default: null, extra: '' })).toBeNull();
    expect(
      mysqlDefaultLiteral({
        column_default: `_utf8mb4\\'x\\'`,
        extra: 'auto_increment',
      }),
    ).toBe(`_utf8mb4\\'x\\'`);
  });
});
