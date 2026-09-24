import type { DataRow, DataValue } from './data-contracts.js';
import { DataAccessError } from './data-query-policy.js';

/** One shared budget covers all root rows and included relations. Never coerce precision values to Number. */
export function dataOutput(rows: readonly object[]): {
  items: DataRow[];
  truncated: boolean;
} {
  let budget = 100000;
  let truncated = false;
  let nodes = 0;
  function normalize(value: unknown, depth: number): DataValue {
    if (++nodes > 20000 || depth > 8)
      throw new DataAccessError('Result exceeds the supported structure size');
    if (value === null || value === undefined) return null;
    if (typeof value === 'bigint')
      return normalize(value.toString(), depth + 1);
    if (typeof value === 'number') {
      if (
        !Number.isFinite(value) ||
        (Number.isInteger(value) && !Number.isSafeInteger(value))
      )
        throw new DataAccessError(
          'Database returned a number that cannot be represented safely',
        );
      return value;
    }
    if (typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') {
      const length = Math.max(0, Math.min(value.length, 4096, budget));
      budget -= length;
      if (length < value.length) {
        // Numeric strings may be bigint IDs or exact decimals. Returning only a
        // prefix would silently change their value rather than merely shorten text.
        if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
          throw new DataAccessError(
            'Exact numeric result exceeds the output budget',
          );
        }
        truncated = true;
      }
      return value.slice(0, length);
    }
    if (Array.isArray(value)) {
      if (value.length > 1000)
        throw new DataAccessError('Result array is too large');
      return value.map((item) => normalize(item, depth + 1));
    }
    if (
      typeof value === 'object' &&
      (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null)
    ) {
      const entries = Object.entries(value);
      if (entries.length > 100)
        throw new DataAccessError('Result object is too large');
      return Object.fromEntries(
        entries.map(([key, item]) => {
          if (
            key.length > 128 ||
            ['__proto__', 'prototype', 'constructor'].includes(key)
          )
            throw new DataAccessError('Unsupported result key');
          budget -= key.length;
          if (budget < 0)
            throw new DataAccessError('Result exceeds the output budget');
          return [key, normalize(item, depth + 1)];
        }),
      );
    }
    throw new DataAccessError('Unsupported database result type');
  }
  return { items: rows.map((row) => normalize(row, 0) as DataRow), truncated };
}
