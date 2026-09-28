import { describe, expect, it } from 'vitest';
import {
  allScopes,
  anyScope,
  assertDatabaseScope,
  condition,
  idsScope,
  scopeAst,
} from '../../../server/database/scope.js';

describe('database scope construction', () => {
  it('collapses emptiness rather than emitting an empty group', () => {
    expect(anyScope([])).toBe(false);
    expect(allScopes([])).toBe(true);
    expect(anyScope([true, condition('id', '$eq', '1')])).toBe(true);
    expect(allScopes([false, condition('id', '$eq', '1')])).toBe(false);
    expect(anyScope([false, condition('id', '$eq', '1')])).toMatchObject({
      kind: 'condition',
    });
    expect(allScopes([true, condition('id', '$eq', '1')])).toMatchObject({
      kind: 'condition',
    });
  });

  it('attaches a scope to its collection and wraps a bare condition', () => {
    expect(scopeAst('orders', condition('ownerId', '$eq', 'alice'))).toEqual({
      kind: 'filter',
      version: 1,
      collection: 'orders',
      root: {
        kind: 'group',
        logic: 'and',
        items: [
          {
            kind: 'condition',
            path: ['ownerId'],
            operator: '$eq',
            value: 'alice',
          },
        ],
      },
    });
    const or = idsScope('id', ['a', 'b']);
    expect(scopeAst('orders', or).root).toBe(or);
  });

  it('refuses a scope that names an unknown field, a relation or a JSON operator', () => {
    const fields = ['id', 'status'];
    expect(() => assertDatabaseScope(true, fields)).not.toThrow();
    expect(() =>
      assertDatabaseScope(condition('missing', '$eq', 'x'), fields),
    ).toThrow(/Unknown Record Access scope field: missing/);
    expect(() =>
      assertDatabaseScope(
        { kind: 'relation', path: ['owner'], quantifier: 'exists' },
        fields,
      ),
    ).toThrow(/must not traverse relations/);
    expect(() =>
      assertDatabaseScope(condition('status', '$jsonEq', 'x'), fields),
    ).toThrow(/Unsupported Record Access scope operator: \$jsonEq/);
    expect(() => assertDatabaseScope('nonsense', fields)).toThrow(
      /Invalid Record Access scope/,
    );
  });
});
