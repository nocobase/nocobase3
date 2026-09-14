import { describe, expect, it } from 'vitest';
import {
  allScopes,
  anyScope,
  assertDatabaseScope,
  condition,
  idsScope,
  scopeAst,
} from '../server/database/index.js';

describe('database scope construction', () => {
  it('builds a literal condition for every operator it accepts', () => {
    expect(condition('status', '$eq', 'paid')).toEqual({
      kind: 'condition',
      path: ['status'],
      operator: '$eq',
      value: 'paid',
    });
    expect(condition('amount', '$gte', 100)).toMatchObject({
      operator: '$gte',
      value: 100,
    });
    expect(condition('title', '$startsWith', 'a')).toMatchObject({
      operator: '$startsWith',
      value: 'a',
    });
    expect(condition('archivedAt', '$empty')).toEqual({
      kind: 'condition',
      path: ['archivedAt'],
      operator: '$empty',
    });
    expect(condition('active', '$isTruly')).toMatchObject({
      operator: '$isTruly',
    });
    expect(condition('createdAt', '$dateBefore', '2026-01-01')).toMatchObject({
      operator: '$dateBefore',
    });
  });

  it('expands a set of identifiers into an or of equalities', () => {
    expect(idsScope('id', ['order-1', 'order-2'])).toEqual({
      kind: 'group',
      logic: 'or',
      items: [
        { kind: 'condition', path: ['id'], operator: '$eq', value: 'order-1' },
        { kind: 'condition', path: ['id'], operator: '$eq', value: 'order-2' },
      ],
    });
    expect(idsScope('id', ['order-1'])).toMatchObject({ kind: 'condition' });
    expect(idsScope('id', [])).toBe(false);
  });

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

  it('composes positive scopes with or and restrictions with and', () => {
    const positive = anyScope([
      idsScope('id', ['order-1', 'order-2']),
      condition('ownerId', '$eq', 'alice'),
    ]);
    expect(
      allScopes([positive, condition('status', '$eq', 'paid')]),
    ).toMatchObject({
      kind: 'group',
      logic: 'and',
      items: [
        { kind: 'group', logic: 'or' },
        { kind: 'condition', path: ['status'] },
      ],
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
